// Hook events are loosely shaped (clients differ), so a permissive record.
export type Event = Record<string, any>;

export interface Usage {
  d: number; // local date key YYYYMMDD
  ts: number; // wall-clock ms
  sid: string | null; // session id
  m: string; // model id
  in: number;
  out: number;
  cc: number; // cache creation tokens
  cr: number; // cache read tokens
}
