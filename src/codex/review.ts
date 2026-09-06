import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "fs";
import path from "path";
import os from "os";
import { spawn, spawnSync } from "child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

/**
 * 碧衣が生成した成果物（画像生成プロンプト・SNS投稿本文）を Codex CLI へ渡し、
 * 一往復だけレビューを受け取る。
 *
 * このスクリプトは「補助工程」であり、碧衣の処理を止めないことを最優先する。
 * codex が未導入でも、認証切れでも、時間切れでも **常に終了コード 0** で終わり、
 * 呼び出し側は stdout の JSON の `status` を見てスキップするか反映するかを決める。
 * 終了コード 1 を返すのは引数不正（呼び出し側の誤り）のときだけ。
 */

export const REVIEW_STATUSES = [
  "ok",
  "skipped",
  "unavailable",
  "timeout",
  "error",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** codex の推論強度として受け付ける値（`model_reasoning_effort` に渡す） */
export const REVIEW_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export type ReviewEffort = (typeof REVIEW_EFFORTS)[number];

/** レビュー依頼文・レビュー結果の既定の受け渡し先 */
const DEFAULT_INPUT_PATH = "tmp/codex_review_input.md";
const DEFAULT_OUTPUT_PATH = "tmp/codex_review_result.md";

/**
 * codex を動かす作業ディレクトリ（空・OS の一時領域）。
 *
 * codex の `--sandbox read-only` は**全ディスクの読み取りを許す**（v0.153.4 で実測。
 * 読み取り範囲を絞る設定キーは存在せず、ヘルプにある `sandbox_permissions` は
 * `--strict-config` で「unknown configuration field」として弾かれる）。
 * そのため作業根をリポジトリの外へ置き、codex に「このリポジトリ」を掴ませない。
 * これにより cwd を辿って AGENTS.md やソースを読みに行く動きも起こらない。
 * 依頼文側の「ファイルを読まない」指示、および下の buildChildEnv による環境変数の
 * 絞り込みと合わせた多層の防御とする。
 */
const SCRATCH_DIR_NAME = "aoi_codex_review";
/** codex が最終メッセージを書き出すファイル名（作業ディレクトリ内の相対名） */
const SCRATCH_OUTPUT_NAME = "codex_review_output.md";

/**
 * codex へ引き渡す環境変数の許可リスト。
 *
 * 本スクリプトは冒頭で dotenv により `.env` を `process.env` へ展開しており、
 * そのまま継承させると LINE・Todoist・Twitter などの認証情報が codex（および
 * codex のシェルツール）から見える状態になる。必要な変数だけを渡す。
 */
const CHILD_ENV_ALLOWLIST = [
  // 実行に必要な基本
  "PATH",
  "Path",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "SystemDrive",
  "COMSPEC",
  "ComSpec",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  // codex 自身の設定・認証
  "CODEX_HOME",
  "OPENAI_API_KEY",
  // ネットワーク（EC2 のプロキシ構成を想定）
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

/** 許可リストに載っている環境変数だけを取り出す */
export function buildChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = env[key];
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }
  return childEnv;
}

/** 自前タイムアウトの既定値（秒）。Bash ツール既定の 300 秒の内側に収める */
const DEFAULT_TIMEOUT_SEC = 240;
/**
 * `setTimeout` に渡せる遅延の上限（秒）。
 * Node.js のタイマーは符号付き 32bit 整数（最大 2147483647 ms）のため、
 * それを超える秒数は受け付けず既定値へ戻す。
 */
const MAX_TIMEOUT_SEC = 2_147_483;
/** `codex --version` の確認打ち切り（ミリ秒） */
const VERSION_CHECK_TIMEOUT_MS = 10_000;
/** stderr を保持する上限（バイト）。失敗時の手掛かりだけを残す */
const MAX_STDERR_BYTES = 2000;
/** SIGTERM 後に強制終了へ切り替えるまでの猶予（ミリ秒） */
const KILL_GRACE_MS = 2000;

export interface ReviewConfig {
  enabled: boolean;
  timeoutMs: number;
  model?: string;
  effort?: ReviewEffort;
}

export interface ParsedArgs {
  inputPath: string;
  outputPath: string;
}

function isEffort(value: string): value is ReviewEffort {
  return (REVIEW_EFFORTS as readonly string[]).includes(value);
}

/**
 * 環境変数からレビューの設定を解決する。
 * 設定値が壊れていても例外は投げず、既定値へ落として警告に留める
 * （本番の .env の記述ミスで日次処理を止めないため）。
 */
