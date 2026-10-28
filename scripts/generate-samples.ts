// Writes synthetic sample files to samples/ for live demo uploads (see README → Demo script).
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_FILES } from "./lib/demo-data";
import { renderDoc } from "./lib/render";

(async () => {
  const dir = path.resolve(process.cwd(), "samples");
  fs.mkdirSync(dir, { recursive: true });
  for (const spec of SAMPLE_FILES) {
    const { buffer } = await renderDoc(spec);
    fs.writeFileSync(path.join(dir, spec.file), buffer);
    console.log(`samples/${spec.file}`);
  }
  // A text file disguised as a PDF, to demonstrate content-based upload rejection.
  fs.writeFileSync(path.join(dir, "invalid-renamed-file.pdf"), "This is a plain-text file renamed to .pdf. Pravah AI rejects it because its content is not a PDF.\n");
  console.log("samples/invalid-renamed-file.pdf");
})();
