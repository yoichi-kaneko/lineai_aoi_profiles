import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const skillsDir = resolve(__dirname, "skills");
const tsconfigPath = resolve(__dirname, "tsconfig.json");
const mobileEnvPath = resolve(__dirname, ".env");
const mobileEnv = dotenv.config({ path: mobileEnvPath }).parsed ?? {};
const functionUrl = (mobileEnv.FUNCTION_URL ?? "").trim();
const localStorageKey = (mobileEnv.LOCAL_STORAGE_KEY ?? "").trim();

function assertRequiredEnv() {
  const errors = [];
  if (!functionUrl) {
    errors.push("FUNCTION_URL is missing or empty in mobile/.env");
  }
  if (!localStorageKey) {
    errors.push("LOCAL_STORAGE_KEY is missing or empty in mobile/.env");
  }
  if (errors.length > 0) {
    console.error("[build:mobile:skills] Build failed:");
    for (const msg of errors) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }
}

const functionUrlDefineValue = JSON.stringify(functionUrl).replace(/"/g, '\\"');
const localStorageKeyDefineValue = JSON.stringify(localStorageKey).replace(
  /"/g,
  '\\"'
);

function listSkillDirectories(baseDir) {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(baseDir, entry.name));
}

function buildSkill(skillDir) {
  const entry = join(skillDir, "src", "main.ts");
  if (!existsSync(entry)) {
    return { skipped: true, reason: "src/main.ts not found" };
  }

  const scriptsDir = join(skillDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const outFile = join(scriptsDir, "bundle.js");

  const args = [
    "esbuild",
    entry,
    "--bundle",
    "--platform=browser",
    "--format=iife",
    "--target=es2020",
    `--tsconfig=${tsconfigPath}`,
    `--define:__FUNCTION_URL__="${functionUrlDefineValue}"`,
    `--define:__LOCAL_STORAGE_KEY__="${localStorageKeyDefineValue}"`,
    `--outfile=${outFile}`,
  ];

  const result = spawnSync("npx", args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`Build failed for ${skillDir}`);
  }

  return { skipped: false };
}

function main() {
  assertRequiredEnv();

  const skillDirs = listSkillDirectories(skillsDir);
  if (skillDirs.length === 0) {
    console.log("[build:mobile:skills] No skills found under mobile/skills");
    return;
  }

  console.log(`[build:mobile:skills] Found ${skillDirs.length} skill(s).`);
  let builtCount = 0;
  let skippedCount = 0;

  for (const skillDir of skillDirs) {
    const skillName = skillDir.split(/[/\\]/).pop();
    console.log(`\n[build:mobile:skills] Processing: ${skillName}`);
    const result = buildSkill(skillDir);
    if (result.skipped) {
      skippedCount += 1;
      console.log(`[build:mobile:skills] Skipped (${result.reason})`);
      continue;
    }
    builtCount += 1;
    console.log("[build:mobile:skills] Built scripts/bundle.js");
  }

  console.log(
    `\n[build:mobile:skills] Done. built=${builtCount}, skipped=${skippedCount}`
  );
}

main();
