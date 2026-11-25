export { voiceCacheIdentity, voiceCacheKey } from "./whaleVoiceCacheKey";

const memoryCache = new Map<string, Uint8Array>();
const MAX_ITEMS = 32;

export async function getCachedVoice(identity: string): Promise<string | null> {
  const bytes = memoryCache.get(identity);
  if (!bytes) return null;
  // Refresh LRU order
  memoryCache.delete(identity);
  memoryCache.set(identity, bytes);
  return URL.createObjectURL(new Blob([bytes.slice()], { type: "audio/mpeg" }));
}

export async function putCachedVoice(identity: string, bytes: Uint8Array): Promise<string> {
  if (memoryCache.has(identity)) memoryCache.delete(identity);
  memoryCache.set(identity, bytes);
  while (memoryCache.size > MAX_ITEMS) {
    const oldest = memoryCache.keys().next().value;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
  return URL.createObjectURL(new Blob([bytes.slice()], { type: "audio/mpeg" }));
}

export async function clearVoiceCache(): Promise<void> {
  memoryCache.clear();
}

export async function getVoiceCacheSize(): Promise<number> {
  let total = 0;
  for (const bytes of memoryCache.values()) total += bytes.byteLength;
  return total;
}

export function releaseVoiceUri(uri: string): void {
  if (uri.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(uri);
    } catch {}
  }
}
