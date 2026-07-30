/**
 * patch-info-plist.mjs
 *
 * Ensures required iOS privacy-usage keys are present in Info.plist.
 * Safe to run multiple times — only inserts keys that are missing.
 *
 * Usage:
 *   node scripts/patch-info-plist.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLIST_PATH = resolve(__dirname, "../ios/App/App/Info.plist");

const REQUIRED_KEYS = {
  NSCameraUsageDescription:
    "My Garden uses the camera so you can photograph items to add to your garden.",
  NSPhotoLibraryUsageDescription:
    "My Garden reads your photo library so you can pick existing photos to add to your garden.",
  NSPhotoLibraryAddUsageDescription:
    "My Garden saves captured photos to your photo library.",
};

let content;
try {
  content = readFileSync(PLIST_PATH, "utf8");
} catch {
  console.error(`❌  Could not read ${PLIST_PATH}`);
  console.error("    Make sure you have run: npx cap add ios");
  process.exit(1);
}

let changed = false;

for (const [key, value] of Object.entries(REQUIRED_KEYS)) {
  if (content.includes(`<key>${key}</key>`)) {
    console.log(`✅  ${key} — already present`);
  } else {
    // Insert before the closing </dict> of the root dictionary
    const insertion = `\t<key>${key}</key>\n\t<string>${value}</string>\n`;
    content = content.replace(/(<\/dict>\s*<\/plist>)/, `${insertion}$1`);
    console.log(`➕  ${key} — added`);
    changed = true;
  }
}

if (changed) {
  writeFileSync(PLIST_PATH, content, "utf8");
  console.log(`\n✅  Info.plist updated at ${PLIST_PATH}`);
} else {
  console.log("\n✅  Info.plist already has all required keys — no changes needed.");
}
