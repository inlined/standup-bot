export type EventType = "ADDED_TO_SPACE" | "REMOVED_FROM_SPACE";
export type UserType = "HUMAN" | "BOT";
export type AnnotationType = "USER_MENTION";
export type ThreadRetentionState = "PERMANENT";

export interface ChatEvent {
  type: EventType;
  eventTime: string;
  message?: Message;
}

export interface AddToSpaceEvent extends ChatEvent {
  type: "ADDED_TO_SPACE";
  message?: Message;
  user: User;
  space: Space;
  configCompleteRedirectUrl: string;
}

export function isAddToSpaceSpaceEvent(event: ChatEvent): event is AddToSpaceEvent {
  return event.type == "ADDED_TO_SPACE";
}

export interface User {
  name: string;
  displayName: string;
  avatarUrl: string;
  email: string;
  type: UserType;
  domainId?: string;
}

export interface Annotation {
  type: AnnotationType;
  userMention?: {
    user: User;
  };
}

export interface UserMentionAnnotation extends Annotation {
  type: "USER_MENTION";
  startIndex: number;
  length: number;
  userMention: {
    user: User;
    type: "ADD"
  }
}

export interface Thread {
  name: string;
  retentionSettings: {
    state: ThreadRetentionState;
  };
};

export interface Space {
  name: string;
  type: "ROOM",
  displayName: string;
  spaceThreadingState: "THREADED_MESSAGES";
  spaceType: "SPACE";
  spaceHistoryState: "HISTORY_ON";
};

export interface Message {
  name: string;
  sender: User;
  createTime: string;
  text: string;
  annotations: Annotation[];
  thread: Thread;
  argumentText: string;
  lastUpdateTime: string;
  retentionSettings: {
    state: ThreadRetentionState;
  }
  space: Space;
}
