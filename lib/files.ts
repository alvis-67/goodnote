export const STORAGE_BUCKET = "request-files";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 8;
export const MAX_BODY_LENGTH = 4000;

export const FILE_RULES = [
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { mime: "image/png", extensions: ["png"] },
  { mime: "image/webp", extensions: ["webp"] },
  { mime: "image/gif", extensions: ["gif"] },
  { mime: "image/heic", extensions: ["heic"] },
  { mime: "image/heif", extensions: ["heif"] },
  { mime: "application/pdf", extensions: ["pdf"] },
  { mime: "text/plain", extensions: ["txt"] },
  { mime: "application/msword", extensions: ["doc"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
  },
  { mime: "application/vnd.ms-excel", extensions: ["xls"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
  },
] as const;

export type AllowedMime = (typeof FILE_RULES)[number]["mime"];

const MIME_SET = new Set<string>(FILE_RULES.map((rule) => rule.mime));

export type FileMeta = {
  name: string;
  type: string;
  size: number;
};

export type ResolvedFile = {
  fileName: string;
  mime: AllowedMime;
  extension: string;
  size: number;
};

export function isAllowedMime(value: string): value is AllowedMime {
  return MIME_SET.has(value);
}

export function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function displayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 180) || "檔案";
}

export function resolveFile(file: FileMeta): ResolvedFile | null {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return null;
  }
  const extension = extensionOf(file.name);
  const declared = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  const byExtension = FILE_RULES.find((rule) =>
    (rule.extensions as readonly string[]).includes(extension),
  );

  if (isAllowedMime(declared)) {
    const rule = FILE_RULES.find((item) => item.mime === declared);
    if (!rule || !(rule.extensions as readonly string[]).includes(extension)) return null;
    return {
      fileName: displayFileName(file.name),
      mime: declared,
      extension,
      size: file.size,
    };
  }

  if ((declared === "" || declared === "application/octet-stream") && byExtension) {
    return {
      fileName: displayFileName(file.name),
      mime: byExtension.mime,
      extension,
      size: file.size,
    };
  }

  return null;
}

export function validateFiles(files: FileMeta[]): string | null {
  if (files.length > MAX_FILES) {
    return `最多上載 ${MAX_FILES} 個檔案。`;
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return `「${displayFileName(file.name)}」超過 20MB。`;
    }
    if (!resolveFile(file)) {
      return `「${displayFileName(file.name)}」的格式不支援。請上載相片、PDF 或常見的文件。`;
    }
  }
  return null;
}

export function acceptAttribute(): string {
  const values = new Set<string>();
  for (const rule of FILE_RULES) {
    values.add(rule.mime);
    for (const extension of rule.extensions) values.add(`.${extension}`);
  }
  return Array.from(values).join(",");
}

const STORAGE_PATH =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z0-9]+)$/;

export type StoragePathParts = {
  clientId: string;
  requestId: string;
  messageId: string;
  attachmentId: string;
  extension: string;
};

export function parseStoragePath(path: string): StoragePathParts | null {
  const match = STORAGE_PATH.exec(path);
  if (!match) return null;
  const [, clientId, requestId, messageId, attachmentId, extension] = match;
  if (!clientId || !requestId || !messageId || !attachmentId || !extension) return null;
  return { clientId, requestId, messageId, attachmentId, extension };
}

export function buildStoragePath(parts: StoragePathParts): string {
  return `${parts.clientId}/${parts.requestId}/${parts.messageId}/${parts.attachmentId}.${parts.extension}`;
}
