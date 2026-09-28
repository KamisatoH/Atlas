import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import { POI_TYPE_META } from '@/lib/poiTypeMeta';
import { tripNodeCaption, tripSegmentCount } from '@/lib/tripLabels';
import { PoiTypeTag } from '@/components/PoiTypeTag';
import type { DayPlan, PoiType, TransportMode, TripStop } from '@/types/trip';

const { Text } = Typography;

const TRANS_OPTS: { v: TransportMode; l: string }[] = [
  { v: 'driving', l: '驾车' },
  { v: 'transit', l: '公交/地铁' },
  { v: 'walking', l: '步行' },
  { v: 'riding', l: '骑行' },
];

const POI_TYPE_OPTS = (['scenic', 'food', 'hotel', 'other'] as const).map((value) => ({
  value,
  label: POI_TYPE_META[value].label,
}));

export function DayStopsSection({
  activeDayIndex,
  day,
  displayStops,
  warnings,
  emptyText = '暂无站点，请从上方加入目的地',
  onUpdateDay,
  onUpdateStop,
  onRemoveStop,
  onTransportCompare,
  onReorderStops,
  visible = true,
}: {
  activeDayIndex: number;
  day: DayPlan | undefined;
  displayStops: TripStop[];
  warnings: string[];
  emptyText?: string;
  onUpdateDay: (dayIndex: number, patch: Partial<DayPlan>) => void;
  onUpdateStop: (dayIndex: number, stopId: string, patch: Partial<TripStop>) => void;
  onRemoveStop: (dayIndex: number, stopId: string) => void;
  onTransportCompare: (from: TripStop, to: TripStop) => void;
  onReorderStops: (fromIndex: number, toIndex: number) => void;
  /** 面板从隐藏状态切回可见时，重新初始化表格的横向滚动布局。 */
  visible?: boolean;
}) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [tableScrollY, setTableScrollY] = useState(280);
  const stopsTableWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stopsTableWrapRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      const tableHeader = el.querySelector<HTMLElement>('.ant-table-thead');
      const headerHeight = tableHeader?.offsetHeight ?? 40;
      // Ant Table 的 scroll.y 只控制正文高度，需先扣除表头；否则整个表格
      // 会高于外层容器，最末站点的展开备注会被 overflow 裁掉。
      setTableScrollY(Math.max(96, h - headerHeight - 8));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeDayIndex, day?.dayIndex, displayStops.length, visible]);

  if (!day) return null;

  return (
    <section className="day-stops-section flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="mb-2 shrink-0">
        <Text strong className="section-title !text-sm !normal-case !tracking-normal !text-slate-800">
          当日详情与站点
        </Text>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            size="small"
            className="max-w-[180px]"
            value={day.title}
            onChange={(e) => onUpdateDay(activeDayIndex, { title: e.target.value })}
            addonBefore="标题"
          />
          <Space size={4}>
            <Text className="text-xs text-slate-500">出发</Text>
            <Input
              size="small"
              style={{ width: 72 }}
              value={day.dayStart}
              onChange={(e) => onUpdateDay(activeDayIndex, { dayStart: e.target.value })}
            />
          </Space>
          <Tag bordered={false} className="!m-0 !bg-zinc-100 !text-zinc-600">
            {tripSegmentCount(displayStops.length)} 段 · {displayStops.length} 站
          </Tag>
          <Text type="secondary" className="text-[11px]">
            <span className="desktop-order-hint">拖拽 ≡ 调整顺序</span>
            <span className="mobile-order-hint">使用上下按钮调整顺序</span>
          </Text>
        </div>
      </div>

      <div
        ref={stopsTableWrapRef}
        className="day-stops-scroll min-h-0 flex-1 overflow-x-scroll overflow-y-hidden"
      >
        <div className="day-stops-table h-full min-w-[820px]">
          <Table
            key={`stops-day-${activeDayIndex}-${visible ? 'visible' : 'hidden'}`}
            size="middle"
            pagination={false}
            scroll={{ y: tableScrollY }}
            rowKey="id"
            dataSource={displayStops}
            locale={{ emptyText }}
            expandable={{
              expandedRowKeys: displayStops.map((stop) => stop.id),
              showExpandColumn: false,
              expandedRowClassName: () => 'trip-stop-note-expanded-row',
              expandedRowRender: (record: TripStop) => (
                <label className="trip-stop-note-editor">
                  <span>备注</span>
                  <Input.TextArea
                    value={record.note}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="补充预约、入口、联系人或其他提醒"
                    aria-label={`${record.name}备注`}
                    onChange={(event) =>
                      onUpdateStop(activeDayIndex, record.id, { note: event.target.value })
                    }
                  />
                </label>
              ),
            }}
            onRow={(_, index) => ({
              className:
                dragOverIndex === index
                  ? 'trip-stop-row-drag-over !bg-zinc-100/80'
                  : 'trip-stop-row',
              onDragOver: (e) => {
                e.preventDefault();
                if (index != null) setDragOverIndex(index);
              },
              onDragLeave: () => setDragOverIndex(null),
              onDrop: (e) => {
                e.preventDefault();
                setDragOverIndex(null);
                const from = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isNaN(from) || index == null || from === index) return;
                onReorderStops(from, index);
              },
            })}
            columns={[
            {
              title: '',
              width: 28,
              fixed: 'left',
              render: (_: unknown, __: TripStop, index: number) => (
                <span
                  draggable
                  className="trip-drag-handle inline-flex cursor-grab touch-none text-slate-400 active:cursor-grabbing"
                  title="拖拽调整顺序"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', String(index));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragOverIndex(null)}
                >
                  <HolderOutlined />
                </span>
              ),
            },
            {
              title: '类型',
              width: 72,
              render: (_: unknown, r: TripStop) => (
                <Select
                  size="small"
                  className="w-[68px]"
                  value={r.type}
                  options={POI_TYPE_OPTS}
                  optionRender={(opt) => <PoiTypeTag type={opt.value as PoiType} />}
                  labelRender={() => <PoiTypeTag type={r.type} />}
                  onChange={(v) => onUpdateStop(activeDayIndex, r.id, { type: v as PoiType })}
                />
              ),
            },
            {
              title: '地点',
              width: 180,
              ellipsis: true,
              render: (_: unknown, r: TripStop, i: number) => (
                <div className="min-w-0">
                  <Text type="secondary" className="mb-0.5 block text-xs leading-tight">
                    {tripNodeCaption(i, displayStops.length, 'full')}
                  </Text>
                  <Text strong className="block text-sm leading-tight">
                    {r.name}
                  </Text>
                </div>
              ),
            },
            {
              title: '游玩(分)',
              width: 88,
              render: (_: unknown, r: TripStop) => (
                <InputNumber
                  size="middle"
                  min={0}
                  max={600}
                  className="w-[72px]"
                  value={r.playMinutes}
                  onChange={(v) =>
                    onUpdateStop(activeDayIndex, r.id, {
                      playMinutes: v == null ? 90 : Number(v),
                    })
                  }
                />
              ),
            },
            {
              title: '下一站',
              width: 152,
              render: (_: unknown, r: TripStop, i: number) => {
                if (i >= displayStops.length - 1) {
                  return <Text type="secondary">—</Text>;
                }
                const nextStop = displayStops[i + 1];
                return (
                  <Space direction="vertical" size={0} className="w-full">
                    <Select
                      size="middle"
                      className="w-[112px]"
                      value={r.transportToNext}
                      options={TRANS_OPTS.map((x) => ({ label: x.l, value: x.v }))}
                      onChange={(v) =>
                        onUpdateStop(activeDayIndex, r.id, {
                          transportToNext: v as TransportMode,
                        })
                      }
                    />
                    <Button
                      type="link"
                      size="small"
                      className="!h-auto !p-0 text-[10px]"
                      onClick={() => onTransportCompare(r, nextStop)}
                    >
                      对比交通
                    </Button>
                  </Space>
                );
              },
            },
            {
              title: '闭馆',
              width: 64,
              render: (_: unknown, r: TripStop) => (
                <Input
                  size="small"
                  placeholder="18:00"
                  value={r.closeTime}
                  onChange={(e) =>
                    onUpdateStop(activeDayIndex, r.id, { closeTime: e.target.value })
                  }
                />
              ),
            },
            {
              title: '到/离',
              width: 100,
              render: (_: unknown, r: TripStop) => (
                <Text type="secondary" className="text-[10px]">
                  {r.arriveTime ?? '-'} / {r.leaveTime ?? '-'}
                </Text>
              ),
            },
            {
              title: '',
              width: 36,
              render: (_: unknown, r: TripStop) => (
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => onRemoveStop(activeDayIndex, r.id)}
                />
              ),
            },
            ]}
          />
        </div>

        <div className="mobile-stops-list" aria-label="当日站点编辑">
          {displayStops.length === 0 ? (
            <div className="mobile-stops-empty">{emptyText}</div>
          ) : (
            displayStops.map((stop, index) => {
              const nextStop = displayStops[index + 1];
              const isLast = index === displayStops.length - 1;
              return (
                <article key={stop.id} className="mobile-stop-card">
                  <div className="mobile-stop-card-head">
                    <div className="min-w-0">
                      <Text type="secondary" className="block text-[11px] leading-tight">
                        {tripNodeCaption(index, displayStops.length, 'full')}
                      </Text>
                      <Text strong className="block truncate text-sm text-zinc-900">
                        {stop.name}
                      </Text>
                    </div>
                    <PoiTypeTag type={stop.type} />
                  </div>

                  {(stop.arriveTime || stop.leaveTime) && (
                    <div className="mobile-stop-card-meta">
                      <span>{stop.arriveTime ?? '—'} – {stop.leaveTime ?? '—'}</span>
                    </div>
                  )}

                  <label className="mobile-stop-note-editor">
                    <span>备注</span>
                    <Input.TextArea
                      value={stop.note}
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      placeholder="补充预约、入口、联系人或其他提醒"
                      aria-label={`${stop.name}备注`}
                      onChange={(event) =>
                        onUpdateStop(activeDayIndex, stop.id, { note: event.target.value })
                      }
                    />
                  </label>

                  <div className="mobile-stop-fields">
                    <label>
                      <span>类型</span>
                      <Select
                        size="middle"
                        value={stop.type}
                        options={POI_TYPE_OPTS}
                        onChange={(value) => onUpdateStop(activeDayIndex, stop.id, { type: value as PoiType })}
                      />
                    </label>
                    <label>
                      <span>游玩</span>
                      <InputNumber
                        size="middle"
                        min={0}
                        max={600}
                        controls={false}
                        value={stop.playMinutes}
                        addonAfter="分"
                        onChange={(value) =>
                          onUpdateStop(activeDayIndex, stop.id, {
                            playMinutes: value == null ? 90 : Number(value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>闭馆</span>
                      <Input
                        size="middle"
                        placeholder="未设置"
                        value={stop.closeTime}
                        onChange={(event) => onUpdateStop(activeDayIndex, stop.id, { closeTime: event.target.value })}
                      />
                    </label>
                  </div>

                  {!isLast && nextStop && (
                    <div className="mobile-stop-route">
                      <div className="min-w-0">
                        <span>前往 {nextStop.name}</span>
                        <Select
                          size="middle"
                          value={stop.transportToNext}
                          options={TRANS_OPTS.map((item) => ({ label: item.l, value: item.v }))}
                          onChange={(value) =>
                            onUpdateStop(activeDayIndex, stop.id, { transportToNext: value as TransportMode })
                          }
                        />
                      </div>
                      <Button size="middle" onClick={() => onTransportCompare(stop, nextStop)}>
                        对比
                      </Button>
                    </div>
                  )}

                  <div className="mobile-stop-actions">
                    <Button
                      size="middle"
                      icon={<ArrowUpOutlined />}
                      disabled={index === 0}
                      aria-label={`将${stop.name}上移`}
                      onClick={() => onReorderStops(index, index - 1)}
                    >
                      上移
                    </Button>
                    <Button
                      size="middle"
                      icon={<ArrowDownOutlined />}
                      disabled={isLast}
                      aria-label={`将${stop.name}下移`}
                      onClick={() => onReorderStops(index, index + 1)}
                    >
                      下移
                    </Button>
                    <Button
                      size="middle"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除${stop.name}`}
                      onClick={() => onRemoveStop(activeDayIndex, stop.id)}
                    >
                      删除
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {warnings.length > 0 && (
          <Alert
            className="mt-2 shrink-0 py-1.5"
            type="warning"
            message="时间提醒"
            description={
              <ul className="mb-0 pl-4 text-xs">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            }
          />
        )}
      </div>
    </section>
  );
}
