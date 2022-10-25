import * as logger from "firebase-functions/logger";
import fetch from "node-fetch";
import { Response } from "express";
import { initializeApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import * as moment from "moment-timezone";

import * as chat from "./chat";
import * as ux from "./ux";
import { getEmail, getToken } from "./auth";
import * as scheduler from "./scheduler";

const app = initializeApp();

function idNo(name: string, index: number): string {
  const parts = name.split("/");
  if (parts.length < index * 2 + 1) {
    throw new Error(`name ${name} does not have id number ${index}`);
  }
  return parts[index * 2 + 1];
}

function userId(name: string) { return idNo(name, 0); }
function roomId(name: string) { return idNo(name, 0); }

export async function addedToSpace(event: chat.AddToSpaceEvent) {
  const user = event.user;
  const db = getDatabase(app);
  const room = roomId(event.space.name);
  const userUpdate = {
    displayName: user.displayName,
    email: user.email,
    domainId: user.domainId,
    spaces: {
      [room]: {
        displayName: event.space.displayName,
        spaceType: event.space.type,
      },
    }
  }
  if (!userUpdate.spaces[room].displayName) {
    delete userUpdate.spaces[room].displayName;
  }
  const roomSettings = {
    type: event.space.type,
    displayName: event.space.displayName,
    spaceType: event.space.type,
    invitedBy: userId(user.name),
    users: {
      [userId(user.name)]: user.email,
    },
  };
  if (!roomSettings.displayName) {
    delete roomSettings.displayName;
  }

  await Promise.all([
    db.ref(`users/${userId(user.name)}`).update(userUpdate),
    db.ref(`spaces/${roomId(event.space.name)}`).set(roomSettings),
    schedule(roomId(event.space.name)),
  ]);
}

export async function removeFromSpace(event: chat.ChatEvent) {
  const db = getDatabase(app);
  await db.ref(`spaces/${roomId((event as any).space.name)}`).remove();
  // Note: we do not delete the users' space membership because they should
  // keep snippets after leaving a room.
}

export const DISPATCH_TABLE: Array<[RegExp, (message: chat.Message) => Promise<string | void>]> = [
  [/⬅️|👈|y(exterday)?:/, addStatusUpdate],
  [/^help/, handleHelp],
  [/^add/, handleAdd],
  [/^remove/, handleRemove],
  [/^schedule/, handleSchedule],
  [/^unschedule/, handleUnschedule],
  [/^set/, handleSetProperty],
  [/^forgetme/, handleForgetMe],
  [/^forget me/, handleForgetMe],
];

export function getAction(text: string): ((message: chat.Message) => Promise<string | void>) | null {
  text = text.trim().toLowerCase();
  for (const [pattern, strategy] of DISPATCH_TABLE) {
    if (!text.match(pattern)) {
      continue;
    }
    return strategy;
  }
  return null;
}

export async function handleMessage(message: chat.Message, res: Response) {
  try {
    const action = getAction(message.argumentText);
    if (!action) {
      res.json({
        text: `Unknown command ${message.argumentText}.\n${ux.STRINGS.helpCommands}`
      });
      return;
    }
    const response = await action(message);
    if (response) {
      res.json({text: response});
    }
    return;
  } catch (err: any) {
    logger.error("Unhandled exception:", JSON.stringify(err, null, 2));
    res.json({
      text: "Standup Bot failed with unhandled exception: " + err.message,
    });
  }
} 

export async function handleHelp(message: chat.Message) {
    const parts = message.argumentText.toLowerCase().split(" ").map(s => s.trim()).filter(s => s.length);
    if (parts[0] === "help") {
      parts.splice(0, 1);
    }
    if (!parts.length) {
      return ux.STRINGS.helpCommands;
    }
    switch (parts[0]) {
      case "schedule": return ux.STRINGS.helpSchedule;
      case "unschedule": return ux.STRINGS.helpUnschedule;
      case "set":
        if (parts.length === 1) {
          return "Valid properties are timezone and days. Please ask for further help";
        }
        if (parts[1] === "timezone" || parts[1] === "time" && parts[2] === "zone") {
          return ux.STRINGS.helpSetTimeZone;
        }
        if (parts[1] === "days") {
          return ux.STRINGS.helpSetDays;
        }
        return `Cannot set unknown property ${parts.slice(1).join(" ")}\n${ux.STRINGS.helpCommands}`;
      case "add": return ux.STRINGS.helpAdd;
      case "remove": return ux.STRINGS.helpRemove;
      case "forgetme": return ux.STRINGS.helpForgetMe;
      case "standup": return ux.STRINGS.helpStandup;
    }
    return `Cannot help with unknown command ${parts.slice(1).join(" ")}.${ux.STRINGS.helpCommands}`;
}

function mentionedUsers(message: chat.Message): chat.User[] {
  return (message.annotations || [])
    .filter(annotation => annotation.type === "USER_MENTION")
    .filter(annotation => annotation.userMention?.user.type === "HUMAN")
    .map(annotation => annotation.userMention?.user!)
    .filter(user => !!user);
}

export async function handleAdd(message: chat.Message) {
  const space = roomId(message.space.name);
  let users: Array<chat.User>;
  if (message.argumentText.trim().toLowerCase() === "add me") {
    users = [message.sender];
  } else {
    users = mentionedUsers(message);
  }
  const userMap: Record<string, string> = {};
  for (const user of users) {
    userMap[userId(user.name)] = user.email;
  }
  const db = getDatabase(app);
  const updates: Array<Promise<void>> = users.map(user => {
    const update: Record<string, unknown> = {
      spaceType: message.space.type,
    }
    if (message.space.displayName) {
      update.displayName = message.space.displayName;
    }
    return db.ref(`users/${userId(user.name)}/spaces/${space}`).update(update);
  });
  updates.push(db.ref(`spaces/${space}/users`).update(userMap));
  await Promise.all(updates);
  return `Added ${users.map(user => user.email).join(", ")} to standup`;
}

export async function handleRemove(message: chat.Message) {
  const space = roomId(message.space.name);
  let users: Array<chat.User>;
  if (message.argumentText.trim().toLowerCase() === "remove me") {
    users = [message.sender];
  } else {
    users = mentionedUsers(message);
  }
  const userMap: Record<string, null> = {};
  for (const user of users) {
    userMap[userId(user.name)] = null;
  }
  const db = getDatabase(app);
  await db.ref(`spaces/${space}/users`).update(userMap);
  return `Removed ${users.map(user => user.email).join(", ")} from standup`;
}

export async function handleSchedule(message: chat.Message) {
  const parts = message.argumentText.trim().split(" ");
  logger.debug(`argumentText is ${message.argumentText}. parts is ${JSON.stringify(parts)}`);
  if (parts[0] === "schedule") {
    parts.splice(0, 1);
  }
  const time = parts[0];
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return "Expected schedule to be in the form 'HH:MM'";
  }
  if (+match[1] >= 24) {
    return "Hours must be less than 24";
  }
  if (+match[2] >= 60) {
    return "Minutes must be less than 60";
  }
  const spaceId = roomId(message.space.name);
  const db = getDatabase(app);
  await db
    .ref(`/spaces/${spaceId}/schedule`)
    .set(match[0]);
  await schedule(spaceId);
  return `Sounds good. Standups are scheduled at ${match[0]}. ` +
        "To set the time zone use the `set timezone` command";
}

