import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REDIRECT_URI,
  extractOAuthCredentials,
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
