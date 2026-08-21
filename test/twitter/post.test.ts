import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("twitter/post", () => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const tmpDir = join(projectRoot, "tmp");
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

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
    rmSync(join(projectRoot, "twitter-secret.png"), { force: true });
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
    writeFileSync(join(projectRoot, "twitter-secret.png"), "secret");
    symlinkSync(join(projectRoot, "twitter-secret.png"), join(tmpDir, "twitter-escape.png"));
    const { resolveUploadImagePath } = await import("../../src/twitter/post.js");
    expect(() => resolveUploadImagePath("tmp/twitter-escape.png")).toThrow("process.exit");
  });
});
