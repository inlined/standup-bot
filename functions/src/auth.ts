import fetch from "node-fetch";
import { Request } from "firebase-functions/v2/https";
import { Response } from "express";
import { logger } from "firebase-functions/v1";

// TODO: verify auth is chat@system.gserviceaccount.com
export async function assertAuthorized(req: Request, res: Response): Promise<void> {
  return Promise.resolve();
}

// TODO: cache requests
export async function getToken(): Promise<string> {
  const scopes = [
    "https://www.googleapis.com/auth/chat.bot",
    "https://www.googleapis.com/auth/cloud-platform",
  ].join(",");
  const host = "metadata.google.internal"
  const path = `/computeMetadata/v1/instance/service-accounts/default/token?scopes=${scopes}`
  const res = await fetch(`http://${host}${path}`, {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });
  const json = await res.json();
  return json.access_token;
}

export async function getEmail(): Promise<string> {
  const host = "metadata.google.internal"
  const path = `/computeMetadata/v1/instance/service-accounts/default/email`
  const res = await fetch(`http://${host}${path}`, {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });
  const email = await res.text();
  logger.debug("Current email is ", email);
  return email;
}