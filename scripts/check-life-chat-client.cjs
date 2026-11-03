const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/services/deepseek.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const service = new Module(filename, module);
const originalRequire = service.require.bind(service);
service.require = (name) => name === "@/utils/base64" ? { extractJson: JSON.parse } : originalRequire(name);
service._compile(compiled.outputText, filename);
const { chat } = service.exports;
const savedFetch = global.fetch;
const messages = [{ role: "user", content: "test" }];
async function main() {
  let calls = 0;
  let body;
  global.fetch = async (_url, options) => {
    calls++;
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  assert.equal(await chat(messages, "fake-test-key", { maxTokens: 220, jsonMode: true }), "ok");
  assert.equal(body.max_tokens, 220);
  assert.equal(body.response_format.type, "json_object");
  await chat(messages, "fake-test-key");
  assert.equal(body.max_tokens, undefined, "other call sites retain their existing output policy");
  await chat(messages, "fake-test-key", { maxTokens: 10000 });
  assert.equal(body.max_tokens, 1024);
  await chat(messages, "fake-test-key", { maxTokens: 1 });
  assert.equal(body.max_tokens, 16);
  global.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      const abort = () => { const error = new Error("cancelled"); error.name = "AbortError"; reject(error); };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener("abort", abort, { once: true });
    });
  };
  const controller = new AbortController();
  const pending = chat(messages, "fake-test-key", { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  // 用户主动取消与超时分开提示，避免把取消误报成网络问题
  await assert.rejects(pending, /请求已取消/);
  const before = calls;
  await assert.rejects(chat(messages, "fake-test-key", { timeoutMs: 5 }), /请求超时/);
  assert.equal(calls, before + 1, "timeout does not automatically retry");
  await assert.rejects(chat(messages, "fake-test-key", { signal: controller.signal }), /请求已取消/);
  console.log("Chat client mock checks passed: 220-token bound, compatibility, cancellation, timeout and no retry. No real API requests.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = savedFetch; });
