/** Codex のセットアップが、セットアッププロセス固有の PATH や Corepack に依存しないことを検証する。 */

import { execFileSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const describeShell = process.platform === "win32" ? describe.skip : describe;

// Node.js 25 以降と同じく、Corepack を同梱しない bin ディレクトリを模す。
const NODE_COMMANDS = ["node", "npm", "npx", "pnpm", "pnpx"];

let workDir: string;
let nodeBinDir: string;
let npmLogPath: string;

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/bash\n${body}\n`, "utf-8");
  chmodSync(path, 0o755);
}

function writePackageJson(fields: Record<string, unknown>): void {
  writeFileSync(join(workDir, "package.json"), JSON.stringify(fields), "utf-8");
}

function runSetup(codexPath: string, pathPrefix: string[] = []): void {
  execFileSync("bash", [join(workDir, ".codex", "setup.sh")], {
    env: {
      ...process.env,
      CODEX_PATH_DIR: codexPath,
      NVM_DIR: join(workDir, "nvm"),
      PATH: [...pathPrefix, nodeBinDir, "/usr/bin", "/bin"].join(":"),
    },
    stdio: "pipe",
  });
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "aoi-codex-setup-"));
  mkdirSync(join(workDir, ".codex"));
  copyFileSync(join(REPO_ROOT, ".codex", "setup.sh"), join(workDir, ".codex", "setup.sh"));
  writeFileSync(join(workDir, ".nvmrc"), "26\n", "utf-8");
  writePackageJson({ packageManager: "pnpm@12.18.0+sha512.abc" });

  const nvmDir = join(workDir, "nvm");
  nodeBinDir = join(nvmDir, "versions", "node", "v26.0.0", "bin");
  npmLogPath = join(workDir, "npm.log");
  mkdirSync(nodeBinDir, { recursive: true });
  writeFileSync(
    join(nvmDir, "nvm.sh"),
    [
      "nvm() {",
      '  if [ \"$1\" = \"which\" ]; then printf \"%s\\n\" \"$NVM_DIR/versions/node/v26.0.0/bin/node\"; fi',
      "}",
    ].join("\n"),
    "utf-8",
  );

  // node は package.json を読むために実体へ委ね、バージョン表示だけ差し替える。
  writeExecutable(
    join(nodeBinDir, "node"),
    `if [ "$1" = "-v" ]; then printf "v26.0.0\\n"; else exec ${JSON.stringify(process.execPath)} "$@"; fi`,
  );
  writeExecutable(join(nodeBinDir, "npm"), `printf '%s\\n' "$*" >> ${JSON.stringify(npmLogPath)}`);
  for (const command of ["npx", "pnpm", "pnpx"]) {
    writeExecutable(join(nodeBinDir, command), "exit 0");
  }
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describeShell(".codex/setup.sh", () => {
  it("コマンド配置先が現在の PATH に無くても symlink を作成する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);

    runSetup(codexPath);

    for (const command of NODE_COMMANDS) {
      const link = join(codexPath, command);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(join(nodeBinDir, command));
    }
  });

  it("前回作成した循環 symlink が残っていても実体へのリンクに修復する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);

    for (const command of NODE_COMMANDS) {
      const link = join(codexPath, command);
      symlinkSync(link, link);
    }

    runSetup(codexPath, [codexPath]);

    for (const command of NODE_COMMANDS) {
      expect(readlinkSync(join(codexPath, command))).toBe(join(nodeBinDir, command));
    }
  });

  it("Corepack を使わず、packageManager の版の pnpm を npm で導入する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);

    runSetup(codexPath);

    const npmCalls = readFileSync(npmLogPath, "utf-8").trim().split("\n");
    expect(npmCalls).toContain("install -g pnpm@12.18.0");
    expect(existsSync(join(codexPath, "corepack"))).toBe(false);
  });

  it("packageManager に pnpm の版が無ければ pnpm を導入せずに失敗する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);
    writePackageJson({});

    expect(() => runSetup(codexPath)).toThrow();
    expect(existsSync(npmLogPath)).toBe(false);
  });
});
