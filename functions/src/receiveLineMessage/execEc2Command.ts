import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

export async function execEc2Command(): Promise<void> {
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY ?? "",
    secretAccessKey: process.env.AWS_SECRET_KEY ?? "",
  };

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION,
    credentials,
  });

  await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [process.env.EC2_INSTANCE_ID ?? ""],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [process.env.EC2_COMMAND ?? ""],
      },
    })
  );
}
