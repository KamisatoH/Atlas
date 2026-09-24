import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Calendar,
  Collapse,
  DatePicker,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClearOutlined,
  CompassOutlined,
  SendOutlined,
  EnvironmentOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { probeAgentAvailability, sendAgentChat, type LlmConnectionStatus } from '@/api/agentChat';
import { describeApiError } from '@/api/http';
import { mergePlansForApply } from '@/lib/normalizeAgentPlans';
import { confirmOverwriteExistingDays } from '@/lib/confirmTripOverwrite';
import { resolveStopsForAgentPlan, type AgentApplyOutcome, type ResolvedAgentStop } from '@/lib/agentApply';
import { planDayLabel } from '@/lib/planDate';
import { TRANSPORT_LABELS, transportIcon } from '@/lib/transportLabels';
import { PoiTypeTag } from '@/components/PoiTypeTag';
import type {
  AgentClarification,
  AgentClarificationAnswers,
  AgentReplanContext,
  AgentItineraryMeta,
  AgentTripPlan,
  ChatMessage,
} from '@/types/agentChat';
import type { DayPlan, PoiType, TransportMode, TripStop } from '@/types/trip';

const PACE_LABEL: Record<NonNullable<AgentTripPlan['pace']>, string> = {
  relaxed: '轻松节奏',
  balanced: '均衡节奏',
  compact: '紧凑节奏',
};

export type { ResolvedAgentStop } from '@/lib/agentApply';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '告诉我**城市**、**天数**和**偏好**（如低预算、亲子或美食），即可生成单日或多日路线。',
  createdAt: Date.now(),
};

const CLARIFICATION_LABELS: Record<AgentClarification['field'], string> = {
  pace: '行程节奏',
  interest: '游玩偏好',
  transport: '出行方式',
  companions: '同行情况',
  budget: '预算倾向',
  startArea: '出发区域',
  accommodation: '住宿安排',
  arrival: '抵达安排',
};

function PlanCard({
  plan,
  applying,
  applyLabel,
  onApply,
}: {
  plan: AgentTripPlan;
  applying: boolean;
  applyLabel: string;
  onApply: () => void;
}) {
  return (
    <div className="agent-plan-card mt-2 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Text strong className="text-sm text-zinc-900">
          {plan.title ?? '推荐路线'}
        </Text>
        {plan.city && (
          <Tag bordered={false} className="!m-0 !bg-zinc-100 !text-zinc-700">
            {plan.city}
          </Tag>
        )}
        {plan.dayStart && (
          <Text type="secondary" className="text-xs">
            出发 {plan.dayStart}
          </Text>
        )}
        {plan.pace && (
          <Tag bordered={false} className="!m-0 !bg-zinc-100 !text-zinc-700">
            {PACE_LABEL[plan.pace]}
          </Tag>
        )}
      </div>
      {plan.transportSummary && (
        <Text type="secondary" className="mb-2 block text-xs">
          🧭 {plan.transportSummary}
        </Text>
      )}
      <ol className="mb-3 space-y-2 pl-0 text-sm text-slate-700 list-none">
        {plan.stops.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-800">
                {i + 1}. {s.name}
              </span>
              <PoiTypeTag type={(s.type ?? 'scenic') as PoiType} />
              <Text type="secondary" className="text-xs">
                游玩 {s.playMinutes ?? 90} 分钟
              </Text>
            </div>
            {s.note && (
              <Text type="secondary" className="ml-4 block text-xs text-slate-500">
                {s.note}
              </Text>
            )}
            {i < plan.stops.length - 1 && s.transportToNext && (
              <div className="ml-4 mt-0.5 text-xs text-zinc-600">
                {transportIcon(s.transportToNext)}{' '}
                {TRANSPORT_LABELS[s.transportToNext as TransportMode]} → 下一站
              </div>
            )}
          </li>
        ))}
      </ol>
      <Text type="secondary" className="mb-2 block text-[10px]">
        应用后将用高德精算各段耗时，并推算到达/离开时间
      </Text>
      <Button
        type="primary"
        size="small"
        icon={<EnvironmentOutlined />}
        loading={applying}
        onClick={onApply}
        className="agent-apply-btn"
      >
        {applyLabel}
      </Button>
    </div>
  );
}

