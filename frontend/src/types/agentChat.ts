import type { PoiType, TransportMode } from '@/types/trip';

export type ChatRole = 'user' | 'assistant' | 'system';

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
  createdAt: number;
}

/** 大模型返回的结构化行程（坐标可在前端用高德补全） */
export interface AgentPlanStop {
  name: string;
  lng?: number;
  lat?: number;
  type?: PoiType;
  playMinutes?: number;
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
}
