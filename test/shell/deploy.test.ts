import { execFileSync, spawnSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = readFileSync(fileURLToPath(new URL("../../deploy.sh", import.meta.url)), "utf-8");
const describeShell = process.platform === "win32" ? describe.skip : describe;

describeShell("deploy.sh", () => {
  let workDir: string;
  let checkout: string;
  let initialCommit: string;
  let latestCommit: string;
  let installLog: string;

  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", [
      "-c", "core.hooksPath=/dev/null",
      "-c", "commit.gpgsign=false",
      "-c", "user.name=Deploy Test",
      "-c", "user.email=deploy-test@example.invalid",
      ...args,
    ], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  }

  function runDeploy(exitCode = 0) {
    // 本物の Git は一時リポジトリだけを更新し、pnpm は取得した内容を記録する。
    return spawnSync("sh", [join(checkout, "deploy.sh")], {
      cwd: workDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${join(workDir, "bin")}:${process.env.PATH ?? ""}`,
        DEPLOY_TEST_LOG: installLog,
        DEPLOY_TEST_EXIT: String(exitCode),
      },
    });
  }

  beforeEach(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), "aoi-deploy-")));
    const origin = join(workDir, "origin.git");
    const seed = join(workDir, "seed");
    checkout = join(workDir, "checkout with spaces");
    installLog = join(workDir, "install.log");
    mkdirSync(seed);
    mkdirSync(join(workDir, "bin"));
    git(workDir, "init", "--bare", "--initial-branch=main", origin);
    git(seed, "init", "--initial-branch=main");
    writeFileSync(join(seed, "deploy.sh"), SCRIPT);
    writeFileSync(join(seed, ".gitignore"), ".env\n");
    writeFileSync(join(seed, "package.json"), '{"private":true,"version":"1.0.0"}\n');
    git(seed, "add", ".");
    git(seed, "commit", "-m", "Initial deployment");
    git(seed, "remote", "add", "origin", origin);
    git(seed, "push", "origin", "main");
    git(workDir, "clone", "--branch", "main", pathToFileURL(origin).href, checkout);
    initialCommit = git(checkout, "rev-parse", "HEAD");

    // スクリプト自身も更新対象に含める。
    writeFileSync(join(seed, "deploy.sh"), SCRIPT.replace("set -eu", "set -eu\n# Updated deployment script"));
    writeFileSync(join(seed, "package.json"), '{"private":true,"version":"2.0.0"}\n');
    git(seed, "add", ".");
    git(seed, "commit", "-m", "Update deployment");
    git(seed, "push", "origin", "main");
    latestCommit = git(seed, "rev-parse", "HEAD");

    const pnpmStub = join(workDir, "bin", "pnpm");
    writeFileSync(pnpmStub, [
      "#!/bin/sh",
      'printf "%s\\n" "$PWD" "$@" "$(git rev-parse HEAD)" "$(cat package.json)" > "$DEPLOY_TEST_LOG"',
      'exit "$DEPLOY_TEST_EXIT"',
      "",
    ].join("\n"));
    chmodSync(pnpmStub, 0o755);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("別のディレクトリから sh で実行し、最新コミットの依存関係をインストールする", () => {
    writeFileSync(join(checkout, "package.json"), "local changes\n");
    writeFileSync(join(checkout, ".env"), "LOCAL_FIXTURE=true\n");

    const result = runDeploy();

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(git(checkout, "rev-parse", "HEAD")).toBe(latestCommit);
    expect(git(checkout, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(git(checkout, "reflog", "show", "--all")).toBe("");
    expect(readFileSync(join(checkout, "deploy.sh"), "utf-8")).toContain("# Updated deployment script");
    expect(readFileSync(join(checkout, ".env"), "utf-8")).toBe("LOCAL_FIXTURE=true\n");
    expect(readFileSync(installLog, "utf-8").trim().split("\n")).toEqual([
      checkout, "install", "--frozen-lockfile", latestCommit, '{"private":true,"version":"2.0.0"}',
    ]);
  });

  it("Git の取得に失敗したらチェックアウトの更新とインストールを行わない", () => {
    git(checkout, "remote", "set-url", "origin", join(workDir, "missing.git"));
    writeFileSync(join(checkout, "package.json"), "local changes\n");

    const result = runDeploy();

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(git(checkout, "rev-parse", "HEAD")).toBe(initialCommit);
    expect(readFileSync(join(checkout, "package.json"), "utf-8")).toBe("local changes\n");
    expect(existsSync(installLog)).toBe(false);
  });

  it("依存関係のインストール失敗を終了コードで伝える", () => {
    const result = runDeploy(23);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(git(checkout, "rev-parse", "HEAD")).toBe(latestCommit);
    expect(existsSync(installLog)).toBe(true);
  });
});
