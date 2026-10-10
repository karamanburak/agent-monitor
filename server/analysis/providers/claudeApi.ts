// Claude API with the developer's own key (ANTHROPIC_API_KEY). Structured outputs
// constrain the reply to REPORT_SCHEMA, so the text block is guaranteed to be valid JSON.
import Anthropic from '@anthropic-ai/sdk';
import type { Availability, CompleteArgs, LLMProvider } from './types';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export const claudeApi: LLMProvider = {
  id: 'claude-api',
  label: 'Claude API (your key)',
  local: false,

  async available(): Promise<Availability> {
    return process.env.ANTHROPIC_API_KEY
      ? { ok: true, detail: 'ANTHROPIC_API_KEY is set' }
      : { ok: false, detail: 'ANTHROPIC_API_KEY is not set' };
  },

  async complete({ system, user, schema, model }: CompleteArgs): Promise<unknown> {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: model || DEFAULT_CLAUDE_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (response.stop_reason === 'refusal') throw new Error('The model declined to analyse this session.');
    if (response.stop_reason === 'max_tokens') throw new Error('The reply was cut off (max_tokens).');
    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!block) throw new Error('No text in the reply.');
    return block.text;
  },
};
