import { Firestore } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { createReceiveCheckinMessageHandler } from "./handler";

const firestore = new Firestore();

functions.http(
  "receiveCheckinMessage",
  createReceiveCheckinMessageHandler({ firestore }),
);
