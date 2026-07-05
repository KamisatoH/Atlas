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
  RobotOutlined,
  SendOutlined,
  EnvironmentOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { probeAgentAvailability, sendAgentChat, type LlmConnectionStatus } from '@/api/agentChat';
import { describeApiError } from '@/api/http';
import { mergePlansForApply } from '@/lib/normalizeAgentPlans';
import { confirmOverwriteExistingDays } from '@/lib/confirmTripOverwrite';
import { resolveStopsForAgentPlan, type ResolvedAgentStop } from '@/lib/agentApply';
import { planDayLabel } from '@/lib/planDate';
import { TRANSPORT_LABELS, transportIcon } from '@/lib/transportLabels';
import { PoiTypeTag } from '@/components/PoiTypeTag';
import type { AgentItineraryMeta, AgentTripPlan, ChatMessage } from '@/types/agentChat';
import type { DayPlan, PoiType, TransportMode, TripStop } from '@/types/trip';

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
    '你好，我是 **Atlas 旅行助手**。请告诉我：**城市**、**玩几天**、**偏好**（如低预算/亲子/美食），我会为你规划单日或多日行程。',
  createdAt: Date.now(),
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
    <div className="agent-plan-card mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Text strong className="text-sm text-emerald-800">
          {plan.title ?? '推荐路线'}
        </Text>
        {plan.city && (
          <Tag bordered={false} className="!m-0 !bg-white/80 !text-emerald-700">
            {plan.city}
          </Tag>
        )}
        {plan.dayStart && (
          <Text type="secondary" className="text-xs">
            出发 {plan.dayStart}
          </Text>
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
              <div className="ml-4 mt-0.5 text-xs text-violet-600">
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
        className="!bg-emerald-500 !border-emerald-500"
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
    <div className="agent-multi-plan mt-2 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Text strong className="text-sm text-violet-900">
          {itinerary?.title ?? `${plans.length} 日连续行程`}
        </Text>
        {itinerary?.city && (
          <Tag bordered={false} className="!m-0 !bg-white/80">
            {itinerary.city}
          </Tag>
        )}
        <Tag bordered={false} color="purple" className="!m-0">
          共 {plans.length} 天
          {itinerary?.totalDays != null && itinerary.totalDays > plans.length
            ? ` / ${itinerary.totalDays} 天（不完整）`
            : ''}
        </Tag>
      </div>
      {itinerary?.totalDays != null && itinerary.totalDays > plans.length && (
        <Text type="warning" className="mb-2 block text-xs">
          数据缺少第 {plans.length + 1}～{itinerary.totalDays} 天，应用前请让助手补全
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
              <Text strong className="text-violet-800">
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
        className="!bg-violet-600 !border-violet-600"
      >
        将完整行程应用到日历（{plans.length} 天）
      </Button>
    </div>
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
  embedded = false,
}: {
  planStartDate: string | null;
  day: DayPlan | undefined;
  activeDayIndex: number;
  days: DayPlan[];
  displayStops: TripStop[];
  searchCity: string | null;
  onApplyPlan: (plan: AgentTripPlan, resolved: ResolvedAgentStop[], targetDayIndex: number) => Promise<void>;
  onApplyPlans: (items: Array<{ plan: AgentTripPlan; resolved: ResolvedAgentStop[] }>) => Promise<void>;
  onSetPlanStartDate: (d: string | null) => void;
  onSetActiveDay: (i: number) => void;
  onAddDay: () => void;
  onClearTrip: () => void;
  embedded?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingPlanId, setApplyingPlanId] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmConnectionStatus>('checking');
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

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (llmStatus !== 'connected') {
      message.warning('大模型未连接，请稍候');
      return;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = nextMessages
        .filter((m) => m.id !== 'welcome' && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const { reply, plan, plans, itinerary, plansIncomplete } = await sendAgentChat({
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
        },
      });

      const merged =
        plans && plans.length > 1
          ? mergePlansForApply(plans, plan, itinerary)
          : null;

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: reply,
        plan: merged ? undefined : plan ? { ...plan, dayIndex: plan.dayIndex ?? activeDayIndex } : undefined,
        plans: merged ? merged.plans : plans ?? undefined,
        itinerary: itinerary ?? undefined,
        plansIncomplete: plansIncomplete ?? merged?.incomplete,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setLlmStatus('connected');
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
  ]);

  const applyPlan = async (msgId: string, plan: AgentTripPlan) => {
    const targetDayIndex = plan.dayIndex ?? activeDayIndex;
    const confirmed = await confirmOverwriteExistingDays({
      days,
      dayIndices: [targetDayIndex],
      planStartDate,
    });
    if (!confirmed) return;

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
      await onApplyPlan(plan, resolved, targetDayIndex);
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
    extraPlan?: AgentTripPlan | null
  ) => {
    const { plans: normalized, incomplete } = mergePlansForApply(plans, extraPlan, itinerary);
    const confirmed = await confirmOverwriteExistingDays({
      days,
      dayIndices: normalized.map((p) => p.dayIndex ?? 0),
      planStartDate,
    });
    if (!confirmed) return;

    setApplyingPlanId(msgId);
    if (incomplete) {
      message.warning(
        `行程不完整：应有 ${itinerary?.totalDays ?? '?'} 天，实际 ${normalized.length} 天。将先应用已有天数，请再让助手补全缺失日期。`
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

      await onApplyPlans(items);

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
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <RobotOutlined />
              </span>
              <div>
                <Text strong className="block text-base text-slate-800">
                  Atlas 助手
                </Text>
                <Text type="secondary" className="text-[11px]">
                  对话规划 · 多日行程
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
          <Tag bordered={false} className="mb-2 !bg-violet-50 !text-violet-700">
            当前规划：{activeDateLabel}
          </Tag>
        )}

        {llmStatus === 'disconnected' && (
          <Text type="danger" className="mb-2 block text-xs">
            大模型未连接，请稍候。请确认 server 已启动且 .env 中 API Key 配置正确。
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
                className={active ? '!bg-violet-500 !border-violet-500' : ''}
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
                  <RobotOutlined />
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
                {m.plans && m.plans.length > 1 && (
                  <MultiItineraryCard
                    plans={m.plans}
                    itinerary={m.itinerary}
                    applying={applyingPlanId === m.id}
                    planStartDate={planStartDate}
                    onApplyAll={() =>
                      void applyAllPlans(m.id, m.plans!, m.itinerary, m.plan ?? undefined)
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
                      onApply={() => void applyPlan(m.id, singlePlan)}
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
                <RobotOutlined />
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
