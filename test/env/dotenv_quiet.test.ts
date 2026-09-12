/**
 * `src/` 配下の `dotenv.config()` が必ず `quiet: true` を渡していることを検証する。
 *
 * dotenv は 17.0.0 で `quiet` の既定値が false になり、読み込みのたびに
 * `◇ injected env (N) from .env` という実行時ログを **標準出力** へ出すようになった。
 * 本リポジトリの CLI は判断結果や JSON を標準出力へ書き、それを Skill や
 * `send_daily_line.sh` が読み取る。とりわけ `src/firebase/has_log.ts` の出力は
 * シェルが `"true"` と文字列比較しており、ログが混ざると実行済み判定が崩れて
 * 二重送信につながる。ログの混入を防ぐため、全ての読み込みで `quiet: true` を明示する。
 */

import { readFileSync, readdirSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const SRC_ROOT = join(REPO_ROOT, "src");

/** `src/` 配下の TypeScript ファイルを再帰的に集める。 */
function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

/** `dotenv.config(...)` の呼び出し 1件分を、引数の括弧の対応を数えて切り出す。 */
function extractConfigCalls(source: string): string[] {
  const calls: string[] = [];
  const marker = "dotenv.config(";

  for (let index = source.indexOf(marker); index !== -1; index = source.indexOf(marker, index + 1)) {
    let depth = 0;
    for (let cursor = index + marker.length - 1; cursor < source.length; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      if (source[cursor] === ")") {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(index, cursor + 1));
          break;
        }
      }
    }
  }

  return calls;
}

describe("dotenv の実行時ログ抑止", () => {
  const files = collectTsFiles(SRC_ROOT);

  it("src/ 配下に dotenv.config の呼び出しが存在する", () => {
    const total = files.reduce(
      (count, file) => count + extractConfigCalls(readFileSync(file, "utf-8")).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it("全ての dotenv.config が quiet: true を渡している", () => {
    const missing = files.flatMap((file) =>
      extractConfigCalls(readFileSync(file, "utf-8"))
        .filter((call) => !/quiet:\s*true/.test(call))
        .map(() => relative(REPO_ROOT, file)),
    );

    expect(missing).toEqual([]);
  });
});
