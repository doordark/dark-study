const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

function createMockResponse(status, body = "") {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  };
}

function createEnv(options = {}) {
  const disk = new Map(options.initialDisk ?? []);
  const secure = new Map(options.initialSecure ?? []);
  const secureCalls = { get: [], set: [], del: [] };
  const platform = { OS: options.os ?? "android" };

  const asyncStorage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => {
      disk.set(key, value);
    },
    removeItem: async (key) => {
      disk.delete(key);
    },
    multiGet: async (keys) => keys.map((key) => [key, disk.get(key) ?? null]),
    multiSet: async (rows) => {
      for (const [key, value] of rows) disk.set(key, value);
    },
    multiRemove: async (keys) => {
      for (const key of keys) disk.delete(key);
    },
  };

  let getOverride = null;
  let deleteOverride = null;

  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: async (key) => {
      secureCalls.get.push(key);
      if (getOverride) return getOverride(key);
      return secure.has(key) ? secure.get(key) : null;
    },
    setItemAsync: async (key, value, opts) => {
      secureCalls.set.push({ key, value, opts });
      secure.set(key, value);
    },
    deleteItemAsync: async (key) => {
      secureCalls.del.push(key);
      if (deleteOverride) return deleteOverride(key);
      secure.delete(key);
    },
  };

  const extraMocks = options.mocks ?? {};
  const load = createLoader({
    "@react-native-async-storage/async-storage": asyncStorage,
    "react-native": { Platform: platform },
    "expo-secure-store": secureStore,
    ...extraMocks,
  });

  return {
    disk,
    secure,
    secureCalls,
    load,
    setGetOverride: (fn) => {
      getOverride = fn;
    },
    setDeleteOverride: (fn) => {
      deleteOverride = fn;
    },
  };
}

async function flushAll(load) {
  const { flushPendingWrites } = load("src/utils/coalescedWriter.ts");
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await flushPendingWrites();
  }
}

async function withMockFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function buildValidBackup(load) {
  const backupUtil = load("src/utils/backup.ts");
  const {
    DEFAULT_PERIODS,
    DEFAULT_GRADE_RULES,
    DEFAULT_GRADE_TYPES,
    DEFAULT_GRADE_YEARS,
    SAMPLE_SCHEDULE,
  } = load("src/constants/sample.ts");

  const course = {
    id: "webdav-course-1",
    name: "高等数学",
    teacher: "张老师",
    classroom: "一教 101",
    weekday: 2,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2, 3, 4],
    color: "sky",
  };
  const main = {
    version: 6,
    state: {
      schedules: [
        { ...SAMPLE_SCHEDULE, periods: DEFAULT_PERIODS, courses: [course] },
      ],
      activeScheduleId: SAMPLE_SCHEDULE.id,
      grades: [
        {
          id: "g1",
          name: "高等数学",
          credit: 4,
          score: "95",
          yearId: DEFAULT_GRADE_YEARS[0].id,
          semester: "fall",
          type: DEFAULT_GRADE_TYPES[0].id,
        },
      ],
      gradeYears: DEFAULT_GRADE_YEARS,
      activeGradeYearId: DEFAULT_GRADE_YEARS[0].id,
      gradeTypes: DEFAULT_GRADE_TYPES,
      gradeRules: DEFAULT_GRADE_RULES,
      activeGradeRuleId: DEFAULT_GRADE_RULES[0].id,
      activeGradeSemester: "fall",
    },
  };
  return backupUtil.createBackup([
    ["dark-study-storage", JSON.stringify(main)],
    [
      "dark-study-settings",
      JSON.stringify({
        version: 0,
        state: {
          apiKey: "should-never-export",
          appearance: "dark",
          material: "glass",
        },
      }),
    ],
  ]);
}

