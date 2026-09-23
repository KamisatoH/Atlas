import type { DayPlan, TripPace, TripStop } from '@/types/trip';

export type ScheduleIssueCode =
  | 'before_open'
  | 'after_close'
  | 'day_end_overflow'
  | 'excessive_travel'
  | 'missing_lunch'
  | 'pace_overload';

export type ScheduleIssue = {
  code: ScheduleIssueCode;
  stopId?: string;
  stopName?: string;
  message: string;
  severity: 'warning' | 'error';
};

export type ScheduleOptions = {
  dayEnd?: string;
  transferBufferMinutes?: number;
  closeBufferMinutes?: number;
  maxTravelMinutes?: number;
  fallbackTravelMinutes?: number;
  /** 未设置时沿用 day.pace；手动行程不强行套用 AI 的节奏规则。 */
  pace?: TripPace;
};

export type ScheduleReport = {
  day: DayPlan;
  issues: ScheduleIssue[];
  warnings: string[];
  feasible: boolean;
  totalTravelMinutes: number;
  totalVisitMinutes: number;
  totalWaitMinutes: number;
  totalBufferMinutes: number;
  /** 游玩、通勤及换乘缓冲的合计；用于以真实时间而非站点数衡量节奏。 */
  totalScheduledMinutes: number;
  endTime: string;
};

const DEFAULTS: Omit<Required<ScheduleOptions>, 'pace'> = {
  dayEnd: '21:30',
  transferBufferMinutes: 8,
  closeBufferMinutes: 20,
  maxTravelMinutes: 180,
  fallbackTravelMinutes: 30,
};

