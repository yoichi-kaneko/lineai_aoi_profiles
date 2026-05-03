import * as functions from "@google-cloud/functions-framework";
import { OAuth2Client } from "google-auth-library";

const oauth2Client = new OAuth2Client();

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

  console.log(url);
  res.status(200).send("OK");
});
