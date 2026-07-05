import type { PoiType } from '@/types/trip';

export const POI_TYPE_META: Record<
  PoiType,
  { label: string; color: string; bg: string; border: string; antColor: string }
> = {
  scenic: {
    label: '景点',
    color: '#047857',
    bg: '#d1fae5',
    border: '#6ee7b7',
    antColor: 'green',
  },
  food: {
    label: '餐饮',
    color: '#c2410c',
    bg: '#ffedd5',
    border: '#fdba74',
    antColor: 'orange',
  },
  hotel: {
    label: '住宿',
    color: '#1d4ed8',
    bg: '#dbeafe',
    border: '#93c5fd',
    antColor: 'blue',
  },
  other: {
    label: '其他',
    color: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1',
    antColor: 'default',
  },
};

export function poiTypeLabel(type: PoiType): string {
  return POI_TYPE_META[type]?.label ?? type;
}
