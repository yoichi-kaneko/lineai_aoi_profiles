import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REDIRECT_URI,
  extractOAuthCredentials,
  parseLocalRedirectListener,
  resolveGoogleSkillsTokenPath,
} from "../../src/util/google_oauth.js";

describe("util/google_oauth", () => {
  describe("extractOAuthCredentials", () => {
    it("installed 形式から client_id / client_secret / redirect_uri を取り出す", () => {
      expect(
        extractOAuthCredentials({
          installed: {
            client_id: "id",
            client_secret: "secret",
            redirect_uris: ["http://localhost:9999/cb", "urn:ietf:wg:oauth:2.0:oob"],
          },
        })
      ).toEqual({
        client_id: "id",
        client_secret: "secret",
        redirect_uri: "http://localhost:9999/cb",
      });
    });

    it("フラット形式も受ける", () => {
      expect(
        extractOAuthCredentials({
          client_id: "id",
          client_secret: "secret",
          redirect_uris: ["http://localhost:9999/cb"],
        })
      ).toEqual({
        client_id: "id",
        client_secret: "secret",
        redirect_uri: "http://localhost:9999/cb",
      });
    });

    it("redirect_uris が無ければ既定のコールバックで補う", () => {
      expect(
        extractOAuthCredentials({ installed: { client_id: "id", client_secret: "secret" } })
      ).toEqual({
        client_id: "id",
        client_secret: "secret",
        redirect_uri: DEFAULT_REDIRECT_URI,
      });
    });

    it("redirect_uris が空配列でも既定のコールバックで補う", () => {
      expect(
        extractOAuthCredentials({
          client_id: "id",
          client_secret: "secret",
          redirect_uris: [],
        })
      ).toEqual({
        client_id: "id",
        client_secret: "secret",
        redirect_uri: DEFAULT_REDIRECT_URI,
      });
    });

    it("client_id / client_secret が揃っていなければ拒否する", () => {
      const message = "クレデンシャルの形式が不正です";
      expect(() => extractOAuthCredentials({ client_id: "id" })).toThrow(message);
      expect(() => extractOAuthCredentials({ installed: { client_id: "id" } })).toThrow(message);
      expect(() => extractOAuthCredentials({})).toThrow(message);
      expect(() => extractOAuthCredentials(null)).toThrow(message);
      expect(() => extractOAuthCredentials("keys.json")).toThrow(message);
    });
  });

  describe("parseLocalRedirectListener", () => {
    it("localhost のポートと pathname を取り出す", () => {
      expect(parseLocalRedirectListener("http://localhost:9999/cb")).toEqual({
        redirectUri: "http://localhost:9999/cb",
        port: 9999,
        pathname: "/cb",
      });
    });

    it("既定のコールバックも同じ形で分解する", () => {
      expect(parseLocalRedirectListener(DEFAULT_REDIRECT_URI)).toEqual({
        redirectUri: DEFAULT_REDIRECT_URI,
        port: 3000,
        pathname: "/oauth2callback",
      });
    });

    it("127.0.0.1 も受ける", () => {
      expect(parseLocalRedirectListener("http://127.0.0.1:3000/oauth2callback")).toEqual({
        redirectUri: "http://127.0.0.1:3000/oauth2callback",
        port: 3000,
        pathname: "/oauth2callback",
      });
    });

    it("http://localhost 以外やポート無しは拒否する", () => {
      expect(() => parseLocalRedirectListener("https://localhost:3000/cb")).toThrow(
        "http://localhost のみ対応"
      );
      expect(() => parseLocalRedirectListener("http://example.com:3000/cb")).toThrow(
        "localhost または 127.0.0.1"
      );
      expect(() => parseLocalRedirectListener("http://localhost/cb")).toThrow("ポート番号");
      expect(() => parseLocalRedirectListener("not-a-url")).toThrow("redirect_uri が不正");
    });
  });

  describe("resolveGoogleSkillsTokenPath", () => {
    it("GOOGLE_SKILLS_TOKEN_PATH があればそのまま使う", () => {
      expect(
        resolveGoogleSkillsTokenPath(
          { GOOGLE_SKILLS_TOKEN_PATH: "/etc/aoi/tokens.json", XDG_CONFIG_HOME: "/xdg" },
          "/home/aoi"
        )
      ).toBe("/etc/aoi/tokens.json");
    });

    it("XDG_CONFIG_HOME があればその配下を使う", () => {
      expect(resolveGoogleSkillsTokenPath({ XDG_CONFIG_HOME: "/xdg" }, "/home/aoi")).toBe(
        path.join("/xdg", "google-skills", "tokens.json")
      );
    });

    it("どちらも無ければホーム直下の .config を使う", () => {
      expect(resolveGoogleSkillsTokenPath({}, "/home/aoi")).toBe(
        path.join("/home/aoi", ".config", "google-skills", "tokens.json")
      );
    });
  });
});
