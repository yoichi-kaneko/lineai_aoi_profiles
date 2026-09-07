import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const checkOnly = process.argv.slice(2).includes("--check");
const skillNames = ["dev_ship_change", "dev_apply_pr_review"];
const generatedNotice =
  "<!-- このファイルは .agents/skills/ の共有正本から自動生成されます。直接編集せず pnpm agent-config:sync を実行してください。 -->";

function normalize(content) {
  return content.replace(/\r\n/g, "\n");
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    })
    .sort();
}

function renderGeneratedFile(sourcePath, content) {
  const normalized = normalize(content);
  if (!sourcePath.endsWith("SKILL.md")) return normalized;

  const frontmatterEnd = normalized.indexOf("\n---\n", 4);
  if (!normalized.startsWith("---\n") || frontmatterEnd < 0) {
    throw new Error(`${sourcePath} の YAML フロントマターを認識できません`);
  }

  const insertAt = frontmatterEnd + "\n---\n".length;
  return `${normalized.slice(0, insertAt)}${generatedNotice}\n${normalized.slice(insertAt)}`;
}

const differences = [];

for (const skillName of skillNames) {
  const sourceDirectory = resolve(projectRoot, ".agents", "skills", skillName);
  const targetDirectory = resolve(projectRoot, ".claude", "skills", skillName);
  const sourceFiles = listFiles(sourceDirectory);

  if (sourceFiles.length === 0) {
    throw new Error(`共有 Skill の正本がありません: ${sourceDirectory}`);
  }

  const expectedRelativePaths = new Set(
    sourceFiles.map((sourcePath) => relative(sourceDirectory, sourcePath)),
  );

  for (const sourcePath of sourceFiles) {
    const relativePath = relative(sourceDirectory, sourcePath);
    const targetPath = join(targetDirectory, relativePath);
    const expected = renderGeneratedFile(
      sourcePath,
      readFileSync(sourcePath, "utf8"),
    );
    const actual = existsSync(targetPath)
      ? normalize(readFileSync(targetPath, "utf8"))
      : undefined;

    if (actual === expected) continue;

    differences.push(relative(projectRoot, targetPath));
    if (!checkOnly) {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, expected, "utf8");
    }
  }

  for (const targetPath of listFiles(targetDirectory)) {
    const relativePath = relative(targetDirectory, targetPath);
    if (expectedRelativePaths.has(relativePath)) continue;

    differences.push(relative(projectRoot, targetPath));
    if (!checkOnly) rmSync(targetPath);
  }
}

if (checkOnly && differences.length > 0) {
  console.error("共有 Skill の生成物が正本と一致しません:");
  for (const path of differences) console.error(`- ${path}`);
  console.error("pnpm agent-config:sync を実行してください。");
  process.exit(1);
}

if (differences.length === 0) {
  console.log("共有 Skill の生成物は正本と一致しています。");
} else {
  console.log(`共有 Skill の生成物を ${differences.length} 件更新しました。`);
}
