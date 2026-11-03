const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/services/farmChat.ts'),m=new Module(filename,module);
m.require=name=>name==='./deepseek'?{TEXT_MODEL:'mock-model'}:require(name);
m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {farmChat}=m.exports;const saved=global.fetch;
async function main(){
  let calls=0,body;
  global.fetch=async(_url,options)=>{calls++;body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"reply":"好","action":null}'}}]})};};
  assert.equal(await farmChat([{role:'user',content:'mock JSON'}],'fake-test-only',{maxTokens:480}),'{"reply":"好","action":null}');
  assert.equal(calls,1);assert.equal(body.response_format.type,'json_object');assert.equal(body.max_tokens,480);assert.equal(body.thinking.type,'disabled');
  await farmChat([],'fake-test-only',{maxTokens:100000});assert.equal(body.max_tokens,1024);
  global.fetch=async()=>{calls++;return {ok:false,status:503};};let before=calls;
  await assert.rejects(farmChat([],'fake-test-only'),/503/);assert.equal(calls,before+1,'server errors never retry');
  const cancelled=new AbortController();cancelled.abort();before=calls;await assert.rejects(farmChat([],'fake-test-only',{signal:cancelled.signal}),/取消/);assert.equal(calls,before);
  global.fetch=(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>{const abort=()=>{const error=new Error('aborted');error.name='AbortError';reject(error);};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});};
  const controller=new AbortController();const pending=farmChat([],'fake-test-only',{signal:controller.signal});controller.abort();await assert.rejects(pending,/aborted/);
  before=calls;await assert.rejects(farmChat([],'fake-test-only',{timeoutMs:1000}),/aborted/);assert.equal(calls,before+1,'timeout never retries');
  before=calls;await assert.rejects(farmChat([],''),/Key/);assert.equal(calls,before,'missing keys cannot send HTTP');
  console.log('Farm chat checks passed: strict JSON request, bounded tokens, one attempt, missing key, cancellation, timeout and server-error fallback. Mock transport only; zero paid API calls.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=saved;});
