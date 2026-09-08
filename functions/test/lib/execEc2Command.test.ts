import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, SSMClientMock, SendCommandCommandMock } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const SSMClientMock = vi.fn(function (this: { send: typeof sendMock }) {
    this.send = sendMock;
  });
  const SendCommandCommandMock = vi.fn(function (
    this: { input: unknown },
    input: unknown,
  ) {
    this.input = input;
  });
  return {
    sendMock,
    SSMClientMock,
    SendCommandCommandMock,
  };
});

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: SSMClientMock,
  SendCommandCommand: SendCommandCommandMock,
}));

import { buildEc2Command, execEc2Command } from "../../src/lib/execEc2Command";

describe("execEc2Command", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AWS_ACCESS_KEY: "key",
      AWS_SECRET_KEY: "secret",
      AWS_REGION: "ap-northeast-1",
      EC2_INSTANCE_ID: "i-123",
      EC2_COMMAND_TEMPLATE: "run --mode {MODE}",
    };
    sendMock.mockResolvedValue({});
    SSMClientMock.mockClear();
    SendCommandCommandMock.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("必須 env 欠落時は失敗する", async () => {
    delete process.env.EC2_COMMAND_TEMPLATE;
    await expect(execEc2Command("night")).rejects.toThrow(/Missing required env/);
  });

  it("MODE を埋め込んで SSM へ送る", async () => {
    await execEc2Command("off_mountain");

    expect(SSMClientMock).toHaveBeenCalledWith({
      region: "ap-northeast-1",
      credentials: {
        accessKeyId: "key",
        secretAccessKey: "secret",
      },
    });
    expect(SendCommandCommandMock).toHaveBeenCalledWith({
      InstanceIds: ["i-123"],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: ["run --mode off_mountain"],
      },
    });
    expect(sendMock).toHaveBeenCalled();
  });

  it("対象文書を渡すモードでは ID と投稿日も埋め込む", async () => {
    process.env.EC2_COMMAND_TEMPLATE =
      "run --mode {MODE} --doc {TARGET_DOC_ID} --date {POSTED_DATE}";

    await execEc2Command("talk", { docId: "abcDEF123", postedDate: "2026-08-20" });

    expect(SendCommandCommandMock).toHaveBeenCalledWith({
      InstanceIds: ["i-123"],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: ["run --mode talk --doc abcDEF123 --date 2026-08-20"],
      },
    });
  });
});

describe("buildEc2Command", () => {
  const TEMPLATE = "run --mode {MODE} --doc {TARGET_DOC_ID} --date {POSTED_DATE}";

  it("target 無しでは新しいプレースホルダを空文字へ畳む", () => {
    expect(buildEc2Command(TEMPLATE, "off_mountain")).toBe(
      "run --mode off_mountain --doc  --date ",
    );
  });

  it("従来の {MODE} だけのテンプレートは互換のまま動く", () => {
    expect(buildEc2Command("run --mode {MODE}", "night")).toBe("run --mode night");
  });

  it("同じプレースホルダが複数あってもすべて置換する", () => {
    expect(buildEc2Command("{MODE} {MODE}", "noon")).toBe("noon noon");
  });

  it.each([
    ["mode; rm -rf /", undefined],
    ["MODE", undefined],
    ["", undefined],
  ])("不正な mode (%s) は拒否する", (mode) => {
    expect(() => buildEc2Command(TEMPLATE, mode as string)).toThrow(/Invalid mode/);
  });

  it.each([
    "abc 123",
    "abc;rm",
    "$(id)",
    "../secret",
    "",
  ])("不正なドキュメントID (%s) は拒否する", (docId) => {
    expect(() =>
      buildEc2Command(TEMPLATE, "talk", { docId, postedDate: "2026-08-20" }),
    ).toThrow(/Invalid target document id/);
  });

  it.each(["2026/08/20", "20260820", "2026-08-20; rm -rf /", ""])(
    "不正な投稿日 (%s) は拒否する",
    (postedDate) => {
      expect(() =>
        buildEc2Command(TEMPLATE, "talk", { docId: "abcDEF123", postedDate }),
      ).toThrow(/Invalid target posted date/);
    },
  );

  it("受け取り口の無い旧テンプレートでは起動情報を落とさず失敗する", () => {
    expect(() =>
      buildEc2Command("run --mode {MODE}", "talk", {
        docId: "abcDEF123",
        postedDate: "2026-08-20",
      }),
    ).toThrow(/EC2_COMMAND_TEMPLATE must contain/);
  });
});
