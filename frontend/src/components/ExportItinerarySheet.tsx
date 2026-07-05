import { forwardRef } from 'react';
import dayjs from 'dayjs';
import { planDayLabel } from '@/lib/planDate';
import { POI_TYPE_META, poiTypeLabel } from '@/lib/poiTypeMeta';
import { tripNodeCaption, tripSegmentCount } from '@/lib/tripLabels';
import { recomputeTimes } from '@/store/tripStore';
import type { PoiType, TripState } from '@/types/trip';

const TRANS_LABEL: Record<string, string> = {
  driving: '驾车',
  walking: '步行',
  transit: '公交/地铁',
  riding: '骑行',
};

function ExportTypeBadge({ type }: { type: PoiType }) {
  const m = POI_TYPE_META[type] ?? POI_TYPE_META.other;
  return (
    <span
      style={{
        display: 'inline-block',
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
        fontSize: 10,
        lineHeight: '18px',
        padding: '0 6px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

export const ExportItinerarySheet = forwardRef<HTMLDivElement, TripState>(
  function ExportItinerarySheet({ planStartDate, trip }, ref) {
    const hasStops = trip.days.some((d) => d.stops.length > 0);

    return (
      <div
        ref={ref}
        className="export-itinerary-sheet"
        style={{
          width: 720,
          padding: 32,
          background: '#ffffff',
          color: '#1e293b',
          fontFamily: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif',
        }}
      >
        <div style={{ borderBottom: '2px solid #34d399', paddingBottom: 12, marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            Atlas 行程单
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
            导出时间 {dayjs().format('YYYY-MM-DD HH:mm')}
          </p>
          {planStartDate ? (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              旅程起始：{dayjs(planStartDate).locale('zh-cn').format('YYYY年M月D日 dddd')}
            </p>
          ) : null}
        </div>

        {!hasStops ? (
          <p style={{ fontSize: 13, color: '#64748b' }}>暂无行程站点</p>
        ) : (
          <>
            <div style={{ marginBottom: 12, fontSize: 11, color: '#64748b' }}>
              图例：
              {(['scenic', 'food', 'hotel', 'other'] as const).map((t) => (
                <span key={t} style={{ marginRight: 10 }}>
                  <ExportTypeBadge type={t} /> {poiTypeLabel(t)}
                </span>
              ))}
            </div>

            {trip.days.map((d) => {
              const computed = recomputeTimes(d);
              const stops = computed.day.stops;
              if (stops.length === 0) return null;
              const dayCalLong = planDayLabel(planStartDate, d.dayIndex, 'long');
              return (
                <div
                  key={d.dayIndex}
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                    {d.title}
                    {dayCalLong ? ` · ${dayCalLong}` : ''}
                  </h3>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
                    出发 {d.dayStart} · {tripSegmentCount(stops.length)} 段 · {stops.length} 个地点
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>#</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>类型</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>地点</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>到达</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>离开</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>游玩</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>下一站交通</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((s, idx, arr) => (
                        <tr key={s.id}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                            {tripNodeCaption(idx, arr.length, 'short')}
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                            <ExportTypeBadge type={s.type} />
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 500, color: '#1e293b' }}>
                            {s.name}
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            {s.arriveTime ?? '-'}
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            {s.leaveTime ?? '-'}
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            {s.playMinutes} 分
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            {idx < arr.length - 1
                              ? `${TRANS_LABEL[s.transportToNext ?? 'driving'] ?? s.transportToNext}${s.travelMinutesToNext ? ` · ${s.travelMinutesToNext}分` : ''}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {computed.warnings.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: '#b45309' }}>
                      {computed.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }
);
