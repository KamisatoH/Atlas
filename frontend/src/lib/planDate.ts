import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

/** 旅程第 dayIndex 天对应的公历日期文案；无起始日则返回 null */
export function planDayLabel(
  planStartDate: string | null | undefined,
  dayIndex: number,
  style: 'short' | 'long' = 'short'
): string | null {
  if (!planStartDate) return null;
  const d = dayjs(planStartDate).add(dayIndex, 'day');
  if (!d.isValid()) return null;
  if (style === 'long') {
    return d.locale('zh-cn').format('YYYY年M月D日 dddd');
  }
  return d.locale('zh-cn').format('M月D日');
}
