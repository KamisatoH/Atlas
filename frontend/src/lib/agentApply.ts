import type { AgentReplanContext, AgentTripPlan, AgentPlanStop } from '@/types/agentChat';
import { resolvePlaceByName } from '@/lib/resolvePlace';
import { syncStopsTravelTimes } from '@/lib/amapRouteCompare';
import { evaluateDaySchedule, scheduleScore, type ScheduleReport } from '@/lib/scheduleEngine';
import { recomputeTimes } from '@/store/tripStore';
import type { DayPlan, PoiType, StopPriority, TransportMode, TripPace, TripStop } from '@/types/trip';

export type ResolvedAgentStop = {
  name: string;
  lng: number;
  lat: number;
  type: PoiType;
  playMinutes: number;
  priority?: StopPriority;
  note?: string;
  openTime?: string;
  closeTime?: string;
  transportToNext?: TransportMode;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function resolveStopsForAgentPlan(
  plan: AgentTripPlan,
  searchCity: string | null,
  onSkip?: (name: string) => void
): Promise<ResolvedAgentStop[]> {
  const city = plan.city ?? searchCity;
  const resolved: ResolvedAgentStop[] = [];

  for (const stop of plan.stops) {
    let hit: { name: string; lng: number; lat: number } | null = null;

    if (stop.lng != null && stop.lat != null && stop.lng !== 0 && stop.lat !== 0) {
      hit = { name: stop.name, lng: stop.lng, lat: stop.lat };
    } else {
      const found = await resolvePlaceByName(stop.name, city);
      if (!found) {
        onSkip?.(stop.name);
        continue;
      }
      hit = found;
    }

    resolved.push({
      name: hit.name,
      lng: hit.lng,
      lat: hit.lat,
      type: (stop.type ?? 'scenic') as PoiType,
      playMinutes: stop.playMinutes ?? 90,
      priority: stop.priority ?? 'recommended',
      note: stop.note,
      openTime: stop.openTime,
      closeTime: stop.closeTime,
      transportToNext: stop.transportToNext ?? 'transit',
    });
  }

  if (resolved.length > 0) {
    resolved[resolved.length - 1].transportToNext = undefined;
  }
  return resolved;
}

export type PreparedAgentDayEntry = {
  dayIndex: number;
  stops: Array<Omit<TripStop, 'id'>>;
  dayPatch: Partial<Pick<DayPlan, 'title' | 'dayStart' | 'pace'>>;
  stopCount: number;
  schedule: ScheduleReport;
  repairs: ScheduleRepair[];
};

export type ScheduleRepair = {
  kind: 'reordered' | 'removed_optional';
  detail: string;
};

function closeSortValue(stop: TripStop): number {
  if (!stop.closeTime || !/^\d{1,2}:\d{2}$/.test(stop.closeTime)) return Number.MAX_SAFE_INTEGER;
  const [hour, minute] = stop.closeTime.split(':').map(Number);
  return hour * 60 + minute;
}

function reorderClosingFirst(stops: TripStop[]): TripStop[] {
  if (stops.length < 3) return stops.map((stop) => ({ ...stop }));
  const keepFirst = stops[0]?.type === 'hotel' ? [stops[0]] : [];
  const keepLast = stops[stops.length - 1]?.type === 'hotel' ? [stops[stops.length - 1]] : [];
  const middle = stops.slice(keepFirst.length, stops.length - keepLast.length);
  return [
    ...keepFirst,
    ...middle.slice().sort((a, b) => closeSortValue(a) - closeSortValue(b)),
    ...keepLast,
  ].map((stop) => ({ ...stop }));
}

function sameOrder(left: TripStop[], right: TripStop[]): boolean {
  return left.length === right.length && left.every((stop, index) => stop.id === right[index]?.id);
}

async function timeStops(
  stops: TripStop[],
  dayIndex: number,
  dayTitle: string,
  dayStart: string,
  pace: TripPace | undefined
): Promise<{ stops: TripStop[]; schedule: ScheduleReport }> {
  const synced = await syncStopsTravelTimes(stops);
  const schedule = evaluateDaySchedule({ dayIndex, title: dayTitle, dayStart, pace, stops: synced });
  return { stops: schedule.day.stops, schedule };
}

async function repairTimedStops(
  initialStops: TripStop[],
  dayIndex: number,
  dayTitle: string,
  dayStart: string,
  pace: TripPace | undefined
): Promise<{ stops: TripStop[]; schedule: ScheduleReport; repairs: ScheduleRepair[] }> {
  let candidate = await timeStops(initialStops, dayIndex, dayTitle, dayStart, pace);
  const repairs: ScheduleRepair[] = [];

  if (!candidate.schedule.feasible) {
    const reordered = reorderClosingFirst(candidate.stops);
    if (!sameOrder(reordered, candidate.stops)) {
      const trial = await timeStops(reordered, dayIndex, dayTitle, dayStart, pace);
      if (scheduleScore(trial.schedule) < scheduleScore(candidate.schedule)) {
        candidate = trial;
        repairs.push({ kind: 'reordered', detail: '已将较早闭馆的地点提前安排' });
      }
    }
  }

  while (!candidate.schedule.feasible) {
    const offendingIds = new Set(
      candidate.schedule.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.stopId)
    );
    const optional = candidate.stops
      .filter((stop) => stop.priority === 'optional' && stop.type !== 'hotel')
      .sort((a, b) => Number(offendingIds.has(b.id)) - Number(offendingIds.has(a.id)));
    const removable = optional[0];
    if (!removable || candidate.stops.length <= 2) break;

    const trialStops = candidate.stops.filter((stop) => stop.id !== removable.id);
    const trial = await timeStops(trialStops, dayIndex, dayTitle, dayStart, pace);
    if (scheduleScore(trial.schedule) >= scheduleScore(candidate.schedule)) break;
    candidate = trial;
    repairs.push({ kind: 'removed_optional', detail: `已移除可选地点「${removable.name}」以满足时间约束` });
  }

  return { ...candidate, repairs };
}

