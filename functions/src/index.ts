import { onRequest } from "firebase-functions/v2/https"
import * as logger from "firebase-functions/logger";
import { assertAuthorized } from "./auth";
import * as chat from "./chat";
import * as actions from "./actions";
import * as ux from "./ux";

export const handlechat = onRequest({
  invoker: "public"
}, async (req, res) => {
  await assertAuthorized(req, res);
  logger.debug("Received message", JSON.stringify(req.body, null, 2));
  const event = req.body as chat.ChatEvent;
  if (chat.isAddToSpaceSpaceEvent(event)) {
    await actions.addedToSpace(event);
    if (!event.message?.argumentText) {
      res.json({ text: "Hi, my name is Standup Bot\n" + ux.STRINGS.helpCommands });
      return;
    }
  } else if (event.type === "REMOVED_FROM_SPACE") {
    await actions.removeFromSpace(event);
  }
  if (event.message?.argumentText) {
    await actions.handleMessage(event.message, res);
  }
});

export const postchat = onRequest(async (req, res) => {
  logger.debug("in postchat");
  const spaceId = req.body.spaceId || "AAAAYwWg1x8";
  await actions.handleStandup(spaceId);
  res.send("OK");
});
