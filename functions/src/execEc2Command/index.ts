import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";
import * as functions from "@google-cloud/functions-framework";

functions.http("execEc2Command", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

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

  const command = process.env.EC2_COMMAND ?? "";

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
