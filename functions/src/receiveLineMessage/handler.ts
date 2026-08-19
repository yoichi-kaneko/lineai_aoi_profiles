import { Timestamp } from "@google-cloud/firestore";
import { validateSignature, webhook } from "@line/bot-sdk";
import { NOTE_TYPE } from "../firebase/noteTypes";
import { execEc2Command } from "../lib/execEc2Command";
import { jstDateFromYmd, startOfJstDay } from "./jstDate";
import { parseImageFeedback } from "./parseImageFeedback";
import { parseSongFeedback } from "./parseSongFeedback";
import { findTriggerMode } from "./routing";

export type FeedbackPayload = {
  kind: string;
  score: number | null;
  comment: string;
  target_date: string | null;
};

export interface FirestoreLike {
  collection(name: string): {
    add(data: Record<string, unknown>): Promise<unknown>;
  };
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
  await firestore.collection(collection).add({
    date: Timestamp.fromDate(feedbackDate),
    description: JSON.stringify({
      kind: feedback.kind,
      score: feedback.score,
      comment: feedback.comment,
      target_date: feedback.target_date,
    }),
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

      if (event.type === "message" && event.message.type === "text") {
        const message = event.message as webhook.TextMessageContent;
        const dateValue = startOfJstDay(new Date(event.timestamp));

        const imageFeedback = parseImageFeedback(message.text);
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

        const songFeedback = parseSongFeedback(message.text);
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

        await deps.firestore.collection("notes").add({
          date: Timestamp.fromDate(dateValue),
          description: message.text,
          type: NOTE_TYPE.LINE_TEXT,
          createdAt: Timestamp.fromDate(now()),
        });

        const triggerMode = findTriggerMode(message.text);
        if (triggerMode) {
          try {
            await execEc2CommandFn(triggerMode);
          } catch (error) {
            console.error("execEc2Command failed:", error);
          }
        }
        continue;
      }

      if (
        event.type === "message" &&
        event.message.type === "image" &&
        (event.message as webhook.ImageMessageContent).contentProvider.type === "line"
      ) {
        const message = event.message as webhook.ImageMessageContent;
        const dateValue = startOfJstDay(new Date(event.timestamp));

        await deps.firestore.collection("notes").add({
          date: Timestamp.fromDate(dateValue),
          description: JSON.stringify({ id: message.id }),
          type: NOTE_TYPE.LINE_IMAGE,
          createdAt: Timestamp.fromDate(now()),
        });
        continue;
      }

      const messageType = event.type === "message" ? event.message.type : "N/A";
      throw new Error(`Unsupported event: type=${event.type}, message.type=${messageType}`);
    }

    res.status(200).send("OK");
  };
}
