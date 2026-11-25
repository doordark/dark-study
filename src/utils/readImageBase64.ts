import { bytesToBase64 } from "@/utils/base64";

/** 按需从本地 uri 读取图片 base64（仅云端识图时触发，离线 OCR 零编码开销，且不引入顶层原生选择器依赖） */
export async function readImageBase64(
  uri: string,
  cachedBase64?: string,
): Promise<string> {
  if (cachedBase64) return cachedBase64;
  const { File } = await import("expo-file-system");
  const bytes = new Uint8Array(await new File(uri).arrayBuffer());
  return bytesToBase64(bytes);
}
