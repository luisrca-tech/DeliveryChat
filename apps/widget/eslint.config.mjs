import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: [".react-router/**", "build/**"],
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
    files: ["src/widget/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
          message:
            "Avoid innerHTML. Use textContent, replaceChildren(), or DOM construction. Static SVG icon writes may be whitelisted with an inline eslint-disable-next-line.",
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
