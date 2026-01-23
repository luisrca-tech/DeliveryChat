import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const shouldRewrite = (specifier) =>
  specifier.startsWith(".") &&
  !specifier.match(/\.(js|cjs|mjs|json)$/i) &&
  !specifier.endsWith("/");

const rewriteFile = (filePath) => {
  const original = readFileSync(filePath, "utf8");
  const replaced = original.replace(
    /((?:import|export)\s+(?:[^"']+?\s+from\s+)?["'])(\.{1,2}\/[^"']+)(["'])/g,
    (match, p1, specifier, p3) => {
      if (!shouldRewrite(specifier)) return match;
      return `${p1}${specifier}.js${p3}`;
    }
  );

  if (replaced !== original) {
    writeFileSync(filePath, replaced, "utf8");
    globalThis.console.info("[fix-dist-extensions] patched", filePath);
  }
};

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full);
    } else if (full.endsWith(".js")) {
      rewriteFile(full);
    }
  }
};

const distDir = new globalThis.URL("../dist", import.meta.url).pathname;
walk(distDir);

