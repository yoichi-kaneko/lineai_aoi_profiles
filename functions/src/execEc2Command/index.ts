import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";
import * as functions from "@google-cloud/functions-framework";

functions.http("execEc2Command", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const expectedToken = process.env.BEARER_TOKEN ?? "";
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY ?? "",
    secretAccessKey: process.env.AWS_SECRET_KEY ?? "",
  };

  const mode = (req.query.mode as string | undefined) ?? (req.body?.mode as string | undefined);
  const rawCommand = process.env.EC2_COMMAND ?? `/home/ec2-user/line_message/lineai_aoi_profiles/send_daily_line.sh ${mode ?? "morning"} >> /home/ec2-user/line_message/log/line_log.log 2>&1`;
  // SSM SendCommand は root で実行されるため、ec2-user に切り替えてから実行する
  const runAsUser = process.env.EC2_RUN_AS_USER ?? "ec2-user";
  const command = `su - ${runAsUser} -c '${rawCommand}'`;

  const ssmClient = new SSMClient({ region: process.env.AWS_REGION, credentials });
  await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [process.env.EC2_INSTANCE_ID ?? ""],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [command],
      },
    })
  );

  res.status(200).json({ status: "success" });
});
