import {
  Button,
  Calendar,
  Collapse,
  DatePicker,
  Select,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { planDayLabel } from '@/lib/planDate';
import { POI_TYPE_META } from '@/lib/poiTypeMeta';
import { DayStopsSection } from '@/components/DayStopsSection';
import { PoiTypeTag } from '@/components/PoiTypeTag';
import type { PoiHit } from '@/types/poi';
import type { DayPlan, PoiType, TripStop } from '@/types/trip';

const { Text } = Typography;

const POI_TYPE_OPTS = (['scenic', 'food', 'hotel', 'other'] as const).map((value) => ({
  value,
  label: POI_TYPE_META[value].label,
}));

export function TripPanel({
  planStartDate,
  days,
  activeDayIndex,
  day,
  displayStops,
  warnings,
  selectedPoi,
  selectedPoiType,
  onPoiTypeChange,
  onAddToTrip,
  onSetPlanStartDate,
  onSetActiveDay,
  onAddDay,
  onUpdateDay,
  onUpdateStop,
  onRemoveStop,
  onTransportCompare,
  onReorderStops,
  embedded = false,
}: {
  planStartDate: string | null;
  days: DayPlan[];
  activeDayIndex: number;
  day: DayPlan | undefined;
  displayStops: TripStop[];
  warnings: string[];
  selectedPoi: PoiHit | null;
  selectedPoiType: PoiType;
  onPoiTypeChange: (t: PoiType) => void;
  onAddToTrip: () => void;
  onSetPlanStartDate: (d: string | null) => void;
  onSetActiveDay: (i: number) => void;
  onAddDay: () => void;
  onUpdateDay: (dayIndex: number, patch: Partial<DayPlan>) => void;
  onUpdateStop: (dayIndex: number, stopId: string, patch: Partial<TripStop>) => void;
  onRemoveStop: (dayIndex: number, stopId: string) => void;
  onTransportCompare: (from: TripStop, to: TripStop) => void;
  onReorderStops: (fromIndex: number, toIndex: number) => void;
  /** 嵌入 TripPlanningShell 时使用，去掉外层卡片样式 */
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? 'trip-panel trip-panel--embedded flex h-full min-h-0 w-full flex-col overflow-hidden bg-white'
          : 'trip-panel flex min-h-0 min-w-[min(100%,480px)] w-full max-w-2xl flex-[6] flex-col overflow-hidden rounded-2xl bg-white shadow-sm'
      }
    >
      <div className="trip-panel-header shrink-0 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {!embedded ? (
            <Text strong className="text-base text-slate-800">
              行程规划
            </Text>
          ) : (
            <Text strong className="section-title text-sm">
              编辑日程
            </Text>
          )}
          <Button size="small" type="default" className="add-day-btn" icon={<PlusOutlined />} onClick={onAddDay}>
            新的一天
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="trip-panel-setup shrink-0 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Text className="field-label mb-1.5 block">旅程起始日</Text>
              <DatePicker
                className="w-full"
                size="small"
                value={planStartDate ? dayjs(planStartDate) : null}
                onChange={(d) => onSetPlanStartDate(d ? d.format('YYYY-MM-DD') : null)}
                allowClear
                placeholder="选择第 1 天"
                format="YYYY-MM-DD"
              />
            </div>
            <Collapse
              ghost
              size="small"
              className="trip-calendar-collapse !mb-0 min-w-[100px]"
              items={[
                {
                  key: 'cal',
                  label: <span className="text-xs text-slate-600">展开日历</span>,
                  children: (
                    <Calendar
                      fullscreen={false}
                      className="map-workspace-calendar rounded-xl border border-slate-100"
                      value={planStartDate ? dayjs(planStartDate) : undefined}
                      onSelect={(d) => onSetPlanStartDate(d.format('YYYY-MM-DD'))}
                    />
                  ),
                },
              ]}
            />
          </div>

          <Text className="field-label mb-1.5 block">编辑的天</Text>
          <div className="day-chip-row mb-3 flex flex-wrap gap-1.5">
            {days.map((d, i) => {
              const cal = planDayLabel(planStartDate, d.dayIndex);
              const active = i === activeDayIndex;
              return (
                <button
                  key={d.dayIndex}
                  type="button"
                  className={`day-chip ${active ? 'day-chip--active' : ''}`}
                  onClick={() => onSetActiveDay(i)}
                >
                  {d.title}
                  {cal ? <span className="day-chip-date"> · {cal}</span> : null}
                </button>
              );
            })}
          </div>

          {day && (
            <div className="add-to-trip-section px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {selectedPoi ? (
                  <Text strong className="max-w-[200px] truncate text-xs" title={selectedPoi.name}>
                    {selectedPoi.name}
                  </Text>
                ) : (
                  <Text type="secondary" className="text-xs">
                    地图/搜索选点后加入
                  </Text>
                )}
                <Select
                  size="small"
                  value={selectedPoiType}
                  options={POI_TYPE_OPTS}
                  optionRender={(opt) => <PoiTypeTag type={opt.value as PoiType} />}
                  onChange={onPoiTypeChange}
                  className="min-w-[80px]"
                  disabled={!selectedPoi}
                />
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={!selectedPoi}
                  onClick={onAddToTrip}
                >
                  加入{day.title}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 下部：当日详情与站点 — 占据剩余高度 */}
        {day && (
          <DayStopsSection
            activeDayIndex={activeDayIndex}
            day={day}
            displayStops={displayStops}
            warnings={warnings}
            onUpdateDay={onUpdateDay}
            onUpdateStop={onUpdateStop}
            onRemoveStop={onRemoveStop}
            onTransportCompare={onTransportCompare}
            onReorderStops={onReorderStops}
          />
        )}
      </div>
    </div>
  );
}
