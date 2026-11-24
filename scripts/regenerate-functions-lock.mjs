import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** pnpm が `minimumReleaseAge` の記載が無いときに使う既定値（分）。 */
export const DEFAULT_MINIMUM_RELEASE_AGE_MINUTES = 1440;

const MINUTES_PER_DAY = 1440;

/**
 * pnpm-workspace.yaml の本文から、トップレベルの `minimumReleaseAge`（分）を読む。
 * 記載が無ければ pnpm の既定値を返す。値が0以上の整数として読めない場合は、
 * 待機を誤って緩めないよう既定値に頼らずエラーにする。
 */
export function readMinimumReleaseAgeMinutes(workspaceYaml) {
  const line = workspaceYaml
    .split(/\r?\n/)
    .find((text) => /^minimumReleaseAge\s*:/.test(text));
  if (line === undefined) return DEFAULT_MINIMUM_RELEASE_AGE_MINUTES;

  const value = line
    .slice(line.indexOf(":") + 1)
    .replace(/\s+#.*$/, "")
    .trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `pnpm-workspace.yaml の minimumReleaseAge を0以上の整数（分）として読めません: ${value || "値なし"}`,
    );
  }
  return Number(value);
}

/**
 * pnpm の `minimumReleaseAge`（分）を npm の `min-release-age`（日）へ換算する。
 * npm 側の待機が pnpm より短くならないよう、端数は切り上げる。
 */
export function toMinReleaseAgeDays(minutes) {
  return Math.ceil(minutes / MINUTES_PER_DAY);
}

/** npm に `min-release-age` を渡すため、子プロセス用の環境変数を組み立てる。 */
export function buildNpmEnv(baseEnv, minReleaseAgeDays) {
  return { ...baseEnv, npm_config_min_release_age: String(minReleaseAgeDays) };
}

function main() {
  // pnpm 管理の functions/node_modules を npm に読ませないため、依存を
  // インストールしない一時ディレクトリで Cloud Build 用ロックだけを更新する。
  const workspacePath = new URL("../pnpm-workspace.yaml", import.meta.url);
  const packagePath = new URL("../functions/package.json", import.meta.url);
  const lockPath = new URL("../functions/package-lock.json", import.meta.url);
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "aoi-functions-lock-"),
  );
  const temporaryPackagePath = join(temporaryDirectory, "package.json");
  const temporaryLockPath = join(temporaryDirectory, "package-lock.json");

  try {
    // pnpm が公開直後の版を拒否するのと同じ待機を npm にも効かせ、推移的な依存が
    // pnpm-lock.yaml より新しい版へ解決されてずれるのを防ぐ。
    const minReleaseAgeDays = toMinReleaseAgeDays(
      readMinimumReleaseAgeMinutes(readFileSync(workspacePath, "utf8")),
    );

    copyFileSync(packagePath, temporaryPackagePath);
    if (existsSync(lockPath)) {
      copyFileSync(lockPath, temporaryLockPath);
    }

    // Windows の npm は npm.cmd のため shell 経由でしか起動できない。shell と引数配列の
    // 併用は Node.js が非推奨（DEP0190）としているため、Windows では引数を含めた固定の
    // コマンド文字列として渡す。待機日数はコマンド文字列に混ぜず環境変数で渡す。
    const spawnOptions = {
      cwd: temporaryDirectory,
      stdio: "inherit",
      env: buildNpmEnv(process.env, minReleaseAgeDays),
    };
    const result =
      process.platform === "win32"
        ? spawnSync("npm install --package-lock-only", {
            ...spawnOptions,
            shell: true,
          })
        : spawnSync("npm", ["install", "--package-lock-only"], spawnOptions);

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `npm install --package-lock-only が終了コード ${result.status ?? "不明"} で失敗しました`,
      );
    }
    if (!existsSync(temporaryLockPath)) {
      throw new Error("npm が package-lock.json を生成しませんでした");
    }

    copyFileSync(temporaryLockPath, lockPath);
    console.log(
      `functions/package-lock.json を再生成しました（npm の min-release-age: ${minReleaseAgeDays} 日）。`,
    );
  } catch (error) {
    console.error(
      `functions/package-lock.json の再生成に失敗しました: ${error.message}`,
    );
    process.exitCode = 1;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

// テストから import したときに npm を起動しないよう、直接実行時だけ main() を呼ぶ。
// import.meta.url はシンボリックリンクを解決したパスのため、argv 側も解決してから比べる。
const isDirectRun =
  !!process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
