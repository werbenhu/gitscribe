import { SESSION_LOG_LIMITS } from '../constants';
import type { LlmSessionLog, LlmTurnLog } from '../types';
import type { ChatMessage } from './prompt';

function truncateText(text: string): string {
  const max = SESSION_LOG_LIMITS.MAX_CONTENT_CHARS;
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n…(truncated)`;
}

function sanitizeMessages(messages: ChatMessage[]): LlmTurnLog['messages'] {
  return messages.map((m) => ({
    role: m.role,
    content: truncateText(m.content),
  }));
}

/** 收集一次生成过程中的多回合 LLM 往返 */
export class SessionLogBuilder {
  private readonly startedAt = Date.now();
  private readonly turns: LlmTurnLog[] = [];

  constructor(
    private readonly model: string,
    private readonly providerName: string,
  ) {}

  async run(
    phase: string,
    messages: ChatMessage[],
    invoke: () => Promise<string>,
  ): Promise<string> {
    const t0 = Date.now();
    try {
      const response = await invoke();
      this.turns.push({
        phase,
        messages: sanitizeMessages(messages),
        response: truncateText(response),
        durationMs: Date.now() - t0,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.turns.push({
        phase,
        messages: sanitizeMessages(messages),
        response: '',
        error: truncateText(message),
        durationMs: Date.now() - t0,
      });
      throw error;
    }
  }

  finish(ok: boolean, id: string): LlmSessionLog {
    return {
      id,
      startedAt: this.startedAt,
      model: this.model,
      providerName: this.providerName,
      ok,
      turns: this.turns,
    };
  }
}
