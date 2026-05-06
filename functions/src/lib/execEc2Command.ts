import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

export async function execEc2Command(mode: string): Promise<void> {
  const requiredEnv = [
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "AWS_REGION",
    "EC2_INSTANCE_ID",
    "EC2_COMMAND_TEMPLATE",
  ] as const;
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  const command = process.env.EC2_COMMAND_TEMPLATE!.replace("{MODE}", mode);

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY!,
      secretAccessKey: process.env.AWS_SECRET_KEY!,
    },
  });

  await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [process.env.EC2_INSTANCE_ID!],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [command],
      },
    })
  );
}
