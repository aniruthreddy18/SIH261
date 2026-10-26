// Private document storage on local disk. Files are stored under random names outside the
// public web root and are only ever served through authorised route handlers.
// For deployment, replace this module with an object-store implementation (same interface).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function root() {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");
}

const KEY_RE = /^[a-f0-9]{48}$/;

function resolveKey(key: string, sub = "documents"): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  const base = path.join(root(), sub);
  const full = path.join(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Invalid storage path");
  return full;
}

export async function saveFile(buffer: Buffer): Promise<string> {
  const key = crypto.randomBytes(24).toString("hex");
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer, { flag: "wx", mode: 0o600 });
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

export async function readCachedPreview(key: string, page: number): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(root(), "previews", `${resolveKey(key).split(path.sep).pop()}-p${Math.trunc(page)}.png`));
  } catch {
    return null;
  }
}

export async function writeCachedPreview(key: string, page: number, png: Buffer): Promise<void> {
  const dir = path.join(root(), "previews");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${resolveKey(key).split(path.sep).pop()}-p${Math.trunc(page)}.png`), png);
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
