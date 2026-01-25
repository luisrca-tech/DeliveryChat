#!/usr/bin/env node

/**
 * Script to check if environment variables are available during build
 * This runs BEFORE vite build to verify Vercel/Infisical integration
 */

console.log("\n🔍 [BUILD] Checking environment variables during build...\n");

const requiredVars = ["HONO_API_UPSTREAM", "VITE_API_URL", "VITE_RESEND_EMAIL_TO"];
const allEnvKeys = Object.keys(globalThis.process.env).sort();
const viteKeys = allEnvKeys.filter((k) => k.startsWith("VITE_"));

console.log("📋 Environment Check Results:");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Check required variables
let allPresent = true;
requiredVars.forEach((varName) => {
  const value = globalThis.process.env[varName];
  const isSet = !!value;
  const status = isSet ? "✅ SET" : "❌ NOT SET";
  const preview = isSet
    ? value.length > 50
      ? `${value.substring(0, 50)}...`
      : value
    : "";

  console.log(`${status} ${varName}${preview ? ` = ${preview}` : ""}`);
  if (!isSet) allPresent = false;
});

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Show Vercel-specific env vars
console.log("\n🌐 Vercel Environment:");
console.log(`   VERCEL: ${globalThis.process.env.VERCEL || "❌ Not set"}`);
console.log(
  `   VERCEL_ENV: ${globalThis.process.env.VERCEL_ENV || "❌ Not set"}`,
);
console.log(
  `   VERCEL_URL: ${globalThis.process.env.VERCEL_URL || "❌ Not set"}`,
);

// Show all VITE_ prefixed vars
console.log(`\n🔑 All VITE_* variables (${viteKeys.length}):`);
if (viteKeys.length > 0) {
  viteKeys.forEach((key) => {
    const value = globalThis.process.env[key];
    const preview =
      value && value.length > 40 ? `${value.substring(0, 40)}...` : value;
    console.log(`   ${key} = ${preview || "(empty)"}`);
  });
} else {
  console.log("   ⚠️  No VITE_* variables found!");
}

// Show total env vars count
console.log(`\n📊 Total environment variables: ${allEnvKeys.length}`);

// Show sample of other env vars (non-VITE)
const otherKeys = allEnvKeys
  .filter((k) => !k.startsWith("VITE_") && !k.startsWith("VERCEL_"))
  .slice(0, 10);
if (otherKeys.length > 0) {
  console.log(`\n📝 Sample of other env vars (first 10):`);
  otherKeys.forEach((key) => {
    console.log(`   ${key}`);
  });
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (!allPresent) {
  console.error("\n❌ ERROR: Required environment variables are missing!");
  console.error("\n💡 How to fix:");
  console.error(
    "   1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables",
  );
  console.error(
    "   2. Find the missing VITE_* variable(s) and ensure it's checked for:",
  );
  console.error("      ✅ Production");
  console.error("      ✅ Preview");
  console.error("      ✅ Development");
  console.error("   3. IMPORTANT: The variable must be available during BUILD");
  console.error("      (Not just Runtime)");
  console.error("\n   4. If using Infisical:");
  console.error("      - Check Infisical integration settings");
  console.error("      - Ensure variables are synced for BUILD time");
  console.error("      - You may need to set the variable directly in Vercel");
  console.error("        for build-time access\n");
  globalThis.process.exit(1);
} else {
  console.log("\n✅ All required environment variables are present!\n");
}
