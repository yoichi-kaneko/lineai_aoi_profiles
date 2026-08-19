import { describe, expect, it } from "vitest";
import { calcPreviewSize } from "../../src/cloudinary/upload_image.js";

describe("cloudinary/upload_image", () => {
  it("長辺が制限以下なら元サイズを保つ", () => {
    expect(calcPreviewSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it("長辺を維持して縮小する", () => {
    expect(calcPreviewSize(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(calcPreviewSize(800, 1200)).toEqual({ width: 341, height: 512 });
  });
});
