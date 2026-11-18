import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// pnpm 管理の functions/node_modules を npm に読ませないため、依存を
// インストールしない一時ディレクトリで Cloud Build 用ロックだけを更新する。
const packagePath = new URL("../functions/package.json", import.meta.url);
const lockPath = new URL("../functions/package-lock.json", import.meta.url);
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "aoi-functions-lock-"),
);
const temporaryPackagePath = join(temporaryDirectory, "package.json");
const temporaryLockPath = join(temporaryDirectory, "package-lock.json");

try {
  copyFileSync(packagePath, temporaryPackagePath);
  if (existsSync(lockPath)) {
    copyFileSync(lockPath, temporaryLockPath);
  }

  // Windows の npm は npm.cmd のため shell 経由でしか起動できない。shell と引数配列の
  // 併用は Node.js が非推奨（DEP0190）としているため、Windows では引数を含めた固定の
  // コマンド文字列として渡す。
  const spawnOptions = { cwd: temporaryDirectory, stdio: "inherit" };
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
  console.log("functions/package-lock.json を再生成しました。");
} catch (error) {
  console.error(
    `functions/package-lock.json の再生成に失敗しました: ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
