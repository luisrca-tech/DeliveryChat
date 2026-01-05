import nextra from "nextra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const withNextra = nextra({
  contentDirBasePath: "/content",
});

export default withNextra({
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "next-mdx-import-source-file": path.resolve(
        __dirname,
        "./src/components/mdx-components.tsx"
      ),
    };
    return config;
  },
  experimental: {
    turbo: {
      resolveAlias: {
        "next-mdx-import-source-file": "./src/components/mdx-components.tsx",
      },
    },
  },
});