export function resolveConfig(
  env: NodeJS.ProcessEnv,
  warn: (message: string) => void = () => {},
): ReviewConfig {
  const enabledRaw = (env.CODEX_REVIEW_ENABLED ?? "").trim().toLowerCase();
  const enabled = !["false", "0", "no", "off"].includes(enabledRaw);

  let timeoutSec = DEFAULT_TIMEOUT_SEC;
  const timeoutRaw = (env.CODEX_REVIEW_TIMEOUT_SEC ?? "").trim();
  if (timeoutRaw.length > 0) {
    if (/^[1-9]\d*$/.test(timeoutRaw)) {
      const parsed = Number(timeoutRaw);
      if (parsed > MAX_TIMEOUT_SEC) {
        warn(
          `CODEX_REVIEW_TIMEOUT_SEC は ${MAX_TIMEOUT_SEC} 秒以下で指定してください（既定の ${DEFAULT_TIMEOUT_SEC} 秒を使います）: ${timeoutRaw}`,
        );
      } else {
        timeoutSec = parsed;
      }
    } else {
      warn(
        `CODEX_REVIEW_TIMEOUT_SEC は 1 以上の整数で指定してください（既定の ${DEFAULT_TIMEOUT_SEC} 秒を使います）: ${timeoutRaw}`,
      );
    }
  }

  const modelRaw = (env.CODEX_REVIEW_MODEL ?? "").trim();
  const model = modelRaw.length > 0 ? modelRaw : undefined;

  const effortRaw = (env.CODEX_REVIEW_EFFORT ?? "").trim().toLowerCase();
  let effort: ReviewEffort | undefined;
  if (effortRaw.length > 0) {
    if (isEffort(effortRaw)) {
      effort = effortRaw;
    } else {
      warn(
        `CODEX_REVIEW_EFFORT は ${REVIEW_EFFORTS.join(" / ")} のいずれかで指定してください（未指定として扱います）: ${effortRaw}`,
      );
    }
  }

  return { enabled, timeoutMs: timeoutSec * 1000, model, effort };
}

/** 引数を解釈する。`--out` の指定が無ければ既定の受け渡し先を使う */
export function parseArgs(argv: string[]): ParsedArgs {
  let inputPath: string | undefined;
  let outputPath = DEFAULT_OUTPUT_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--out には出力ファイルのパスを指定してください");
      }
      outputPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`不明なオプションです: ${arg}`);
    }

    if (inputPath !== undefined) {
      throw new Error(`引数が多すぎます: ${arg}`);
    }
    inputPath = arg;
  }

  if (!inputPath) {
    throw new Error("レビュー依頼文のファイルパスを指定してください");
  }

  return { inputPath, outputPath };
}

/**
 * codex exec へ渡す引数を組み立てる。
 * 作業ディレクトリは spawn の cwd で与え、出力先は相対名で渡す
 * （空白を含むパスを引数へ載せず、Windows の shell 経由でも壊れないようにする）。
 */
export function buildCodexArgs(config: Pick<ReviewConfig, "model" | "effort">): string[] {
  const args = [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "-o",
    SCRATCH_OUTPUT_NAME,
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.effort) {
    // TOML のリテラル文字列（単引用符）で渡す。cmd.exe 経由でも引用符が剥がれない
    args.push("-c", `model_reasoning_effort='${config.effort}'`);
  }

  // 末尾の "-" で、依頼文を stdin から読ませる
  args.push("-");

  return args;
}

/** プロジェクトルート外への参照（絶対パスや ../ による脱出）を拒否して絶対パスを返す */
function resolveInsideProject(filePath: string, label: string): string {
  const resolvedPath = resolve(PROJECT_ROOT, filePath);
  if (
    resolvedPath !== PROJECT_ROOT &&
    !resolvedPath.startsWith(PROJECT_ROOT + path.sep)
  ) {
    throw new Error(
      `${label}はプロジェクトルート内のパスを指定してください: ${filePath}`,
    );
  }
  return resolvedPath;
}

/** codex バイナリが呼び出せるかを確認する */
function isCodexAvailable(useShell: boolean): boolean {
  try {
    const result = spawnSync("codex", ["--version"], {
      env: buildChildEnv(process.env),
      shell: useShell,
      stdio: "ignore",
      windowsHide: true,
      timeout: VERSION_CHECK_TIMEOUT_MS,
    });
    // timeout 時は result.error が ETIMEDOUT になり、unavailable として扱う
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

/** タイムアウト時に、シェル経由で起動した子孫プロセスまで確実に落とす */
function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    } catch {
      // taskkill が使えない場合は下の kill にフォールバックする
    }
  }
  try {
    process.kill(pid, "SIGTERM");
    setTimeout(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // すでに終了している
      }
    }, KILL_GRACE_MS).unref();
  } catch {
    // すでに終了している
  }
}

interface RunResult {
  status: ReviewStatus;
  elapsedMs: number;
  stderr: string;
}

/** codex exec を起動し、依頼文を stdin へ流し込んで終了を待つ */
function runCodex(
  requestText: string,
  scratchDirFullPath: string,
  config: ReviewConfig,
): Promise<RunResult> {
  const useShell = process.platform === "win32";
  const args = buildCodexArgs(config);
  const startedAt = Date.now();

  return new Promise<RunResult>((resolvePromise) => {
    const child = spawn("codex", args, {
      cwd: scratchDirFullPath,
      env: buildChildEnv(process.env),
      shell: useShell,
      // stdout（進捗イベント）は捨てる。stderr だけ失敗時の手掛かりとして拾う
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (status: ReviewStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ status, elapsedMs: Date.now() - startedAt, stderr });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) {
        killProcessTree(child.pid);
      }
      finish("timeout");
    }, config.timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += chunk.toString("utf-8");
      }
    });

    child.on("error", (error) => {
      stderr += `\n${error.message}`;
      finish("error");
    });

    child.on("close", (code) => {
      if (timedOut) return;
      finish(code === 0 ? "ok" : "error");
    });

    child.stdin?.on("error", () => {
      // codex 側が早期終了して stdin が閉じた場合。close イベントで status を確定させる
    });
    child.stdin?.end(requestText, "utf-8");
  });
}

