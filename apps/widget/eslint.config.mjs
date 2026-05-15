import { config } from "@repo/eslint-config/react-internal";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: [
      "scripts/**/*.{js,ts}",
      "embed-build/**/*.{js,ts}",
      "vite.embed.config.ts",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: [".react-router/**", "build/**", "dist-embed/**", "public/widget.js"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
