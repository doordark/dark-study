const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/services/deepseek.ts");
const domain = new Module(filename, module);
domain.require = (id) => id === "@/utils/base64" ? { extractJson: JSON.parse } : require(id);
domain._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { chat } = domain.exports;
const originalFetch = global.fetch;
const messages = [{ role: "user", content: "test letter" }];
async function main() {
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "A quiet moment." } }] }) });
  assert.equal(await chat(messages, "test-only-placeholder"), "A quiet moment.");
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [] }) });
  await assert.rejects(chat(messages, "test-only-placeholder"), /非预期/);
  let unavailableCalls = 0;
  global.fetch = async () => { unavailableCalls++; return { ok: false, status: 503, text: async () => "unavailable" }; };
  // 503/5xx 会做退避重试，最终给用户可读提示，不再暴露原始 JSON
  await assert.rejects(chat(messages, "test-only-placeholder"), /繁忙/);
  assert.equal(unavailableCalls, 3, "server busy is retried up to three attempts");
  let capturedSignal;
  global.fetch = (_, opts) => new Promise((resolve, reject) => {
    capturedSignal = opts.signal;
    const abort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    if (opts.signal.aborted) abort();
    else opts.signal.addEventListener("abort", abort, { once: true });
  });
  const close = new AbortController();
  const pending = chat(messages, "test-only-placeholder", { signal: close.signal });
  close.abort();
  await assert.rejects(pending);
  assert.equal(capturedSignal.aborted, true, "closing the sky cancels the transport");
  const alreadyClosed = new AbortController();
  alreadyClosed.abort();
  await assert.rejects(chat(messages, "test-only-placeholder", { signal: alreadyClosed.signal }));
  await assert.rejects(chat(messages, "test-only-placeholder", { timeoutMs: 5 }));
  console.log("Sky network checks passed: success, bad response, offline failure, close cancellation, pre-abort and timeout. No real API requests.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
