import { Firestore } from "@google-cloud/firestore";
import * as functions from "@google-cloud/functions-framework";
import { createReceiveLineMessageHandler } from "./handler";

const firestore = new Firestore();

functions.http(
  "receiveLineMessage",
  createReceiveLineMessageHandler({ firestore }),
);
