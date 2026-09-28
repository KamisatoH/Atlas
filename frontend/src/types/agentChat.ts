import type { PoiType, StopPriority, TransportMode, TripPace } from '@/types/trip';

export type ChatRole = 'user' | 'assistant' | 'system';

/** 可由选择卡确认的行程偏好。城市、天数等开放输入仍由普通对话处理。 */
export type ClarificationField =
  | 'pace'
  | 'interest'
  | 'transport'
  | 'companions'
  | 'budget'
  | 'startArea'
  | 'accommodation'
  | 'arrival'
  | 'eventTime'
  | 'afterEvent';

export interface AgentClarificationOption {
  value: string;
  label: string;
  description?: string;
  /** 选择后需要补充酒店区域、车站或到达时间等具体信息。 */
  requiresDetail?: boolean;
  detailPlaceholder?: string;
}

/** 模型返回的结构化澄清问题，由前端直接渲染为选择卡。 */
export interface AgentClarification {
  field: ClarificationField;
  question: string;
  options: AgentClarificationOption[];
  allowSkip?: boolean;
}

export type AgentClarificationAnswers = Partial<Record<ClarificationField, string>>;

export interface AgentReplanContext {
  /** 同一份方案最多允许一次基于真实路线的模型重排。 */
  attempt: number;
  days: Array<{
    dayIndex: number;
    title: string;
    dayStart: string;
    endTime: string;
    totalTravelMinutes: number;
    totalVisitMinutes: number;
    totalScheduledMinutes: number;
    issues: Array<{ code: string; stopName?: string; message: string }>;
    stops: Array<{
      name: string;
      type: PoiType;
      priority?: StopPriority;
      playMinutes: number;
      openTime?: string;
      closeTime?: string;
      arriveTime?: string;
      leaveTime?: string;
      travelMinutesToNext?: number;
      transportToNext?: TransportMode;
    }>;
  }>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** 单日路线（与 plans 二选一或 plans 仅含一项时填充） */
  plan?: AgentTripPlan | null;
  /** 多日连续行程 */
  plans?: AgentTripPlan[] | null;
  /** 多日行程元信息 */
  itinerary?: AgentItineraryMeta | null;
  /** 返回的 plans 少于 totalDays */
  plansIncomplete?: boolean;
  /** 需要用户确认的单个偏好问题。 */
  clarification?: AgentClarification | null;
  /** 该方案是否已由真实路线约束触发过一次重排。 */
  replanAttempt?: number;
  createdAt: number;
}

/** 大模型返回的结构化行程（坐标可在前端用高德补全） */
export interface AgentPlanStop {
  name: string;
  lng?: number;
  lat?: number;
  type?: PoiType;
  playMinutes?: number;
  /** 仅 optional 站点会在时间冲突无法修复时被自动移除。 */
  priority?: StopPriority;
  note?: string;
  openTime?: string;
  closeTime?: string;
  /** 前往下一站的交通方式（最后一站无需设置） */
  transportToNext?: TransportMode;
}

export interface AgentTripPlan {
  city?: string;
  title?: string;
  dayStart?: string;
  /** 本日节奏；决定用餐、午后休整等自然时间块的强度。 */
  pace?: TripPace;
  /** 目标日程索引（0 起），与当前选中的「第 N 天」对应 */
  dayIndex?: number;
  stops: AgentPlanStop[];
  /** AI 选用的出行策略说明，如「低预算 · 公交为主」 */
  transportSummary?: string;
}

/** 多日行程整体说明（可选） */
export interface AgentItineraryMeta {
  city?: string;
  /** 如「杭州三日慢游」 */
  title?: string;
  totalDays?: number;
}

export interface AgentChatContext {
  city?: string | null;
  dayTitle?: string;
  planDateLabel?: string | null;
  planStartDate?: string | null;
  activeDayIndex?: number;
  existingStopNames?: string[];
  /** 当前行程总天数 */
  totalDays?: number;
  /** 各日已有站点摘要，供多日增量规划 */
  stopsByDay?: Array<{ dayIndex: number; dayTitle?: string; stopNames: string[] }>;
  /** 已由选择卡确认的偏好；后端据此避免重复提问。 */
  clarificationAnswers?: AgentClarificationAnswers;
  /** 本轮会话已经主动展示过的选择卡数量，最多为 3。 */
  clarificationCount?: number;
  /** 用户选择按默认偏好直接生成时为 true。 */
  skipClarification?: boolean;
  /** 高德实测路线校验失败时传入；模型只能重排，不得追问。 */
  replan?: AgentReplanContext;
}

export interface AgentChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  context?: AgentChatContext;
}

export interface AgentChatResponse {
  reply: string;
  source: 'openai';
  plan?: AgentTripPlan | null;
  /** 多日连续行程；长度 >1 时前端展示「应用全部」 */
  plans?: AgentTripPlan[] | null;
  itinerary?: AgentItineraryMeta | null;
  /** plans 少于 itinerary.totalDays 时为 true */
  plansIncomplete?: boolean;
  clarification?: AgentClarification | null;
  /** 该方案是否已由真实路线约束触发过一次重排。 */
  replanAttempt?: number;
}
