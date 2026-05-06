import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { validateSignature, webhook } from "@line/bot-sdk";
import { NOTE_TYPE } from "../firebase/noteTypes";
import { execEc2Command } from "../lib/execEc2Command";

type TriggerMode = "off_mountain" | "up_mountain";

const TRIGGER_MODE_MAP: { keywords: string[]; mode: TriggerMode }[] = [
  { keywords: ["下山", "無事下山"], mode: "off_mountain" },
  { keywords: ["登山開始"], mode: "up_mountain" },
];

function findTriggerMode(text: string): TriggerMode | null {
  for (const { keywords, mode } of TRIGGER_MODE_MAP) {
    if (keywords.some((kw) => text.startsWith(kw))) return mode;
  }
  return null;
}

/** notes の `date` 用。JST 基準で日付を揃え、UTC midnight として返す */
function startOfJstDay(base: Date): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jst = new Date(base.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

const firestore = new Firestore();

functions.http("receiveLineMessage", async (req, res) => {
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const lineUserId = process.env.LINE_USER_ID ?? "";
  const signature = req.headers["x-line-signature"] as string | undefined;
  const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;

  if (!signature || !validateSignature(rawBody, channelSecret, signature)) {
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
    // グループメッセージ・ルームメッセージは無視
    if (event.source?.type === "group" || event.source?.type === "room") {
      continue;
    }

    if (event.type === "message") {
      const sourceUserId = event.source?.userId;
      if (sourceUserId !== lineUserId) {
        res.status(403).send("Forbidden");
        return;
      }
    }

    if (event.type === "message" && event.message.type === "text") {
      const message = event.message as webhook.TextMessageContent;
      const dateValue = startOfJstDay(new Date(event.timestamp));

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: message.text,
        type: NOTE_TYPE.LINE_TEXT,
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });

      const triggerMode = findTriggerMode(message.text);
      if (triggerMode !== null) {
        await execEc2Command(triggerMode);
      }
    } else if (
      event.type === "message" &&
      event.message.type === "image" &&
      (event.message as webhook.ImageMessageContent).contentProvider.type ===
        "line"
    ) {
      const message = event.message as webhook.ImageMessageContent;
      const dateValue = startOfJstDay(new Date(event.timestamp));

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: JSON.stringify({ id: message.id }),
        type: NOTE_TYPE.LINE_IMAGE,
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });
    } else {
      const messageType = event.type === "message" ? event.message.type : "N/A";
      throw new Error(
        `Unsupported event: type=${event.type}, message.type=${messageType}`,
      );
    }
  }

  res.status(200).send("OK");
});
