const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
module.exports = function createLoader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += fs.existsSync(filename + '.ts') ? '.ts' : '.tsx';
    if (cache.has(filename)) return cache.get(filename).exports;
    const target = new Module(filename, module); target.paths = module.paths; cache.set(filename, target);
    target.require = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load('src/' + name.slice(2));
      if (name.startsWith('.') && !path.extname(name)) return load(path.resolve(path.dirname(filename), name));
      return require(name);
    };
    target._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return target.exports;
  }
  return load;
};
