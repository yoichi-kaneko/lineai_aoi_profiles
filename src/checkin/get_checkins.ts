import { resolve } from "path";
import { fileURLToPath } from "url";
import { Timestamp } from "firebase-admin/firestore";
import {
  finishFirestoreCli,
  handleFirestoreCliError,
  initFirestore,
  withFirestoreTimeout,
} from "../firebase/client";

/**
 * チェックイン用の LINE 公式アカウント（地写）へ送った記録を `checkin_logs` から読み出し、
 * 位置情報ごとにテキスト・写真をまとめて返す。
 *
 * 受信側（`functions/src/receiveCheckinMessage/`）は1メッセージを1ドキュメントとして保存するだけで、
 * 紐づけは行わない。別々の Webhook で届くため、受信時に紐づけると処理の順番で結果が変わるからである。
 * 紐づけはここで `postedAt` の順に並べて行う。
 */

export const CHECKIN_COLLECTION = "checkin_logs";

/** 位置情報の後、この時間以内に届いたテキスト・写真をその位置情報に紐づける。 */
export const LINK_WINDOW_MS = 10 * 60 * 1000;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ImageSet {
  id: string;
  index?: number;
  total?: number;
}

interface RecordBase {
  messageId: string;
  postedAtMs: number;
}

export interface LocationRecord extends RecordBase {
  type: "location";
  latitude: number;
  longitude: number;
  title?: string;
  address?: string;
}

export interface TextRecord extends RecordBase {
  type: "text";
  text: string;
  quotedMessageId?: string;
}

export interface ImageRecord extends RecordBase {
  type: "image";
  imageSet?: ImageSet;
}

export type CheckinLogRecord = LocationRecord | TextRecord | ImageRecord;

/** Firestore のドキュメントのうち、読み出しに使うフィールド。 */
export interface CheckinLogDoc {
  type?: unknown;
  description?: unknown;
  postedAt?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function readPostedAtMs(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const toMillis = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== "function") return null;
  const ms = toMillis.call(value);
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

function readImageSet(value: unknown): ImageSet | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, index, total } = value as Record<string, unknown>;
  if (!isNonEmptyString(id)) return undefined;
  return {
    id,
    ...(typeof index === "number" ? { index } : {}),
    ...(typeof total === "number" ? { total } : {}),
  };
}

/**
 * `checkin_logs` の1ドキュメントを読み出し用の形にする。読めないものには `null` を返す。
 *
 * `description` は種別ごとの中身を入れた JSON 文字列（形は functions/README.md の「`checkin_logs` の形」）。
 */
export function parseCheckinLogDoc(doc: CheckinLogDoc): CheckinLogRecord | null {
  const postedAtMs = readPostedAtMs(doc.postedAt);
  if (postedAtMs === null || typeof doc.description !== "string") return null;

  let description: unknown;
  try {
    description = JSON.parse(doc.description);
  } catch {
    return null;
  }
  if (!description || typeof description !== "object") return null;

  const fields = description as Record<string, unknown>;
  const messageId = fields.message_id;
  if (!isNonEmptyString(messageId)) return null;

  if (doc.type === "location") {
    if (!isCoordinate(fields.latitude, 90) || !isCoordinate(fields.longitude, 180)) return null;
    return {
      type: "location",
      messageId,
      postedAtMs,
      latitude: fields.latitude,
      longitude: fields.longitude,
      ...(isNonEmptyString(fields.title) ? { title: fields.title } : {}),
      ...(isNonEmptyString(fields.address) ? { address: fields.address } : {}),
    };
  }

  if (doc.type === "text") {
    if (typeof fields.text !== "string") return null;
    return {
      type: "text",
      messageId,
      postedAtMs,
      text: fields.text,
      ...(isNonEmptyString(fields.quoted_message_id)
        ? { quotedMessageId: fields.quoted_message_id }
        : {}),
    };
  }

  if (doc.type === "image") {
    const imageSet = readImageSet(fields.image_set);
    return { type: "image", messageId, postedAtMs, ...(imageSet ? { imageSet } : {}) };
  }

  return null;
}

