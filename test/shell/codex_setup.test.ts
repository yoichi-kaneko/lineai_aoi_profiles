/** Codex のセットアップが、セットアッププロセス固有の PATH に依存しないことを検証する。 */

import { execFileSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
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

let workDir: string;

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/bash\n${body}\n`, "utf-8");
  chmodSync(path, 0o755);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "aoi-codex-setup-"));
  mkdirSync(join(workDir, ".codex"));
  copyFileSync(join(REPO_ROOT, ".codex", "setup.sh"), join(workDir, ".codex", "setup.sh"));
  writeFileSync(join(workDir, ".nvmrc"), "24\n", "utf-8");

  const nvmDir = join(workDir, "nvm");
  const nodeBinDir = join(nvmDir, "versions", "node", "v24.0.0", "bin");
  mkdirSync(nodeBinDir, { recursive: true });
  writeFileSync(
    join(nvmDir, "nvm.sh"),
    [
      "nvm() {",
      '  if [ \"$1\" = \"which\" ]; then printf \"%s\\n\" \"$NVM_DIR/versions/node/v24.0.0/bin/node\"; fi',
      "}",
    ].join("\n"),
    "utf-8",
  );
  for (const command of ["node", "npm", "npx", "corepack", "pnpm", "pnpx"]) {
    const body = command === "node" ? 'printf "v24.0.0\\n"' : "exit 0";
    writeExecutable(join(nodeBinDir, command), body);
  }
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe(".codex/setup.sh", () => {
  it("コマンド配置先が現在の PATH に無くても symlink を作成する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);
    const nodeBinDir = join(workDir, "nvm", "versions", "node", "v24.0.0", "bin");

    execFileSync("bash", [join(workDir, ".codex", "setup.sh")], {
      env: {
        ...process.env,
        CODEX_PATH_DIR: codexPath,
        NVM_DIR: join(workDir, "nvm"),
        PATH: `${nodeBinDir}:/usr/bin:/bin`,
      },
      stdio: "pipe",
    });

    for (const command of ["node", "npm", "npx", "corepack", "pnpm", "pnpx"]) {
      const link = join(codexPath, command);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(join(nodeBinDir, command));
    }
  });

  it("前回作成した循環 symlink が残っていても実体へのリンクに修復する", () => {
    const codexPath = join(workDir, "codex-path");
    mkdirSync(codexPath);
    const nodeBinDir = join(workDir, "nvm", "versions", "node", "v24.0.0", "bin");

    for (const command of ["node", "npm", "npx", "corepack", "pnpm", "pnpx"]) {
      const link = join(codexPath, command);
      symlinkSync(link, link);
    }

    execFileSync("bash", [join(workDir, ".codex", "setup.sh")], {
      env: {
        ...process.env,
        CODEX_PATH_DIR: codexPath,
        NVM_DIR: join(workDir, "nvm"),
        PATH: `${codexPath}:${nodeBinDir}:/usr/bin:/bin`,
      },
      stdio: "pipe",
    });

    for (const command of ["node", "npm", "npx", "corepack", "pnpm", "pnpx"]) {
      expect(readlinkSync(join(codexPath, command))).toBe(join(nodeBinDir, command));
    }
  });
});
