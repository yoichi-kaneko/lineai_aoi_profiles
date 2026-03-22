import { Firestore, Timestamp } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { webhook } from "@line/bot-sdk";

const firestore = new Firestore();

functions.http("receiveLineMessage", async (req, res) => {
  const body = req.body as webhook.CallbackRequest;
  const events = body.events ?? [];

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const message = event.message as webhook.TextMessageContent;
      const receivedAt = new Date(event.timestamp);
      const year = receivedAt.getFullYear();
      const month = receivedAt.getMonth();
      const day = receivedAt.getDate();
      const dateValue = new Date(year, month, day);

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: message.text,
        type: "line_text",
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });
    } else if (
      event.type === "message" &&
      event.message.type === "image" &&
      (event.message as webhook.ImageMessageContent).contentProvider.type ===
        "line"
    ) {
      const message = event.message as webhook.ImageMessageContent;
      const receivedAt = new Date(event.timestamp);
      const year = receivedAt.getFullYear();
      const month = receivedAt.getMonth();
      const day = receivedAt.getDate();
      const dateValue = new Date(year, month, day);

      await firestore.collection("notes").add({
        date: Timestamp.fromDate(dateValue),
        description: JSON.stringify({ id: message.id }),
        type: "line_image",
        isRead: false,
        createdAt: Timestamp.fromDate(new Date()),
      });
    } else {
      const messageType =
        event.type === "message" ? event.message.type : "N/A";
      throw new Error(
        `Unsupported event: type=${event.type}, message.type=${messageType}`
      );
    }
  }

  res.status(200).send("OK");
});
