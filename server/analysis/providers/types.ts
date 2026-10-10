// Every LLM backend looks the same to the rest of the analyst. Adding one = one file here.
export type ProviderId = 'claude-code' | 'claude-api' | 'ollama';

export interface Availability {
  ok: boolean;
  detail: string; // shown in the UI: why it is (not) usable, which model
  models?: string[]; // Ollama: installed models
}

export interface CompleteArgs {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  model?: string; // provider default when empty
}

export interface LLMProvider {
  id: ProviderId;
  label: string;
  local: boolean; // true = nothing leaves this machine
  available(): Promise<Availability>;
  complete(args: CompleteArgs): Promise<unknown>; // parsed JSON or raw text; validateReport() takes either
}
