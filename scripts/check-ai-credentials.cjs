const assert = require("node:assert/strict");
const createLoader = require("./load-project-ts.cjs");

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  let setOverride = null;
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
      if (setOverride) return setOverride(key, value, opts);
      secure.set(key, value);
    },
    deleteItemAsync: async (key) => {
      secureCalls.del.push(key);
      if (deleteOverride) return deleteOverride(key);
      secure.delete(key);
    },
  };

  const load = createLoader({
    "@react-native-async-storage/async-storage": asyncStorage,
    "react-native": { Platform: platform },
    "expo-secure-store": secureStore,
  });

  return {
    disk,
    secure,
    secureCalls,
    platform,
    load,
    setGetOverride: (fn) => {
      getOverride = fn;
    },
    setSetOverride: (fn) => {
      setOverride = fn;
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

async function testAiCredentialsService() {
  // Native SecureStore behavior
  const nativeEnv = createEnv({ os: "ios" });
  const creds = nativeEnv.load("src/services/aiCredentials.ts");
  assert.equal(await creds.getAiApiKey(), "");
  assert.equal(await creds.hasAiApiKey(), false);

  await creds.setAiApiKey("  sk-native-secret  ");
  assert.equal(nativeEnv.secure.get("dark-study.ai-api-key"), "sk-native-secret");
  assert.equal(nativeEnv.secureCalls.set.length, 1);
  assert.deepEqual(nativeEnv.secureCalls.set[0].opts, {
    keychainAccessible: 5,
  });
  assert.equal(await creds.getAiApiKey(), "sk-native-secret");
  assert.equal(await creds.hasAiApiKey(), true);

  // Whitespace-only value deletes from SecureStore
  await creds.setAiApiKey("   ");
  assert.equal(nativeEnv.secure.has("dark-study.ai-api-key"), false);
  assert.equal(nativeEnv.secureCalls.del.length, 1);
  assert.equal(await creds.getAiApiKey(), "");
  assert.equal(await creds.hasAiApiKey(), false);

  // Error tolerance on get/delete
  nativeEnv.setGetOverride(async () => {
    throw new Error("keystore locked");
  });
  assert.equal(await creds.getAiApiKey(), "");
  nativeEnv.setGetOverride(null);

  nativeEnv.setDeleteOverride(async () => {
    throw new Error("already absent");
  });
  await creds.deleteAiApiKey();
  nativeEnv.setDeleteOverride(null);

  // Web in-memory fallback (never calls SecureStore)
  const webEnv = createEnv({ os: "web" });
  const webCreds = webEnv.load("src/services/aiCredentials.ts");
  assert.equal(await webCreds.getAiApiKey(), "");
  assert.equal(await webCreds.hasAiApiKey(), false);
  await webCreds.setAiApiKey("  sk-web-session  ");
  assert.equal(await webCreds.getAiApiKey(), "sk-web-session");
  assert.equal(await webCreds.hasAiApiKey(), true);
  await webCreds.setAiApiKey("  ");
  assert.equal(await webCreds.getAiApiKey(), "");
  assert.equal(await webCreds.hasAiApiKey(), false);
  assert.equal(webEnv.secureCalls.get.length, 0);
  assert.equal(webEnv.secureCalls.set.length, 0);
  assert.equal(webEnv.secureCalls.del.length, 0);
}

async function testPartializeAndSetApiKey() {
  const env = createEnv({ os: "android" });
  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  useSettings.getState().setApiKey("  sk-live-secret  ");
  useSettings.getState().setAppearance("dark");
  assert.equal(useSettings.getState().apiKey, "sk-live-secret");
  assert.equal(useSettings.getState().apiKeyHydrated, true);

  await flushAll(env.load);

  // SecureStore receives trimmed key with WHEN_UNLOCKED_THIS_DEVICE_ONLY
  assert.equal(env.secure.get("dark-study.ai-api-key"), "sk-live-secret");
  assert.deepEqual(env.secureCalls.set[env.secureCalls.set.length - 1].opts, {
    keychainAccessible: 5,
  });

  // Persisted AsyncStorage snapshot NEVER contains apiKey or apiKeyHydrated
  const raw = env.disk.get("dark-study-settings");
  assert(raw, "dark-study-settings should be persisted");
  assert(!raw.includes("sk-live-secret"), "plaintext key must never be persisted");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.state.appearance, "dark");
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed.state, "apiKeyHydrated"), false);

  // Clearing apiKey deletes from SecureStore and still never leaks into AsyncStorage
  useSettings.getState().setApiKey("   ");
  assert.equal(useSettings.getState().apiKey, "");
  await flushAll(env.load);
  assert.equal(env.secure.has("dark-study.ai-api-key"), false);
  const rawAfterClear = env.disk.get("dark-study-settings");
  const parsedAfterClear = JSON.parse(rawAfterClear);
  assert.equal(Object.hasOwn(parsedAfterClear.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsedAfterClear.state, "apiKeyHydrated"), false);
}

