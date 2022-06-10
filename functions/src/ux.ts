import * as moment from "moment-timezone";
import { Room } from "./model";

export const STRINGS = {
  helpCommands: "Valid commands are:\n" +
    "- help [command]?: display a list of valid commands\n" +
    "- help standup: display syntax for recording stanups for snippet parsing\n" +
    "- schedule <time>: schedule standup for a particular time\n" +
    "- unschedule: stop scheduling standups\n" +
    "- set timezone <tz>: set the time zone for standup\n" +
    "- set days <day list>: set the days for standup\n" +
    "- add <username>: add a user to standup\n" +
    "- remove <username>: remove a user from standup\n" +
    "- forgetme: purge all data about me",
  helpSchedule: 'schedule <time>: schedule a standup for a particular time. <time> should be in the form HH:MM in a 24hr clock.',
  helpUnschedule: 'unschedule: stop scheduling standups',
  helpSetTimeZone: 'set timezone <timezone>: schedule standup to happen at a particualr timezone, e.g. America/Los_Angeles',
  helpSetDays: 'set days <day list>: schedule standup to happen on particular days. ' +
    'Day names can be full names (e.g. "monday") or three-letter acronyms (e.g. "mon"). ' + 
    'Days can be space or comma delimited.',
  helpAdd: 'add <user mention>: adds a user to daily standup. Use "add me" to schedule yourself',
  helpRemove: 'remove <user mention>: removes a user from daily standup. Use "remove me" to unschedule yourself',
  helpForgetMe: 'forgetme: remove yourself from all standups and delete all recorded snippets',
  helpStandup: "Standups can be formatted in multiple ways to preserve yesterday's accomplishments as snippets.\n" +
    "If you prefer emojis, you can use 👈 (yesterday), 👇 (today), 🛑 (blockers), ❓ (questions)\n" +
    'If you prefer terse text, you can use "y:", "t:", "b:", "q:"\n' +
    "You will soon be able to get snippets based on all previous day's accomplishments",
};

const MONTH_NAMES = [
    "Jan",
    "Feb",
    "March",
    "April",
    "May",
    "June",
    "July",
    "Aug",
    "Sept",
    "Oct",
    "Nov",
    "Dec",
];

export function standupMessage(room: Room): string {
  const timeZone = room.timeZone || "America/Los_Angeles";
  const time = moment().tz(timeZone);
  const day: number = time.date();
  const month: number = time.month();
  const monthName =   MONTH_NAMES[month];

  const userList = Object.keys(room.users).map(user => `<users/${user}>`).join(", ");
  return `It's time for the ${monthName} ${day} standup ${userList}!\n` +
  'What did you do yesterday? What do you hope to do today? Blockers? Questions?. ' +
  'Ask me to "help standup" for syntax';
}