async function testUrlAndPathNormalization() {
  const env = createEnv();
  const webdav = env.load("src/services/webdavSync.ts");

  // Presets check
  const presetIds = webdav.WEBDAV_PRESETS.map((p) => p.id);
  assert.deepEqual(presetIds, ["jianguoyun", "nextcloud", "alist", "custom"]);
  assert.equal(
    webdav.getWebdavPreset("jianguoyun").defaultServerUrl,
    "https://dav.jianguoyun.com/dav/",
  );

  // Valid URL + path normalization
  assert.equal(
    webdav.buildWebdavTargetUrl(
      "https://dav.jianguoyun.com/dav/",
      "/DarkStudy/dark-study-backup.json",
    ),
    "https://dav.jianguoyun.com/dav/DarkStudy/dark-study-backup.json",
  );
  assert.equal(
    webdav.buildWebdavTargetUrl(
      "https://dav.jianguoyun.com/dav///",
      "DarkStudy/sub/backup..v2.json",
    ),
    "https://dav.jianguoyun.com/dav/DarkStudy/sub/backup..v2.json",
  );
  assert.equal(
    webdav.buildWebdavTargetUrl(
      "http://192.168.1.10:5244/dav",
      "/暗学 备份/课表.json",
    ),
    "http://192.168.1.10:5244/dav/%E6%9A%97%E5%AD%A6%20%E5%A4%87%E4%BB%BD/%E8%AF%BE%E8%A1%A8.json",
  );
  assert.deepEqual(
    webdav.buildWebdavParentDirUrls(
      "https://dav.jianguoyun.com/dav/",
      "/DarkStudy/2026/backup.json",
    ),
    [
      "https://dav.jianguoyun.com/dav/DarkStudy/",
      "https://dav.jianguoyun.com/dav/DarkStudy/2026/",
    ],
  );
  assert.deepEqual(
    webdav.buildWebdavParentDirUrls(
      "https://dav.jianguoyun.com/dav/",
      "/backup.json",
    ),
    [],
  );

  // Invalid server URLs rejected
  for (const badUrl of [
    "",
    "   ",
    "ftp://dav.example.com/dav",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@dav.example.com/dav/",
    "https://dav.example.com/dav?token=1",
    "https://dav.example.com/dav#frag",
    "https://dav.example.com/dav/../admin",
    "https://dav.example.com/dav/%2e%2e/admin",
    "https://dav.example.com/dav\\admin",
  ]) {
    assert.throws(
      () =>
        webdav.buildWebdavTargetUrl(badUrl, "/DarkStudy/dark-study-backup.json"),
      `Expected invalid serverUrl to throw: ${badUrl}`,
    );
  }

  // Traversal & invalid remote paths rejected
  for (const badPath of [
    "",
    "   ",
    "/",
    "/DarkStudy/",
    "../secret.json",
    "/DarkStudy/../../etc/passwd",
    "/DarkStudy/./backup.json",
    "/DarkStudy/%2e%2e/secret.json",
    "/DarkStudy/%2E%2E/secret.json",
    "/DarkStudy/%252e%252e/secret.json",
    "/DarkStudy/..%2fsecret.json",
    "/DarkStudy\\..\\secret.json",
    "//evil.com/secret.json",
    "https://evil.com/secret.json",
    "/DarkStudy/backup.json?a=1",
    "/DarkStudy/backup.json#top",
  ]) {
    assert.throws(
      () =>
        webdav.buildWebdavTargetUrl("https://dav.jianguoyun.com/dav/", badPath),
      `Expected invalid remotePath to throw: ${badPath}`,
    );
  }
}