/** 時刻の順に並べる。同じ時刻はメッセージ ID（数字列）の順にする。 */
function compareRecords(a: CheckinLogRecord, b: CheckinLogRecord): number {
  if (a.postedAtMs !== b.postedAtMs) return a.postedAtMs - b.postedAtMs;
  return a.messageId.localeCompare(b.messageId, "en", { numeric: true });
}

/**
 * テキスト・写真ごとに、紐づける位置情報のメッセージ ID を決める。
 *
 * 1. 位置情報メッセージへの引用返信のテキストは、時間によらず引用元に紐づける
 * 2. それ以外は、直前の位置情報から {@link LINK_WINDOW_MS} 以内に届いたものを、その位置情報に紐づける
 * 3. 複数枚をまとめて送った写真（同じ `image_set`）は、組の最初の1枚と同じ位置情報にそろえる
 */
export function resolveLinks(sorted: readonly CheckinLogRecord[]): Map<string, string> {
  const locationIds = new Set(
    sorted.filter((record) => record.type === "location").map((record) => record.messageId),
  );
  const links = new Map<string, string>();
  let lastLocation: LocationRecord | undefined;

  for (const record of sorted) {
    if (record.type === "location") {
      lastLocation = record;
      continue;
    }
    if (record.type === "text" && record.quotedMessageId && locationIds.has(record.quotedMessageId)) {
      links.set(record.messageId, record.quotedMessageId);
      continue;
    }
    if (lastLocation && record.postedAtMs - lastLocation.postedAtMs <= LINK_WINDOW_MS) {
      links.set(record.messageId, lastLocation.messageId);
    }
  }

  const firstImageOfSet = new Map<string, string>();
  for (const record of sorted) {
    if (record.type !== "image" || !record.imageSet) continue;
    const first = firstImageOfSet.get(record.imageSet.id);
    if (first === undefined) {
      firstImageOfSet.set(record.imageSet.id, record.messageId);
      continue;
    }
    const target = links.get(first);
    if (target === undefined) {
      links.delete(record.messageId);
    } else {
      links.set(record.messageId, target);
    }
  }

  return links;
}

