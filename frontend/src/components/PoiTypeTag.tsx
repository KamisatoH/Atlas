import { Tag } from 'antd';
import { POI_TYPE_META } from '@/lib/poiTypeMeta';
import type { PoiType } from '@/types/trip';

export function PoiTypeTag({ type, className }: { type: PoiType; className?: string }) {
  const meta = POI_TYPE_META[type] ?? POI_TYPE_META.other;
  return (
    <Tag
      bordered={false}
      className={className}
      style={{
        margin: 0,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        fontSize: 10,
        lineHeight: '18px',
        padding: '0 6px',
      }}
    >
      {meta.label}
    </Tag>
  );
}
