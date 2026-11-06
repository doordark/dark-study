const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m);
  m.require = name => name === './deepseek' ? { TEXT_MODEL: 'mock-model' } : name === './whaleTools' ? { searchWeb: async () => { throw new Error('mock-search-offline'); } } : name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))) : require(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}
const { vendorChat, readVendorReply, NPC_CHAT_UNAVAILABLE } = load('src/services/farmVendorChat.ts');
const pricing = load('src/utils/farmMarket.ts'), memory = load('src/utils/farmMemory.ts');
const at = new Date(2026, 10, 6, 12, 15).getTime();
const options = { vendor: 'farmer', text: '你刚才说价格能商量，那能便宜一点吗？', memory: { affinity: 30, turns: [{ id: '1', player: '价格能商量吗', reply: '可以谈谈，你想买什么？' }] }, apiKey: 'mock-only', webSearch: false, signal: new AbortController().signal, at };
const originalFetch = global.fetch, originalWarn = console.warn;
const warnings = []; console.warn = (...args) => warnings.push(args);
let calls = 0, payload;
const response = raw => ({ ok: true, json: async () => ({ choices: [{ message: { content: raw } }] }) });
async function main() {
  global.fetch = async (_url, init) => { calls++; payload = JSON.parse(init.body); return response(JSON.stringify({ reply: '这次可以给你些优惠。', reaction: 'neutral', action: { type: 'set_discount', discountPercent: 10 } })); };
  let result = await vendorChat(options);
  assert.equal(result.discountPercent, 10); assert.equal(result.unavailable, undefined);
  assert(payload.messages.some(message => message.content === '可以谈谈，你想买什么？'));
  assert(payload.messages.some(message => message.role === 'system' && message.content.includes('真实报价')));
  const before = calls; result = await vendorChat({ ...options, apiKey: '' });
  assert.equal(result.reply, NPC_CHAT_UNAVAILABLE); assert(result.unavailable); assert.equal(calls, before);
  // A recoverable HTTP error really retries instead of substituting an unrelated greeting.
  let attempts = 0;
  global.fetch = async () => { calls++; return ++attempts === 1 ? { ok: false, status: 503 } : response('{"reply":"你说的是刚才的折扣，我愿意再商量。","action":null}'); };
  result = await vendorChat(options); assert.equal(attempts, 2); assert(!result.unavailable);
  assert(result.reply.includes('刚才的折扣'));
  // Auth failure is neither retried nor disguised as a successful conversation.
  attempts = 0; global.fetch = async () => { attempts++; return { ok: false, status: 401 }; };
  result = await vendorChat(options); assert.equal(attempts, 1); assert(result.unavailable);
  assert(warnings.some(args => args[1]?.status === 401));
  assert(!JSON.stringify(warnings).includes('mock-only'));
  // Valid JSON with an invalid schema is retried through plain JSON mode, within the same budget.
  const modes = []; global.fetch = async (_url, init) => { const body = JSON.parse(init.body); modes.push(body.response_format?.type); return modes.length === 1 ? response('{"greeting":"你好"}') : response('{"reply":"我记得你问的是打折，可以谈谈。","action":null}'); };
  result = await vendorChat(options); assert(!result.unavailable); assert.deepEqual(modes, ['json_object', undefined]);
  global.fetch = async () => response('{"unexpected":"invalid"}');
  result = await vendorChat(options); assert(result.unavailable); assert.equal(result.reply, NPC_CHAT_UNAVAILABLE);
  result = await vendorChat({ ...options, text: '联网搜索：今天的天气', webSearch: true }); assert(result.unavailable);
  assert.equal(readVendorReply('{"reply":"你来得正好，看看今天的货和委托吧。","action":null}'), null);
  assert.equal(readVendorReply('{"reply":"给你打八折","action":null}'), null);
  assert.equal(readVendorReply('{"reply":"好","action":{"type":"coins","amount":999}}'), null);
  assert.equal(readVendorReply('{"reply":"好","action":{"type":"set_discount","discountPercent":-2}}'), null);
  for (const vendor of pricing.VENDORS) {
    const state = { affinity: 30, mood: '平静' };
    const deal = pricing.negotiateVendorDeal(vendor, state, 99, at);
    assert.equal(deal.discountPercent, pricing.vendorDiscountLimit(vendor, state));
    const base = pricing.vendorQuotedPrice(vendor, 100, state, at);
    const agreed = pricing.vendorQuotedPrice(vendor, 100, state, at, deal);
    assert(agreed < base); assert(agreed >= 75);
    assert.equal(pricing.vendorQuotedPrice(vendor, 100, state, deal.until, deal), pricing.vendorQuotedPrice(vendor, 100, state, deal.until));
    assert.equal(pricing.negotiateVendorDeal(vendor, { ...state, mood: '不悦' }, 10, at), null);
    assert.equal(pricing.negotiateVendorDeal(vendor, { ...state, mood: '生气' }, 10, at), null);
    const upset = { ...state, mood: '不悦' };
    assert.equal(pricing.vendorQuotedPrice(vendor, 100, upset, at, deal), pricing.vendorQuotedPrice(vendor, 100, upset, at));
    assert.deepEqual(pricing.restoreGear({ priceDeals: { [vendor]: deal } }).priceDeals[vendor], deal);
    const close = { affinity: 100, mood: '开心' };
    assert.equal(pricing.vendorQuotedPrice(vendor, 100, close, at, pricing.negotiateVendorDeal(vendor, close, 99, at)), 75);
  }
  const failed = memory.recordFarmChatTurn(options.memory, { id: 'fail', player: '谢谢你帮忙', reply: NPC_CHAT_UNAVAILABLE, unavailable: true }, 'warm', 'farmer');
  assert.equal(failed.affinity, options.memory.affinity);
  assert(!memory.farmChatContext(failed, '谢谢你帮忙').some(turn => turn.id === 'fail'));
  assert(memory.restoreFarmMemories({ gu: failed }).gu.turns.at(-1).unavailable);
  console.log('Vendor chat passed: context, real discount quotes/limits/expiry/save, mood boundaries, 503 retry, auth diagnostics, schema fallback, search failure, clear unavailability and no failed-chat affinity changes. All HTTP mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; console.warn = originalWarn; });
