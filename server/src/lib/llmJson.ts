/** 从 OpenAI 兼容接口的 assistant message 中提取文本 */
export function extractAssistantText(
  message: { content?: unknown; reasoning_content?: string } | null | undefined
): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

function stripJsonFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

/** 从不完整 JSON 中尽量 salvage reply 字段 */
function salvagePartialJson(text: string): Record<string, unknown> | null {
  const replyMatch = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(text);
  if (!replyMatch) return null;
  try {
    const reply = JSON.parse(`"${replyMatch[1]}"`) as string;
    return { reply, plan: null, plans: null, itinerary: null };
  } catch {
    return { reply: replyMatch[1].replace(/\\"/g, '"'), plan: null, plans: null, itinerary: null };
  }
}

/** 解析模型 JSON 输出；失败时抛出可读错误 */
export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = stripJsonFence(text.trim());
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    const salvaged = salvagePartialJson(trimmed);
    if (salvaged) return salvaged;
    throw new Error('模型返回的 JSON 不完整或格式错误（可能因输出过长被截断）');
  }
}

export class LlmParseError extends Error {
  readonly truncated: boolean;
  constructor(message: string, truncated = false) {
    super(message);
    this.name = 'LlmParseError';
    this.truncated = truncated;
  }
}

export function parseAssistantJson(
  message: { content?: unknown; reasoning_content?: string } | null | undefined,
  finishReason?: string | null
): Record<string, unknown> {
  const text = extractAssistantText(message);
  if (!text.trim()) {
    if (finishReason === 'length') {
      throw new LlmParseError('模型输出因长度限制被截断，未返回有效内容', true);
    }
    return {};
  }
  try {
    return parseModelJson(text);
  } catch (e) {
    const truncated = finishReason === 'length';
    const msg = e instanceof Error ? e.message : 'JSON 解析失败';
    throw new LlmParseError(msg, truncated);
  }
}