async function testLegacyMigrationFromMainKey() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({
          version: 0,
          state: {
            apiKey: "  sk-legacy-plaintext  ",
            appearance: "dark",
            material: "clear",
            whalePhrase: "旧口令",
          },
        }),
      ],
    ],
  });

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  assert.equal(useSettings.getState().apiKey, "sk-legacy-plaintext");
  assert.equal(useSettings.getState().apiKeyHydrated, true);
  assert.equal(useSettings.getState().appearance, "dark");
  assert.equal(useSettings.getState().material, "clear");
  assert.equal(useSettings.getState().whalePhrase, "旧口令");

  // Migrated into SecureStore
  assert.equal(env.secure.get("dark-study.ai-api-key"), "sk-legacy-plaintext");

  // Scrubbed from AsyncStorage
  const raw = env.disk.get("dark-study-settings");
  assert(raw, "settings must remain persisted after scrub");
  assert(!raw.includes("sk-legacy-plaintext"), "legacy plaintext key must be scrubbed");
  const parsed = JSON.parse(raw);
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed.state, "apiKeyHydrated"), false);
  assert.equal(parsed.state.appearance, "dark");
  assert.equal(parsed.state.material, "clear");
}

async function testLegacyMigrationFromCourseflowFallback() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "courseflow-settings",
        JSON.stringify({
          version: 0,
          state: {
            apiKey: "sk-courseflow-old",
            showWeekend: false,
          },
        }),
      ],
    ],
  });

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  assert.equal(useSettings.getState().apiKey, "sk-courseflow-old");
  assert.equal(useSettings.getState().apiKeyHydrated, true);
  assert.equal(useSettings.getState().showWeekend, false);
  assert.equal(env.secure.get("dark-study.ai-api-key"), "sk-courseflow-old");

  const raw = env.disk.get("dark-study-settings");
  assert(raw && !raw.includes("sk-courseflow-old"));
  const parsed = JSON.parse(raw);
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(parsed.state.showWeekend, false);
  assert.equal(
    env.disk.has("courseflow-settings"),
    false,
    "legacy courseflow-settings key must be removed so no plaintext key remains",
  );
}

async function testHydrateFromSecureStore() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({
          version: 0,
          state: { appearance: "light" },
        }),
      ],
    ],
    initialSecure: [["dark-study.ai-api-key", "sk-secure-stored"]],
  });

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  assert.equal(useSettings.getState().apiKey, "sk-secure-stored");
  assert.equal(useSettings.getState().apiKeyHydrated, true);
  assert.equal(useSettings.getState().appearance, "light");

  const raw = env.disk.get("dark-study-settings");
  assert(!raw.includes("sk-secure-stored"));
  const parsed = JSON.parse(raw);
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed.state, "apiKeyHydrated"), false);
}

async function testStaleHydrateDoesNotClobberNewerSetApiKey() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({ version: 0, state: { appearance: "system" } }),
      ],
    ],
    initialSecure: [["dark-study.ai-api-key", "sk-stale-old"]],
  });

  const pendingRead = createDeferred();
  env.setGetOverride(async () => pendingRead.promise);

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();

  // Explicitly start a slow hydrateApiKey while SecureStore.getItemAsync is in flight
  const slowHydrate = useSettings.getState().hydrateApiKey();
  await new Promise((r) => setTimeout(r, 0));

  // User saves a newer key while the async read is still pending
  useSettings.getState().setApiKey("  sk-fresh-user-key  ");
  assert.equal(useSettings.getState().apiKey, "sk-fresh-user-key");

  // Stale async read finally resolves with the old key
  pendingRead.resolve("sk-stale-old");
  await slowHydrate;
  await flushAll(env.load);

  assert.equal(
    useSettings.getState().apiKey,
    "sk-fresh-user-key",
    "stale async hydrateApiKey must never clobber a newer setApiKey call",
  );
  assert.equal(
    env.secure.get("dark-study.ai-api-key"),
    "sk-fresh-user-key",
    "SecureStore must hold the newer user key",
  );
}

