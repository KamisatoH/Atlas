import { Modal } from 'antd';
import { planDayLabel } from '@/lib/planDate';
import type { DayPlan } from '@/types/trip';

export function formatDayOverwriteLabel(
  days: DayPlan[],
  dayIndex: number,
  planStartDate: string | null
): string {
  const dateLabel = planDayLabel(planStartDate, dayIndex, 'long');
  const title = days[dayIndex]?.title;
  if (dateLabel && title) return `${dateLabel}（${title}）`;
  if (dateLabel) return dateLabel;
  if (title) return title;
  return `第 ${dayIndex + 1} 天`;
}

/** 应用 AI 行程时会写入、且当前已有站点的 dayIndex */
export function findDaysWithExistingStops(days: DayPlan[], dayIndices: number[]): number[] {
  const unique = [...new Set(dayIndices)].filter((i) => i >= 0 && i < days.length);
  return unique.filter((i) => (days[i]?.stops.length ?? 0) > 0);
}

/** 若目标日已有行程，弹出确认；无冲突则直接通过 */
export function confirmOverwriteExistingDays(options: {
  days: DayPlan[];
  dayIndices: number[];
  planStartDate: string | null;
}): Promise<boolean> {
  const { days, dayIndices, planStartDate } = options;
  const toOverwrite = findDaysWithExistingStops(days, dayIndices);
  if (toOverwrite.length === 0) return Promise.resolve(true);

  const labels = toOverwrite.map((i) => formatDayOverwriteLabel(days, i, planStartDate));

  return new Promise((resolve) => {
    Modal.confirm({
      title: '覆盖已有行程？',
      okText: '确认覆盖',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content:
        labels.length === 1
          ? `「${labels[0]}」已有 ${days[toOverwrite[0]!]!.stops.length} 个站点，应用后将替换该日全部行程，此操作不可撤销。`
          : `以下日期已有行程，应用后将替换对应日的全部站点：\n${toOverwrite
              .map(
                (i) =>
                  `· ${formatDayOverwriteLabel(days, i, planStartDate)}（${days[i]!.stops.length} 站）`
              )
              .join('\n')}`,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
