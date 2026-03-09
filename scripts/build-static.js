#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
const args = process.argv.slice(2);
const basePath =
  args.find((arg) => arg.startsWith("--base-path="))?.split("=")[1] || "";
const assetPrefix =
  args.find((arg) => arg.startsWith("--asset-prefix="))?.split("=")[1] || "";
const help = args.includes("--help") || args.includes("-h");

if (help) {
  console.log(`
Usage: node scripts/build-static.js [options]

Options:
  --base-path=<path>     Set the base path for deployment (e.g., --base-path=/figma-clone)
  --asset-prefix=<url>   Set the asset prefix for CDN deployment (e.g., --asset-prefix=https://cdn.example.com)
  --help, -h             Show this help message

Examples:
  node scripts/build-static.js
  node scripts/build-static.js --base-path=/figma-clone
  node scripts/build-static.js --base-path=/my-app --asset-prefix=https://cdn.example.com

The static files will be generated in the 'out' directory.
`);
  process.exit(0);
}

console.log("🚀 Building static version of Figma Clone...");

// Update next.config.js temporarily if base path or asset prefix is provided
const configPath = path.join(__dirname, "..", "next.config.js");
let originalConfig = null;

if (basePath || assetPrefix) {
  console.log(`📝 Configuring build with:`);
  if (basePath) console.log(`   Base Path: ${basePath}`);
  if (assetPrefix) console.log(`   Asset Prefix: ${assetPrefix}`);

  // Read original config
  originalConfig = fs.readFileSync(configPath, "utf8");

  // Update config
  let newConfig = originalConfig;

  if (basePath) {
    newConfig = newConfig.replace(
      "// basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',",
      `basePath: '${basePath}',`
    );
  }

  if (assetPrefix) {
    newConfig = newConfig.replace(
      "// assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',",
      `assetPrefix: '${assetPrefix}',`
    );
  }

  fs.writeFileSync(configPath, newConfig);
}

try {
  // Run the build
  console.log("🏗️  Running Next.js build...");
  execSync("npm run build:static", { stdio: "inherit" });

  console.log("✅ Static build completed successfully!");
  console.log('📁 Static files are in the "out" directory');
  console.log("");
  console.log("To serve locally:");
  console.log("  npm run serve:static");
  console.log("");
  console.log("To deploy:");
  console.log(
    '  Upload the contents of the "out" directory to your web server'
  );
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
} finally {
  // Restore original config if it was modified
  if (originalConfig) {
    console.log("🔄 Restoring original next.config.js...");
    fs.writeFileSync(configPath, originalConfig);
  }
}
