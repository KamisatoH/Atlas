import { Router } from 'express';
import {
  type AgentChatContext,
  buildAgentSystemPrompt,
} from '../lib/agentPrompts';
import { LlmParseError, parseAssistantJson, extractAssistantText } from '../lib/llmJson';
import { authRequired } from '../middleware/auth';
import { aiRateLimit } from '../middleware/aiRateLimit';

/** 开发环境可匿名试用；CloudBase 生产镜像默认要求登录并启用限流。 */
export const aiRouter = Router();

function aiAuthIfRequired(req: Parameters<typeof authRequired>[0], res: Parameters<typeof authRequired>[1], next: Parameters<typeof authRequired>[2]) {
  if (process.env.AI_REQUIRE_AUTH?.trim().toLowerCase() === 'true') {
    authRequired(req, res, next);
    return;
  }
  next();
}

type ChatMsg = { role: 'user' | 'assistant'; content: string };

type AgentPlanStop = {
  name: string;
  lng?: number;
  lat?: number;
  type?: 'scenic' | 'food' | 'hotel' | 'other';
  playMinutes?: number;
  note?: string;
  openTime?: string;
  closeTime?: string;
  transportToNext?: 'walking' | 'driving' | 'transit' | 'riding';
};

type AgentTripPlan = {
  city?: string;
  title?: string;
  dayStart?: string;
  dayIndex?: number;
  stops: AgentPlanStop[];
  transportSummary?: string;
};

type AgentItineraryMeta = {
  city?: string;
  title?: string;
  totalDays?: number;
};

type ChatPayload = {
  reply: string;
  source: 'openai';
  plan?: AgentTripPlan | null;
  plans?: AgentTripPlan[] | null;
  itinerary?: AgentItineraryMeta | null;
  /** plans 数量少于 itinerary.totalDays 时为 true */
  plansIncomplete?: boolean;
};

function llmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function llmTimeoutMs(): number {
  return Number(process.env.OPENAI_TIMEOUT_MS) || 90000;
}

aiRouter.get('/status', (_req, res) => {
  res.json({
    connected: llmConfigured(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
  });
});

aiRouter.post('/chat', aiAuthIfRequired, aiRateLimit, async (req, res) => {
  const messages = req.body?.messages as ChatMsg[] | undefined;
  const context = req.body?.context as AgentChatContext | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 无效' });
    return;
  }

  if (!llmConfigured()) {
    res.status(503).json({ error: '大模型未连接，请稍候', code: 'LLM_UNAVAILABLE' });
    return;
  }

  try {
    const result = await chatWithOpenAI(messages, context, process.env.OPENAI_API_KEY!);
    res.json(result);
  } catch (e) {
    console.warn('LLM chat failed:', e);
    const detail = e instanceof Error ? e.message : String(e);
    if (e instanceof LlmParseError) {
      res.status(502).json({
        error: e.truncated
          ? '行程内容过长被截断，请减少天数或说「精简版」后重试'
          : '模型响应格式异常，请重试',
        code: 'LLM_PARSE_ERROR',
        detail,
      });
      return;
    }
    res.status(503).json({
      error: '大模型请求失败，请稍候重试',
      code: 'LLM_UNAVAILABLE',
      detail,
    });
  }
});

function normalizeBaseUrl(url?: string): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function createLlmClient(apiKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai').default as typeof import('openai').default;
  const timeoutMs = llmTimeoutMs();
  return new OpenAI({
    apiKey,
    baseURL: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
    timeout: timeoutMs,
    maxRetries: 1,
  });
}

function llmExtraBody(): Record<string, unknown> | undefined {
  const model = process.env.OPENAI_MODEL || '';
  if (/deepseek-v4/i.test(model)) {
    return { thinking: { type: 'disabled' } };
  }
  return undefined;
}

async function chatWithOpenAI(
  messages: ChatMsg[],
  context: AgentChatContext | undefined,
  apiKey: string,
  compact = false
): Promise<ChatPayload> {
  const client = createLlmClient(apiKey);
  let sys = buildAgentSystemPrompt(context);
  if (compact) {
    sys +=
      '\n\n# 压缩模式\n上次输出过长被截断。请用更精简内容重新输出**完整** JSON：每日最多 3 站，note 10～15 字，仍须 plans.length === totalDays。';
  }
  const extraBody = llmExtraBody();

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: sys }, ...messages],
    temperature: 0.35,
    max_tokens: Number(process.env.OPENAI_MAX_TOKENS) || 8192,
    response_format: { type: 'json_object' },
    ...(extraBody ? { extra_body: extraBody } : {}),
  });

  const choice = completion.choices[0];
  let parsed: {
    reply?: string;
    plan?: AgentTripPlan | null;
    plans?: AgentTripPlan[] | null;
    itinerary?: AgentItineraryMeta | null;
  };

  try {
    parsed = parseAssistantJson(choice?.message, choice?.finish_reason) as typeof parsed;
  } catch (e) {
    if (!compact && e instanceof LlmParseError && e.truncated) {
      console.warn('LLM output truncated, retrying in compact mode');
      return chatWithOpenAI(messages, context, apiKey, true);
    }
    if (e instanceof LlmParseError) {
      console.warn('LLM JSON parse failed, raw length:', extractAssistantText(choice?.message).length);
    }
    throw e;
  }

  if (choice?.finish_reason === 'length' && !compact) {
    console.warn('LLM finish_reason=length, retrying in compact mode');
    return chatWithOpenAI(messages, context, apiKey, true);
  }

  return normalizeChatPayload(parsed, context?.activeDayIndex);
}