/** `2026-10-11T09:12:03+09:00` の形にする（秒まで）。 */
export function toJstIsoString(ms: number): string {
  return `${new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

export interface CheckinComment {
  message_id: string;
  posted_at: string;
  text: string;
}

export interface CheckinPhoto {
  message_id: string;
  posted_at: string;
  image_set?: ImageSet;
}

export interface CheckinEntry {
  message_id: string;
  posted_at: string;
  title?: string;
  address?: string;
  latitude: number;
  longitude: number;
  comments: CheckinComment[];
  photos: CheckinPhoto[];
}

export type UnlinkedEntry =
  | ({ type: "text" } & CheckinComment)
  | ({ type: "image" } & CheckinPhoto);

export interface CheckinRange {
  /** 範囲の始まり（含む） */
  startMs: number;
  /** 範囲の終わり（含まない） */
  endMs: number;
}

function toComment(record: TextRecord): CheckinComment {
  return {
    message_id: record.messageId,
    posted_at: toJstIsoString(record.postedAtMs),
    text: record.text,
  };
}

function toPhoto(record: ImageRecord): CheckinPhoto {
  return {
    message_id: record.messageId,
    posted_at: toJstIsoString(record.postedAtMs),
    ...(record.imageSet ? { image_set: record.imageSet } : {}),
  };
}

/**
 * 位置情報ごとにテキスト・写真をまとめる。
 *
 * - `checkins`: 範囲内に届いた位置情報。紐づいたテキストを `comments`、写真を `photos` に入れる
 *   （範囲の終わりをまたいで届いたものも、紐づいていれば入れる）
 * - `unlinked`: 範囲内に届き、範囲内の位置情報に紐づかなかったテキスト・写真
 *
 * いずれも時刻の古い順に並べる。
 */
export function groupCheckins(
  records: readonly CheckinLogRecord[],
  range: CheckinRange,
): { checkins: CheckinEntry[]; unlinked: UnlinkedEntry[] } {
  const sorted = [...records].sort(compareRecords);
  const links = resolveLinks(sorted);
  const inRange = (record: CheckinLogRecord) =>
    record.postedAtMs >= range.startMs && record.postedAtMs < range.endMs;

  const checkins: CheckinEntry[] = [];
  const entryById = new Map<string, CheckinEntry>();
  for (const record of sorted) {
    if (record.type !== "location" || !inRange(record)) continue;
    const entry: CheckinEntry = {
      message_id: record.messageId,
      posted_at: toJstIsoString(record.postedAtMs),
      ...(record.title ? { title: record.title } : {}),
      ...(record.address ? { address: record.address } : {}),
      latitude: record.latitude,
      longitude: record.longitude,
      comments: [],
      photos: [],
    };
    checkins.push(entry);
    entryById.set(record.messageId, entry);
  }

  const unlinked: UnlinkedEntry[] = [];
  for (const record of sorted) {
    if (record.type === "location") continue;
    const target = links.get(record.messageId);
    const entry = target === undefined ? undefined : entryById.get(target);
    if (entry) {
      if (record.type === "text") entry.comments.push(toComment(record));
      else entry.photos.push(toPhoto(record));
      continue;
    }
    if (!inRange(record)) continue;
    unlinked.push(
      record.type === "text"
        ? { type: "text", ...toComment(record) }
        : { type: "image", ...toPhoto(record) },
    );
  }

  return { checkins, unlinked };
}

function parseStrictDate(value: string | undefined): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("日付は YYYY-MM-DD 形式で指定してください");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("日付は YYYY-MM-DD 形式で指定してください");
  }
  return date.getTime();
}

/** `startDate` の 0:00（JST）から `endDate` の翌日 0:00（JST）の手前までを返す。 */
export function resolveJstRange(startDate: string | undefined, endDate: string | undefined): CheckinRange {
  const startUtcMs = parseStrictDate(startDate);
  const endUtcMs = parseStrictDate(endDate);
  if (startUtcMs > endUtcMs) {
    throw new Error("start_date は end_date 以前の日付を指定してください");
  }
  return {
    startMs: startUtcMs - JST_OFFSET_MS,
    endMs: endUtcMs + DAY_MS - JST_OFFSET_MS,
  };
}

async function main() {
  const [startDate, endDate] = process.argv.slice(2);

  let range: CheckinRange;
  try {
    range = resolveJstRange(startDate, endDate);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("使用方法: npx tsx src/checkin/get_checkins.ts <start_date> <end_date>");
    console.error('例: npx tsx src/checkin/get_checkins.ts "2026-10-11" "2026-10-11"');
    process.exit(1);
  }

  const db = initFirestore();

  // 範囲の終わりをまたいで届いたテキスト・写真も紐づけられるよう、終わりは紐づけの時間だけ広げて取る
  const snapshot = await withFirestoreTimeout(
    db
      .collection(CHECKIN_COLLECTION)
      .where("postedAt", ">=", Timestamp.fromMillis(range.startMs))
      .where("postedAt", "<", Timestamp.fromMillis(range.endMs + LINK_WINDOW_MS))
      .get(),
    `コレクション ${CHECKIN_COLLECTION} の取得`,
    "read",
  );

  const records: CheckinLogRecord[] = [];
  let skipped = 0;
  for (const doc of snapshot.docs) {
    const record = parseCheckinLogDoc(doc.data());
    if (record) records.push(record);
    else skipped++;
  }
  if (skipped > 0) {
    console.error(`形式を読めない記録を ${skipped} 件読み飛ばしました`);
  }

  const { checkins, unlinked } = groupCheckins(records, range);
  console.log(
    JSON.stringify(
      {
        date_range: `${startDate} to ${endDate}`,
        count: checkins.length,
        checkins,
        unlinked,
      },
      null,
      2,
    ),
  );

  await finishFirestoreCli(db);
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleFirestoreCliError);
}
