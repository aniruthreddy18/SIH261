// Upload validation: extension, declared MIME type, size and magic bytes must all agree.
// A valid extension alone is never trusted.

export type SupportedKind = "pdf" | "png" | "jpeg";

const EXTENSIONS: Record<string, SupportedKind> = { pdf: "pdf", png: "png", jpg: "jpeg", jpeg: "jpeg" };
const MIME: Record<SupportedKind, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
};
export const CANONICAL_MIME: Record<SupportedKind, string> = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" };

export function sniffKind(buf: Buffer): SupportedKind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  return null;
}

export interface FileCheckInput {
  fileName: string;
  declaredMime: string;
  buffer: Buffer;
  maxBytes: number;
}

export type FileCheckResult = { ok: true; kind: SupportedKind; mimeType: string; safeName: string } | { ok: false; error: string };

/** Strip path components and unsafe characters from a user-supplied filename (display only). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "document";
}

export function checkUpload({ fileName, declaredMime, buffer, maxBytes }: FileCheckInput): FileCheckResult {
  const safeName = sanitizeFileName(fileName);
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
  const byExt = EXTENSIONS[ext];
  if (!byExt) return { ok: false, error: `Unsupported file type ".${ext || "?"}". Upload a PDF, PNG or JPEG file.` };
  if (buffer.length === 0) return { ok: false, error: "The file is empty." };
  if (buffer.length > maxBytes) {
    return { ok: false, error: `The file is ${(buffer.length / 1048576).toFixed(1)} MB, which exceeds the ${(maxBytes / 1048576).toFixed(0)} MB limit.` };
  }
  const declared = (declaredMime || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && !MIME[byExt].includes(declared)) {
    return { ok: false, error: `The declared content type (${declared}) does not match the .${ext} extension.` };
  }
  const sniffed = sniffKind(buffer);
  if (sniffed !== byExt) {
    return { ok: false, error: `The file content does not match its .${ext} extension. The file may be renamed or corrupt.` };
  }
  return { ok: true, kind: byExt, mimeType: CANONICAL_MIME[byExt], safeName };
}