function MultiItineraryCard({
  plans,
  itinerary,
  applying,
  planStartDate,
  onApplyAll,
}: {
  plans: AgentTripPlan[];
  itinerary?: AgentItineraryMeta | null;
  applying: boolean;
  planStartDate: string | null;
  onApplyAll: () => void;
}) {
  return (
    <div className="agent-multi-plan mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Text strong className="text-sm text-zinc-900">
          {itinerary?.title ?? `${plans.length} 日连续行程`}
        </Text>
        {itinerary?.city && (
          <Tag bordered={false} className="!m-0 !bg-white/80">
            {itinerary.city}
          </Tag>
        )}
        <Tag bordered={false} className="!m-0 !bg-zinc-200 !text-zinc-700">
          共 {plans.length} 天
          {itinerary?.totalDays != null && itinerary.totalDays > plans.length
            ? ` / ${itinerary.totalDays} 天（不完整）`
            : ''}
        </Tag>
      </div>
      {itinerary?.totalDays != null && itinerary.totalDays > plans.length && (
        <Text type="warning" className="mb-2 block text-xs">
          数据缺少第 {plans.length + 1}～{itinerary.totalDays} 天，请先补全再应用
        </Text>
      )}
      <div className="mb-3 space-y-2">
        {plans.map((p) => {
          const dateLabel = planDayLabel(planStartDate, p.dayIndex ?? 0, 'short');
          return (
            <div
              key={p.dayIndex ?? p.title}
              className="rounded-lg border border-white/80 bg-white/70 px-2.5 py-1.5 text-xs text-slate-700"
            >
              <Text strong className="text-zinc-800">
                {dateLabel ? `${dateLabel} · ` : ''}
                {p.title ?? `第 ${(p.dayIndex ?? 0) + 1} 天`}
              </Text>
              <div className="mt-0.5 text-slate-500">
                {p.stops.map((s) => s.name).join(' → ')}
              </div>
            </div>
          );
        })}
      </div>
      <Button
        type="primary"
        size="small"
        icon={<EnvironmentOutlined />}
        loading={applying}
        onClick={onApplyAll}
        className="agent-apply-btn"
      >
        将完整行程应用到日历（{plans.length} 天）
      </Button>
    </div>
  );
}

function ClarificationCard({
  clarification,
  disabled,
  onChoose,
  onSkip,
}: {
  clarification: AgentClarification;
  disabled: boolean;
  onChoose: (option: AgentClarification['options'][number], detail?: string) => void;
  onSkip: () => void;
}) {
  const [detailOption, setDetailOption] = useState<AgentClarification['options'][number] | null>(null);
  const [detail, setDetail] = useState('');

  const chooseOption = (option: AgentClarification['options'][number]) => {
    if (option.requiresDetail) {
      setDetailOption(option);
      setDetail('');
      return;
    }
    onChoose(option);
  };

  const submitDetail = () => {
    const value = detail.trim();
    if (!detailOption || !value) return;
    onChoose(detailOption, value);
  };

  return (
    <section className="agent-clarification-card" aria-label={CLARIFICATION_LABELS[clarification.field]}>
      <div className="agent-clarification-card-heading">
        <span>{CLARIFICATION_LABELS[clarification.field]}</span>
        <small>选择一项</small>
      </div>
      <strong className="agent-clarification-question">{clarification.question}</strong>
      <div className="agent-clarification-options">
        {clarification.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`agent-clarification-option ${detailOption?.value === option.value ? 'is-selected' : ''}`}
            disabled={disabled}
            onClick={() => chooseOption(option)}
          >
            <span>{option.label}</span>
            {option.description && <small>{option.description}</small>}
          </button>
        ))}
      </div>
      {detailOption && (
        <div className="agent-clarification-detail">
          <Input
            size="small"
            value={detail}
            disabled={disabled}
            placeholder={detailOption.detailPlaceholder ?? '补充具体信息'}
            onChange={(event) => setDetail(event.target.value)}
            onPressEnter={submitDetail}
          />
          <Button type="primary" size="small" disabled={disabled || !detail.trim()} onClick={submitDetail}>
            确认
          </Button>
          <small>仅填写区域、车站/机场与大致时间，请勿填写订单或证件信息。</small>
        </div>
      )}
      {clarification.allowSkip !== false && (
        <button
          type="button"
          className="agent-clarification-skip"
          disabled={disabled}
          onClick={onSkip}
        >
          直接生成
        </button>
      )}
    </section>
  );
}