export type AgentApplyOutcome =
  | { status: 'applied' }
  | { status: 'needs-replan'; replan: AgentReplanContext };

export function buildReplanContext(
  entries: PreparedAgentDayEntry[],
  attempt: number
): AgentReplanContext {
  return {
    attempt,
    days: entries.map((entry) => ({
      dayIndex: entry.dayIndex,
      title: entry.dayPatch.title ?? `第 ${entry.dayIndex + 1} 天`,
      dayStart: entry.dayPatch.dayStart ?? '09:00',
      pace: entry.dayPatch.pace,
      endTime: entry.schedule.endTime,
      totalTravelMinutes: entry.schedule.totalTravelMinutes,
      totalVisitMinutes: entry.schedule.totalVisitMinutes,
      totalScheduledMinutes: entry.schedule.totalScheduledMinutes,
      issues: entry.schedule.issues
        .filter((issue) => issue.severity === 'error')
        .map(({ code, stopName, message }) => ({ code, stopName, message })),
      stops: entry.schedule.day.stops.map((stop) => ({
        name: stop.name,
        type: stop.type,
        priority: stop.priority,
        playMinutes: stop.playMinutes,
        openTime: stop.openTime,
        closeTime: stop.closeTime,
        arriveTime: stop.arriveTime,
        leaveTime: stop.leaveTime,
        travelMinutesToNext: stop.travelMinutesToNext,
        transportToNext: stop.transportToNext,
      })),
    })),
  };
}
/** 解析坐标 + 算路，产出可写入 store 的单日数据 */
export async function prepareAgentDayEntry(
  plan: AgentTripPlan,
  resolved: ResolvedAgentStop[],
  targetDayIndex: number,
  dayTitle: string
): Promise<PreparedAgentDayEntry> {
  const tempStops: TripStop[] = resolved.map((s, i) => ({
    id: uid(),
    name: s.name,
    lng: s.lng,
    lat: s.lat,
    type: s.type,
    playMinutes: s.playMinutes,
    priority: s.priority,
    note: s.note,
    openTime: s.openTime,
    closeTime: s.closeTime,
    transportToNext: s.transportToNext ?? (i < resolved.length - 1 ? 'transit' : undefined),
  }));

  const dayStart = plan.dayStart ?? '09:00';
  const timedResult = await repairTimedStops(tempStops, targetDayIndex, dayTitle, dayStart, plan.pace);
  const timed = recomputeTimes(timedResult.schedule.day).day;
  const partials = timed.stops.map(({ id: _id, arriveTime: _a, leaveTime: _l, ...rest }) => rest);

  return {
    dayIndex: targetDayIndex,
    stops: partials,
    dayPatch: {
      title: dayTitle,
      dayStart,
      pace: plan.pace,
    },
    stopCount: timedResult.stops.length,
    schedule: timedResult.schedule,
    repairs: timedResult.repairs,
  };
}

/** 批量准备多日行程（各日串行；高德 QPS 由 amapRateLimit 统一控制） */
export async function prepareAllAgentDayEntries(
  items: Array<{ plan: AgentTripPlan; resolved: ResolvedAgentStop[] }>,
  getDayTitle: (plan: AgentTripPlan, dayIndex: number) => string
): Promise<{ entries: PreparedAgentDayEntry[]; failedDayLabels: number[] }> {
  const sorted = [...items].sort((a, b) => (a.plan.dayIndex ?? 0) - (b.plan.dayIndex ?? 0));
  const entries: PreparedAgentDayEntry[] = [];
  const failedDayLabels: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const { plan, resolved } = sorted[i];
    const targetDayIndex = plan.dayIndex ?? i;
    try {
      const entry = await prepareAgentDayEntry(
        plan,
        resolved,
        targetDayIndex,
        getDayTitle(plan, targetDayIndex)
      );
      entries.push(entry);
    } catch (e) {
      console.error(`Prepare day ${targetDayIndex + 1} failed:`, e);
      failedDayLabels.push(targetDayIndex + 1);
    }
  }

  return { entries, failedDayLabels };
}

export type { AgentPlanStop };
