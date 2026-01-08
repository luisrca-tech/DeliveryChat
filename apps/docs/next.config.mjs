import nextra from "nextra";

const withNextra = nextra({});

export default withNextra({
  reactStrictMode: true,
  experimental: {
    turbo: {
      resolveAlias: {
        "next-mdx-import-source-file": "./src/mdx-components.tsx",
      },
    },
  },
});
