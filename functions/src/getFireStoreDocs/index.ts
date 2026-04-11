import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";

const firestore = new Firestore();
const TARGET_COLLECTION = "records";

function resolveDateParam(req: { query?: unknown; body?: unknown }): string | undefined {
  const queryDate =
    typeof req.query === "object" &&
    req.query !== null &&
    "date" in req.query &&
    typeof (req.query as { date?: unknown }).date === "string"
      ? (req.query as { date: string }).date
      : undefined;

  if (queryDate) {
    return queryDate;
  }

  const bodyDate =
    typeof req.body === "object" &&
    req.body !== null &&
    "date" in req.body &&
    typeof (req.body as { date?: unknown }).date === "string"
      ? (req.body as { date: string }).date
      : undefined;

  return bodyDate;
}

functions.http("getFireStoreDocs", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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

    const date = resolveDateParam(req);

    if (!date) {
      res.status(400).json({
        error: 'date パラメータを指定してください（YYYY-MM-DD）。例: ?date=2026-03-21',
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "日付は YYYY-MM-DD 形式で指定してください" });
      return;
    }

    const [year, month, day] = date.split("-").map(Number);
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);

    const snapshot = await firestore
      .collection(TARGET_COLLECTION)
      .where("date", ">=", Timestamp.fromDate(startDate))
      .where("date", "<=", Timestamp.fromDate(endDate))
      .get();

    if (snapshot.empty) {
      res.status(200).json({
        date,
        collection: TARGET_COLLECTION,
        count: 0,
        results: [],
      });
      return;
    }

    const results: object[] = [];
    const batch = firestore.batch();

    for (const doc of snapshot.docs) {
      results.push({ id: doc.id, ...doc.data() });
      batch.update(doc.ref, { isRead: true });
    }

    await batch.commit();

    res.status(200).json({
      date,
      collection: TARGET_COLLECTION,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error(
      "getFireStoreDocs error:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
});
