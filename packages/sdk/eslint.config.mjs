import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**"],
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
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
          message:
            "Avoid innerHTML. Use textContent, replaceChildren(), or DOM construction. For trusted static HTML (e.g. build-time SVG icons), route through setTrustedInnerHTML + TrustedStaticHTML from utils/trusted-html.ts instead of an inline eslint-disable.",
        },
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.property.name='outerHTML']",
          message:
            "Avoid outerHTML. Replace the element explicitly via DOM APIs.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='insertAdjacentHTML']",
          message:
            "Avoid insertAdjacentHTML. Use DOM construction instead.",
        },
      ],
    },
  },
];
