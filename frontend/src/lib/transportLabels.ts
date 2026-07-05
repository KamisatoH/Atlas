import type { TransportMode } from '@/types/trip';

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  driving: '驾车',
  transit: '公交/地铁',
  walking: '步行',
  riding: '骑行',
};

export function transportIcon(mode: TransportMode): string {
  switch (mode) {
    case 'driving':
      return '🚗';
    case 'transit':
      return '🚌';
    case 'walking':
      return '🚶';
    case 'riding':
      return '🚲';
    default:
      return '→';
  }
}
