const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function createLoader(mocks = {}) {
  const cache = new Map();

  function resolveLocal(baseDir, specifier) {
    const candidates = [
      path.resolve(baseDir, specifier),
      path.resolve(baseDir, `${specifier}.ts`),
      path.resolve(baseDir, `${specifier}.tsx`),
      path.resolve(baseDir, specifier, 'index.ts'),
      path.resolve(baseDir, specifier, 'index.tsx'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.relative(root, candidate);
      }
    }
    return null;
  }

  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;

    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) {
        const resolved = resolveLocal(path.join(root, 'src'), name.slice(2));
        if (resolved) return load(resolved);
      }
      if (name.startsWith('.')) {
        const resolved = resolveLocal(path.dirname(filename), name);
        if (resolved) return load(resolved);
      }
      return require(name);
    };

    new Function('require', 'module', 'exports', source)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  return load;
}

function collectNodes(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return out;
  }
  if (typeof node === 'object') {
    out.push(node);
    if (node.props && node.props.children !== undefined) {
      collectNodes(node.props.children, out);
    }
  }
  return out;
}

function extractText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node.props) return extractText(node.props.children);
  return '';
}

function makeFakeApkBytes(payloadText) {
  const payload = Buffer.from(payloadText, 'utf8');
  const header = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
  return new Uint8Array(Buffer.concat([header, payload]));
}

