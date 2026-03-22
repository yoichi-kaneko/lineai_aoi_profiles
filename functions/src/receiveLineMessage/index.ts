import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";

const firestore = new Firestore();

functions.http("receiveLineMessage", async (req, res) => {
  const body = req.body as { events?: LineEvent[] };
  const events = body.events ?? [];

  for (const event of events) {
    if (event.type === "message" && event.message?.type === "text") {
      const receivedAt = new Date(event.timestamp);
      const year = receivedAt.getFullYear();
      const month = receivedAt.getMonth();
      const day = receivedAt.getDate();
      const dateValue = new Date(year, month, day);

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        descript: event.message.text,
        type: "line_text",
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });
    } else {
      throw new Error(
        `Unsupported event: type=${event.type}, message.type=${event.message?.type ?? "N/A"}`
      );
    }
  }

  res.status(200).send("OK");
});

interface LineEvent {
  type: string;
  timestamp: number;
  message?: {
    type: string;
    text?: string;
  };
}
