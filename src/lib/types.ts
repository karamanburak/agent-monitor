// The hook event shape is intentionally loose — clients emit varying fields that applyEvent normalizes.
export type StatusKind = 'working' | 'waiting' | 'idle' | 'ended';

export interface HookEvent {
  hook_event_name?: string;
  session_id?: string;
  received_at: number;
  source?: string;
  cwd?: string;
  model?: string;
  permission_mode?: string;
  effort?: string | { level?: string };
  prompt?: string;
  prompt_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: ToolResponse | null;
  tool_output?: ToolResponse | null;
  duration_ms?: number;
  duration?: number;
  agent_id?: string;
  subagent_id?: string;
  agent_type?: string;
  subagent_type?: string;
  agent_name?: string;
  message?: string;
  notification?: string;
  last_assistant_message?: string;
  reason?: string;
  synthetic?: boolean;
  workspace_roots?: string[];
  background_tasks?: BackgroundTask[];
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  events?: HookEvent[];
  raw?: string;
  [k: string]: unknown;
}

export interface ToolResponse {
  is_error?: boolean;
  success?: boolean;
  error?: string;
  status?: string;
  stderr?: string;
  stdout?: string;
  noOutputExpected?: boolean;
  interrupted?: boolean;
  [k: string]: unknown;
}

export interface BackgroundTask {
  id: string;
  type?: string;
  status?: string;
  agent_type?: string;
  description?: string;
}

export interface ToolInfo {
  name: string;
  detail: string;
}

export interface EditPart {
  file?: string;
  old: string;
  new: string;
}

export type TimelineEntry = SysEntry | PromptEntry | ToolEntry | NoteEntry | AgentEntry | ResultEntry;

export interface SysEntry {
  kind: 'sys';
  t: number;
  text: string;
}
export interface PromptEntry {
  kind: 'prompt';
  t: number;
  text: string;
  promptId?: string | null;
}
export interface ToolEntry {
  kind: 'tool';
  id: string;
  t: number;
  name: string;
  detail: string;
  agent: string | null;
  dur: number | null;
  ok: boolean | null;
  promptId: string | null;
  inStr: string;
  outStr: string;
  edits: EditPart[] | null;
}
export interface NoteEntry {
  kind: 'note';
  t: number;
  text: string;
}
export interface AgentEntry {
  kind: 'agent';
  t: number;
  text: string;
  agent: string;
  result?: string;
}
export interface ResultEntry {
  kind: 'result';
  t: number;
  text: string;
  hasResult: boolean;
  promptId: string | null;
  tok: { in: number; out: number; cache: number } | null;
}

export interface Subagent {
  id: string;
  type: string;
  running: boolean;
  started: number;
  lastSeen?: number;
  stopped?: number;
  desc?: string;
  tool?: ToolInfo | null;
  result?: string;
}

export interface Session {
  id: string;
  cwd: string;
  source: string;
  firstSeen: number;
  lastSeen: number;
  status: StatusKind;
  prompt: string;
  promptId?: string | null;
  currentTool: ToolInfo | null;
  toolStart: number;
  toolCount: number;
  failCount: number;
  workStart: number;
  doneAt: number;
  model: string;
  permMode: string;
  effort: string;
  lastResult: string;
  lastResultAt: number;
  waitMsg?: string | null;
  subagents: Subagent[];
  timeline: TimelineEntry[];
  // plain record (not a Map) so it lives happily inside Redux/Immer state.
  pending: Record<string, ToolEntry>;
  turnOpen: Record<string, boolean>;
}

export interface UsageBucket {
  input: number;
  output: number;
  cache: number;
  total: number;
  cost: number;
}
export interface UsageResponse {
  updated: number;
  scanEveryMs: number;
  today: UsageBucket;
  week: UsageBucket;
  month: UsageBucket;
  year: UsageBucket;
  bySession: Record<string, { input: number; output: number; cache: number; cost: number; model?: string }>;
}
export interface StatsDay {
  d: number;
  total: number;
  msgs: number;
  byModel: Record<string, { t: number; in: number; out: number }>;
  sids: string[];
  hours: number[];
}
export interface SessionUsageEntry {
  ts: number;
  in: number;
  out: number;
  cache: number;
  cost: number;
}
export interface HistorySession {
  id: string;
  cwd: string;
  firstSeen: number;
  lastSeen: number;
  events: number;
  tools: number;
  fails: number;
  prompts: number;
  subs: number;
  firstPrompt: string;
  lastPrompt: string;
  ended: boolean;
  result: string;
}
