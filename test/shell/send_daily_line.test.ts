/**
 * `send_daily_line.sh` の起動情報の受け渡しと作業領域の扱いを検証する。
 *
 * 実際の claude 起動・LINE送信・Firestore アクセスは行わず、`CLAUDE_BIN` をスタブへ
 * 差し替えて「どのトリガーと effort で起動されたか」を記録させる。スクリプトは自身の
 * ディレクトリへ cd するため、テストごとに一時ディレクトリへスクリプトを複製し、
 * リポジトリの `tmp/` には触れない。
 */

import { execFileSync } from "child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const describeShell = process.platform === "win32" ? describe.skip : describe;

let workDir: string;

/** スクリプト一式と、起動内容を記録する claude スタブを用意する。 */
function setupWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aoi-runner-"));
  copyFileSync(join(REPO_ROOT, "send_daily_line.sh"), join(dir, "send_daily_line.sh"));
  copyFileSync(join(REPO_ROOT, "refresh_tmp.sh"), join(dir, "refresh_tmp.sh"));
  mkdirSync(join(dir, "tmp"), { recursive: true });

  const stub = join(dir, "claude-stub.sh");
  writeFileSync(
    stub,
    [
      "#!/bin/bash",
      // 起動引数をそのまま記録する。実際の送信・生成は行わない。
      'printf "%s\\n" "$@" >> "$(dirname "$0")/claude_calls.txt"',
      'if [ -n "$STUB_TOUCH_FILE" ]; then : > "$(dirname "$0")/$STUB_TOUCH_FILE"; fi',
      'exit "${STUB_EXIT_CODE:-0}"',
    ].join("\n"),
    "utf-8",
  );
  chmodSync(stub, 0o755);

  // macOS 等で GNU timeout が無い環境でも runner を検証できるようにする
  const timeoutStub = join(dir, "timeout");
  writeFileSync(
    timeoutStub,
    ["#!/bin/bash", "shift", 'exec "$@"'].join("\n"),
    "utf-8",
  );
  chmodSync(timeoutStub, 0o755);
  return dir;
}

