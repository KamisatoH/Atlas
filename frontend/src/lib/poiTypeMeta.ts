import type { PoiType } from '@/types/trip';

export const POI_TYPE_META: Record<
  PoiType,
  { label: string; color: string; bg: string; border: string; antColor: string }
> = {
  scenic: {
    label: '景点',
    color: '#18181b',
    bg: '#f4f4f5',
    border: '#d4d4d8',
    antColor: 'default',
  },
  food: {
    label: '餐饮',
    color: '#3f3f46',
    bg: '#fafafa',
    border: '#e4e4e7',
    antColor: 'default',
  },
  hotel: {
    label: '住宿',
    color: '#27272a',
    bg: '#e4e4e7',
    border: '#a1a1aa',
    antColor: 'default',
  },
  other: {
    label: '其他',
    color: '#52525b',
    bg: '#f4f4f5',
    border: '#d4d4d8',
    antColor: 'default',
  },
};

export function poiTypeLabel(type: PoiType): string {
  return POI_TYPE_META[type]?.label ?? type;
}