function normalizeOnePlan(
  plan: AgentTripPlan | null | undefined,
  fallbackDayIndex?: number
): AgentTripPlan | null {
  if (!plan || !Array.isArray(plan.stops) || plan.stops.length === 0) return null;
  const validModes = new Set(['walking', 'driving', 'transit', 'riding']);
  const stops = plan.stops
    .filter((s) => s?.name?.trim())
    .map((s, i, arr) => ({
      name: String(s.name).trim(),
      lng: typeof s.lng === 'number' ? s.lng : undefined,
      lat: typeof s.lat === 'number' ? s.lat : undefined,
      type: s.type ?? 'scenic',
      playMinutes: Math.min(Math.max(s.playMinutes ?? 90, 15), 360),
      note: s.note?.trim() || undefined,
      openTime: s.openTime?.trim() || undefined,
      closeTime: s.closeTime?.trim() || undefined,
      transportToNext:
        i < arr.length - 1 && s.transportToNext && validModes.has(s.transportToNext)
          ? s.transportToNext
          : i < arr.length - 1
            ? 'transit'
            : undefined,
    }));
  if (!stops.length) return null;
  return {
    city: plan.city,
    title: plan.title,
    dayStart: plan.dayStart ?? '09:00',
    dayIndex: plan.dayIndex ?? fallbackDayIndex,
    transportSummary: plan.transportSummary,
    stops,
  };
}

function mergeMultiDayPlans(
  parsed: {
    plan?: AgentTripPlan | null;
    plans?: AgentTripPlan[] | null;
    itinerary?: AgentItineraryMeta | null;
  },
  activeDayIndex?: number
): AgentTripPlan[] {
  const fromArray = Array.isArray(parsed.plans)
    ? parsed.plans
        .map((p, i) => normalizeOnePlan(p, p.dayIndex ?? i))
        .filter((p): p is AgentTripPlan => p != null)
    : [];

  const expectedDays = parsed.itinerary?.totalDays;
  const extra = normalizeOnePlan(parsed.plan, fromArray.length);

  // 模型常把最后一天误放进 plan，或 plans 被截断少一项
  if (extra && fromArray.length >= 2) {
    const needMore = expectedDays != null ? fromArray.length < expectedDays : true;
    const duplicate = fromArray.some(
      (p) => p.title === extra.title && p.stops.length === extra.stops.length
    );
    if (needMore && !duplicate) {
      fromArray.push({ ...extra, dayIndex: fromArray.length });
    }
  }

  return fromArray.map((p, i) => ({ ...p, dayIndex: i }));
}

function normalizeChatPayload(
  parsed: {
    reply?: string;
    plan?: AgentTripPlan | null;
    plans?: AgentTripPlan[] | null;
    itinerary?: AgentItineraryMeta | null;
  },
  activeDayIndex?: number
): ChatPayload {
  const mergedMulti = mergeMultiDayPlans(parsed, activeDayIndex);
  const single = normalizeOnePlan(parsed.plan, activeDayIndex);

  if (mergedMulti.length > 1) {
    const expectedDays = parsed.itinerary?.totalDays ?? mergedMulti.length;
    const plansIncomplete = mergedMulti.length < expectedDays;
    let reply = String(parsed.reply ?? '已收到，请继续描述你的旅行需求。');
    if (plansIncomplete) {
      reply += `\n\n⚠️ 行程数据不完整（声明 ${expectedDays} 天，实际 ${mergedMulti.length} 天）。请回复「补全第 ${mergedMulti.length + 1} 天」或重新生成。`;
    }
    return {
      reply,
      source: 'openai',
      plan: null,
      plans: mergedMulti,
      itinerary: {
        city: parsed.itinerary?.city ?? mergedMulti[0]?.city,
        title: parsed.itinerary?.title,
        totalDays: expectedDays,
      },
      plansIncomplete,
    };
  }

  const one = mergedMulti.length === 1 ? mergedMulti[0] : single;
  return {
    reply: String(parsed.reply ?? '已收到，请继续描述你的旅行需求。'),
    source: 'openai',
    plan: one ?? null,
    plans: null,
    itinerary: null,
  };
}
