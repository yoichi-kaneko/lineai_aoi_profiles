import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { OAuth2Client } from "google-auth-library";
import { NOTE_TYPE } from "../../../src/firebase/noteTypes";
import { execEc2Command } from "../lib/execEc2Command";

const oauth2Client = new OAuth2Client();
const firestore = new Firestore();

/** notes の `date` 用。ローカル日の 0:00 のみ（receiveLineMessage と同様、時刻は保持しない） */
function startOfLocalDay(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
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
  const url = typeof body?.url === "string" ? body.url : undefined;
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
