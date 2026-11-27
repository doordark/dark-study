import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import {
  cleanHtmlToText,
  decodeTextBytes,
  parseXlsxToTsv,
} from "@/utils/documentParser";
import { parsePdfToText } from "@/utils/pdfParser";
import { parseXlsToTsv } from "@/utils/xlsParser";
export { readImageBase64 } from "@/utils/readImageBase64";

export class PermissionDeniedError extends Error {
  readonly permission: "camera" | "library";
  constructor(permission: "camera" | "library", message: string) {
    super(message);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

export interface PickedImage {
  /** 仅在背景图或显式读取时填充；识别任务按需读取，避免 9 张大图同时占满内存 */
  base64?: string;
  mimeType: string;
  uri: string;
}

export type DocumentFormat =
  | "text"
  | "csv"
  | "json"
  | "html"
  | "xlsx"
  | "xls"
  | "pdf"
  | "ics";

export interface PickedDocument {
  text: string;
  name: string;
  uri: string;
  format: DocumentFormat;
}

function toLazyPickedImage(asset: ImagePicker.ImagePickerAsset): PickedImage {
  return {
    mimeType: asset.mimeType ?? "image/jpeg",
    uri: asset.uri,
  };
}

/** 打开相册（单选，按需延迟读取 base64） */
export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PermissionDeniedError(
      "library",
      "未获得相册读取权限，请前往系统设置开启相册权限后再试",
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.75,
    base64: false,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  return toLazyPickedImage(result.assets[0]);
}

/** 相册多选：一次最多 9 张，用于批量识别课表 / 作息表 / 成绩单 */
export async function pickImagesFromLibrary(
  limit = 9,
): Promise<PickedImage[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PermissionDeniedError(
      "library",
      "未获得相册读取权限，请前往系统设置开启相册权限后再试",
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.75,
    base64: false,
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map(toLazyPickedImage);
}

/** 选择背景图：开启系统裁剪/缩放编辑器，支持捏合缩放调整取景 */
export async function pickImageForBackground(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PermissionDeniedError(
      "library",
      "未获得相册读取权限，请前往系统设置开启相册权限后再试",
    );
  }

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

/** 打开相机拍摄（用于拍课表 / 作息表 / 成绩单） */
export async function pickImageFromCamera(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new PermissionDeniedError(
      "camera",
      "未获得相机权限，请前往系统设置开启相机权限后再试",
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.75,
    base64: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  return toLazyPickedImage(result.assets[0]);
}

const SUPPORTED_EXTENSIONS = new Set([
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
  "ics",
  "xlsx",
  "xls",
  "pdf",
]);

export function detectFormat(ext: string, mimeType?: string): DocumentFormat | null {
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "xlsx" || mimeType?.includes("spreadsheetml")) return "xlsx";
  if (ext === "xls" || mimeType === "application/vnd.ms-excel") return "xls";
  if (ext === "ics" || mimeType === "text/calendar") return "ics";
  if (ext === "html" || ext === "htm" || ext === "xhtml" || mimeType === "text/html") {
    return "html";
  }
  if (ext === "json" || mimeType === "application/json") return "json";
  if (ext === "csv" || ext === "tsv" || mimeType === "text/csv") return "csv";
  if (SUPPORTED_EXTENSIONS.has(ext) || mimeType?.startsWith("text/")) {
    return "text";
  }
  return null;
}

/** 打开系统文档选择器，自动解析 pdf / xls / xlsx / csv(含GBK) / ics / html / json / txt 等常见教务导出文件 */
export async function pickTextDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: [
      "text/*",
      "application/json",
      "text/csv",
      "application/xml",
      "text/calendar",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "*/*",
    ],
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const name = asset.name ?? "文件";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const format = detectFormat(ext, asset.mimeType);
  if (!format) {
    throw new Error(
      "暂支持 pdf / xls / xlsx / csv / ics / json / html / txt / md 文件；图片请走「相册识图 / 拍照识别」",
    );
  }

  const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
  let text: string;
  if (format === "pdf") {
    text = parsePdfToText(bytes);
  } else if (format === "xls") {
    text = parseXlsToTsv(bytes);
  } else if (format === "xlsx") {
    text = parseXlsxToTsv(bytes);
  } else {
    const decoded = decodeTextBytes(bytes);
    text = format === "html" ? cleanHtmlToText(decoded) : decoded;
  }

  return { text, name, uri: asset.uri, format };
}
