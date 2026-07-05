import { create } from 'zustand';
import dayjs from 'dayjs';
import {
  emptyTrip,
  normalizeTripState,
  type DayPlan,
  type ModeTripData,
  type TripState,
  type TripStop,
} from '@/types/trip';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function updateTrip(
  s: TripState,
  updater: (data: ModeTripData) => ModeTripData
): TripState {
  return { ...s, trip: updater(s.trip) };
}

export interface TripStore extends TripState {
  setPlanStartDate: (isoDate: string | null) => void;
  setActiveDay: (i: number) => void;
  addDay: () => void;
  updateDay: (dayIndex: number, patch: Partial<Pick<DayPlan, 'title' | 'dayStart'>>) => void;
  addStop: (
    dayIndex: number,
    partial: Omit<TripStop, 'id' | 'playMinutes'> & { playMinutes?: number }
  ) => void;
  updateStop: (dayIndex: number, stopId: string, patch: Partial<TripStop>) => void;
  removeStop: (dayIndex: number, stopId: string) => void;
  reorderStops: (dayIndex: number, orderedIds: string[]) => void;
  setTravelMinutes: (dayIndex: number, stopId: string, minutes: number | undefined) => void;
  replaceDayStops: (
    dayIndex: number,
    stops: Array<Omit<TripStop, 'id'> & { id?: string }>,
    dayPatch?: Partial<Pick<DayPlan, 'title' | 'dayStart'>>
  ) => void;
  ensureDays: (minCount: number) => void;
  replaceMultipleDayStops: (
    entries: Array<{
      dayIndex: number;
      stops: Array<Omit<TripStop, 'id'> & { id?: string }>;
      dayPatch?: Partial<Pick<DayPlan, 'title' | 'dayStart'>>;
    }>
  ) => void;
  loadState: (s: unknown) => void;
  reset: () => void;
}

function timeToHours(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h + (m || 0) / 60;
}

