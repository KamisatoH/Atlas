import type { AgentItineraryMeta, AgentPlanStop, AgentTripPlan } from '@/types/agentChat';

/**
 * 多日行程应用前归一化 dayIndex：按顺序映射为 startDayIndex..startDayIndex+n-1，
 * 避免 AI 返回重复/错位 dayIndex 导致覆盖或丢失。
 */
export function normalizePlansForApply(
  plans: AgentTripPlan[],
  startDayIndex = 0
): AgentTripPlan[] {
  return [...plans]
    .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
    .map((plan, i) => ({
      ...plan,
      dayIndex: startDayIndex + i,
    }));
}

/** 合并 plans + 误放在 plan 的最后一天，并校验 totalDays；多日时衔接相邻日酒店 */
export function mergePlansForApply(
  plans: AgentTripPlan[],
  extraPlan?: AgentTripPlan | null,
  itinerary?: AgentItineraryMeta | null
): { plans: AgentTripPlan[]; incomplete: boolean } {
  let merged = [...plans];
  if (extraPlan?.stops?.length) {
    const duplicate = merged.some(
      (p) => p.title === extraPlan.title && p.stops.length === extraPlan.stops.length
    );
    if (!duplicate && merged.length >= 2) {
      merged.push(extraPlan);
    }
  }
  const normalized = normalizePlansForApply(merged, 0);
  const linked = linkMultiDayPlansByHotel(normalized);
  const expected = itinerary?.totalDays ?? linked.length;
  return {
    plans: linked,
    incomplete: expected > linked.length,
  };
}

function normalizeStopName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

function stopNamesMatch(a: string, b: string): boolean {
  const na = normalizeStopName(a);
  const nb = normalizeStopName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function findLastHotelIndex(stops: AgentPlanStop[]): number {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].type === 'hotel') return i;
  }
  return -1;
}

function cloneHotelStop(
  hotel: AgentPlanStop,
  overrides: Partial<AgentPlanStop>
): AgentPlanStop {
  return {
    name: hotel.name,
    lng: hotel.lng,
    lat: hotel.lat,
    type: 'hotel',
    playMinutes: hotel.playMinutes ?? 45,
    note: hotel.note,
    openTime: hotel.openTime,
    closeTime: hotel.closeTime,
    ...overrides,
  };
}

/**
 * 多日行程：前一日终点酒店应为下一日起点。
 * 若模型未对齐，应用前自动补全（prepend/append 同一 hotel 站点）。
 */
export function linkMultiDayPlansByHotel(plans: AgentTripPlan[]): AgentTripPlan[] {
  if (plans.length < 2) return plans;

  const result = plans.map((p) => ({ ...p, stops: [...p.stops] }));

  for (let i = 0; i < result.length - 1; i++) {
    const prev = result[i];
    const next = result[i + 1];
    if (!prev.stops.length || !next.stops.length) continue;

    const prevHotelIdx = findLastHotelIndex(prev.stops);
    const prevHotel = prevHotelIdx >= 0 ? prev.stops[prevHotelIdx] : null;
    const nextFirst = next.stops[0];
    const nextFirstIsHotel = nextFirst?.type === 'hotel';

    if (!prevHotel && nextFirstIsHotel) {
      const checkIn = cloneHotelStop(nextFirst, {
        playMinutes: 45,
        note: nextFirst.note?.includes('入住') ? nextFirst.note : '办理入住、放行李',
        transportToNext: undefined,
      });
      if (prev.stops.length > 0) {
        const last = prev.stops[prev.stops.length - 1];
        if (!last.transportToNext) {
          prev.stops[prev.stops.length - 1] = { ...last, transportToNext: 'transit' };
        }
      }
      prev.stops.push(checkIn);
      continue;
    }

    if (!prevHotel) continue;

    if (!nextFirst || !stopNamesMatch(nextFirst.name, prevHotel.name)) {
      next.stops.unshift(
        cloneHotelStop(prevHotel, {
          playMinutes: 30,
          note: '退房取行李后出发',
          transportToNext: nextFirst?.transportToNext ?? 'transit',
        })
      );
      continue;
    }

    if (nextFirst.type !== 'hotel') {
      next.stops[0] = { ...nextFirst, type: 'hotel' };
    }
    const note = next.stops[0].note ?? '';
    if (!note.includes('退')) {
      next.stops[0] = {
        ...next.stops[0],
        note: note ? `${note}；退房后出发` : '退房取行李后出发',
        playMinutes: Math.min(next.stops[0].playMinutes ?? 30, 45),
      };
    }
  }

  return result;
}
