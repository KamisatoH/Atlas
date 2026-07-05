import type { AgentTripPlan, AgentPlanStop } from '@/types/agentChat';
import { resolvePlaceByName } from '@/lib/resolvePlace';
import { syncStopsTravelTimes } from '@/lib/amapRouteCompare';
import { recomputeTimes } from '@/store/tripStore';
import type { DayPlan, PoiType, TransportMode, TripStop } from '@/types/trip';

export type ResolvedAgentStop = {
  name: string;
  lng: number;
  lat: number;
  type: PoiType;
  playMinutes: number;
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
  dayPatch: Partial<Pick<DayPlan, 'title' | 'dayStart'>>;
  stopCount: number;
};

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
    note: s.note,
    openTime: s.openTime,
    closeTime: s.closeTime,
    transportToNext: s.transportToNext ?? (i < resolved.length - 1 ? 'transit' : undefined),
  }));

  const synced = await syncStopsTravelTimes(tempStops);
  const timed = recomputeTimes({
    dayIndex: targetDayIndex,
    title: dayTitle,
    dayStart: plan.dayStart ?? '09:00',
    stops: synced,
  }).day;
  const partials = timed.stops.map(({ id: _id, arriveTime: _a, leaveTime: _l, ...rest }) => rest);

  return {
    dayIndex: targetDayIndex,
    stops: partials,
    dayPatch: {
      title: dayTitle,
      dayStart: plan.dayStart ?? '09:00',
    },
    stopCount: synced.length,
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