function segmentTravelMinutes(stop: TripStop | undefined, fallback = 30): number {
  const raw = stop?.travelMinutesToNext;
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function recomputeTimes(day: DayPlan): { day: DayPlan; warnings: string[] } {
  const warnings: string[] = [];
  const stops = [...day.stops];
  if (stops.length === 0) return { day: { ...day, stops }, warnings };

  const dayStart = dayjs(`2000-01-01 ${day.dayStart || '09:00'}`);
  let leaveCursor = dayStart;

  for (let i = 0; i < stops.length; i++) {
    const s = { ...stops[i] };
    if (i === 0) {
      const dep = s.departTime ? dayjs(`2000-01-01 ${s.departTime}`) : dayStart;
      s.arriveTime = dep.format('HH:mm');
      leaveCursor = dep.add(s.playMinutes ?? 120, 'minute');
      s.leaveTime = leaveCursor.format('HH:mm');
    } else {
      const travel = segmentTravelMinutes(stops[i - 1]);
      leaveCursor = leaveCursor.add(travel, 'minute');
      s.arriveTime = leaveCursor.format('HH:mm');
      const close = parseClose(s.closeTime);
      if (close != null && timeToHours(s.arriveTime ?? '00:00') > close - 1 / 60) {
        warnings.push(`${s.name}：预计到达 ${s.arriveTime}，可能晚于闭馆 ${s.closeTime}`);
      }
      leaveCursor = leaveCursor.add(s.playMinutes ?? 120, 'minute');
      s.leaveTime = leaveCursor.format('HH:mm');
    }
    stops[i] = s;

    if (i < stops.length - 1) {
      const next = stops[i + 1];
      const closeNext = parseClose(next.closeTime);
      const travel = segmentTravelMinutes(s);
      const eta = leaveCursor.add(travel, 'minute');
      if (closeNext != null && timeToHours(eta.format('HH:mm')) > closeNext) {
        warnings.push(
          `从「${s.name}」出发预计 ${eta.format('HH:mm')} 抵达「${next.name}」，可能无法在 ${next.closeTime} 闭馆前到达。`
        );
      }
    }
  }

  return { day: { ...day, stops }, warnings };
}

function parseClose(s?: string): number | null {
  if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
  return timeToHours(s);
}

function partialsToStops(
  partials: Array<Omit<TripStop, 'id'> & { id?: string }>
): TripStop[] {
  return partials.map((p, i, arr) => ({
    id: p.id ?? uid(),
    playMinutes: p.playMinutes ?? 90,
    transportToNext:
      p.transportToNext ?? (i < arr.length - 1 ? 'driving' : undefined),
    type: p.type ?? 'scenic',
    name: p.name,
    lng: p.lng,
    lat: p.lat,
    departTime: p.departTime,
    note: p.note,
    openTime: p.openTime,
    closeTime: p.closeTime,
    travelMinutesToNext: p.travelMinutesToNext,
  }));
}

function recomputeTripDays(data: ModeTripData): ModeTripData {
  return {
    ...data,
    days: data.days.map((d) => recomputeTimes(d).day),
  };
}

function dayWithRecomputedStops(
  base: DayPlan,
  partials: Array<Omit<TripStop, 'id'> & { id?: string }>,
  dayPatch?: Partial<Pick<DayPlan, 'title' | 'dayStart'>>
): DayPlan {
  return recomputeTimes({
    ...base,
    ...dayPatch,
    stops: partialsToStops(partials),
  }).day;
}

function ensureDaySlots(days: DayPlan[], minIndex: number): DayPlan[] {
  const next = [...days];
  while (next.length <= minIndex) {
    const i = next.length;
    next.push({
      dayIndex: i,
      title: `第 ${i + 1} 天`,
      dayStart: '09:00',
      stops: [],
    });
  }
  return next;
}

export const useTripStore = create<TripStore>((set) => ({
  ...emptyTrip(),

  setPlanStartDate: (planStartDate) => set({ planStartDate }),

  setActiveDay: (activeDayIndex) =>
    set((s) => updateTrip(s, (d) => ({ ...d, activeDayIndex }))),

  addDay: () =>
    set((s) => {
      const cur = s.trip;
      const nextIndex = cur.days.length;
      const newDays = [
        ...cur.days,
        {
          dayIndex: nextIndex,
          title: `第 ${nextIndex + 1} 天`,
          dayStart: '09:00',
          stops: [],
        },
      ];
      return { ...s, trip: { days: newDays, activeDayIndex: nextIndex } };
    }),

  updateDay: (dayIndex, patch) =>
    set((s) =>
      updateTrip(s, (d) => ({
        ...d,
        days: d.days.map((x, i) => {
          if (i !== dayIndex) return x;
          const next = { ...x, ...patch };
          return 'dayStart' in patch ? recomputeTimes(next).day : next;
        }),
      }))
    ),

  addStop: (dayIndex, partial) =>
    set((s) =>
      updateTrip(s, (d) => {
        const stop: TripStop = {
          id: uid(),
          playMinutes: partial.playMinutes ?? 90,
          transportToNext: partial.transportToNext ?? 'driving',
          ...partial,
        };
        const days = d.days.map((x, i) => {
          if (i !== dayIndex) return x;
          return recomputeTimes({ ...x, stops: [...x.stops, stop] }).day;
        });
        return { ...d, days };
      })
    ),

  updateStop: (dayIndex, stopId, patch) =>
    set((s) =>
      updateTrip(s, (d) => ({
        ...d,
        days: d.days.map((x, di) => {
          if (di !== dayIndex) return x;
          const mergedPatch =
            'transportToNext' in patch && !('travelMinutesToNext' in patch)
              ? { ...patch, travelMinutesToNext: undefined }
              : patch;
          const stops = x.stops.map((st) =>
            st.id === stopId ? { ...st, ...mergedPatch } : st
          );
          const next = { ...x, stops };
          const timeKeys = [
            'playMinutes',
            'travelMinutesToNext',
            'transportToNext',
            'departTime',
            'closeTime',
          ];
          return timeKeys.some((k) => k in mergedPatch) ? recomputeTimes(next).day : next;
        }),
      }))
    ),

  removeStop: (dayIndex, stopId) =>
    set((s) =>
      updateTrip(s, (d) => ({
        ...d,
        days: d.days.map((x, i) => {
          if (i !== dayIndex) return x;
          const stops = x.stops.filter((st) => st.id !== stopId);
          if (stops.length > 0) {
            stops[stops.length - 1] = {
              ...stops[stops.length - 1],
              transportToNext: undefined,
              travelMinutesToNext: undefined,
            };
          }
          return recomputeTimes({ ...x, stops }).day;
        }),
      }))
    ),

  reorderStops: (dayIndex, orderedIds) =>
    set((s) =>
      updateTrip(s, (d) => {
        const plan = d.days[dayIndex];
        if (!plan) return d;
        const map = new Map(plan.stops.map((x) => [x.id, x]));
        const stops = orderedIds.map((id) => map.get(id)!).filter(Boolean);
        const days = d.days.map((x, i) =>
          i === dayIndex ? recomputeTimes({ ...x, stops }).day : x
        );
        return { ...d, days };
      })
    ),

  setTravelMinutes: (dayIndex, stopId, minutes) =>
    set((s) =>
      updateTrip(s, (d) => ({
        ...d,
        days: d.days.map((x, di) => {
          if (di !== dayIndex) return x;
          const stops = x.stops.map((st) => {
            if (st.id !== stopId) return st;
            if (st.travelMinutesToNext === minutes) return st;
            return { ...st, travelMinutesToNext: minutes };
          });
          return recomputeTimes({ ...x, stops }).day;
        }),
      }))
    ),

  replaceDayStops: (dayIndex, partials, dayPatch) =>
    set((s) =>
      updateTrip(s, (d) => {
        let days = ensureDaySlots(d.days, dayIndex);
        const base = days[dayIndex];
        days = days.map((x, i) =>
          i === dayIndex ? dayWithRecomputedStops(base, partials, dayPatch) : x
        );
        return { ...d, days };
      })
    ),

  ensureDays: (minCount) =>
    set((s) => {
      const cur = s.trip;
      if (cur.days.length >= minCount) return s;
      const newDays = [...cur.days];
      while (newDays.length < minCount) {
        const nextIndex = newDays.length;
        newDays.push({
          dayIndex: nextIndex,
          title: `第 ${nextIndex + 1} 天`,
          dayStart: '09:00',
          stops: [],
        });
      }
      return { ...s, trip: { ...cur, days: newDays } };
    }),

  replaceMultipleDayStops: (entries) =>
    set((s) =>
      updateTrip(s, (d) => {
        if (!entries.length) return d;

        const maxIdx = Math.max(...entries.map((e) => e.dayIndex));
        let days = ensureDaySlots(d.days, maxIdx);

        const byDay = new Map<
          number,
          {
            dayIndex: number;
            stops: Array<Omit<TripStop, 'id'> & { id?: string }>;
            dayPatch?: Partial<Pick<DayPlan, 'title' | 'dayStart'>>;
          }
        >();
        for (const entry of entries) {
          byDay.set(entry.dayIndex, entry);
        }

        for (const [dayIndex, { stops: partials, dayPatch }] of byDay) {
          if (dayIndex < 0 || dayIndex >= days.length) continue;
          days[dayIndex] = dayWithRecomputedStops(days[dayIndex], partials, dayPatch);
        }
        return { ...d, days };
      })
    ),

  loadState: (raw) =>
    set(() => {
      const normalized = normalizeTripState(raw);
      return {
        ...normalized,
        trip: recomputeTripDays(normalized.trip),
      };
    }),

  reset: () => set(emptyTrip()),
}));

export { recomputeTimes };