async function testUtf8BasicAuth() {
  const env = createEnv();
  const webdav = env.load("src/services/webdavSync.ts");

  const asciiAuth = webdav.encodeWebdavBasicAuth("user@example.com", "app-key-99");
  assert.equal(
    asciiAuth,
    `Basic ${Buffer.from("user@example.com:app-key-99", "utf8").toString("base64")}`,
  );

  // Non-ASCII UTF-8 credentials (Chinese + emoji) — btoa would throw InvalidCharacterError
  const utf8User = "测试用户@坚果云";
  const utf8Pass = "应用密码🔐#2026";
  const expectedUtf8 = `Basic ${Buffer.from(`${utf8User}:${utf8Pass}`, "utf8").toString("base64")}`;
  assert.equal(webdav.encodeWebdavBasicAuth(utf8User, utf8Pass), expectedUtf8);

  // Also test pure-TS fallback when TextEncoder is unavailable
  const savedTextEncoder = globalThis.TextEncoder;
  try {
    globalThis.TextEncoder = undefined;
    assert.equal(webdav.encodeWebdavBasicAuth(utf8User, utf8Pass), expectedUtf8);
  } finally {
    globalThis.TextEncoder = savedTextEncoder;
  }

  // Header injection & colon in username rejected
  assert.throws(() => webdav.encodeWebdavBasicAuth("bad:user", "pass"), /冒号/);
  assert.throws(() => webdav.encodeWebdavBasicAuth("user\r\n", "pass"), /控制字符/);
  assert.throws(() => webdav.encodeWebdavBasicAuth("user", "pass\nX-Inject: 1"), /控制字符/);
}

async function testCredentialsAndSettingsNoPasswordPersist() {
  // Native SecureStore credentials behavior
  const nativeEnv = createEnv({ os: "ios" });
  const creds = nativeEnv.load("src/services/webdavCredentials.ts");
  assert.equal(await creds.getWebdavPassword(), "");
  assert.equal(await creds.hasWebdavPassword(), false);

  await creds.setWebdavPassword("  dav-app-secret  ");
  assert.equal(
    nativeEnv.secure.get("dark-study.webdav-password"),
    "dav-app-secret",
  );
  assert.deepEqual(nativeEnv.secureCalls.set[0].opts, {
    keychainAccessible: 5,
  });
  assert.equal(await creds.getWebdavPassword(), "dav-app-secret");
  assert.equal(await creds.hasWebdavPassword(), true);

  await creds.setWebdavPassword("   ");
  assert.equal(nativeEnv.secure.has("dark-study.webdav-password"), false);
  assert.equal(await creds.hasWebdavPassword(), false);

  nativeEnv.setGetOverride(async () => {
    throw new Error("locked");
  });
  assert.equal(await creds.getWebdavPassword(), "");
  nativeEnv.setGetOverride(null);

  nativeEnv.setDeleteOverride(async () => {
    throw new Error("missing");
  });
  await creds.deleteWebdavPassword();
  nativeEnv.setDeleteOverride(null);

  // Web fallback never touches SecureStore
  const webEnv = createEnv({ os: "web" });
  const webCreds = webEnv.load("src/services/webdavCredentials.ts");
  await webCreds.setWebdavPassword("web-only-pass");
  assert.equal(await webCreds.getWebdavPassword(), "web-only-pass");
  assert.equal(await webCreds.hasWebdavPassword(), true);
  await webCreds.deleteWebdavPassword();
  assert.equal(await webCreds.getWebdavPassword(), "");
  assert.equal(webEnv.secureCalls.set.length, 0);
  assert.equal(webEnv.secureCalls.get.length, 0);

  // Zustand store persists config, NEVER password or hasPassword
  const storeEnv = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-webdav-settings",
        JSON.stringify({
          version: 0,
          state: {
            preset: "nextcloud",
            serverUrl: "https://cloud.example.com/remote.php/dav/files/alice/",
            username: "alice",
            remotePath: "/DarkStudy/custom.json",
            autoSyncOnLaunch: true,
            // Simulated hostile/tampered fields on disk must be ignored
            password: "leaked-password",
            hasPassword: true,
          },
        }),
      ],
    ],
  });
  const { useWebdavSettings } = storeEnv.load("src/store/useWebdavSettings.ts");
  await useWebdavSettings.persist.rehydrate();
  await useWebdavSettings.getState().refreshPasswordStatus();

  assert.equal(useWebdavSettings.getState().preset, "nextcloud");
  assert.equal(useWebdavSettings.getState().username, "alice");
  assert.equal(useWebdavSettings.getState().autoSyncOnLaunch, true);
  assert.equal(
    useWebdavSettings.getState().hasPassword,
    false,
    "hasPassword must come from SecureStore, never persisted disk JSON",
  );
  assert.equal(Object.hasOwn(useWebdavSettings.getState(), "password"), false);

  await useWebdavSettings.getState().savePassword("ultra-secret-pass-999");
  useWebdavSettings.getState().setLastSync({
    lastSyncAt: 1730000000000,
    lastSyncMessage: "已上传",
  });
  await flushAll(storeEnv.load);

  assert.equal(useWebdavSettings.getState().hasPassword, true);
  assert.equal(
    storeEnv.secure.get("dark-study.webdav-password"),
    "ultra-secret-pass-999",
  );

  const rawDisk = storeEnv.disk.get("dark-study-webdav-settings");
  assert(rawDisk, "webdav settings must be persisted to AsyncStorage");
  assert(
    !rawDisk.includes("ultra-secret-pass-999"),
    "WebDAV password must NEVER appear in AsyncStorage",
  );
  assert(
    !rawDisk.includes("leaked-password"),
    "stale password field must not survive persist",
  );
  const parsedDisk = JSON.parse(rawDisk);
  assert.equal(Object.hasOwn(parsedDisk.state, "password"), false);
  assert.equal(Object.hasOwn(parsedDisk.state, "hasPassword"), false);
  assert.equal(parsedDisk.state.username, "alice");
  assert.equal(parsedDisk.state.lastSyncAt, 1730000000000);

  // Preset switching behavior
  useWebdavSettings.getState().setPreset("jianguoyun");
  assert.equal(
    useWebdavSettings.getState().serverUrl,
    "https://dav.jianguoyun.com/dav/",
  );
  useWebdavSettings.getState().setPreset("alist");
  assert.equal(useWebdavSettings.getState().serverUrl, "");

  await useWebdavSettings.getState().clearPassword();
  assert.equal(useWebdavSettings.getState().hasPassword, false);
  assert.equal(storeEnv.secure.has("dark-study.webdav-password"), false);

  // Ensure backup.ts NEVER includes WebDAV settings or password keys
  const { BACKUP_KEYS } = storeEnv.load("src/utils/backup.ts");
  assert.equal(BACKUP_KEYS.includes("dark-study-webdav-settings"), false);
  assert.equal(BACKUP_KEYS.includes("dark-study.webdav-password"), false);
}

