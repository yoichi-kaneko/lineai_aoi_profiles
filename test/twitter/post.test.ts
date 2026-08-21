import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("twitter/post", () => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const tmpDir = join(projectRoot, "tmp");
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  /** シンボリックリンク脱出テスト用の一時ディレクトリ（プロジェクト外） */
  let secretDir: string | undefined;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "twitter-post-image.png"), "binary");
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(join(tmpDir, "twitter-post-image.png"), { force: true });
    // シンボリックリンクはリンク先より先に消す。リンク先を先に消すとリンクが
    // 壊れた状態になり、rmSync の force がリンク自体を残したまま握り潰してしまう
    // （残骸が次回実行の symlinkSync を EEXIST で失敗させる）
    rmSync(join(tmpDir, "twitter-escape.png"), { force: true });
    if (secretDir) {
      rmSync(secretDir, { force: true, recursive: true });
      secretDir = undefined;
    }
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("tmp 配下の相対パスを絶対パスへ解決する", async () => {
    const { resolveUploadImagePath } = await import("../../src/twitter/post.js");
    expect(resolveUploadImagePath("tmp/twitter-post-image.png")).toBe(
      realpathSync(join(tmpDir, "twitter-post-image.png")),
    );
  });

  it("tmp 外のパスを拒否する", async () => {
    const { resolveUploadImagePath } = await import("../../src/twitter/post.js");
    expect(() => resolveUploadImagePath(".env")).toThrow("process.exit");
  });

  it.skipIf(process.platform === "win32")("シンボリックリンクで tmp 外へ脱出するパスを拒否する", async () => {
    secretDir = mkdtempSync(join(tmpdir(), "twitter-secret-"));
    const secretPath = join(secretDir, "twitter-secret.png");
    writeFileSync(secretPath, "secret");
    symlinkSync(secretPath, join(tmpDir, "twitter-escape.png"));
    const { resolveUploadImagePath } = await import("../../src/twitter/post.js");
    expect(() => resolveUploadImagePath("tmp/twitter-escape.png")).toThrow("process.exit");
  });
});
