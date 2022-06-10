export interface Room {
  users: Record<string, string>;
  timeZone?: string;
  schedule?: string;
  days?: string;
}