export async function handleUnschedule(message: chat.Message) {
  const spaceId = roomId(message.space.name);
  const db = getDatabase(app);
  await Promise.all([
    db.ref(`spaces/${spaceId}/schedule`).set(null),
    scheduler.deleteJob(`projects/${process.env.GCLOUD_PROJECT}/locations/us-central1/jobs/${spaceId}`),
  ]);
  return "OK. I won't bother you anymore. To reschedule standups say 'schedule <time>'";
}

export async function handleSetProperty(message: chat.Message) {
  const spaceId = roomId(message.space.name);
  const parts = message.argumentText.trim().split(" ");
  logger.debug(`Argument text is "${message.argumentText}" and parts are ${JSON.stringify(parts)}`);
  if (parts[1].toLowerCase() === "timezone") {
    return setTimeZone(spaceId, parts[2]);
  } else if (parts[1] === "time" && parts[2] === "zone") {
    return setTimeZone(spaceId, parts[3]);
  } else if (parts[1] === "days") {
    return setDays(spaceId, parts.slice(2).join(","));
  } else {
    return `Cannot set unknown property ${parts[1]}.\n${ux.STRINGS.helpCommands}`;
  }
}

export async function handleForgetMe(message: chat.Message) {
  const db = getDatabase(app);
  const uid = userId(message.sender.name);
  const roomSnap = await db.ref(`/users/${uid}/rooms`).get();
  const rooms = Object.keys(roomSnap.val());
  const updates: Array<Promise<void>> = [];
  for (const room of rooms) {
    updates.push(db.ref(`/spaces/${room}/users/${uid}`).set(null));
  }
  updates.push(db.ref(`/users/${uid}`).set(null));

  await Promise.all(updates);
  return "https://memegen.corp.google.com/template/i_don_t_even_know_who_you_are_thanos";
}

