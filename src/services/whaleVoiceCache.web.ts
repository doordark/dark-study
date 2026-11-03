// Web keeps existing speech compatibility. Fish playback uses a temporary Blob,
// never localStorage; native devices use the persistent FileSystem LRU cache.
export { voiceCacheIdentity, voiceCacheKey } from "./whaleVoiceCacheKey";
export async function getCachedVoice(_identity: string): Promise<string | null> { return null; }
export async function putCachedVoice(_identity: string, bytes: Uint8Array): Promise<string> {
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }));
}
export async function clearVoiceCache(): Promise<void> {}
export async function getVoiceCacheSize(): Promise<number> { return 0; }
export function releaseVoiceUri(uri: string) { URL.revokeObjectURL(uri); }
