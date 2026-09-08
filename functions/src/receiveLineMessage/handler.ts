import { Timestamp } from "@google-cloud/firestore";
import { validateSignature, webhook } from "@line/bot-sdk";
import { NOTE_TYPE } from "../firebase/noteTypes";
import { execEc2Command } from "../lib/execEc2Command";
import { jstDateFromYmd, jstYmd, startOfJstDay } from "./jstDate";
import { parseImageFeedback } from "./parseImageFeedback";
import { parseSongFeedback } from "./parseSongFeedback";
import { findTriggerMode, requiresTargetDoc } from "./routing";

export type FeedbackPayload = {
  kind: string;
  score: number | null;
  comment: string;
  target_date: string | null;
  /** 画像フィードバックのみ。楽曲フィードバックでは付与しない（保存形式を変えないため）。 */
  target_image_id?: string | null;
};

export interface FirestoreLike {
  collection(name: string): {
    /** 実体は Firestore の `DocumentReference`（`id` を持つ）。テスト用の差し替えを許すため構造で受ける。 */
    add(data: Record<string, unknown>): Promise<{ id?: unknown }>;
  };
}

/** `add()` の戻り値からドキュメントIDを取り出す。取り出せない場合は null。 */
function extractDocId(added: { id?: unknown } | null | undefined): string | null {
  const id = added?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export interface HandlerDeps {
  firestore: FirestoreLike;
  validateSignatureFn?: typeof validateSignature;
  execEc2CommandFn?: typeof execEc2Command;
  now?: () => Date;
}

export interface HandlerRequest {
  headers: Record<string, string | string[] | undefined>;
  body: webhook.CallbackRequest;
  rawBody?: Buffer;
}

export interface HandlerResponse {
  status(code: number): { send(body: string): void };
}

export const IMAGE_FEEDBACK_TYPE = "image_feedback";
export const SONG_FEEDBACK_TYPE = "song_feedback";

export async function addFeedbackDoc(
  firestore: FirestoreLike,
  collection: string,
  type: string,
  feedback: FeedbackPayload,
  postedDate: Date,
  now: Date,
): Promise<void> {
  const feedbackDate = feedback.target_date
    ? jstDateFromYmd(feedback.target_date)
    : postedDate;
  const payload: Record<string, unknown> = {
    kind: feedback.kind,
    score: feedback.score,
    comment: feedback.comment,
    target_date: feedback.target_date,
  };
  if (feedback.target_image_id !== undefined) {
    payload.target_image_id = feedback.target_image_id;
  }
  await firestore.collection(collection).add({
    date: Timestamp.fromDate(feedbackDate),
    description: JSON.stringify(payload),
    type,
    createdAt: Timestamp.fromDate(now),
  });
}

export function createReceiveLineMessageHandler(deps: HandlerDeps) {
  const validateSignatureFn = deps.validateSignatureFn ?? validateSignature;
  const execEc2CommandFn = deps.execEc2CommandFn ?? execEc2Command;
  const now = deps.now ?? (() => new Date());

  return async (req: HandlerRequest, res: HandlerResponse): Promise<void> => {
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
    const lineUserId = process.env.LINE_USER_ID ?? "";
    const signatureHeader = req.headers["x-line-signature"];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!channelSecret) {
      res.status(500).send("LINE_CHANNEL_SECRET is not configured");
      return;
    }

    if (!signature || !req.rawBody || !validateSignatureFn(req.rawBody, channelSecret, signature)) {
      res.status(401).send("Unauthorized");
      return;
    }

    if (!lineUserId) {
      res.status(500).send("LINE_USER_ID is not configured");
      return;
    }

    const events = req.body.events ?? [];

    for (const event of events) {
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

      if (event.type !== "message") {
        throw new Error(`Unsupported event: type=${event.type}, message.type=N/A`);
      }

      const message = event.message;
      if (!message) {
        continue;
      }

      if (message.type === "text") {
        const textMessage = message as webhook.TextMessageContent;
        const dateValue = startOfJstDay(new Date(event.timestamp));

        const imageFeedback = parseImageFeedback(textMessage.text);
        if (imageFeedback) {
          await addFeedbackDoc(
            deps.firestore,
            "image_feedback",
            IMAGE_FEEDBACK_TYPE,
            imageFeedback,
            dateValue,
            now(),
          );
          continue;
        }

        const songFeedback = parseSongFeedback(textMessage.text);
        if (songFeedback) {
          await addFeedbackDoc(
            deps.firestore,
            "song_feedback",
            SONG_FEEDBACK_TYPE,
            songFeedback,
            dateValue,
            now(),
          );
          continue;
        }

        const added = await deps.firestore.collection("notes").add({
          date: Timestamp.fromDate(dateValue),
          description: textMessage.text,
          type: NOTE_TYPE.LINE_TEXT,
          createdAt: Timestamp.fromDate(now()),
        });

        const triggerMode = findTriggerMode(textMessage.text);
        if (triggerMode) {
          // 応答対象を渡す必要があるモードでは、保存できた文書のIDと投稿日を添えて起動する。
          // IDが取れない場合は、別のメッセージを主題にさせないため起動しない。
          let target: { docId: string; postedDate: string } | undefined;
          if (requiresTargetDoc(triggerMode)) {
            const docId = extractDocId(added);
            if (!docId) {
              console.error(
                `Skipped EC2 trigger for mode ${triggerMode}: saved document id is unavailable`,
              );
              continue;
            }
            target = { docId, postedDate: jstYmd(new Date(event.timestamp)) };
          }

          try {
            await execEc2CommandFn(triggerMode, target);
          } catch (error) {
            console.error("execEc2Command failed:", error);
          }
        }
        continue;
      }

      if (
        message.type === "image" &&
        (message as webhook.ImageMessageContent).contentProvider.type === "line"
      ) {
        const imageMessage = message as webhook.ImageMessageContent;
        const dateValue = startOfJstDay(new Date(event.timestamp));

        await deps.firestore.collection("notes").add({
          date: Timestamp.fromDate(dateValue),
          description: JSON.stringify({ id: imageMessage.id }),
          type: NOTE_TYPE.LINE_IMAGE,
          createdAt: Timestamp.fromDate(now()),
        });
        continue;
      }

      throw new Error(`Unsupported event: type=${event.type}, message.type=${message.type}`);
    }

    res.status(200).send("OK");
  };
}
