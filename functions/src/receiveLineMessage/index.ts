import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { validateSignature, webhook } from "@line/bot-sdk";
import { execEc2Command } from "./execEc2Command";

// EC2コマンドのトリガーキーワード（前方一致）
const EC2_TRIGGER_KEYWORDS = ["下山", "無事下山"];

const firestore = new Firestore();

functions.http("receiveLineMessage", async (req, res) => {
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const lineUserId = process.env.LINE_USER_ID ?? "";
  const signature = req.headers["x-line-signature"] as string | undefined;
  const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;

  if (
    !signature ||
    !validateSignature(rawBody, channelSecret, signature)
  ) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!lineUserId) {
    res.status(500).send("LINE_USER_ID is not configured");
    return;
  }

  const body = req.body as webhook.CallbackRequest;
  const events = body.events ?? [];

  for (const event of events) {
    if (event.type === "message") {
      const sourceUserId = event.source?.userId;
      if (sourceUserId !== lineUserId) {
        res.status(403).send("Forbidden");
        return;
      }
    }

    if (event.type === "message" && event.message.type === "text") {
      const message = event.message as webhook.TextMessageContent;
      const receivedAt = new Date(event.timestamp);
      const year = receivedAt.getFullYear();
      const month = receivedAt.getMonth();
      const day = receivedAt.getDate();
      const dateValue = new Date(year, month, day);

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: message.text,
        type: "line_text",
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });

      if (EC2_TRIGGER_KEYWORDS.some((kw) => message.text.startsWith(kw))) {
        await execEc2Command();
      }
    } else if (
      event.type === "message" &&
      event.message.type === "image" &&
      (event.message as webhook.ImageMessageContent).contentProvider.type ===
        "line"
    ) {
      const message = event.message as webhook.ImageMessageContent;
      const receivedAt = new Date(event.timestamp);
      const year = receivedAt.getFullYear();
      const month = receivedAt.getMonth();
      const day = receivedAt.getDate();
      const dateValue = new Date(year, month, day);

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: JSON.stringify({ id: message.id }),
        type: "line_image",
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });
    } else {
      const messageType =
        event.type === "message" ? event.message.type : "N/A";
      throw new Error(
        `Unsupported event: type=${event.type}, message.type=${messageType}`
      );
    }
  }

  res.status(200).send("OK");
});
