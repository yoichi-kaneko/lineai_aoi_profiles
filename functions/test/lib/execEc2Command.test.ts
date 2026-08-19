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

import { execEc2Command } from "../../src/lib/execEc2Command";

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
});