async function testSha256() {
  const { sha256String, sha256Bytes, Sha256Hasher } = createLoader()('src/utils/sha256.ts');

  // 1. Standard NIST FIPS 180-4 test vectors
  assert.equal(
    sha256String(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'empty string SHA-256 vector',
  );
  assert.equal(
    sha256String('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    '"abc" SHA-256 vector',
  );
  assert.equal(
    sha256String('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    '448-bit 2-block SHA-256 vector',
  );
  assert.equal(
    sha256String('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'),
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    '896-bit multi-block SHA-256 vector',
  );

  // 2. Multi-block > 128 bytes + Unicode UTF-8
  const longText = 'Dark Study 课程表安全校验 🚀 '.repeat(18);
  const longBuf = Buffer.from(longText, 'utf8');
  assert.ok(longBuf.length > 256, 'multi-block test buffer should exceed 256 bytes');
  const expectedLong = crypto.createHash('sha256').update(longBuf).digest('hex');
  assert.equal(sha256String(longText), expectedLong, 'long UTF-8 string matches node:crypto');
  assert.equal(sha256Bytes(new Uint8Array(longBuf)), expectedLong, 'sha256Bytes matches node:crypto');

  // 3. Incremental chunked hashing matches one-shot across odd chunk boundaries
  const binary = new Uint8Array(409);
  for (let i = 0; i < binary.length; i++) binary[i] = (i * 73 + 19) & 0xff;
  const expectedBin = crypto.createHash('sha256').update(binary).digest('hex');
  assert.equal(sha256Bytes(binary), expectedBin);

  for (const step of [1, 7, 55, 56, 63, 64, 65, 130]) {
    const hasher = new Sha256Hasher();
    for (let pos = 0; pos < binary.length; pos += step) {
      hasher.update(binary.subarray(pos, Math.min(binary.length, pos + step)));
    }
    const firstDigest = hasher.digestHex();
    const secondDigest = hasher.digestHex();
    assert.equal(firstDigest, expectedBin, `incremental hash step=${step} must match one-shot`);
    assert.equal(secondDigest, expectedBin, 'digestHex must be idempotent');
  }
}

async function testUpdateConfigAndExtract() {
  const updateConfig = createLoader()('src/config/update.ts');
  assert.equal(updateConfig.GITHUB_REPO, 'doordark/dark-study');
  assert.equal(updateConfig.UPDATE_MIRRORS.length, 3);
  assert.deepEqual(
    updateConfig.UPDATE_MIRRORS.map((m) => [m.id, m.prefix]),
    [
      ['direct', ''],
      ['ghproxy', 'https://gh-proxy.com/'],
      ['ghfast', 'https://ghfast.top/'],
    ],
  );

  const rawUrl = 'https://github.com/doordark/dark-study/releases/download/v3.2.0/dark-study.apk';
  assert.equal(updateConfig.applyMirrorUrl(rawUrl, ''), rawUrl);
  assert.equal(
    updateConfig.applyMirrorUrl(rawUrl, 'https://gh-proxy.com/'),
    `https://gh-proxy.com/${rawUrl}`,
  );
  assert.equal(
    updateConfig.applyMirrorUrl(rawUrl, 'https://ghfast.top'),
    `https://ghfast.top/${rawUrl}`,
    'missing trailing slash should be normalized',
  );
  assert.equal(
    updateConfig.applyMirrorUrl(`https://gh-proxy.com/${rawUrl}`, 'https://gh-proxy.com/'),
    `https://gh-proxy.com/${rawUrl}`,
    'applyMirrorUrl should not double-prefix',
  );

  const updater = createLoader({
    'expo-constants': {},
    'expo-file-system/legacy': {},
    'expo-intent-launcher': {},
    'react-native': { Platform: { OS: 'android' } },
  })('src/services/updater.ts');

  const h1 = 'A'.repeat(64);
  const h2 = 'b'.repeat(64);
  const h3 = 'c'.repeat(64);

  // Release body formats
  assert.equal(
    updater.extractSha256FromText(`## v3.2.0\n- 修复问题\nSHA256: ${h1}`),
    h1.toLowerCase(),
    'extracts SHA256: <hash> from release body',
  );
  assert.equal(
    updater.extractSha256FromText(`**SHA-256**: \`${h2}\``),
    h2,
    'extracts markdown bold/backtick SHA-256',
  );
  assert.equal(
    updater.extractSha256FromText(`### SHA-256\n\`\`\`\n${h3}\n\`\`\``),
    h3,
    'extracts fenced next-line SHA-256',
  );
  assert.equal(
    updater.extractSha256FromText(`  ${h1}\n`),
    h1.toLowerCase(),
    'extracts standalone .sha256 file hash',
  );

  // Multi-file checksums.txt
  const checksumsTxt = [
    `${h1}  dark-study-v3.2.0-arm64.apk`,
    `${h2} *dark-study-v3.2.0-universal.apk`,
    `${h3}  source-code.tar.gz`,
  ].join('\n');

  assert.equal(
    updater.extractSha256FromText(checksumsTxt, 'dark-study-v3.2.0-universal.apk'),
    h2,
    'matches exact apkFilename in multi-file checksums.txt',
  );
  assert.equal(
    updater.extractSha256FromText(checksumsTxt, 'dark-study-v3.2.0-arm64.apk'),
    h1.toLowerCase(),
    'matches first apkFilename in multi-file checksums.txt',
  );
  assert.equal(
    updater.extractSha256FromText(checksumsTxt, 'non-existent.apk'),
    undefined,
    'returns undefined if apkFilename is absent from multi-file checksums.txt',
  );
  assert.equal(
    updater.extractSha256FromText(checksumsTxt),
    h1.toLowerCase(),
    'prefers .apk line when apkFilename is omitted',
  );

  // BSD format & single non-APK entry rejection
  assert.equal(
    updater.extractSha256FromText(`SHA256 (dark-study.apk) = ${h3}`, 'dark-study.apk'),
    h3,
    'supports BSD SHA256 (file) = hash format',
  );
  assert.equal(
    updater.extractSha256FromText(`SHA256 (source.tar.gz) = ${h3}`, 'dark-study.apk'),
    undefined,
    'rejects single non-APK BSD entry when target apkFilename does not match',
  );
  assert.equal(
    updater.extractSha256FromText(`${h3}  source.tar.gz`, 'dark-study.apk'),
    undefined,
    'rejects single non-APK GNU entry when target apkFilename does not match',
  );
  assert.equal(
    updater.extractSha256FromText(`${h2}  app-release.apk`, 'dark-study-v3.2.0.apk'),
    h2,
    'accepts single renamed .apk checksum entry',
  );
}

async function testVerifyAndDownloadAndStore() {
  const validApkBytes = makeFakeApkBytes('valid-dark-study-apk-payload-2026');
  const validSha256 = crypto.createHash('sha256').update(validApkBytes).digest('hex');
  const wrongSha256 = '0'.repeat(64);
  const corruptBytes = new Uint8Array(Buffer.from('<html>502 Bad Gateway</html>', 'utf8'));
  const corruptSha256 = crypto.createHash('sha256').update(corruptBytes).digest('hex');

  const files = new Map();
  const removed = [];
  let downloadResponder = async (url, uri) => {
    files.set(uri, validApkBytes);
    return { uri, status: 200 };
  };

  const legacyFs = {
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    makeDirectoryAsync: async () => {},
    readDirectoryAsync: async () => [],
    getInfoAsync: async (uri) => {
      const data = files.get(uri);
      if (!data) return { exists: false, isDirectory: false, uri };
      return { exists: true, isDirectory: false, uri, size: data.length };
    },
    readAsStringAsync: async (uri) => {
      const data = files.get(uri);
      if (!data) throw new Error('ENOENT');
      return Buffer.from(data).toString('base64');
    },
    deleteAsync: async (uri) => {
      removed.push(uri);
      files.delete(uri);
    },
    createDownloadResumable: (url, uri) => ({
      downloadAsync: () => downloadResponder(url, uri),
      cancelAsync: async () => {},
    }),
  };

  // Path A: expo-file-system File.bytes() mock
  const fsNextMock = {
    File: class MockFile {
      constructor(uri) {
        this.uri = uri;
      }
      async bytes() {
        const data = files.get(this.uri);
        if (!data) throw new Error('ENOENT');
        return data;
      }
    },
  };

  const updaterWithNext = createLoader({
    'expo-constants': { expoConfig: { version: '3.1.5' } },
    'expo-file-system': fsNextMock,
    'expo-file-system/legacy': legacyFs,
    'expo-intent-launcher': {},
    'react-native': { Platform: { OS: 'android' } },
  })('src/services/updater.ts');

  files.set('file:///cache/good.apk', validApkBytes);
  files.set('file:///cache/corrupt.apk', corruptBytes);
  files.set('file:///cache/empty.apk', new Uint8Array(0));

  assert.equal(await updaterWithNext.verifyApk('file:///cache/good.apk', validSha256), true, 'matching SHA-256 + ZIP magic passes');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/good.apk', validSha256.toUpperCase()), true, 'uppercase expected SHA-256 passes');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/good.apk'), true, 'valid ZIP without expectedSha256 passes');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/good.apk', wrongSha256), false, 'mismatched SHA-256 fails');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/corrupt.apk'), false, 'non-ZIP bytes fail magic check');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/corrupt.apk', corruptSha256), false, 'non-ZIP bytes fail even if hash matches');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/empty.apk'), false, 'empty file fails');
  assert.equal(await updaterWithNext.verifyApk('file:///cache/missing.apk'), false, 'missing file fails');

  // Path B: legacy readAsStringAsync base64 fallback (expo-file-system omitted)
  const updaterLegacyOnly = createLoader({
    'expo-constants': { expoConfig: { version: '3.1.5' } },
    'expo-file-system/legacy': legacyFs,
    'expo-intent-launcher': {},
    'react-native': { Platform: { OS: 'android' } },
  })('src/services/updater.ts');

  assert.equal(await updaterLegacyOnly.verifyApk('file:///cache/good.apk', validSha256), true, 'legacy base64 fallback verifies matching SHA-256');
  assert.equal(await updaterLegacyOnly.verifyApk('file:///cache/good.apk', wrongSha256), false, 'legacy base64 fallback rejects mismatched SHA-256');
  assert.equal(await updaterLegacyOnly.verifyApk('file:///cache/corrupt.apk'), false, 'legacy base64 fallback rejects non-ZIP bytes');

  // Path C: minimal mock (only getInfoAsync) gracefully skips magic check when no hash required
  const updaterMinimal = createLoader({
    'expo-constants': {},
    'expo-file-system/legacy': {
      getInfoAsync: async () => ({ exists: true, isDirectory: false, size: 123 }),
    },
    'expo-intent-launcher': {},
    'react-native': { Platform: { OS: 'android' } },
  })('src/services/updater.ts');
  assert.equal(await updaterMinimal.verifyApk('file:///cache/stub.apk'), true, 'minimal stub skips magic check cleanly');
  assert.equal(await updaterMinimal.verifyApk('file:///cache/stub.apk', validSha256), false, 'minimal stub rejects when SHA-256 is required but unreadable');

  // Test createApkDownload: mirror fallback + SHA-256 check + delete on mismatch
  const attemptedUrls = [];
  downloadResponder = async (url, uri) => {
    attemptedUrls.push(url);
    if (url.startsWith('https://gh-proxy.com/')) {
      throw new Error('mirror timeout');
    }
    if (url.startsWith('https://ghfast.top/')) {
      files.set(uri, corruptBytes);
      return { uri, status: 200 };
    }
    files.set(uri, validApkBytes);
    return { uri, status: 200 };
  };

  const baseApkUrl = 'https://github.com/doordark/dark-study/releases/download/v3.2.0/dark-study.apk';
  const fallbackUri = await updaterWithNext.createApkDownload(baseApkUrl, () => {}, {
    mirrorPrefix: 'https://gh-proxy.com/',
    fallbackMirrors: ['https://ghfast.top/', ''],
    expectedSha256: validSha256,
  }).promise;
  assert.deepEqual(attemptedUrls, [
    `https://gh-proxy.com/${baseApkUrl}`,
    `https://ghfast.top/${baseApkUrl}`,
    baseApkUrl,
  ], 'falls back across network failure and corrupt HTML mirror to direct URL');
  assert.equal(files.has(fallbackUri), true);

  // Test SHA-256 mismatch deletes file and throws exact Chinese error message
  removed.length = 0;
  downloadResponder = async (_url, uri) => {
    files.set(uri, validApkBytes);
    return { uri, status: 200 };
  };
  await assert.rejects(
    updaterWithNext.createApkDownload(baseApkUrl, () => {}, {
      expectedSha256: wrongSha256,
    }).promise,
    (err) => {
      assert.equal(err.message, '安装包完整性校验失败（SHA-256 不匹配），请重新下载');
      return true;
    },
  );
  assert.equal(removed.length, 1, 'mismatched APK must be deleted');
  assert.equal(files.has(removed[0]), false, 'deleted mismatched APK must not remain');

  // Test fetchLatestRelease parsing checksum asset + best-effort resilience
  const origFetch = global.fetch;
  try {
    const fetchedUrls = [];
    global.fetch = async (url) => {
      fetchedUrls.push(String(url));
      if (String(url).includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: 'v3.2.0',
            body: '新版本发布',
            published_at: '2026-11-27T00:00:00Z',
            assets: [
              {
                name: 'dark-study-v3.2.0.apk',
                browser_download_url: baseApkUrl,
                size: 1024,
              },
              {
                name: 'checksums.txt',
                browser_download_url: 'https://github.com/doordark/dark-study/releases/download/v3.2.0/checksums.txt',
                size: 128,
              },
            ],
          }),
        };
      }
      if (String(url).startsWith('https://gh-proxy.com/')) {
        return {
          ok: true,
          status: 200,
          text: async () => `${validSha256}  dark-study-v3.2.0.apk\n`,
        };
      }
      return { ok: false, status: 500, text: async () => '' };
    };

    const release = await updaterWithNext.fetchLatestRelease({
      mirrorPrefix: 'https://gh-proxy.com/',
    });
    assert.equal(release.sha256, validSha256);
    assert.equal(
      release.checksumUrl,
      'https://github.com/doordark/dark-study/releases/download/v3.2.0/checksums.txt',
    );
    assert.ok(fetchedUrls.some((u) => u.startsWith('https://gh-proxy.com/')));

    // Best-effort: checksum fetch failure must not fail release check
    global.fetch = async (url) => {
      if (String(url).includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: 'v3.2.1',
            body: '无内联哈希',
            published_at: '2026-11-27T00:00:00Z',
            assets: [
              { name: 'dark-study.apk', browser_download_url: baseApkUrl, size: 2048 },
              { name: 'dark-study.apk.sha256', browser_download_url: `${baseApkUrl}.sha256`, size: 64 },
            ],
          }),
        };
      }
      throw new Error('checksum network failed');
    };
    updaterWithNext.clearUpdateRouteCache();
    const releaseNoHash = await updaterWithNext.fetchLatestRelease();
    assert.equal(releaseNoHash.version, '3.2.1');
    assert.equal(releaseNoHash.sha256, undefined);

    // Test detectFastestUpdateRoute: HEAD -> Range fallback, fastest wins & aborts others, 5m cache, all-timeout fallback
    updaterWithNext.clearUpdateRouteCache();
    const probeCalls = [];
    const abortedUrls = [];
    global.fetch = async (url, init = {}) => {
      const urlStr = String(url);
      const method = init.method || 'GET';
      probeCalls.push({ url: urlStr, method, range: init.headers?.Range });
      if (init.signal) {
        init.signal.addEventListener('abort', () => abortedUrls.push(`${method}:${urlStr}`));
      }
      // ghfast responds fastest via HEAD -> Range bytes=0-0 fallback
      if (urlStr.startsWith('https://ghfast.top/')) {
        if (method === 'HEAD') {
          return { ok: false, status: 405 };
        }
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, status: 206 }), 15),
        );
      }
      // gh-proxy is slower
      if (urlStr.startsWith('https://gh-proxy.com/')) {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ ok: true, status: 200 }), 120);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('Aborted'));
          });
        });
      }
      // direct hangs until aborted
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    };

    const route1 = await updaterWithNext.detectFastestUpdateRoute(baseApkUrl, { timeoutMs: 3500 });
    assert.equal(route1.fromCache, false);
    assert.equal(route1.fastestPrefix, 'https://ghfast.top/');
    assert.deepEqual(route1.fallbackMirrors, ['', 'https://gh-proxy.com/']);
    assert.ok(
      probeCalls.some((c) => c.url.startsWith('https://ghfast.top/') && c.method === 'HEAD') &&
        probeCalls.some(
          (c) =>
            c.url.startsWith('https://ghfast.top/') &&
            c.method === 'GET' &&
            c.range === 'bytes=0-0',
        ),
      'HEAD 405 must fall back to Range: bytes=0-0',
    );
    assert.ok(abortedUrls.length >= 2, 'slower/pending probes must be aborted once fastest responds');

    // Second call within 5 min TTL hits cache without calling fetch
    const callsBeforeCache = probeCalls.length;
    const routeCached = await updaterWithNext.detectFastestUpdateRoute(baseApkUrl);
    assert.equal(routeCached.fromCache, true);
    assert.equal(routeCached.fastestPrefix, 'https://ghfast.top/');
    assert.equal(probeCalls.length, callsBeforeCache, 'cached probe must not issue network requests');

    // All routes fail/timeout -> graceful fallback to default order without caching failure
    updaterWithNext.clearUpdateRouteCache();
    global.fetch = async () => {
      throw new Error('offline');
    };
    const routeOffline = await updaterWithNext.detectFastestUpdateRoute(baseApkUrl, { timeoutMs: 50 });
    assert.deepEqual(routeOffline.orderedPrefixes, ['', 'https://gh-proxy.com/', 'https://ghfast.top/']);
    assert.equal(routeOffline.fastestPrefix, '');

    // Direct API fails -> fetchLatestRelease automatically falls back to fastest proxy & fetches checksum
    updaterWithNext.clearUpdateRouteCache();
    const fallbackApiUrls = [];
    global.fetch = async (url, init = {}) => {
      const u = String(url);
      fallbackApiUrls.push(`${init.method || 'GET'}:${u}`);
      if (u === 'https://api.github.com/repos/doordark/dark-study/releases/latest') {
        throw new Error('direct github timeout');
      }
      if (u.startsWith('https://gh-proxy.com/https://api.github.com/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tag_name: 'v3.2.2',
            body: '代理链路拉取成功',
            published_at: '2026-11-27T00:00:00Z',
            assets: [
              { name: 'dark-study.apk', browser_download_url: baseApkUrl, size: 4096 },
              { name: 'checksums.txt', browser_download_url: 'https://github.com/doordark/dark-study/releases/download/v3.2.2/checksums.txt', size: 128 },
            ],
          }),
        };
      }
      if (u.startsWith('https://gh-proxy.com/')) {
        if (init.method === 'HEAD') return { ok: true, status: 200 };
        return { ok: true, status: 200, text: async () => `${validSha256}  dark-study.apk\n` };
      }
      return { ok: false, status: 502 };
    };
    const proxyRelease = await updaterWithNext.fetchLatestRelease();
    assert.equal(proxyRelease.version, '3.2.2');
    assert.equal(proxyRelease.sha256, validSha256);
    assert.ok(fallbackApiUrls.some((x) => x.includes('https://gh-proxy.com/https://api.github.com/')));
  } finally {
    global.fetch = origFetch;
  }

  // Test useUpdateTask automatic route detection in check() & download() + sha256 wiring
  const recordedCalls = { downloadOpts: null, verifyArgs: null, fetchOpts: null, probedUrls: [] };
  const storeMod = createLoader({
    '@/services/updater': {
      detectFastestUpdateRoute: async (probeUrl) => {
        recordedCalls.probedUrls.push(probeUrl ?? 'default');
        return {
          fastestPrefix: 'https://ghfast.top/',
          orderedPrefixes: ['https://ghfast.top/', 'https://gh-proxy.com/', ''],
          fallbackMirrors: ['https://gh-proxy.com/', ''],
          fromCache: false,
          checkedAt: Date.now(),
          measurements: [],
        };
      },
      fetchLatestRelease: async (opts) => {
        recordedCalls.fetchOpts = opts;
        return {
          version: '3.3.0',
          tagName: 'v3.3.0',
          notes: 'test',
          apkUrl: baseApkUrl,
          apkSize: 100,
          publishedAt: '',
          sha256: validSha256,
        };
      },
      isNewer: () => true,
      createApkDownload: (_url, _onProgress, opts) => {
        recordedCalls.downloadOpts = opts;
        return { promise: Promise.resolve('file:///cache/downloaded.apk'), cancel: () => {} };
      },
      verifyApk: async (uri, expected) => {
        recordedCalls.verifyArgs = [uri, expected];
        return true;
      },
      installApk: async () => {},
    },
  })('src/store/useUpdateTask.ts');

  const task = storeMod.useUpdateTask;
  await task.getState().check();
  assert.equal(task.getState().mirrorPrefix, 'https://ghfast.top/');
  assert.equal(recordedCalls.fetchOpts.mirrorPrefix, 'https://ghfast.top/');
  assert.deepEqual(recordedCalls.fetchOpts.orderedPrefixes, [
    'https://ghfast.top/',
    'https://gh-proxy.com/',
    '',
  ]);
  await task.getState().download();
  assert.equal(recordedCalls.downloadOpts.expectedSha256, validSha256);
  assert.equal(recordedCalls.downloadOpts.mirrorPrefix, 'https://ghfast.top/');
  assert.deepEqual(recordedCalls.downloadOpts.fallbackMirrors, ['https://gh-proxy.com/', '']);
  assert.equal(recordedCalls.probedUrls[1], baseApkUrl);
  await task.getState().install();
  assert.deepEqual(recordedCalls.verifyArgs, ['file:///cache/downloaded.apk', validSha256]);

  // Verify SettingsScreen UpdateCard removes manual mirror selector and uses automatic route hint
  const settingsSrc = fs.readFileSync(path.join(root, 'src', 'screens', 'SettingsScreen.tsx'), 'utf8');
  assert.ok(!settingsSrc.includes('下载线路（国内网络可切换镜像加速）'), 'SettingsScreen must remove manual mirror selector title');
  assert.ok(!settingsSrc.includes('UPDATE_MIRRORS'), 'SettingsScreen must remove UPDATE_MIRRORS references');
  assert.ok(settingsSrc.includes('自动择优选择最快线路检查与下载'), 'SettingsScreen must show automatic route hint');
}