export function FreeAgentPanel({
  planStartDate,
  day,
  activeDayIndex,
  days,
  displayStops,
  searchCity,
  onApplyPlan,
  onApplyPlans,
  onSetPlanStartDate,
  onSetActiveDay,
  onAddDay,
  onClearTrip,
  onGenerationStart,
  onPlanGenerated,
  onGenerationFailed,
  embedded = false,
}: {
  planStartDate: string | null;
  day: DayPlan | undefined;
  activeDayIndex: number;
  days: DayPlan[];
  displayStops: TripStop[];
  searchCity: string | null;
  onApplyPlan: (
    plan: AgentTripPlan,
    resolved: ResolvedAgentStop[],
    targetDayIndex: number,
    replanAttempt?: number
  ) => Promise<AgentApplyOutcome>;
  onApplyPlans: (
    items: Array<{ plan: AgentTripPlan; resolved: ResolvedAgentStop[] }>,
    replanAttempt?: number
  ) => Promise<AgentApplyOutcome>;
  onSetPlanStartDate: (d: string | null) => void;
  onSetActiveDay: (i: number) => void;
  onAddDay: () => void;
  onClearTrip: () => void;
  /** 请求开始后驱动地图上的临时编排动效，不会写入行程。 */
  onGenerationStart?: () => void;
  /** 模型返回结构化路线后，将其交给地图做临时预览。 */
  onPlanGenerated?: (plans: AgentTripPlan[]) => void;
  onGenerationFailed?: () => void;
  embedded?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingPlanId, setApplyingPlanId] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmConnectionStatus>('checking');
  const [clarificationAnswers, setClarificationAnswers] = useState<AgentClarificationAnswers>({});
  const [clarificationCount, setClarificationCount] = useState(0);
  const [skipClarifications, setSkipClarifications] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeDateLabel = planDayLabel(planStartDate, activeDayIndex, 'long');

  useEffect(() => {
    void probeAgentAvailability().then(setLlmStatus);
    const timer = window.setInterval(() => {
      void probeAgentAvailability().then(setLlmStatus);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(async (override?: {
    content: string;
    answers?: AgentClarificationAnswers;
    clarificationCount?: number;
    skipClarification?: boolean;
  }) => {
    const text = (override?.content ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!override) setInput('');
    setLoading(true);
    onGenerationStart?.();

    try {
      const apiMessages = nextMessages
        .filter((m) => m.id !== 'welcome' && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const { reply, plan, plans, itinerary, plansIncomplete, clarification } = await sendAgentChat({
        messages: apiMessages,
        context: {
          city: searchCity,
          dayTitle: day?.title,
          planDateLabel: activeDateLabel,
          planStartDate,
          activeDayIndex,
          existingStopNames: displayStops.map((s) => s.name),
          totalDays: days.length,
          stopsByDay: days.map((d, i) => ({
            dayIndex: i,
            dayTitle: d.title,
            stopNames: d.stops.map((s) => s.name),
          })),
          clarificationAnswers: override?.answers ?? clarificationAnswers,
          clarificationCount: override?.clarificationCount ?? clarificationCount,
          skipClarification: override?.skipClarification ?? skipClarifications,
        },
      });

      const merged =
        plans && plans.length > 1
          ? mergePlansForApply(plans, plan, itinerary)
          : null;
      const singlePlan = plan ?? (plans?.length === 1 ? plans[0] : null);

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: reply,
        plan: merged ? undefined : singlePlan ? { ...singlePlan, dayIndex: singlePlan.dayIndex ?? activeDayIndex } : undefined,
        plans: merged ? merged.plans : plans && plans.length > 1 ? plans : undefined,
        itinerary: itinerary ?? undefined,
        plansIncomplete: plansIncomplete ?? merged?.incomplete,
        clarification: clarification ?? undefined,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setLlmStatus('connected');

      const generatedPlans = merged?.plans ?? plans ?? (plan ? [plan] : []);
      if (generatedPlans.length) {
        onPlanGenerated?.(generatedPlans);
      } else if (!clarification) {
        onGenerationFailed?.();
      }
    } catch (e) {
      console.error(e);
      const hint = describeApiError(e);
      if (hint.includes('未连接') || hint.includes('无法连接后端')) {
        setLlmStatus('disconnected');
      }
      message.error(hint);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: hint,
          createdAt: Date.now(),
        },
      ]);
      onGenerationFailed?.();
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [
    input,
    loading,
    messages,
    searchCity,
    day?.title,
    activeDateLabel,
    planStartDate,
    activeDayIndex,
    displayStops,
    llmStatus,
    days,
    clarificationAnswers,
    clarificationCount,
    skipClarifications,
    onGenerationStart,
    onPlanGenerated,
    onGenerationFailed,
  ]);

  const answerClarification = useCallback(
    (
      clarification: AgentClarification,
      option: AgentClarification['options'][number],
      detail?: string
    ) => {
      if (loading) return;
      const answer = detail ? `${option.value}：${detail}` : option.value;
      const nextAnswers = { ...clarificationAnswers, [clarification.field]: answer };
      const nextCount = Math.min(3, clarificationCount + 1);
      setClarificationAnswers(nextAnswers);
      setClarificationCount(nextCount);
      void send({
        content: `${CLARIFICATION_LABELS[clarification.field]}：${option.label}${detail ? `（${detail}）` : ''}`,
        answers: nextAnswers,
        clarificationCount: nextCount,
      });
    },
    [clarificationAnswers, clarificationCount, loading, send]
  );

  const skipClarification = useCallback(() => {
    if (loading) return;
    setClarificationCount(3);
    setSkipClarifications(true);
    void send({
      content: '请按已有信息和合理默认偏好直接生成完整行程。',
      answers: clarificationAnswers,
      clarificationCount: 3,
      skipClarification: true,
    });
  }, [clarificationAnswers, loading, send]);

  const requestReplan = async (replan: AgentReplanContext) => {
    if (loading) return;
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: '请依据地图真实耗时和时间冲突重新编排行程，保留必去点与住宿安排。',
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    onGenerationStart?.();
    const hide = message.loading('真实路线存在时间冲突，正在重新编排…', 0);

    try {
      const apiMessages = nextMessages
        .filter((item) => item.id !== 'welcome' && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content }));
      const { reply, plan, plans, itinerary, plansIncomplete } = await sendAgentChat({
        messages: apiMessages,
        context: {
          city: searchCity,
          dayTitle: day?.title,
          planDateLabel: activeDateLabel,
          planStartDate,
          activeDayIndex,
          existingStopNames: displayStops.map((stop) => stop.name),
          totalDays: days.length,
          stopsByDay: days.map((item, index) => ({
            dayIndex: index,
            dayTitle: item.title,
            stopNames: item.stops.map((stop) => stop.name),
          })),
          clarificationAnswers,
          clarificationCount: 3,
          skipClarification: true,
          replan,
        },
      });
      const merged = plans && plans.length > 1 ? mergePlansForApply(plans, plan, itinerary) : null;
      const generatedPlans = merged?.plans ?? plans ?? (plan ? [plan] : []);
      const singlePlan = plan ?? (plans?.length === 1 ? plans[0] : null);
      if (!generatedPlans.length) {
        message.error('重排服务未返回可应用的行程，请手动调整站点');
        onGenerationFailed?.();
        return;
      }
      const replanMessageId = uid();
      setMessages((previous) => [
        ...previous,
        {
          id: replanMessageId,
          role: 'assistant',
          content: reply,
          plan: merged ? undefined : singlePlan ? { ...singlePlan, dayIndex: singlePlan.dayIndex ?? activeDayIndex } : undefined,
          plans: merged ? merged.plans : plans && plans.length > 1 ? plans : undefined,
          itinerary: itinerary ?? undefined,
          plansIncomplete: plansIncomplete ?? merged?.incomplete,
          replanAttempt: replan.attempt,
          createdAt: Date.now(),
        },
      ]);
      onPlanGenerated?.(generatedPlans);
      message.success('已根据真实路线重新编排，正在写入行程');
      if (merged?.plans.length && merged.plans.length > 1) {
        await applyAllPlans(replanMessageId, merged.plans, itinerary, undefined, replan.attempt, true);
      } else if (singlePlan) {
        await applyPlan(
          replanMessageId,
          { ...singlePlan, dayIndex: singlePlan.dayIndex ?? activeDayIndex },
          replan.attempt,
          true
        );
      }
    } catch (error) {
      console.error(error);
      message.error(describeApiError(error));
      onGenerationFailed?.();
    } finally {
      hide();
      setLoading(false);
    }
  };

  const handleApplyOutcome = async (outcome: AgentApplyOutcome, replanAttempt: number) => {
    if (outcome.status !== 'needs-replan') return;
    if (replanAttempt >= 1) {
      message.error('重排后仍存在时间冲突，已停止自动重排，请在站点详情中手动调整。');
      return;
    }
    await requestReplan(outcome.replan);
  };
  const applyPlan = async (
    msgId: string,
    plan: AgentTripPlan,
    replanAttempt = 0,
    skipOverwriteConfirm = false
  ) => {
    const targetDayIndex = plan.dayIndex ?? activeDayIndex;
    if (!skipOverwriteConfirm) {
      const confirmed = await confirmOverwriteExistingDays({
        days,
        dayIndices: [targetDayIndex],
        planStartDate,
      });
      if (!confirmed) return;
    }

    setApplyingPlanId(msgId);
    const hide = message.loading('正在解析坐标并计算路线…', 0);
    try {
      const resolved = await resolveStopsForAgentPlan(plan, searchCity, (name) => {
        message.warning(`未找到「${name}」，已跳过`);
      });
      if (!resolved.length) {
        message.error('没有可应用的站点，请检查高德 Key 或地点名称');
        return;
      }
      const outcome = await onApplyPlan(plan, resolved, targetDayIndex, replanAttempt);
      await handleApplyOutcome(outcome, replanAttempt);
    } catch (e) {
      console.error(e);
      message.error('应用路线失败');
    } finally {
      hide();
      setApplyingPlanId(null);
    }
  };

  const applyAllPlans = async (
    msgId: string,
    plans: AgentTripPlan[],
    itinerary?: AgentItineraryMeta | null,
    extraPlan?: AgentTripPlan | null,
    replanAttempt = 0,
    skipOverwriteConfirm = false
  ) => {
    const { plans: normalized, incomplete } = mergePlansForApply(plans, extraPlan, itinerary);
    if (!skipOverwriteConfirm) {
      const confirmed = await confirmOverwriteExistingDays({
        days,
        dayIndices: normalized.map((p) => p.dayIndex ?? 0),
        planStartDate,
      });
      if (!confirmed) return;
    }

    setApplyingPlanId(msgId);
    if (incomplete) {
      message.warning(
        `行程不完整：应有 ${itinerary?.totalDays ?? '?'} 天，实际 ${normalized.length} 天。将先应用已有天数，请继续补全缺失日期。`
      );
    }
    const hide = message.loading(`正在应用 ${normalized.length} 日行程…`, 0);
    try {
      const items: Array<{ plan: AgentTripPlan; resolved: ResolvedAgentStop[] }> = [];
      const skippedDays: number[] = [];
      const failedDays: number[] = [];

      for (const plan of normalized) {
        try {
          const resolved = await resolveStopsForAgentPlan(plan, searchCity, (name) => {
            message.warning(`未找到「${name}」，已跳过`);
          });
          if (!resolved.length) {
            skippedDays.push((plan.dayIndex ?? 0) + 1);
            continue;
          }
          items.push({ plan, resolved });
        } catch (e) {
          console.error(e);
          failedDays.push((plan.dayIndex ?? 0) + 1);
        }
      }

      if (!items.length) {
        message.error('没有可应用的站点');
        return;
      }

      const outcome = await onApplyPlans(items, replanAttempt);
      await handleApplyOutcome(outcome, replanAttempt);

      if (skippedDays.length) {
        message.warning(`第 ${skippedDays.join('、')} 天因坐标解析失败未写入`);
      }
      if (failedDays.length) {
        message.warning(`第 ${failedDays.join('、')} 天因路线计算失败未写入`);
      }
    } catch (e) {
      console.error(e);
      message.error('应用多日行程失败');
    } finally {
      hide();
      setApplyingPlanId(null);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'free-agent-panel free-agent-panel--embedded flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white'
          : 'free-agent-panel flex min-h-0 min-w-[min(100%,340px)] w-full max-w-md flex-[5] flex-col overflow-hidden rounded-2xl bg-white shadow-sm'
      }
    >
      <div className="free-agent-header shrink-0 border-b border-slate-100 px-4 py-3">
        {!embedded && (
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                <CompassOutlined />
              </span>
              <div>
                <Text strong className="block text-base text-slate-800">
                  路线规划
                </Text>
              </div>
            </div>
            <Tag
              bordered={false}
              color={
                llmStatus === 'connected' ? 'success' : llmStatus === 'checking' ? 'default' : 'error'
              }
              className="!m-0 shrink-0"
            >
              {llmStatus === 'checking'
                ? '连接中…'
                : llmStatus === 'connected'
                  ? '已连接'
                  : '未连接'}
            </Tag>
          </div>
        )}
        {embedded && (
          <div className="mb-2 flex justify-end">
            <Tag
              bordered={false}
              color={
                llmStatus === 'connected' ? 'success' : llmStatus === 'checking' ? 'default' : 'error'
              }
              className="!m-0"
            >
              {llmStatus === 'checking'
                ? '连接中…'
                : llmStatus === 'connected'
                  ? '已连接'
                  : '未连接'}
            </Tag>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Text className="mb-1 block text-[11px] text-slate-500">旅程起始日</Text>
            <DatePicker
              className="w-full"
              size="small"
              value={planStartDate ? dayjs(planStartDate) : null}
              onChange={(d) => onSetPlanStartDate(d ? d.format('YYYY-MM-DD') : null)}
              allowClear
              placeholder="选择第 1 天"
              format="YYYY-MM-DD"
            />
          </div>
          <Collapse
            ghost
            size="small"
            className="trip-calendar-collapse !mb-0 min-w-[100px]"
            items={[
              {
                key: 'cal',
                label: <span className="text-xs text-slate-600">展开日历</span>,
                children: (
                  <Calendar
                    fullscreen={false}
                    className="map-workspace-calendar rounded border border-slate-100"
                    value={
                      planStartDate
                        ? dayjs(planStartDate).add(activeDayIndex, 'day')
                        : undefined
                    }
                    onSelect={(d) => {
                      if (planStartDate) {
                        const start = dayjs(planStartDate);
                        const diff = d.startOf('day').diff(start.startOf('day'), 'day');
                        if (diff >= 0 && diff < days.length) {
                          onSetActiveDay(diff);
                        } else if (diff >= 0) {
                          message.info('请先在下方添加足够的天数');
                        }
                      } else {
                        onSetPlanStartDate(d.format('YYYY-MM-DD'));
                        onSetActiveDay(0);
                      }
                    }}
                  />
                ),
              },
            ]}
          />
        </div>

        {activeDateLabel && (
          <Tag bordered={false} className="mb-2 !bg-zinc-100 !text-zinc-700">
            当前规划：{activeDateLabel}
          </Tag>
        )}

        {llmStatus === 'disconnected' && (
          <Text type="danger" className="mb-2 block text-xs">
            规划服务暂不可用。请确认后端服务已启动且接口配置正确。
          </Text>
        )}

        <Text className="mb-1 block text-[11px] text-slate-500">导出到哪一天</Text>
        <div className="flex flex-wrap items-center gap-1.5">
          {days.map((d, i) => {
            const cal = planDayLabel(planStartDate, d.dayIndex);
            const active = i === activeDayIndex;
            return (
              <Button
                key={d.dayIndex}
                size="small"
                type={active ? 'primary' : 'default'}
                className={active ? 'agent-day-active' : ''}
                onClick={() => onSetActiveDay(i)}
              >
                {d.title}
                {cal ? <span className="opacity-80"> · {cal}</span> : null}
              </Button>
            );
          })}
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAddDay}>
            新一天
          </Button>
          <Button
            size="small"
            type="text"
            onClick={() => {
              setMessages([WELCOME]);
              setClarificationAnswers({});
              setClarificationCount(0);
              setSkipClarifications(false);
              message.info('对话已清空');
            }}
          >
            清空对话
          </Button>
          <Button size="small" type="text" danger icon={<ClearOutlined />} onClick={onClearTrip}>
            清空站点
          </Button>
        </div>

        {displayStops.length > 0 && (
          <Text type="secondary" className="mt-1 block text-[10px]">
            当前日已有 {displayStops.length} 站 · 右侧「当日详情与站点」可编辑
          </Text>
        )}
      </div>

      <div ref={scrollRef} className="free-agent-messages min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <Space direction="vertical" size="middle" className="w-full">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-row chat-row--${m.role}`}
            >
              {m.role === 'assistant' && (
                <span className="chat-avatar chat-avatar--ai" aria-hidden>
                  <CompassOutlined />
                </span>
              )}
              <div
                className={`agent-bubble max-w-[88%] text-sm leading-relaxed ${
                  m.role === 'user' ? 'agent-bubble--user' : 'agent-bubble--assistant'
                }`}
              >
                <Paragraph
                  className={`!mb-0 whitespace-pre-wrap ${m.role === 'user' ? '!text-white' : ''}`}
                >
                  {m.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                    part.startsWith('**') && part.endsWith('**') ? (
                      <strong key={i}>{part.slice(2, -2)}</strong>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </Paragraph>
                {m.clarification && (
                  <ClarificationCard
                    clarification={m.clarification}
                    disabled={
                      loading ||
                      skipClarifications ||
                      Boolean(clarificationAnswers[m.clarification.field])
                    }
                    onChoose={(option, detail) => answerClarification(m.clarification!, option, detail)}
                    onSkip={skipClarification}
                  />
                )}
                {m.plans && m.plans.length > 1 && (
                  <MultiItineraryCard
                    plans={m.plans}
                    itinerary={m.itinerary}
                    applying={applyingPlanId === m.id}
                    planStartDate={planStartDate}
                    onApplyAll={() =>
                      void applyAllPlans(
                        m.id,
                        m.plans!,
                        m.itinerary,
                        m.plan ?? undefined,
                        m.replanAttempt ?? 0
                      )
                    }
                  />
                )}
                {(() => {
                  const singlePlan =
                    m.plans?.length === 1 ? m.plans[0] : m.plan ?? undefined;
                  if (!singlePlan || (m.plans?.length ?? 0) > 1) return null;
                  const dayIdx = singlePlan.dayIndex ?? activeDayIndex;
                  const dateLabel = planDayLabel(planStartDate, dayIdx, 'long');
                  const label = dateLabel
                    ? `将行程应用到 ${dateLabel}`
                    : `将行程应用到 ${singlePlan.title ?? `第 ${dayIdx + 1} 天`}`;
                  return (
                    <PlanCard
                      plan={singlePlan}
                      applying={applyingPlanId === m.id}
                      applyLabel={label}
                      onApply={() => void applyPlan(m.id, singlePlan, m.replanAttempt ?? 0)}
                    />
                  );
                })()}
              </div>
              {m.role === 'user' && (
                <span className="chat-avatar chat-avatar--user" aria-hidden>
                  我
                </span>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-row chat-row--assistant">
              <span className="chat-avatar chat-avatar--ai" aria-hidden>
                <CompassOutlined />
              </span>
              <div className="agent-bubble agent-bubble--assistant agent-bubble--typing flex items-center gap-2 px-4 py-3">
                <Spin size="small" />
                <Text type="secondary" className="text-sm">
                  正在思考…
                </Text>
              </div>
            </div>
          )}
        </Space>
      </div>

      <div className="free-agent-input shrink-0 p-3">
        <div className="flex gap-2">
          <TextArea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeDateLabel
                ? `可规划单日或「${days.length}日」连续行程…`
                : '城市、天数、偏好（信息不足我会追问）…'
            }
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={loading || llmStatus !== 'connected'}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="!rounded-xl"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            disabled={!input.trim() || llmStatus !== 'connected'}
            onClick={() => void send()}
            className="agent-send-btn !h-auto !self-end px-3"
          />
        </div>
        <Text type="secondary" className="mt-1.5 block text-center text-[10px]">
          Enter 发送 · Shift+Enter 换行 · 应用后同步至右侧「当日详情与站点」
        </Text>
      </div>
    </div>
  );
}