function toMinutes(value: string | undefined, fallback: number): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function formatTime(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function travelMinutes(stop: TripStop | undefined, fallback: number): number {
  const value = Number(stop?.travelMinutesToNext);
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : fallback;
}

function overlaps(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start < rangeEnd && end > rangeStart;
}

function lunchRequirement(pace: TripPace | undefined): { minimumMinutes: number; severity: 'warning' | 'error' } | null {
  if (pace === 'relaxed') return { minimumMinutes: 75, severity: 'error' };
  if (pace === 'balanced') return { minimumMinutes: 45, severity: 'warning' };
  return null;
}

type PaceBudget = {
  label: string;
  maxTravelMinutes: number;
  maxVisitMinutes: number;
  maxScheduledMinutes: number;
};

/**
 * 节奏的本体是时间负荷，不是站点数量。
 * 预算包含实际通勤、游玩和每段换乘缓冲；等待开门不计入负荷，但仍会反映在结束时间。
 */
const PACE_BUDGETS: Record<TripPace, PaceBudget> = {
  relaxed: { label: '轻松', maxTravelMinutes: 120, maxVisitMinutes: 360, maxScheduledMinutes: 510 },
  balanced: { label: '均衡', maxTravelMinutes: 180, maxVisitMinutes: 450, maxScheduledMinutes: 630 },
  compact: { label: '紧凑', maxTravelMinutes: 270, maxVisitMinutes: 570, maxScheduledMinutes: 720 },
};

function paceBudget(pace: TripPace | undefined): PaceBudget | null {
  return pace ? PACE_BUDGETS[pace] : null;
}

/**
 * 按真实路段耗时、游玩时长和营业时间推演一天时间轴。
 * 它不依赖地图或 UI，因此也可在行程写入前用于确定性校验与修复。
 */
export function evaluateDaySchedule(day: DayPlan, options?: ScheduleOptions): ScheduleReport {
  const config = { ...DEFAULTS, ...options };
  const issues: ScheduleIssue[] = [];
  const stops = day.stops.map((stop) => ({ ...stop }));
  let cursor = toMinutes(day.dayStart, 9 * 60);
  let totalTravelMinutes = 0;
  let totalVisitMinutes = 0;
  let totalWaitMinutes = 0;
  let totalBufferMinutes = 0;
  const timedStops: Array<{ stop: TripStop; start: number; leave: number }> = [];

  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (index === 0 && stop.departTime) cursor = toMinutes(stop.departTime, cursor);
    const arrive = cursor;
    const open = toMinutes(stop.openTime, -1);
    const close = toMinutes(stop.closeTime, -1);
    const start = open >= 0 && arrive < open ? open : arrive;
    const wait = Math.max(0, start - arrive);
    const visit = Math.max(15, Number(stop.playMinutes) || 90);
    const leave = start + visit;

    stop.arriveTime = formatTime(arrive);
    stop.leaveTime = formatTime(leave);
    timedStops.push({ stop, start, leave });
    totalWaitMinutes += wait;
    totalVisitMinutes += visit;

    if (wait > 0) {
      issues.push({
        code: 'before_open',
        stopId: stop.id,
        stopName: stop.name,
        severity: 'warning',
        message: `「${stop.name}」${stop.arriveTime} 到达，需等待至 ${formatTime(start)} 开门`,
      });
    }
    if (close >= 0 && start > close - config.closeBufferMinutes) {
      issues.push({
        code: 'after_close',
        stopId: stop.id,
        stopName: stop.name,
        severity: 'error',
        message: `「${stop.name}」预计 ${formatTime(start)} 才能开始，距 ${stop.closeTime} 闭馆不足 ${config.closeBufferMinutes} 分钟`,
      });
    } else if (close >= 0 && leave > close) {
      issues.push({
        code: 'after_close',
        stopId: stop.id,
        stopName: stop.name,
        severity: 'error',
        message: `「${stop.name}」预计 ${formatTime(leave)} 离开，晚于 ${stop.closeTime} 闭馆`,
      });
    }

    cursor = leave;
    if (index < stops.length - 1) {
      const travel = travelMinutes(stop, config.fallbackTravelMinutes);
      totalTravelMinutes += travel;
      totalBufferMinutes += config.transferBufferMinutes;
      cursor += travel + config.transferBufferMinutes;
    }
  }

  const dayEnd = toMinutes(config.dayEnd, 21 * 60 + 30);
  if (stops.length > 0 && cursor > dayEnd) {
    issues.push({
      code: 'day_end_overflow',
      severity: 'error',
      message: `预计 ${formatTime(cursor)} 结束，超过默认 ${config.dayEnd} 的可用时间`,
    });
  }
  const selectedPace = config.pace ?? day.pace;
  const budget = paceBudget(selectedPace);
  const totalScheduledMinutes = totalTravelMinutes + totalVisitMinutes + totalBufferMinutes;

  if (!budget && totalTravelMinutes > config.maxTravelMinutes) {
    issues.push({
      code: 'excessive_travel',
      severity: 'warning',
      message: `当日交通约 ${totalTravelMinutes} 分钟，超过建议上限 ${config.maxTravelMinutes} 分钟`,
    });
  }

  if (budget) {
    const exceeded: string[] = [];
    if (totalTravelMinutes > budget.maxTravelMinutes) {
      exceeded.push(`交通 ${totalTravelMinutes}/${budget.maxTravelMinutes} 分钟`);
    }
    if (totalVisitMinutes > budget.maxVisitMinutes) {
      exceeded.push(`游玩 ${totalVisitMinutes}/${budget.maxVisitMinutes} 分钟`);
    }
    if (totalScheduledMinutes > budget.maxScheduledMinutes) {
      exceeded.push(`通勤+游玩+换乘 ${totalScheduledMinutes}/${budget.maxScheduledMinutes} 分钟`);
    }
    if (exceeded.length) {
      issues.push({
        code: 'pace_overload',
        severity: 'error',
        message: `「${budget.label}」节奏超出真实时间预算：${exceeded.join('，')}；请减少跨区往返、缩短游玩或移除非必去站点`,
      });
    }
  }

  const lunch = lunchRequirement(selectedPace);
  if (lunch) {
    const lunchStart = 11 * 60 + 30;
    const lunchEnd = 13 * 60 + 30;
    const lunchStop = timedStops.find(
      ({ stop, start, leave }) =>
        stop.type === 'food' &&
        leave - start >= lunch.minimumMinutes &&
        overlaps(start, leave, lunchStart, lunchEnd)
    );
    if (!lunchStop) {
      const label = selectedPace === 'relaxed' ? '午餐与饭后休整' : '午餐';
      issues.push({
        code: 'missing_lunch',
        severity: lunch.severity,
        message: `未在 11:30～13:30 安排不少于 ${lunch.minimumMinutes} 分钟的${label}时间块`,
      });
    }
  }

  return {
    day: { ...day, stops },
    issues,
    warnings: issues.map((issue) => issue.message),
    feasible: !issues.some((issue) => issue.severity === 'error'),
    totalTravelMinutes,
    totalVisitMinutes,
    totalWaitMinutes,
    totalBufferMinutes,
    totalScheduledMinutes,
    endTime: formatTime(cursor),
  };
}

export function scheduleScore(report: ScheduleReport): number {
  const errors = report.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = report.issues.length - errors;
  return errors * 100_000 + warnings * 1_000 + report.totalScheduledMinutes + report.totalWaitMinutes;
}
