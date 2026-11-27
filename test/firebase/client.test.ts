import { generateKeyPairSync } from "crypto";
import { describe, expect, it } from "vitest";
import { parseFirestoreServiceAccount } from "../../src/firebase/client.js";

const { privateKey: PRIVATE_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const SNAKE_CASE = {
  type: "service_account",
  project_id: "example-project",
  client_email: "sa@example-project.iam.gserviceaccount.com",
  private_key: PRIVATE_KEY,
};

describe("parseFirestoreServiceAccount", () => {
  it("ダウンロードした JSON の snake_case の項目を読み取る", () => {
    expect(parseFirestoreServiceAccount(SNAKE_CASE)).toEqual({
      projectId: "example-project",
      clientEmail: "sa@example-project.iam.gserviceaccount.com",
      privateKey: PRIVATE_KEY,
    });
  });

  it("camelCase の項目も受け付ける", () => {
    expect(
      parseFirestoreServiceAccount({
        projectId: "example-project",
        clientEmail: "sa@example-project.iam.gserviceaccount.com",
        privateKey: PRIVATE_KEY,
      })
    ).toEqual({
      projectId: "example-project",
      clientEmail: "sa@example-project.iam.gserviceaccount.com",
      privateKey: PRIVATE_KEY,
    });
  });

  it("JSON オブジェクトでなければ例外にする", () => {
    expect(() => parseFirestoreServiceAccount(null)).toThrow("JSON オブジェクトではありません");
    expect(() => parseFirestoreServiceAccount([SNAKE_CASE])).toThrow(
      "JSON オブジェクトではありません"
    );
    expect(() => parseFirestoreServiceAccount("service_account")).toThrow(
      "JSON オブジェクトではありません"
    );
  });

  it("欠けている項目の名前を列挙して例外にする", () => {
    expect(() =>
      parseFirestoreServiceAccount({ project_id: "example-project", private_key: "" })
    ).toThrow("必要な項目がありません: client_email, private_key");
  });

  it("文字列でない項目は欠けているものとして扱う", () => {
    expect(() => parseFirestoreServiceAccount({ ...SNAKE_CASE, project_id: 123 })).toThrow(
      "必要な項目がありません: project_id"
    );
  });

  it("秘密鍵として読めない private_key は、値を含めずに例外にする", () => {
    const broken = "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n";
    let message = "";
    try {
      parseFirestoreServiceAccount({ ...SNAKE_CASE, private_key: broken });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("private_key を秘密鍵として読み取れません");
    expect(message).not.toContain("not-a-key");
  });
});