async function testLegacyMigrationPreservesExistingSecureStoreKey() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({
          version: 0,
          state: {
            apiKey: "sk-older-legacy",
            appearance: "dark",
          },
        }),
      ],
    ],
    initialSecure: [["dark-study.ai-api-key", "sk-newer-secure"]],
  });

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  assert.equal(
    useSettings.getState().apiKey,
    "sk-newer-secure",
    "existing SecureStore key must win over stale un-scrubbed legacy key",
  );
  assert.equal(useSettings.getState().apiKeyHydrated, true);
  assert.equal(env.secure.get("dark-study.ai-api-key"), "sk-newer-secure");
  assert.equal(
    env.secureCalls.set.length,
    0,
    "migration must not overwrite an existing non-empty SecureStore key",
  );

  const raw = env.disk.get("dark-study-settings");
  assert(raw && !raw.includes("sk-older-legacy"), "stale legacy plaintext key must still be scrubbed");
  const parsed = JSON.parse(raw);
  assert.equal(Object.hasOwn(parsed.state, "apiKey"), false);
  assert.equal(Object.hasOwn(parsed.state, "apiKeyHydrated"), false);
  assert.equal(parsed.state.appearance, "dark");
}

async function testConcurrentHydratePreservesLegacyKeyOnMigrationFailure() {
  const env = createEnv({
    os: "android",
    initialDisk: [
      [
        "dark-study-settings",
        JSON.stringify({
          version: 0,
          state: {
            apiKey: "sk-legacy-preserved",
            appearance: "light",
          },
        }),
      ],
    ],
  });

  const pendingFail = createDeferred();
  env.setSetOverride(async () => pendingFail.promise);

  const { useSettings } = env.load("src/store/useSettings.ts");
  await useSettings.persist.rehydrate();

  // Call #1 (started by onRehydrateStorage) is blocked on setItemAsync; launch concurrent Call #2.
  const concurrentHydrate = useSettings.getState().hydrateApiKey();
  await new Promise((r) => setTimeout(r, 0));

  pendingFail.reject(new Error("keystore locked"));
  await concurrentHydrate;
  await flushAll(env.load);

  assert.equal(
    useSettings.getState().apiKey,
    "sk-legacy-preserved",
    "concurrent hydrateApiKey must not wipe preserved legacy key when migration fails",
  );
  assert.equal(useSettings.getState().apiKeyHydrated, true);
  assert.equal(env.secure.has("dark-study.ai-api-key"), false);
  assert(
    env.disk.get("dark-study-settings").includes("sk-legacy-preserved"),
    "failed migration must not scrub AsyncStorage before SecureStore write succeeds",
  );

  // Once SecureStore recovers, a subsequent hydrateApiKey retries migration and scrubs plaintext.
  env.setSetOverride(null);
  await useSettings.getState().hydrateApiKey();
  await flushAll(env.load);

  assert.equal(useSettings.getState().apiKey, "sk-legacy-preserved");
  assert.equal(env.secure.get("dark-study.ai-api-key"), "sk-legacy-preserved");
  const scrubbedRaw = env.disk.get("dark-study-settings");
  assert(!scrubbedRaw.includes("sk-legacy-preserved"));
  assert.equal(Object.hasOwn(JSON.parse(scrubbedRaw).state, "apiKey"), false);
}

async function testSetApiKeyRejectsSafelyWithoutUnhandledRejection() {
  const env = createEnv({ os: "android" });
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const { useSettings } = env.load("src/store/useSettings.ts");
    await useSettings.persist.rehydrate();
    await useSettings.getState().hydrateApiKey();

    env.setSetOverride(async () => {
      throw new Error("simulated keychain write failure");
    });

    useSettings.getState().setApiKey("sk-error-safe");
    assert.equal(useSettings.getState().apiKey, "sk-error-safe");
    await flushAll(env.load);
    assert.equal(unhandled, null, "setApiKey must catch SecureStore errors safely");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

async function run() {
  await testAiCredentialsService();
  await testPartializeAndSetApiKey();
  await testLegacyMigrationFromMainKey();
  await testLegacyMigrationFromCourseflowFallback();
  await testHydrateFromSecureStore();
  await testStaleHydrateDoesNotClobberNewerSetApiKey();
  await testLegacyMigrationPreservesExistingSecureStoreKey();
  await testConcurrentHydratePreservesLegacyKeyOnMigrationFailure();
  await testSetApiKeyRejectsSafelyWithoutUnhandledRejection();
  console.log(
    "PASS: AI API key SecureStore service, partialize exclusion, legacy migration & scrubbing, race-condition guard, and error safety verified",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
