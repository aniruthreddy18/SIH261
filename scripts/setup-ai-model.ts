// Downloads the optional local AI model (BERT-SQuAD int8, ~119 MB, Apache-2.0) from the ONNX
// Model Zoo and verifies its size and SHA-256 before installing it. Run once: `npm run ai:setup`.
// After this, AI extraction runs fully offline. Uses curl (bundled with macOS, Windows 10+ and most
// Linux distributions), which also honours HTTPS_PROXY.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AI_MODEL } from "../src/lib/extraction/ai/extractor";

const target = process.env.AI_MODEL_PATH || path.join(process.cwd(), "models", "bert-squad", AI_MODEL.file);

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

async function verify(file: string): Promise<string | null> {
  const size = fs.statSync(file).size;
  if (size !== AI_MODEL.sizeBytes) return `size ${size} bytes, expected ${AI_MODEL.sizeBytes}`;
  const hash = await sha256(file);
  if (hash !== AI_MODEL.sha256) return `SHA-256 ${hash}, expected ${AI_MODEL.sha256}`;
  return null;
}

async function main() {
  console.log(`Local AI model: ${AI_MODEL.name} — ${AI_MODEL.description}`);
  console.log(`Source: ${AI_MODEL.source} · License: ${AI_MODEL.license}`);
  if (fs.existsSync(target) && !(await verify(target))) {
    console.log(`Already installed and verified: ${path.relative(process.cwd(), target)}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.download`;
  console.log(`Downloading ${(AI_MODEL.sizeBytes / 1048576).toFixed(0)} MB…`);
  const r = spawnSync("curl", ["-fL", "--retry", "3", "--progress-bar", "-o", partial, AI_MODEL.url], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    fs.rmSync(partial, { force: true });
    throw new Error(r.error ? `curl could not be started (${r.error.message}). Install curl or download ${AI_MODEL.url} to ${target} manually.` : `Download failed (curl exit code ${r.status}).`);
  }
  const problem = await verify(partial);
  if (problem) {
    fs.rmSync(partial, { force: true });
    throw new Error(`Downloaded file failed verification (${problem}). Nothing was installed.`);
  }
  fs.renameSync(partial, target);
  console.log(`Installed and verified: ${path.relative(process.cwd(), target)}`);
  console.log("AI extraction is now available for new uploads (restart the dev server if it is running).");
}

main().catch((err) => {
  console.error(`AI model setup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
