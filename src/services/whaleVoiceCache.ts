import { Directory, File, Paths } from "expo-file-system";
import { voiceCacheKey } from "./whaleVoiceCacheKey";
export { voiceCacheKey, voiceCacheIdentity } from "./whaleVoiceCacheKey";

const MAX_BYTES = 100 * 1024 * 1024;
interface Entry { key: string; identity: string; file: string; size: number; lastAccess: number }
let entries: Entry[] | null = null;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
function directory() { return new Directory(Paths.cache, "whale-tts"); }

async function load(): Promise<Entry[]> {
  const dir = directory();
  dir.create({ intermediates: true, idempotent: true });
  if (entries) return entries;
  try {
    const index = new File(dir, "index.json");
    const raw: unknown = index.exists ? JSON.parse(await index.text()) : [];
    if (!Array.isArray(raw) || !raw.every((e) => e && typeof e.identity === "string" &&
      typeof e.key === "string" && /^\d+_[0-9a-f]{16}$/.test(e.key) && e.file === `${e.key}.mp3` &&
      Number.isFinite(e.size) && e.size > 0 && Number.isFinite(e.lastAccess))) throw new Error("Invalid index");
    entries = raw as Entry[];
    const known = new Set(entries.map((e) => e.file));
    // Remove interrupted writes and unindexed audio from this cache directory only.
    for (const item of dir.list()) if (item instanceof File && item.name !== "index.json" && !known.has(item.name)) item.delete();
  } catch {
    entries = [];
    for (const item of dir.list()) if (item instanceof File) item.delete();
  }
  return entries;
}

async function save() {
  await new File(directory(), "index.json").write(JSON.stringify(entries));
}

export function getCachedVoice(identity: string): Promise<string | null> {
  return serial(async () => {
    const list = await load();
    const entry = list.find((e) => e.key === voiceCacheKey(identity) && e.identity === identity);
    if (!entry) return null;
    const file = new File(directory(), entry.file);
    if (!file.exists || file.size !== entry.size) {
      entries = list.filter((e) => e !== entry);
      if (file.exists) file.delete();
      await save();
      return null;
    }
    entry.lastAccess = Date.now();
    // A metadata write failure must not hide usable local audio.
    await save().catch(() => {});
    return file.uri;
  });
}

export function putCachedVoice(identity: string, bytes: Uint8Array): Promise<string> {
  return serial(async () => {
    const list = await load();
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Audio exceeds cache limit");
    const key = voiceCacheKey(identity);
    const file = new File(directory(), `${key}.mp3`);
    const temp = new File(directory(), `${key}.tmp`);
    await temp.write(bytes);
    await temp.move(file, { overwrite: true });
    entries = list.filter((e) => e.key !== key);
    entries.push({ key, identity, file: `${key}.mp3`, size: bytes.length, lastAccess: Date.now() });
    let size = entries.reduce((n, e) => n + e.size, 0);
    for (const entry of [...entries].sort((a, b) => a.lastAccess - b.lastAccess)) {
      if (size <= MAX_BYTES) break;
      if (entry.key === key) continue;
      const old = new File(directory(), entry.file);
      if (old.exists) old.delete();
      size -= entry.size;
      entries = entries.filter((e) => e !== entry);
    }
    await save().catch(() => {});
    return file.uri;
  });
}

export function clearVoiceCache(): Promise<void> {
  return serial(async () => {
    const dir = directory();
    if (dir.exists) dir.delete();
    entries = null;
  });
}

export function getVoiceCacheSize(): Promise<number> {
  return serial(async () => { await load(); return directory().size ?? 0; });
}

export function releaseVoiceUri(_uri: string) { /* Native file is owned by the LRU cache. */ }