async function testConnectionChecks() {
  const env = createEnv();
  const webdav = env.load("src/services/webdavSync.ts");
  const config = {
    serverUrl: "https://dav.jianguoyun.com/dav/",
    username: "用户@example.com",
    remotePath: "/DarkStudy/dark-study-backup.json",
  };

  // 207 Multi-Status on PROPFIND
  const calls = [];
  const ok207 = await withMockFetch(
    async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers, hasSignal: !!init.signal });
      return createMockResponse(207, "<multistatus/>");
    },
    () => webdav.testWebdavConnection(config, "密码123"),
  );
  assert.equal(ok207.ok, true);
  assert.equal(ok207.status, 207);
  assert.equal(ok207.method, "PROPFIND");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://dav.jianguoyun.com/dav/");
  assert.equal(calls[0].method, "PROPFIND");
  assert.equal(calls[0].headers.Depth, "0");
  assert.equal(
    calls[0].headers.Authorization,
    webdav.encodeWebdavBasicAuth("用户@example.com", "密码123"),
  );
  assert.equal(calls[0].hasSignal, true);

  // 401 Unauthorized
  const err401 = await withMockFetch(
    async () => createMockResponse(401),
    () => webdav.testWebdavConnection(config, "wrong-pass"),
  );
  assert.equal(err401.ok, false);
  assert.equal(err401.status, 401);
  assert.match(err401.message, /401/);
  assert.match(err401.message, /认证|密码/);
  assert(!err401.message.includes("wrong-pass"));

  // 403 Forbidden
  const err403 = await withMockFetch(
    async () => createMockResponse(403),
    () => webdav.testWebdavConnection(config, "pass"),
  );
  assert.equal(err403.ok, false);
  assert.equal(err403.status, 403);
  assert.match(err403.message, /403/);

  // 404 Not Found
  const err404 = await withMockFetch(
    async () => createMockResponse(404),
    () => webdav.testWebdavConnection(config, "pass"),
  );
  assert.equal(err404.ok, false);
  assert.equal(err404.status, 404);
  assert.match(err404.message, /404/);

  // 405 on PROPFIND falls back to OPTIONS -> 200
  const fallbackMethods = [];
  const okFallback = await withMockFetch(
    async (_url, init) => {
      fallbackMethods.push(init.method);
      if (init.method === "PROPFIND") return createMockResponse(405);
      return createMockResponse(200);
    },
    () => webdav.testWebdavConnection(config, "pass"),
  );
  assert.equal(okFallback.ok, true);
  assert.equal(okFallback.method, "OPTIONS");
  assert.deepEqual(fallbackMethods, ["PROPFIND", "OPTIONS"]);

  // Network error returns clean Chinese failure without throwing
  const netErr = await withMockFetch(
    async () => {
      throw new TypeError("Network request failed");
    },
    () => webdav.testWebdavConnection(config, "secret-pass"),
  );
  assert.equal(netErr.ok, false);
  assert.match(netErr.message, /无法连接/);
  assert(!netErr.message.includes("secret-pass"));
}

