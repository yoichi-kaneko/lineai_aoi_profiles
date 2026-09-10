import { existsSync, readFileSync } from "node:fs";

/**
 * functions/package-lock.json の健全性を検証する。
 *
 * Cloud Build は npm ci でインストールするため、ロックが無い・pnpm のリンクを
 * 取り込んでいる・package.json とずれている場合は、依存が入らないままビルドが
 * 進み tsc: not found などで失敗する。デプロイまで気付けないと手戻りが大きいため、
 * CI（pnpm test:all）と functions/deploy.sh の双方からここを呼ぶ。
 */

const packagePath = new URL("../functions/package.json", import.meta.url);
const lockPath = new URL("../functions/package-lock.json", import.meta.url);

const lockRecipe = `
package-lock.json を再生成してください。
functions/ の中で直接 npm install を実行すると、pnpm が作った functions/node_modules を
npm が取り込んでしまい、依存が .pnpm へのシンボリックリンクとして記録された
壊れたロックになります。必ず node_modules の無い一時ディレクトリで生成してください。
既存のロックも一緒に持ち込むと、今回変えた依存だけが更新されます。

  cd functions
  TMP=$(mktemp -d)
  cp package.json package-lock.json "$TMP/"
  (cd "$TMP" && npm install --package-lock-only)
  cp "$TMP/package-lock.json" ./package-lock.json
  rm -rf "$TMP"
`;

function fail(errors) {
  console.error("functions/package-lock.json が package.json と一致しません:");
  for (const message of errors) console.error(`- ${message}`);
  console.error(lockRecipe);
  process.exit(1);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail([`${label} を読み込めません: ${error.message}`]);
  }
}

if (!existsSync(lockPath)) {
  fail(["functions/package-lock.json がありません"]);
}

const pkg = readJson(packagePath, "functions/package.json");
const lock = readJson(lockPath, "functions/package-lock.json");
const entries = lock.packages ?? {};
const errors = [];

const linked = Object.keys(entries).filter(
  (key) => entries[key].link === true || key.includes(".pnpm"),
);
if (linked.length > 0) {
  errors.push(
    `pnpm のシンボリックリンクを取り込んだロックです (${linked.length} 件)`,
  );
}

const root = entries[""] ?? {};
for (const field of ["dependencies", "devDependencies"]) {
  const declared = pkg[field] ?? {};
  const locked = root[field] ?? {};
  for (const name of Object.keys(declared)) {
    if (locked[name] !== declared[name]) {
      errors.push(
        `${field} の ${name} が package.json (${declared[name]}) とロック (${locked[name] ?? "未登録"}) で不一致`,
      );
    }
  }
  for (const name of Object.keys(locked)) {
    if (!(name in declared)) {
      errors.push(`${field} の ${name} がロックにのみ存在`);
    }
  }
}

const direct = { ...pkg.dependencies, ...pkg.devDependencies };
for (const name of Object.keys(direct)) {
  const entry = entries[`node_modules/${name}`];
  if (!entry) {
    errors.push(`${name} の実体がロックにありません`);
  } else if (typeof entry.resolved !== "string" || !entry.resolved.startsWith("http")) {
    errors.push(
      `${name} がレジストリ以外を参照しています: ${entry.resolved ?? "resolved なし"}`,
    );
  }
}

if (errors.length > 0) fail(errors);

console.log("functions/package-lock.json は package.json と一致しています。");
