import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { bytesToBase64 } from "@/utils/base64";

export interface PickedImage {
  base64: string;
  mimeType: string;
  uri: string;
}

export interface PickedDocument {
  text: string;
  name: string;
  uri: string;
}

/** 打开相册并返回 base64 图片 */
export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    base64: true,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  if (!asset.base64) {
    // 兜底：从 uri 读字节
    const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
    return {
      base64: bytesToBase64(bytes),
      mimeType: asset.mimeType ?? "image/jpeg",
      uri: asset.uri,
    };
  }
  return {
    base64: asset.base64,
    mimeType: asset.mimeType ?? "image/jpeg",
    uri: asset.uri,
  };
}

/** 选择背景图：开启系统裁剪/缩放编辑器，支持捏合缩放调整取景 */
export async function pickImageForBackground(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    base64: true,
    allowsEditing: true,
    aspect: [9, 16],
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  return {
    base64: asset.base64 ?? "",
    mimeType: asset.mimeType ?? "image/jpeg",
    uri: asset.uri,
  };
}

/** 打开相机拍摄（用于拍课表 / 作息表） */
export async function pickImageFromCamera(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.85,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  if (!asset.base64) {
    const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
    return {
      base64: bytesToBase64(bytes),
      mimeType: asset.mimeType ?? "image/jpeg",
      uri: asset.uri,
    };
  }
  return {
    base64: asset.base64,
    mimeType: asset.mimeType ?? "image/jpeg",
    uri: asset.uri,
  };
}

const TEXT_EXTENSIONS = [
  "txt",
  "csv",
  "tsv",
  "json",
  "md",
  "html",
  "htm",
  "xml",
  "xhtml",
  "log",
];

/** 打开系统文档选择器，读取文本类文件内容 */
export async function pickTextDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["text/*", "application/json", "text/csv", "application/xml"],
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const ext = asset.name?.split(".").pop()?.toLowerCase() ?? "";
  if (!TEXT_EXTENSIONS.includes(ext) && !asset.mimeType?.startsWith("text/")) {
    throw new Error(
      "暂仅支持文本类文件（txt / csv / json / md 等），图片请走「AI 识图」",
    );
  }

  const text = await new File(asset.uri).text();
  return { text, name: asset.name ?? "文件", uri: asset.uri };
}