async function testPushPullAndRestore() {
  let restoreCalls = [];
  const tempEnv = createEnv();
  const sampleBackup = buildValidBackup(tempEnv.load);

  const env = createEnv({
    mocks: {
      "@/services/backupStorage": {
        collectBackup: async () => sampleBackup,
        restoreBackup: async (backup, mode) => {
          restoreCalls.push({ backup, mode });
        },
      },
    },
  });
  const webdav = env.load("src/services/webdavSync.ts");
  const backupUtil = env.load("src/utils/backup.ts");

  const config = {
    serverUrl: "https://dav.jianguoyun.com/dav/",
    username: "student@uni.edu",
    remotePath: "/DarkStudy/Term1/dark-study-backup.json",
  };

  // Push: MKCOL each parent dir (tolerating 405 / 201 / 301 / 409) then PUT JSON
  const requests = [];
  const pushResult = await withMockFetch(
    async (url, init) => {
      requests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: init.body,
      });
      if (init.method === "MKCOL" && url.endsWith("/DarkStudy/")) {
        return createMockResponse(405);
      }
      if (init.method === "MKCOL" && url.endsWith("/DarkStudy/Term1/")) {
        return createMockResponse(201);
      }
      if (init.method === "PUT") {
        return createMockResponse(201);
      }
      return createMockResponse(500);
    },
    () => webdav.pushBackupToWebdav(config, "my-app-pass"),
  );

  assert.equal(requests.length, 3);
  assert.equal(requests[0].method, "MKCOL");
  assert.equal(requests[0].url, "https://dav.jianguoyun.com/dav/DarkStudy/");
  assert.equal(requests[1].method, "MKCOL");
  assert.equal(
    requests[1].url,
    "https://dav.jianguoyun.com/dav/DarkStudy/Term1/",
  );
  assert.equal(requests[2].method, "PUT");
  assert.equal(
    requests[2].url,
    "https://dav.jianguoyun.com/dav/DarkStudy/Term1/dark-study-backup.json",
  );
  assert.equal(
    requests[2].headers["Content-Type"],
    "application/json; charset=utf-8",
  );
  assert.equal(
    requests[2].headers.Authorization,
    webdav.encodeWebdavBasicAuth("student@uni.edu", "my-app-pass"),
  );
  assert(!requests[2].body.includes("my-app-pass"));
  assert(!requests[2].body.includes("should-never-export"));
  assert.deepEqual(backupUtil.parseBackup(requests[2].body), sampleBackup);
  assert.equal(pushResult.summary.courses, 1);
  assert.equal(pushResult.summary.grades, 1);
  assert(pushResult.bytes > 0);

  // Also verify ensureRemoteParentDirs tolerates 301 and 409
  const mkcolStatuses = [301, 409];
  await withMockFetch(
    async () => createMockResponse(mkcolStatuses.shift()),
    () =>
      webdav.ensureRemoteParentDirs(
        config.serverUrl,
        config.remotePath,
        webdav.encodeWebdavBasicAuth("student@uni.edu", "my-app-pass"),
      ),
  );

  // Pull: valid backup JSON passes parseBackup and returns { backup, summary }
  const uploadedBody = requests[2].body;
  const pullResult = await withMockFetch(
    async (url, init) => {
      assert.equal(init.method, "GET");
      assert.equal(
        url,
        "https://dav.jianguoyun.com/dav/DarkStudy/Term1/dark-study-backup.json",
      );
      return createMockResponse(200, uploadedBody);
    },
    () => webdav.pullBackupFromWebdav(config, "my-app-pass"),
  );
  assert.deepEqual(pullResult.backup, sampleBackup);
  assert.equal(pullResult.summary.schedules, 1);
  assert.equal(pullResult.summary.courses, 1);
  assert.equal(pullResult.summary.grades, 1);

  // Pull: invalid JSON rejected by parseBackup
  await assert.rejects(
    withMockFetch(
      async () => createMockResponse(200, "{not-valid-json"),
      () => webdav.pullBackupFromWebdav(config, "my-app-pass"),
    ),
    /JSON/,
  );

  // Pull: unsupported backup schema/version rejected by parseBackup
  await assert.rejects(
    withMockFetch(
      async () =>
        createMockResponse(
          200,
          JSON.stringify({ format: "wrong-format", version: 99, data: {} }),
        ),
      () => webdav.pullBackupFromWebdav(config, "my-app-pass"),
    ),
    /格式|版本/,
  );

  // Pull: prototype pollution payload rejected by parseBackup
  await assert.rejects(
    withMockFetch(
      async () =>
        createMockResponse(
          200,
          '{"format":"dark-study-backup","version":1,"createdAt":"2026-01-01T00:00:00.000Z","data":{"__proto__":{}}}',
        ),
      () => webdav.pullBackupFromWebdav(config, "my-app-pass"),
    ),
    /无效字段/,
  );

  // Pull: 404 gives clear Chinese error
  await assert.rejects(
    withMockFetch(
      async () => createMockResponse(404),
      () => webdav.pullBackupFromWebdav(config, "my-app-pass"),
    ),
    /404/,
  );

  // Restore delegates to backupStorage.restoreBackup for both merge and replace
  await webdav.restoreWebdavBackup(pullResult.backup, "merge");
  await webdav.restoreWebdavBackup(pullResult.backup, "replace");
  assert.equal(restoreCalls.length, 2);
  assert.equal(restoreCalls[0].mode, "merge");
  assert.equal(restoreCalls[1].mode, "replace");
}

async function run() {
  await testUrlAndPathNormalization();
  await testUtf8BasicAuth();
  await testCredentialsAndSettingsNoPasswordPersist();
  await testConnectionChecks();
  await testPushPullAndRestore();
  console.log(
    "PASS: WebDAV URL/path normalization & traversal rejection, UTF-8 Basic Auth, SecureStore credentials without AsyncStorage password persistence, PROPFIND/fallback connection checks, MKCOL+PUT push, and GET+parseBackup pull/restore verified",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
