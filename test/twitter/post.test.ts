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

  describe("detectImageMimeType", () => {
    it.each([
      ["PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), "image/png"],
      ["JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg"],
      ["GIF87a", Buffer.from("GIF87a\x00", "latin1"), "image/gif"],
      ["GIF89a", Buffer.from("GIF89a\x00", "latin1"), "image/gif"],
      ["WebP", Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1"), "image/webp"],
    ])("%s を先頭バイトから判定する", async (_label, data, expected) => {
      const { detectImageMimeType } = await import("../../src/twitter/post.js");
      expect(detectImageMimeType(data)).toBe(expected);
    });

    it.each([
      ["テキスト", Buffer.from("binary")],
      ["空", Buffer.alloc(0)],
      ["PNG シグネチャの途中まで", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ["WEBP 以外の RIFF（WAV）", Buffer.from("RIFF\x10\x00\x00\x00WAVEfmt ", "latin1")],
    ])("対応外の形式（%s）は undefined を返す", async (_label, data) => {
      const { detectImageMimeType } = await import("../../src/twitter/post.js");
      expect(detectImageMimeType(data)).toBeUndefined();
    });
  });

  it("GIF だけを tweet_gif カテゴリにする", async () => {
    const { mediaCategoryFor } = await import("../../src/twitter/post.js");
    expect(mediaCategoryFor("image/gif")).toBe("tweet_gif");
    expect(mediaCategoryFor("image/png")).toBe("tweet_image");
    expect(mediaCategoryFor("image/jpeg")).toBe("tweet_image");
    expect(mediaCategoryFor("image/webp")).toBe("tweet_image");
  });

  describe("readUploadImage", () => {
    afterEach(() => {
      rmSync(join(tmpDir, "twitter-post-real.png"), { force: true });
    });

    it("tmp 配下の画像を読み込み、MIME タイプとカテゴリを添えて返す", async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
      writeFileSync(join(tmpDir, "twitter-post-real.png"), png);
      const { readUploadImage } = await import("../../src/twitter/post.js");
      const image = readUploadImage("tmp/twitter-post-real.png");
      expect(image.data.equals(png)).toBe(true);
      expect(image.mediaType).toBe("image/png");
      expect(image.mediaCategory).toBe("tweet_image");
    });

    it("拡張子が画像でも中身が対応外なら拒否する", async () => {
      const { readUploadImage } = await import("../../src/twitter/post.js");
      expect(() => readUploadImage("tmp/twitter-post-image.png")).toThrow("process.exit");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("対応していない画像形式です"),
      );
    });

    it("tmp 外のパスは読み込まずに拒否する", async () => {
      const { readUploadImage } = await import("../../src/twitter/post.js");
      expect(() => readUploadImage(".env")).toThrow("process.exit");
    });
  });
});
