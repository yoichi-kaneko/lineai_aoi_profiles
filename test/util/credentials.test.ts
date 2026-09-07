import { describe, expect, it } from "vitest";
import {
  parseCredentialJson,
  resolveCredentialSource,
} from "../../src/util/credentials.js";

describe("util/credentials", () => {
  describe("resolveCredentialSource", () => {
    it("中身の環境変数があればそれを使う", () => {
      expect(resolveCredentialSource('{"a":1}', "/path/to/keys.json")).toEqual({
        kind: "inline",
        value: '{"a":1}',
      });
    });

    it("中身が未設定ならパス指定へ落ちる", () => {
      expect(resolveCredentialSource(undefined, "/path/to/keys.json")).toEqual({
        kind: "path",
        value: "/path/to/keys.json",
      });
    });

    it("中身が空白のみならパス指定へ落ちる", () => {
      expect(resolveCredentialSource("   \n", "/path/to/keys.json")).toEqual({
        kind: "path",
        value: "/path/to/keys.json",
      });
    });

    it("どちらも未設定・空白のみなら null を返す", () => {
      expect(resolveCredentialSource(undefined, undefined)).toBeNull();
      expect(resolveCredentialSource("", "")).toBeNull();
      expect(resolveCredentialSource(" ", "  ")).toBeNull();
    });
  });

  describe("parseCredentialJson", () => {
    const credential = { client_id: "id", client_secret: "secret" };
    const json = JSON.stringify(credential);

    it("生の JSON をそのまま解釈する", () => {
      expect(parseCredentialJson(json, "TEST_ENV")).toEqual(credential);
    });

    it("前後に空白・改行があっても解釈する", () => {
      expect(parseCredentialJson(`\n  ${json}\n`, "TEST_ENV")).toEqual(credential);
    });

    it("base64 を復号して解釈する", () => {
      const encoded = Buffer.from(json, "utf-8").toString("base64");
      expect(parseCredentialJson(encoded, "TEST_ENV")).toEqual(credential);
    });

    it("base64 が途中で折り返されていても解釈する", () => {
      const encoded = Buffer.from(json, "utf-8").toString("base64");
      const wrapped = encoded.replace(/(.{8})/g, "$1\n");
      expect(parseCredentialJson(wrapped, "TEST_ENV")).toEqual(credential);
    });

    it("base64url 形式も受ける", () => {
      const encoded = Buffer.from(json, "utf-8").toString("base64url");
      expect(parseCredentialJson(encoded, "TEST_ENV")).toEqual(credential);
    });

    it("JSON でも base64 でもない値は環境変数名を添えて拒否する", () => {
      expect(() => parseCredentialJson("これは資格情報ではありません", "TEST_ENV")).toThrow(
        "環境変数 TEST_ENV の値が JSON でも base64 でもありません"
      );
    });

    it("base64 として復号できても JSON でなければ拒否する", () => {
      const encoded = Buffer.from("not json at all", "utf-8").toString("base64");
      expect(() => parseCredentialJson(encoded, "TEST_ENV")).toThrow(
        "環境変数 TEST_ENV の値を JSON として解釈できませんでした"
      );
    });

    it("JSON として壊れていれば拒否する", () => {
      expect(() => parseCredentialJson('{"client_id":', "TEST_ENV")).toThrow(
        "環境変数 TEST_ENV の値を JSON として解釈できませんでした"
      );
    });
  });
});
