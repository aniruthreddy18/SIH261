import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", ".next-e2e/**", "storage-test/**", "storage-e2e/**", "node_modules/**", "storage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
];

export default config;