const isDirectRun = !!process.argv[1] && process.argv[1].endsWith("review.ts");

async function main() {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      `使用方法: pnpm exec tsx src/codex/review.ts <レビュー依頼文のファイルパス> [--out <出力ファイルパス>]`,
    );
    console.error(
      `例: pnpm exec tsx src/codex/review.ts "${DEFAULT_INPUT_PATH}"`,
    );
    process.exit(1);
  }

  const config = resolveConfig(process.env, (message) => console.error(message));

  const report = (
    status: ReviewStatus,
    message: string,
    extra: Record<string, unknown> = {},
  ) => {
    console.log(
      JSON.stringify(
        {
          status,
          message,
          ...(config.model ? { model: config.model } : {}),
          ...(config.effort ? { effort: config.effort } : {}),
          ...extra,
        },
        null,
        2,
      ),
    );
  };

  if (!config.enabled) {
    report(
      "skipped",
      "CODEX_REVIEW_ENABLED が false のため、レビューを実行しませんでした。レビュー前の成果物のまま次の手順へ進んでください。",
    );
    return;
  }

  let inputFullPath: string;
  let outputFullPath: string;
  try {
    inputFullPath = resolveInsideProject(parsed.inputPath, "レビュー依頼文のファイル");
    outputFullPath = resolveInsideProject(parsed.outputPath, "出力ファイル");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // 綴葉モードのように1回の実行で2度レビューする場合、前回の結果が残っていると
  // レビューが行われなかった回にそれを読んでしまう。実行のたびに必ず消しておく。
  rmSync(outputFullPath, { force: true });

  let requestText: string;
  try {
    requestText = readFileSync(inputFullPath, "utf-8");
  } catch (error) {
    console.error(
      `レビュー依頼文のファイルを読み込めませんでした: ${parsed.inputPath}`,
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  if (requestText.trim().length === 0) {
    console.error(`レビュー依頼文が空です: ${parsed.inputPath}`);
    process.exit(1);
  }

  const useShell = process.platform === "win32";
  if (!isCodexAvailable(useShell)) {
    report(
      "unavailable",
      "codex コマンドを実行できませんでした（未導入か PATH 上に無い可能性があります）。レビュー前の成果物のまま次の手順へ進んでください。",
    );
    return;
  }

  const scratchDirFullPath = path.join(os.tmpdir(), SCRATCH_DIR_NAME);
  mkdirSync(scratchDirFullPath, { recursive: true });
  const scratchOutputFullPath = path.join(scratchDirFullPath, SCRATCH_OUTPUT_NAME);
  // 前回の結果を読んでしまわないよう、実行前に必ず消しておく
  rmSync(scratchOutputFullPath, { force: true });

  const result = await runCodex(requestText, scratchDirFullPath, config);

  if (result.status === "timeout") {
    report(
      "timeout",
      `レビューが ${Math.round(config.timeoutMs / 1000)} 秒以内に終わらなかったため打ち切りました。レビュー前の成果物のまま次の手順へ進んでください。`,
      { elapsedMs: result.elapsedMs },
    );
    return;
  }

  if (result.status === "error") {
    report(
      "error",
      "codex の実行に失敗しました。レビュー前の成果物のまま次の手順へ進んでください（再試行はしません）。",
      {
        elapsedMs: result.elapsedMs,
        ...(result.stderr.trim().length > 0
          ? { stderr: result.stderr.trim().slice(0, MAX_STDERR_BYTES) }
          : {}),
      },
    );
    return;
  }

  if (!existsSync(scratchOutputFullPath) || statSync(scratchOutputFullPath).size === 0) {
    report(
      "error",
      "codex はレビュー結果を出力しませんでした。レビュー前の成果物のまま次の手順へ進んでください。",
      { elapsedMs: result.elapsedMs },
    );
    return;
  }

  mkdirSync(path.dirname(outputFullPath), { recursive: true });
  copyFileSync(scratchOutputFullPath, outputFullPath);

  report(
    "ok",
    "レビュー結果を出力しました。outputPath を Read ツールで読み、妥当な指摘を成果物へ反映してください。",
    { outputPath: parsed.outputPath, elapsedMs: result.elapsedMs },
  );
}

if (isDirectRun) {
  main().catch((error) => {
    // 想定外の例外でも呼び出し側の処理を止めない（status を返して正常終了する）
    console.log(
      JSON.stringify(
        {
          status: "error" satisfies ReviewStatus,
          message:
            "レビュー処理で想定外のエラーが発生しました。レビュー前の成果物のまま次の手順へ進んでください。",
          detail: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
  });
}
