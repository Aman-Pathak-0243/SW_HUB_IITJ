import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Verified pre-migration snapshots (DL-003) are frozen V1 source — never lint
      // them (they intentionally preserve the old code, e.g. <img>, base64 forms).
      "backups/**",
    ],
  },
];

export default eslintConfig;
