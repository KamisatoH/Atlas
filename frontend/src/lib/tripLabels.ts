/**
 * 行程以「段」为导向：列表首项为用户设定的起点，其后每一行是上一段的终点。
 * index 为 0-based，total 为当日地点数。
 */
export function tripNodeCaption(index: number, total: number, variant: 'short' | 'full'): string {
  if (total <= 0) return '';
  if (total === 1) return variant === 'short' ? '起' : '起点';
  if (index === 0) return variant === 'short' ? '起' : '起点';
  if (index === total - 1) return variant === 'short' ? '终' : '终点';
  return variant === 'short' ? String(index) : `第 ${index} 段终点`;
}

export function tripSegmentCount(stopsLength: number): number {
  return Math.max(0, stopsLength - 1);
}
