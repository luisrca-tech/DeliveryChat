import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config} */
export default [
  {
    ignores: [".output/**", "dist/**", "build/**"],
  },
  ...config,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is forbidden in admin. Render via JSX children so React escapes the content.",
        },
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
          message:
            "Avoid innerHTML. Use textContent or DOM APIs instead.",
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

