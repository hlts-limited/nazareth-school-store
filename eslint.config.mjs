import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "storage/**"],
  },
  {
    // Module boundaries: code outside a module may only import its public index.
    // Inside a module, use relative imports ("./service").
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message: "Import from the module's public index instead, e.g. '@/modules/payments'.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
