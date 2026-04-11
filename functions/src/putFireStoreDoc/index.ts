import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";

const firestore = new Firestore();
const TARGET_COLLECTION = "records";

function resolveParam<T>(
  req: { query?: unknown; body?: unknown },
  key: string
): T | undefined {
  const fromQuery =
    typeof req.query === "object" &&
    req.query !== null &&
    key in req.query &&
    typeof (req.query as Record<string, unknown>)[key] !== "undefined"
      ? (req.query as Record<string, unknown>)[key]
      : undefined;

  if (fromQuery !== undefined) return fromQuery as T;

  const fromBody =
    typeof req.body === "object" &&
    req.body !== null &&
    key in req.body &&
    typeof (req.body as Record<string, unknown>)[key] !== "undefined"
      ? (req.body as Record<string, unknown>)[key]
      : undefined;

  return fromBody as T | undefined;
}

functions.http("putFireStoreDoc", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const authHeader = req.headers["authorization"];
    const expectedToken = process.env.BEARER_TOKEN ?? "";
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const date = resolveParam<string>(req, "date");
    const description = resolveParam<string>(req, "description");

    if (!date || typeof date !== "string") {
      res.status(400).json({
        error: 'date パラメータを指定してください（YYYY-MM-DD）。例: ?date=2026-03-21',
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "日付は YYYY-MM-DD 形式で指定してください" });
      return;
    }

    if (!description || typeof description !== "string") {
      res.status(400).json({ error: "description パラメータを指定してください" });
      return;
    }

    const [year, month, day] = date.split("-").map(Number);
    const dateTimestamp = Timestamp.fromDate(new Date(year, month - 1, day, 0, 0, 0, 0));
    const now = Timestamp.fromDate(new Date());

    const docData = {
      date: dateTimestamp,
      description: description.replace(/\\n/g, "\n"),
      type: "from_aoi",
      isRead: false,
      createdAt: now,
    };

    const docRef = await firestore.collection(TARGET_COLLECTION).add(docData);

    res.status(200).json({
      id: docRef.id,
      collection: TARGET_COLLECTION,
      ...docData,
    });
  } catch (error) {
    console.error(
      "putFireStoreDoc error:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
});
