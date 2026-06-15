import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { validateSignature, webhook } from "@line/bot-sdk";
import { NOTE_TYPE } from "../firebase/noteTypes";
import { execEc2Command } from "../lib/execEc2Command";
import { parseImageFeedback } from "./parseImageFeedback";

type TriggerMode = "off_mountain" | "up_mountain";

/** image_feedback コレクション内識別用の type（`notes` の NOTE_TYPE とは別系統）。 */
const IMAGE_FEEDBACK_TYPE = "image_feedback";

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

/** "YYYY-MM-DD"（JST の暦日）を startOfJstDay と同じ UTC midnight 表現へ変換する */
function jstDateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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

      // 画像生成フィードバック（`評価` / `傾向`）は image_feedback コレクションへ隔離保存し、
      // line_text としては保存しない。EC2 トリガーも発火させない（その夜の小夜モードが
      // フィードバック文を「ユーザーの言葉」として画像・本文へ誤取込するのを防ぐため）。
      const feedback = parseImageFeedback(message.text);
      if (feedback !== null) {
        const feedbackDate = feedback.target_date
          ? jstDateFromYmd(feedback.target_date)
          : dateValue;
        await firestore.collection("image_feedback").add({
          date: Timestamp.fromDate(feedbackDate),
          description: JSON.stringify({
            kind: feedback.kind,
            score: feedback.score,
            comment: feedback.comment,
            target_date: feedback.target_date,
          }),
          type: IMAGE_FEEDBACK_TYPE,
          createdAt: Timestamp.fromDate(new Date()),
        });
        continue;
      }

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: message.text,
        type: NOTE_TYPE.LINE_TEXT,
        createdAt: Timestamp.fromDate(new Date()),
      });

      const triggerMode = findTriggerMode(message.text);
      if (triggerMode !== null) {
        try {
          await execEc2Command(triggerMode);
        } catch (err) {
          console.error("execEc2Command failed:", err);
        }
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