export async function handleStandup(spaceId: string): Promise<void> {
  logger.debug("Handling standup");
  const access_token = await getToken();

  const db = getDatabase(app);
  const space = await db.ref(`spaces/${spaceId}`).get();
  if (!space.exists()) {
    logger.error(`Asked to hold standup for space ${spaceId} but do not know anything about this space`);
  }
  const response = await fetch(`https://chat.googleapis.com/v1/spaces/${spaceId}/messages`, {
     method: "POST",
     headers: {
       authorization: `Bearer ${access_token}`,
       "content-type": "application/json",
     },
     body: JSON.stringify({
       text: ux.standupMessage(space.val()),
     }),
  });
  logger.debug(`Response Status ${response.status}\n${await response.text()}`);
}

export async function addStatusUpdate(message: chat.Message) {
  const db = getDatabase(app);
  const uid = userId(message.sender.name);
  const spaceId = roomId(message.space.name);
  await db.ref(`users/${uid}/spaces/${spaceId}/updates`).push({
    text: message.text,
    time: ServerValue.TIMESTAMP,
  });
}

export async function schedule(spaceId: string): Promise<void> {
  const roomSnap = await getDatabase(app).ref(`spaces/${spaceId}`).get();
  const time = roomSnap.val()?.schedule || "10:00";
  const days = roomSnap.val()?.days || "mon,tue,wed,thu,fri";
  const tz = roomSnap.val()?.timeZone || "America/Los_Angeles";
  const target = "https://postchat-uvb3o4q2mq-uc.a.run.app";
  const job: scheduler.Job = {
    name: `projects/${process.env.GCLOUD_PROJECT}/locations/us-central1/jobs/${spaceId}`,
    schedule: `every ${days} ${time}`,
    timeZone: tz,
    httpTarget: {
      httpMethod: "POST",
      uri: target,
      headers: {
        "content-type": "application/json",
      },
      body: Buffer.from(JSON.stringify({
        spaceId,
      })).toString("base64"),
      oidcToken: {
        serviceAccountEmail: await getEmail(),
        audience: target,
      },
    },
  };
  logger.debug("Scheduling job", JSON.stringify(job, null, 2));
  await scheduler.createOrReplaceJob(job);
}

export async function setTimeZone(spaceId: string, timeZone: string) {
  if (!moment.tz.names().includes(timeZone)) {
    return `Do not recognize time zone "${timeZone}"`
  }
  const db = getDatabase(app);
  await db.ref(`spaces/${spaceId}/timeZone`).set(timeZone);
  await schedule(spaceId);
  return `Sounds good. Standups are scheduled in ${timeZone}. ` +
        "To set the schedule use the `schedule` command";
}

const VALID_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export async function setDays(spaceId: string, daysString: string) {
  const days = daysString.split(/[ ,]/).map(day => day.toLowerCase()).filter(day => day.trim().length);
  const invalid = days.filter(day => !VALID_DAYS.includes(day));
  if (invalid.length) {
    return `Invalid day(s) ${invalid.join(" ")}; valid day values are ${VALID_DAYS.join(", ")}`
  }
  const db = getDatabase(app);
  await db.ref(`/spaces/${spaceId}/days`).set(days.join(","));
  await schedule(spaceId);
  return `Standups are now scheduled for ${days.join(", ")}`;
}