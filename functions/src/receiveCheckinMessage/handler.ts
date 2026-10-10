import { Timestamp } from "@google-cloud/firestore";
import { validateSignature, webhook } from "@line/bot-sdk";
import { startOfJstDay } from "../lib/jstDate";
import { storeLineImageFromEnv, summarizeError } from "../lib/lineImageStore";
import {
  authenticateLineWebhook,
  judgeEventSource,
  type LineWebhookRequest,
} from "../lib/lineWebhook";

/**
 * チェックイン用の LINE 公式アカウント（地写）の Webhook を受け、届いたメッセージを `checkin_logs` へ保存する。
 *
 * 地写は記録の窓口で、碧衣への言葉としては扱わない。トリガー語の判定・EC2 の起動・フィードバックの振り分けは
 * 行わず、地写からメッセージを送ることもない。
 *
 * 位置情報と写真・テキストの紐づけは受信時には行わない。別々の Webhook で届くため、受信時に紐づけると
 * 処理の順番で結果が変わる。読み出す側が `postedAt` の順に並べてまとめる。
 */

export const CHECKIN_COLLECTION = "checkin_logs";

/** `checkin_logs` の中だけの種別。`notes` の `NOTE_TYPE` とは別系統。 */
export const CHECKIN_TYPE = {
  LOCATION: "location",
  TEXT: "text",
  IMAGE: "image",
} as const;

export type CheckinType = (typeof CHECKIN_TYPE)[keyof typeof CHECKIN_TYPE];

export interface CheckinRecord {
  type: CheckinType;
  /** 種別ごとの中身。保存時に JSON 文字列にして `description` へ入れる。 */
  description: Record<string, unknown>;
  /** 画像のときだけ。Cloudinary への保存に使う。 */
  imageMessageId?: string;
}

export interface FirestoreLike {
  collection(name: string): {
    add(data: Record<string, unknown>): Promise<unknown>;
  };
}

export interface CheckinHandlerDeps {
  firestore: FirestoreLike;
  validateSignatureFn?: typeof validateSignature;
  /** 受け取った画像を Cloudinary へ保存する。既定は環境変数の設定で保存する。 */
  storeLineImageFn?: (messageId: string) => Promise<void>;
  now?: () => Date;
}

export interface CheckinHandlerRequest extends LineWebhookRequest {
  body: webhook.CallbackRequest;
}

export interface CheckinHandlerResponse {
  status(code: number): { send(body: string): void };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function buildImageSet(imageSet: webhook.ImageSet | undefined): Record<string, unknown> | undefined {
  if (!imageSet || !isNonEmptyString(imageSet.id)) {
    return undefined;
  }
  return {
    id: imageSet.id,
    ...(typeof imageSet.index === "number" ? { index: imageSet.index } : {}),
    ...(typeof imageSet.total === "number" ? { total: imageSet.total } : {}),
  };
}

/**
 * メッセージから保存する記録を組み立てる。保存しないメッセージには `null` を返す。
 *
 * 保存するのは位置情報・テキスト・画像（LINE 上のもの）の3種のみ。スタンプ・動画などや、
 * 必須の値（メッセージ ID・座標・本文）が欠けたものは保存しない。
 * 任意項目（場所名・住所・引用元・複数枚の組）は、付いているときだけ入れる。
 */
export function buildCheckinRecord(message: webhook.MessageContent): CheckinRecord | null {
  if (!isNonEmptyString(message.id)) {
    return null;
  }

  if (message.type === "location") {
    const location = message as webhook.LocationMessageContent;
    if (!isCoordinate(location.latitude, 90) || !isCoordinate(location.longitude, 180)) {
      return null;
    }
    return {
      type: CHECKIN_TYPE.LOCATION,
      description: {
        message_id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        ...(isNonEmptyString(location.title) ? { title: location.title } : {}),
        ...(isNonEmptyString(location.address) ? { address: location.address } : {}),
      },
    };
  }

  if (message.type === "text") {
    const text = message as webhook.TextMessageContent;
    if (typeof text.text !== "string") {
      return null;
    }
    return {
      type: CHECKIN_TYPE.TEXT,
      description: {
        message_id: text.id,
        text: text.text,
        ...(isNonEmptyString(text.quotedMessageId) ? { quoted_message_id: text.quotedMessageId } : {}),
      },
    };
  }

  if (message.type === "image") {
    const image = message as webhook.ImageMessageContent;
    // 外部の URL を指す画像は LINE から取得できないため、記録の対象にしない
    if (image.contentProvider?.type !== "line") {
      return null;
    }
    const imageSet = buildImageSet(image.imageSet);
    return {
      type: CHECKIN_TYPE.IMAGE,
      description: {
        message_id: image.id,
        ...(imageSet ? { image_set: imageSet } : {}),
      },
      imageMessageId: image.id,
    };
  }

  return null;
}

type CheckinCounts = Record<CheckinType | "ignored", number>;

/** 種別と件数だけをログへ出す。本文・座標・住所は出さない。 */
function logCheckinCounts(counts: CheckinCounts): void {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return;
  }
  console.log(
    `Checkin messages: location=${counts.location}, text=${counts.text}, image=${counts.image}, ignored=${counts.ignored}`,
  );
}

export function createReceiveCheckinMessageHandler(deps: CheckinHandlerDeps) {
  const validateSignatureFn = deps.validateSignatureFn ?? validateSignature;
  const storeLineImageFn =
    deps.storeLineImageFn ??
    ((messageId: string) =>
      storeLineImageFromEnv("checkin", messageId, "CHECKIN_LINE_ACCESS_TOKEN"));
  const now = deps.now ?? (() => new Date());

  return async (req: CheckinHandlerRequest, res: CheckinHandlerResponse): Promise<void> => {
    const auth = authenticateLineWebhook(req, {
      channelSecretEnvName: "CHECKIN_LINE_CHANNEL_SECRET",
      validateSignatureFn,
    });
    if (!auth.ok) {
      res.status(auth.status).send(auth.body);
      return;
    }

    const counts: CheckinCounts = { location: 0, text: 0, image: 0, ignored: 0 };

    for (const event of req.body.events ?? []) {
      const verdict = judgeEventSource(event, auth.lineUserId);
      if (verdict === "forbidden") {
        logCheckinCounts(counts);
        res.status(403).send("Forbidden");
        return;
      }

      // グループ・複数人トーク、メッセージ以外のイベント（友だち追加の follow など）は、例外にせず読み飛ばす。
      // 地写では友だち追加の時点で follow イベントが届くため。
      if (verdict === "ignore" || event.type !== "message" || !event.message) {
        counts.ignored++;
        continue;
      }
      if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) {
        counts.ignored++;
        continue;
      }

      const record = buildCheckinRecord(event.message);
      if (!record) {
        counts.ignored++;
        continue;
      }

      await deps.firestore.collection(CHECKIN_COLLECTION).add({
        date: Timestamp.fromDate(startOfJstDay(new Date(event.timestamp))),
        postedAt: Timestamp.fromMillis(event.timestamp),
        type: record.type,
        description: JSON.stringify(record.description),
        createdAt: Timestamp.fromDate(now()),
      });
      counts[record.type]++;

      if (record.imageMessageId) {
        // 記録を先に残してから保存する。保存に失敗しても記録は残るため、応答は止めない。
        try {
          await storeLineImageFn(record.imageMessageId);
        } catch (error) {
          console.error("storeLineImage failed:", summarizeError(error));
        }
      }
    }

    logCheckinCounts(counts);
    res.status(200).send("OK");
  };
}