async function testErrorBoundaryAndLayout() {
  const events = [];
  class FakeComponent {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(patch, cb) {
      events.push('setState');
      const next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = { ...this.state, ...next };
      if (typeof cb === 'function') cb();
    }
  }

  const reactMock = {
    Component: FakeComponent,
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
    }),
  };

  const rnMock = {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    StyleSheet: { create: (styles) => styles },
  };

  const { AppErrorBoundary } = createLoader({
    react: reactMock,
    'react-native': rnMock,
  })('src/components/AppErrorBoundary.tsx');

  assert.equal(typeof AppErrorBoundary.getDerivedStateFromError, 'function');
  assert.equal(typeof AppErrorBoundary.prototype.componentDidCatch, 'function');

  const derived = AppErrorBoundary.getDerivedStateFromError(new Error('渲染崩溃示例'));
  assert.equal(derived.hasError, true);
  assert.equal(derived.errorMessage, '渲染崩溃示例');

  let wentHome = 0;
  const childNode = { type: 'ChildScreen', props: {} };
  const boundary = new AppErrorBoundary({
    isDark: true,
    onGoHome: () => {
      events.push('onGoHome');
      wentHome++;
    },
    children: childNode,
  });

  // Healthy state renders children directly
  assert.equal(boundary.render(), childNode);

  // Error state renders dark recovery UI with selectable text & both buttons
  boundary.state = derived;
  const darkTree = boundary.render();
  const darkNodes = collectNodes(darkTree);
  const selectableText = darkNodes.find(
    (n) => n.type === 'Text' && n.props && n.props.selectable === true,
  );
  assert.ok(selectableText, 'error message must use <Text selectable>');
  assert.match(extractText(selectableText), /渲染崩溃示例/);

  const pressables = darkNodes.filter((n) => n.type === 'Pressable');
  const retryBtn = pressables.find((p) => extractText(p).includes('重新渲染'));
  const homeBtn = pressables.find((p) => extractText(p).includes('回到课表首页'));
  assert.ok(retryBtn, 'must render "重新渲染" button');
  assert.ok(homeBtn, 'must render "回到课表首页" button');

  // Clicking "重新渲染" resets error state
  retryBtn.props.onPress();
  assert.equal(boundary.state.hasError, false);
  assert.equal(boundary.render(), childNode);

  // Light theme renders distinct light background & "回到课表首页" invokes onGoHome + resets
  boundary.props = { ...boundary.props, isDark: false };
  boundary.state = AppErrorBoundary.getDerivedStateFromError(new Error('light crash'));
  const lightTree = boundary.render();
  const darkBg = Array.isArray(darkTree.props.style)
    ? Object.assign({}, ...darkTree.props.style).backgroundColor
    : darkTree.props.style.backgroundColor;
  const lightBg = Array.isArray(lightTree.props.style)
    ? Object.assign({}, ...lightTree.props.style).backgroundColor
    : lightTree.props.style.backgroundColor;
  assert.notEqual(darkBg, lightBg, 'dark and light themes must use distinct backgrounds');

  const lightHomeBtn = collectNodes(lightTree).find(
    (n) => n.type === 'Pressable' && extractText(n).includes('回到课表首页'),
  );
  events.length = 0;
  lightHomeBtn.props.onPress();
  assert.equal(wentHome, 1, 'onGoHome callback must be called');
  assert.deepEqual(
    events,
    ['onGoHome', 'setState'],
    'onGoHome must run before setState so navigation leaves crashing route before remount',
  );
  assert.equal(boundary.state.hasError, false, 'error state must reset on goHome');

  // Verify _layout.tsx integration without dropping existing overlays or keys
  const layoutSrc = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
  assert.match(layoutSrc, /import\s+\{\s*AppErrorBoundary\s*\}\s+from\s+["']@\/components\/AppErrorBoundary["']/);
  assert.match(
    layoutSrc,
    /<AppErrorBoundary\s+isDark=\{isDark\}\s+onGoHome=\{\(\)\s*=>\s*router\.replace\(["']\/["']\)\}>[\s\S]*<Stack[\s\S]*<\/Stack>[\s\S]*<\/AppErrorBoundary>/,
    '_layout.tsx must wrap <Stack> with <AppErrorBoundary isDark={isDark} onGoHome={() => router.replace("/")}>',
  );
  for (const requiredToken of [
    'key={`navigation-${dataRevision}`}',
    '<CourseReminderSync />',
    '<CourseWidgetSync />',
    '<ImportTaskOverlay />',
    '<WhaleWaveCoordinator />',
    '<WhalePet key={`pet-${dataRevision}`} />',
  ]) {
    assert.ok(layoutSrc.includes(requiredToken), `_layout.tsx must preserve ${requiredToken}`);
  }
}

async function run() {
  await testSha256();
  await testUpdateConfigAndExtract();
  await testVerifyAndDownloadAndStore();
  await testErrorBoundaryAndLayout();
  console.log(
    'Updater & ErrorBoundary checks passed: NIST/chunked SHA-256, checksum extraction, mirror URL/fallback, APK ZIP+SHA-256 verification, AppErrorBoundary dark/light recovery & _layout integration.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