function runRunner(
  args: string[],
  env: Record<string, string> = {},
): { status: number; stderr: string } {
  try {
    execFileSync("bash", [join(workDir, "send_daily_line.sh"), ...args], {
      env: {
        ...process.env,
        PATH: `${workDir}${process.env.PATH ? `:${process.env.PATH}` : ""}`,
        CLAUDE_BIN: join(workDir, "claude-stub.sh"),
        ...env,
      },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    const err = error as { status?: number; stderr?: string };
    return { status: err.status ?? -1, stderr: err.stderr ?? "" };
  }
}

function claudeCalls(): string[] {
  try {
    return readFileSync(join(workDir, "claude_calls.txt"), "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * runner が呼ぶ `pnpm exec tsx src/firebase/*.ts` を差し替えるスタブを置く。
 * 時間帯の判定は `STUB_WEEKLY_WINDOW_EXIT`、run_logs の有無は `STUB_HAS_LOG` で切り替え、
 * Firestore へは接続しない。呼び出しは1回1行で `pnpm_calls.txt` に記録する。
 */
function installPnpmStub(): void {
  const stub = join(workDir, "pnpm");
  writeFileSync(
    stub,
    [
      "#!/bin/bash",
      'echo "$*" >> "$(dirname "$0")/pnpm_calls.txt"',
      'case "$3" in',
      '  src/firebase/check_weekly_window.ts) exit "${STUB_WEEKLY_WINDOW_EXIT:-0}" ;;',
      '  src/firebase/has_log.ts) echo "${STUB_HAS_LOG:-false}" ;;',
      "esac",
      "exit 0",
    ].join("\n"),
    "utf-8",
  );
  chmodSync(stub, 0o755);
}

function pnpmCalls(): string[] {
  try {
    return readFileSync(join(workDir, "pnpm_calls.txt"), "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

beforeEach(() => {
  workDir = setupWorkDir();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describeShell("send_daily_line.sh の talk モード", () => {
  const DOC_ID = "abcDEF123";
  const POSTED_DATE = "2026-08-20";

  it("対象ドキュメントIDと投稿日をトリガーへ載せる", () => {
    const { status } = runRunner(["talk", DOC_ID, POSTED_DATE]);

    expect(status).toBe(0);
    const calls = claudeCalls();
    expect(calls).toContain(`daily message (響): ${POSTED_DATE} target_doc_id=${DOC_ID}`);
    // 画像生成を含みうるため xhigh で起動する
    expect(calls).toContain("xhigh");
  });

  it("投稿日を基準日にするため、実行日が翌日でも元のメッセージの日付を使う", () => {
    const { status } = runRunner(["talk", DOC_ID, "2026-01-31"]);

    expect(status).toBe(0);
    expect(claudeCalls().some((line) => line.includes("2026-01-31"))).toBe(true);
  });

  it.each([
    [[], "対象ドキュメントID"],
    [[DOC_ID], "投稿日"],
    [["", POSTED_DATE], "対象ドキュメントID"],
    [["bad id", POSTED_DATE], "対象ドキュメントID"],
    [["doc;rm -rf /", POSTED_DATE], "対象ドキュメントID"],
    [[DOC_ID, "2026/08/20"], "投稿日"],
    [[DOC_ID, "2026-08-20; echo hi"], "投稿日"],
    [[DOC_ID, "2026-02-30"], "投稿日"],
  ])("起動情報が不正なら claude を起動しない (%j)", (extraArgs, expectedMessage) => {
    const { status, stderr } = runRunner(["talk", ...(extraArgs as string[])]);

    expect(status).not.toBe(0);
    expect(stderr).toContain(expectedMessage);
    expect(claudeCalls()).toHaveLength(0);
  });
});

describeShell("send_daily_line.sh の従来モード", () => {
  it.each([
    ["off_mountain", "daily message (帰灯): "],
    ["up_mountain", "daily message (門灯): "],
    ["stay_mountain", "daily message (継灯): "],
  ])("%s は従来どおり実行日のトリガーで起動する", (mode, prefix) => {
    const { status } = runRunner([mode]);

    expect(status).toBe(0);
    expect(claudeCalls().some((line) => line.startsWith(prefix))).toBe(true);
    // 対象ドキュメントIDは載らない
    expect(claudeCalls().some((line) => line.includes("target_doc_id"))).toBe(false);
  });

  it("余分な引数を渡されても従来モードの起動は変わらない", () => {
    const { status } = runRunner(["off_mountain", "ignored", "2026-08-20"]);

    expect(status).toBe(0);
    expect(claudeCalls().some((line) => line.includes("target_doc_id"))).toBe(false);
  });

  it.each(["song", "scribe", "unknown"])(
    "未対応の MODE (%s) は暁へ落とさずエラー終了する",
    (mode) => {
      const { status, stderr } = runRunner([mode]);

      expect(status).not.toBe(0);
      expect(stderr).toContain("未対応の MODE");
      expect(claudeCalls()).toHaveLength(0);
    },
  );
});

describeShell("send_daily_line.sh の weekly（結星）モード", () => {
  beforeEach(() => {
    installPnpmStub();
  });

  it("実行時間帯内で当日の run_logs が無ければ xhigh で起動し、完了後に記録する", () => {
    const { status } = runRunner(["weekly"]);

    expect(status).toBe(0);
    const calls = claudeCalls();
    expect(calls.some((line) => line.startsWith("daily message (結星): "))).toBe(true);
    // 画像を生成するため xhigh で起動する
    expect(calls).toContain("xhigh");

    const pnpm = pnpmCalls();
    expect(pnpm.some((line) => line.includes("src/firebase/has_log.ts") && line.endsWith(" weekly"))).toBe(true);
    expect(pnpm.some((line) => line.includes("src/firebase/put_log.ts") && line.endsWith(" weekly"))).toBe(true);
  });

  it("実行時間帯の外では run_logs も確認せず、claude を起動しない", () => {
    const { status, stderr } = runRunner(["weekly"], { STUB_WEEKLY_WINDOW_EXIT: "1" });

    expect(status).not.toBe(0);
    expect(stderr).toContain("月曜 00:00-04:59");
    expect(claudeCalls()).toHaveLength(0);
    expect(pnpmCalls().some((line) => line.includes("src/firebase/has_log.ts"))).toBe(false);
  });

  it("同じ日付の run_logs があれば起動も記録もせずにスキップする", () => {
    const { status } = runRunner(["weekly"], { STUB_HAS_LOG: "true" });

    expect(status).toBe(0);
    expect(claudeCalls()).toHaveLength(0);
    expect(pnpmCalls().some((line) => line.includes("src/firebase/put_log.ts"))).toBe(false);
  });
});

describeShell("作業領域（tmp/）の扱い", () => {
  it("実行の冒頭で tmp/ の通常ファイルを掃除する", () => {
    writeFileSync(join(workDir, "tmp", "line_message.txt"), "前回の残骸", "utf-8");

    runRunner(["talk", "abcDEF123", "2026-08-20"]);

    expect(() => readFileSync(join(workDir, "tmp", "line_message.txt"), "utf-8")).toThrow();
  });

  it("掃除はロックファイルを消さない（直列化を壊さない）", () => {
    writeFileSync(join(workDir, "tmp", ".runner.lock"), "", "utf-8");
    writeFileSync(join(workDir, "tmp", "残骸.txt"), "x", "utf-8");

    execFileSync("bash", [join(workDir, "refresh_tmp.sh")], { encoding: "utf-8" });

    expect(() => readFileSync(join(workDir, "tmp", ".runner.lock"), "utf-8")).not.toThrow();
    expect(() => readFileSync(join(workDir, "tmp", "残骸.txt"), "utf-8")).toThrow();
  });

  it("他の実行がロックを保持している間は掃除も起動も行わずに中断する", () => {
    let hasFlock = true;
    try {
      execFileSync("bash", ["-c", "command -v flock"], { stdio: "ignore" });
    } catch {
      hasFlock = false;
    }
    if (!hasFlock) return;

    const keep = join(workDir, "tmp", "line_message.txt");
    writeFileSync(keep, "先行実行のファイル", "utf-8");

    // 別プロセスがロックを保持している状態を作り、待ち時間0で後続実行を走らせる
    const script = [
      `exec 8>"${join(workDir, "tmp", ".runner.lock")}"`,
      "flock -n 8 || exit 99",
      `PATH="${workDir}:$PATH" RUNNER_LOCK_WAIT_SEC=0 CLAUDE_BIN="${join(workDir, "claude-stub.sh")}" ` +
        `bash "${join(workDir, "send_daily_line.sh")}" talk abcDEF123 2026-08-20`,
      'echo "rc=$?"',
    ].join("\n");

    const out = execFileSync("bash", ["-c", script], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(out).toContain("rc=1");
    expect(readFileSync(keep, "utf-8")).toBe("先行実行のファイル");
    expect(claudeCalls()).toHaveLength(0);
  });
});
