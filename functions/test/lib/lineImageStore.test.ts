import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLineImagePublicId,
  buildUploadOptions,
  raceWithTimeout,
  resolveLineImageStoreConfig,
  storeLineImage,
  storeLineImageFromEnv,
  summarizeError,
  type LineImageStoreConfig,
} from "../../src/lib/lineImageStore";

const config: LineImageStoreConfig = {
  lineAccessToken: "line-token",
  cloudName: "demo",
  apiKey: "key",
  apiSecret: "secret",
};

const fullEnv = {
  LINE_ACCESS_TOKEN: "line-token",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildLineImagePublicId", () => {
  it("チャネルの接頭辞とメッセージ ID で public_id を組み立てる", () => {
    expect(buildLineImagePublicId("aoi", "123456789012345678")).toBe("line_aoi_123456789012345678");
    expect(buildLineImagePublicId("checkin", "123456789012345678")).toBe(
      "line_checkin_123456789012345678",
    );
  });

  it("public_id に使えない文字や長すぎる ID は受け付けない", () => {
    expect(buildLineImagePublicId("aoi", "")).toBeNull();
    expect(buildLineImagePublicId("aoi", "../123")).toBeNull();
    expect(buildLineImagePublicId("aoi", "12 34")).toBeNull();
    expect(buildLineImagePublicId("aoi", "1".repeat(65))).toBeNull();
  });
});

describe("resolveLineImageStoreConfig", () => {
  it("必要な変数がそろえば設定を返し、値の前後の空白と改行を取り除く", () => {
    const result = resolveLineImageStoreConfig(
      { ...fullEnv, CLOUDINARY_API_SECRET: "secret\n", CLOUDINARY_RECEIVED_IMAGE_ASSET_FOLDER: " inbox " },
      "LINE_ACCESS_TOKEN",
    );
    expect(result).toEqual({ ok: true, config: { ...config, assetFolder: "inbox" } });
  });

  it("保存フォルダは任意", () => {
    const result = resolveLineImageStoreConfig(fullEnv, "LINE_ACCESS_TOKEN");
    expect(result).toEqual({ ok: true, config });
  });

  it("足りない変数の名前だけを返す", () => {
    const result = resolveLineImageStoreConfig(
      { CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "  " },
      "CHECKIN_LINE_ACCESS_TOKEN",
    );
    expect(result).toEqual({
      ok: false,
      missing: ["CHECKIN_LINE_ACCESS_TOKEN", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    });
  });
});

describe("buildUploadOptions", () => {
  it("authenticated で、認証情報を呼び出しごとに渡す", () => {
    expect(buildUploadOptions(config, "line_aoi_1")).toEqual({
      type: "authenticated",
      resource_type: "image",
      public_id: "line_aoi_1",
      cloud_name: "demo",
      api_key: "key",
      api_secret: "secret",
      timeout: 30_000,
    });
  });

  it("保存フォルダがあれば asset_folder を付ける", () => {
    expect(buildUploadOptions({ ...config, assetFolder: "inbox" }, "line_aoi_1").asset_folder).toBe(
      "inbox",
    );
  });
});

describe("raceWithTimeout", () => {
  it("期限内なら結果を返し、超過したら例外を返す", async () => {
    await expect(raceWithTimeout(Promise.resolve("ok"), 50, "timed out")).resolves.toBe("ok");
    await expect(
      raceWithTimeout(new Promise(() => {}), 10, "LINE content fetch timed out"),
    ).rejects.toThrow("LINE content fetch timed out");
  });
});

describe("storeLineImage", () => {
  it("LINE から取得した画像を authenticated でアップロードする", async () => {
    const data = Buffer.from("image");
    const fetchContent = vi.fn(async () => data);
    const upload = vi.fn(async () => {});

    const result = await storeLineImage("aoi", "123", config, { fetchContent, upload });

    expect(result).toBe("stored");
    expect(fetchContent).toHaveBeenCalledWith("123", "line-token");
    expect(upload).toHaveBeenCalledWith(data, buildUploadOptions(config, "line_aoi_123"));
  });

  it("想定外のメッセージ ID では取得もアップロードもしない", async () => {
    const fetchContent = vi.fn(async () => Buffer.from("image"));
    const upload = vi.fn(async () => {});

    const result = await storeLineImage("aoi", "../123", config, { fetchContent, upload });

    expect(result).toBe("invalid_message_id");
    expect(fetchContent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("取得に失敗したらアップロードせず例外を返す", async () => {
    const upload = vi.fn(async () => {});

    await expect(
      storeLineImage("aoi", "123", config, {
        fetchContent: async () => {
          throw new Error("content expired");
        },
        upload,
      }),
    ).rejects.toThrow("content expired");
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("storeLineImageFromEnv", () => {
  it("設定が足りなければ変数名だけを警告して保存しない", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchContent = vi.fn(async () => Buffer.from("image"));
    const upload = vi.fn(async () => {});

    await storeLineImageFromEnv(
      "aoi",
      "123",
      "LINE_ACCESS_TOKEN",
      { ...fullEnv, LINE_ACCESS_TOKEN: "" },
      { fetchContent, upload },
    );

    expect(fetchContent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    const warned = warnSpy.mock.calls.flat().map(String).join(" ");
    expect(warned).toContain("LINE_ACCESS_TOKEN");
    expect(warned).not.toContain("secret");
  });

  it("設定がそろえば指定したアクセストークンで保存する", async () => {
    const fetchContent = vi.fn(async () => Buffer.from("image"));
    const upload = vi.fn(async () => {});

    await storeLineImageFromEnv(
      "aoi",
      "123",
      "CHECKIN_LINE_ACCESS_TOKEN",
      { ...fullEnv, CHECKIN_LINE_ACCESS_TOKEN: "checkin-token" },
      { fetchContent, upload },
    );

    expect(fetchContent).toHaveBeenCalledWith("123", "checkin-token");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("summarizeError", () => {
  it("名前・メッセージ・HTTP ステータスだけを取り出す", () => {
    const error = Object.assign(new Error("Request failed"), {
      status: 404,
      headers: { authorization: "Bearer line-token" },
    });
    expect(summarizeError(error)).toBe("Error: Request failed: status=404");
  });

  it("Cloudinary の http_code も拾う", () => {
    expect(summarizeError({ message: "Invalid Signature", http_code: 401 })).toBe(
      "Invalid Signature: status=401",
    );
  });

  it("中身の分からない例外は詳細を出さない", () => {
    expect(summarizeError({ token: "line-token" })).toBe("unknown error");
    expect(summarizeError(undefined)).toBe("unknown error");
  });
});
