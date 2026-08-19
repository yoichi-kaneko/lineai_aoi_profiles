import { describe, expect, it } from "vitest";
import { getFilenameFromResponse } from "../../src/util/download_image.js";

describe("util/download_image", () => {
  it("Content-Disposition を優先する", () => {
    const response = new Response(null, {
      headers: {
        "content-disposition": "attachment; filename*=UTF-8''hello%20world.png",
      },
    });
    expect(getFilenameFromResponse(response, "https://example.com/fallback.jpg")).toBe(
      "hello world.png",
    );
  });

  it("危険な Content-Disposition のファイル名を拒否する", () => {
    const response = new Response(null, {
      headers: {
        "content-disposition": "attachment; filename*=UTF-8''..%2F.env",
      },
    });
    expect(() => getFilenameFromResponse(response, "https://example.com/fallback.jpg")).toThrow(
      "安全でないファイル名です: ../.env",
    );
  });

  it("URL の basename を使う", () => {
    const response = new Response(null, { headers: {} });
    expect(getFilenameFromResponse(response, "https://example.com/images/pic.webp")).toBe(
      "pic.webp",
    );
  });

  it("basename が無ければ Content-Type から拡張子を決める", () => {
    const response = new Response(null, {
      headers: { "content-type": "image/png; charset=utf-8" },
    });
    expect(getFilenameFromResponse(response, "https://example.com/download")).toMatch(
      /^image_\d+\.png$/,
    );
  });
});
