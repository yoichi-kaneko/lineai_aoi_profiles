import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AOI_LINE_IMAGE_PUBLIC_ID_PREFIX,
  buildLineImagePublicId,
  buildSignedImageUrl,
  fetchLineImage,
  isValidMessageId,
  normalizeContentType,
  resolveCloudinaryCredentials,
  type FetchedImage,
} from "../../src/line/download_image.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const jpeg: FetchedImage = { contentType: "image/jpeg", data: Buffer.from("jpeg") };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("line/download_image", () => {
  describe("public_id", () => {
    it("メッセージ ID に碧衣宛の接頭辞を付ける", () => {
      expect(buildLineImagePublicId("123456789012345678")).toBe("line_aoi_123456789012345678");
    });

    it("保存する側（functions）の接頭辞と一致している", () => {
      // functions は別パッケージのため import せず、定義の文字列を突き合わせる
      const source = readFileSync(
        resolve(__dirname, "../../functions/src/lib/lineImageStore.ts"),
        "utf8",
      );
      const match = source.match(/aoi:\s*"([^"]+)"/);
      expect(match?.[1]).toBe(AOI_LINE_IMAGE_PUBLIC_ID_PREFIX);
    });

    it("ファイル名と public_id に使えない messageId を拒否する", () => {
      expect(isValidMessageId("123456789012345678")).toBe(true);
      expect(isValidMessageId("")).toBe(false);
      expect(isValidMessageId("../.env")).toBe(false);
      expect(isValidMessageId("1".repeat(65))).toBe(false);
    });
  });

  describe("normalizeContentType", () => {
    it("パラメーターを落とし小文字にそろえる", () => {
      expect(normalizeContentType("Image/JPEG; charset=binary")).toBe("image/jpeg");
      expect(normalizeContentType(null)).toBe("");
    });
  });

  describe("resolveCloudinaryCredentials", () => {
    it("Cloud Name と API Secret がそろえば返す", () => {
      expect(
        resolveCloudinaryCredentials({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_SECRET: "secret" }),
      ).toEqual({ cloudName: "demo", apiSecret: "secret" });
    });

    it("どちらかが欠ければ null", () => {
      expect(resolveCloudinaryCredentials({ CLOUDINARY_CLOUD_NAME: "demo" })).toBeNull();
      expect(resolveCloudinaryCredentials({ CLOUDINARY_API_SECRET: "secret" })).toBeNull();
    });
  });

  describe("buildSignedImageUrl", () => {
    const credentials = { cloudName: "demo", apiSecret: "secret" };

    it("authenticated の署名付き URL を作り、API Secret そのものは含めない", () => {
      const url = buildSignedImageUrl("line_aoi_123", credentials);
      expect(url).toMatch(
        /^https:\/\/res\.cloudinary\.com\/demo\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/line_aoi_123$/,
      );
      expect(url).not.toContain("secret");
    });

    it("API Secret が違えば署名も変わる", () => {
      expect(buildSignedImageUrl("line_aoi_123", credentials)).not.toBe(
        buildSignedImageUrl("line_aoi_123", { ...credentials, apiSecret: "another" }),
      );
    });
  });

  describe("fetchLineImage", () => {
    it("Cloudinary にあればそれを使い、LINE には取りに行かない", async () => {
      const fromLine = vi.fn(async () => jpeg);

      const result = await fetchLineImage("123", { fromCloudinary: async () => jpeg, fromLine });

      expect(result).toEqual({ source: "cloudinary", image: jpeg });
      expect(fromLine).not.toHaveBeenCalled();
    });

    it("Cloudinary に無ければ LINE から取得する", async () => {
      const fromLine = vi.fn(async () => jpeg);

      const result = await fetchLineImage("123", { fromCloudinary: async () => null, fromLine });

      expect(result).toEqual({ source: "line", image: jpeg });
      expect(fromLine).toHaveBeenCalledWith("123");
    });

    it("Cloudinary の取得に失敗したら LINE から取得する", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await fetchLineImage("123", {
        fromCloudinary: async () => {
          throw new Error("HTTP 401");
        },
        fromLine: async () => jpeg,
      });

      expect(result.source).toBe("line");
      expect(errorSpy.mock.calls.flat().map(String).join(" ")).toContain("HTTP 401");
    });

    it("Cloudinary の画像が対応外の形式なら LINE から取得する", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await fetchLineImage("123", {
        fromCloudinary: async () => ({ contentType: "image/webp", data: Buffer.from("webp") }),
        fromLine: async () => jpeg,
      });

      expect(result).toEqual({ source: "line", image: jpeg });
    });

    it("Cloudinary の設定が無ければ LINE からだけ取得する", async () => {
      const result = await fetchLineImage("123", { fromCloudinary: null, fromLine: async () => jpeg });

      expect(result).toEqual({ source: "line", image: jpeg });
    });
  });
});
