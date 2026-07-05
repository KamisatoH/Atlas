export type PoiType = 'scenic' | 'food' | 'hotel' | 'other';

export type TransportMode = 'walking' | 'driving' | 'transit' | 'riding';

export interface TripStop {
  id: string;
  name: string;
  lng: number;
  lat: number;
  type: PoiType;
  /** 当日出发时间（第一站），HH:mm */
  departTime?: string;
  /** 游玩时长（分钟） */
  playMinutes: number;
  arriveTime?: string;
  leaveTime?: string;
  transportToNext?: TransportMode;
  note?: string;
  openTime?: string;
  closeTime?: string;
  /** 到下一站的预估分钟数，由路径规划填充 */
  travelMinutesToNext?: number;
}

export interface DayPlan {
  dayIndex: number;
  title: string;
  /** 当日起点出发时间 */
  dayStart: string;
  stops: TripStop[];
}

export interface ModeTripData {
  days: DayPlan[];
  activeDayIndex: number;
}

export interface TripState {
  /** 旅程第一天（第 1 天）对应的公历日期 YYYY-MM-DD；未选则为 null */
  planStartDate: string | null;
  trip: ModeTripData;
}

/** @deprecated 旧版双模式存档 */
export type PlanMode = 'linear' | 'free';

/** 旧版存档：双模式或单 days */
export type LegacyTripPayload = {
  mode?: PlanMode;
  days?: DayPlan[];
  activeDayIndex?: number;
  planStartDate?: string | null;
  linear?: ModeTripData;
  free?: ModeTripData;
  trip?: ModeTripData;
};

export function initialDayPlans(): DayPlan[] {
  return [
    {
      dayIndex: 0,
      title: '第 1 天',
      dayStart: '09:00',
      stops: [],
    },
  ];
}

function deepCloneDays(days: DayPlan[]): DayPlan[] {
  return JSON.parse(JSON.stringify(days)) as DayPlan[];
}

function clampActiveDayIndex(activeDayIndex: number | undefined, days: DayPlan[]): number {
  if (!days.length) return 0;
  return Math.min(Math.max(0, activeDayIndex ?? 0), days.length - 1);
}

export function emptyModeData(): ModeTripData {
  return {
    days: initialDayPlans(),
    activeDayIndex: 0,
  };
}

export function emptyTrip(): TripState {
  return {
    planStartDate: null,
    trip: emptyModeData(),
  };
}

function totalStops(data: ModeTripData): number {
  return data.days.reduce((n, d) => n + d.stops.length, 0);
}

/** 旧版 linear/free 双分支：取站点更多的一份 */
function pickLegacyBranch(linear: ModeTripData, free: ModeTripData): ModeTripData {
  const l = totalStops(linear);
  const f = totalStops(free);
  if (f > l) return { ...free, days: deepCloneDays(free.days) };
  if (l > f) return { ...linear, days: deepCloneDays(linear.days) };
  const prefer = free.days.length >= linear.days.length ? free : linear;
  return { ...prefer, days: deepCloneDays(prefer.days) };
}

/**
 * 合并新版单 trip 与旧版双模式 / 单 days 存档。
 */
export function normalizeTripState(raw: unknown): TripState {
  if (!raw || typeof raw !== 'object') return emptyTrip();
  const r = raw as LegacyTripPayload;

  if (r.trip && Array.isArray(r.trip.days)) {
    const days = r.trip.days.length ? deepCloneDays(r.trip.days) : initialDayPlans();
    return {
      planStartDate: r.planStartDate ?? null,
      trip: {
        days,
        activeDayIndex: clampActiveDayIndex(r.trip.activeDayIndex, days),
      },
    };
  }

  if (
    r.linear &&
    r.free &&
    Array.isArray(r.linear.days) &&
    Array.isArray(r.free.days)
  ) {
    const picked = pickLegacyBranch(r.linear, r.free);
    return {
      planStartDate: r.planStartDate ?? null,
      trip: {
        days: picked.days,
        activeDayIndex: clampActiveDayIndex(picked.activeDayIndex, picked.days),
      },
    };
  }

  const legacyDays = Array.isArray(r.days) && r.days.length ? deepCloneDays(r.days) : initialDayPlans();
  return {
    planStartDate: r.planStartDate ?? null,
    trip: {
      days: legacyDays,
      activeDayIndex: clampActiveDayIndex(r.activeDayIndex, legacyDays),
    },
  };
}
