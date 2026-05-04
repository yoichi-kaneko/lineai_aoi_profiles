import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { OAuth2Client } from "google-auth-library";
import { execEc2Command } from "../lib/execEc2Command";
import { NOTE_TYPE } from "../firebase/noteTypes";

const oauth2Client = new OAuth2Client();
const firestore = new Firestore();

/** notes の `date` 用。ローカル日の 0:00 のみ（receiveLineMessage と同様、時刻は保持しない） */
function startOfLocalDay(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

/**
 * 許可されたオリジンかつ pathname が allowed のパス（またはその配下）か。
 * `gas/relay.gs` の URL_PREFIX と同じ値を環境変数に設定すること。
 */
function isUnderAllowedPrefix(candidate: URL, allowed: URL): boolean {
  if (candidate.origin !== allowed.origin) {
    return false;
  }
  const basePath = allowed.pathname;
  const p = candidate.pathname;
  if (p === basePath) {
    return true;
  }
  const boundary = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return p.startsWith(boundary);
}

/**
 * `URL` でパースし、http(s)・ユーザー情報なし・許可プレフィックス内なら正規化済み href を返す。
 */
function parseValidLocationUrl(raw: string, allowed: URL): string | null {
  let candidate: URL;
  try {
    candidate = new URL(raw.trim());
  } catch {
    return null;
  }
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
    return null;
  }
  if (candidate.username || candidate.password) {
    return null;
  }
  if (!isUnderAllowedPrefix(candidate, allowed)) {
    return null;
  }
  return candidate.href;
}

functions.http("receiveGasRequest", async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).send("Unauthorized");
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).send("Unauthorized");
    return;
  }

  const audience = process.env.GAS_OIDC_AUDIENCE;
  if (!audience) {
    console.error("GAS_OIDC_AUDIENCE is not set");
    res.status(500).send("Server misconfiguration");
    return;
  }

  try {
    await oauth2Client.verifyIdToken({
      idToken: token,
      audience,
    });
  } catch {
    res.status(401).send("Unauthorized");
    return;
  }

  const body = req.body as { url?: unknown };
  const urlRaw = typeof body?.url === "string" ? body.url : undefined;
  if (!urlRaw || !urlRaw.trim()) {
    res.status(400).send("Bad Request");
    return;
  }

  const prefixRaw = process.env.LOCATION_URL_ALLOWED_PREFIX?.trim();
  if (!prefixRaw) {
    console.error("LOCATION_URL_ALLOWED_PREFIX is not set");
    res.status(500).send("Server misconfiguration");
    return;
  }

  let allowedUrl: URL;
  try {
    allowedUrl = new URL(prefixRaw);
  } catch {
    console.error("LOCATION_URL_ALLOWED_PREFIX is not a valid URL");
    res.status(500).send("Server misconfiguration");
    return;
  }
  if (allowedUrl.protocol !== "http:" && allowedUrl.protocol !== "https:") {
    console.error("LOCATION_URL_ALLOWED_PREFIX must use http or https");
    res.status(500).send("Server misconfiguration");
    return;
  }

  const url = parseValidLocationUrl(urlRaw, allowedUrl);
  if (!url) {
    res.status(400).send("Bad Request");
    return;
  }

  try {
    const now = new Date();
    const dateValue = startOfLocalDay(now);
    const fiveDaysAgoStart = new Date(dateValue);
    fiveDaysAgoStart.setDate(fiveDaysAgoStart.getDate() - 5);

    const recentNotes = await firestore
      .collection("notes")
      .where("date", ">=", Timestamp.fromDate(fiveDaysAgoStart))
      .get();

    const isDuplicate = recentNotes.docs.some((doc) => {
      const data = doc.data();
      return (
        data.type === NOTE_TYPE.LOCATION_URL &&
        typeof data.description === "string" &&
        data.description === url
      );
    });

    if (isDuplicate) {
      console.log("receiveGasRequest: skip duplicate url (recent notes)", {
        url,
      });
      res.status(200).send("OK");
      return;
    }

    await firestore.collection("notes").add({
      date: Timestamp.fromDate(dateValue),
      description: url,
      type: NOTE_TYPE.LOCATION_URL,
      isRead: false,
      createdAt: Timestamp.fromDate(new Date()),
    });
    await execEc2Command();
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});
