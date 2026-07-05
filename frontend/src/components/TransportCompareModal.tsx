import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, List, Modal, Space, Spin, Tag, Typography } from 'antd';
import { compareRoutesBetween, fmtDist, fmtDur, type ComparedRoute } from '@/lib/amapRouteCompare';
import type { TransportMode, TripStop } from '@/types/trip';

const { Text, Paragraph } = Typography;

const MODE_ORDER: TransportMode[] = ['driving', 'transit', 'walking', 'riding'];

function modeLabel(m: TransportMode): string {
  switch (m) {
    case 'driving':
      return '驾车';
    case 'transit':
      return '公交/地铁';
    case 'walking':
      return '步行';
    case 'riding':
      return '骑行';
    default:
      return m;
  }
}

function routeKey(r: ComparedRoute): string {
  return r.optionKey ?? r.mode;
}

function RouteCard({
  route: r,
  onPick,
  onClose,
}: {
  route: ComparedRoute;
  onPick: (mode: TransportMode, durationSec: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Space wrap align="start">
          <Text strong className="max-w-[420px] text-sm leading-snug">
            {r.title}
          </Text>
          {r.policyHint && (
            <Tag bordered={false} color="processing" className="!m-0">
              {r.policyHint}
            </Tag>
          )}
          {r.ok ? (
            <>
              <Tag color="green">{fmtDur(r.durationSec)}</Tag>
              <Tag>{fmtDist(r.distanceM)}</Tag>
            </>
          ) : (
            <Tag color="default">无方案</Tag>
          )}
        </Space>
        {r.ok && (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              onPick(r.mode, r.durationSec);
              onClose();
            }}
          >
            使用此方案
          </Button>
        )}
      </div>
      {!r.ok && r.error && (
        <Text type="secondary" className="text-sm">
          {r.error}
        </Text>
      )}
      {r.ok && r.summary.length > 0 && (
        <ul className="mb-2 mt-1 list-disc pl-5 text-sm text-slate-600">
          {r.summary.slice(0, 8).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {r.ok && r.steps.length > 0 && (
        <Collapse
          size="small"
          items={[
            {
              key: 'steps',
              label: `查看路径 / 换乘明细（${r.steps.length} 条）`,
              children: (
                <List
                  size="small"
                  dataSource={r.steps}
                  renderItem={(item) => (
                    <List.Item className="!px-0 !py-1">
                      <div>
                        <Tag
                          className="mr-2"
                          color={
                            item.title === '地铁'
                              ? 'blue'
                              : item.title === '公交'
                                ? 'orange'
                                : item.title === '步行'
                                  ? 'default'
                                  : 'purple'
                          }
                        >
                          {item.title}
                        </Tag>
                        <Text>{item.detail || item.title}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export function TransportCompareModal({
  open,
  from,
  to,
  currentMode,
  onClose,
  onPick,
  modalTitle,
  showCancelFooter,
  onSkipWithDefaults,
}: {
  open: boolean;
  from: TripStop | null;
  to: TripStop | null;
  currentMode?: TransportMode;
  onClose: () => void;
  onPick: (mode: TransportMode, durationSec: number) => void;
  modalTitle?: string;
  showCancelFooter?: boolean;
  onSkipWithDefaults?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ComparedRoute[]>([]);

  useEffect(() => {
    if (!open || !from || !to) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setRows([]);
    compareRoutesBetween(from, to)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, from?.id, to?.id, from?.lng, from?.lat, to?.lng, to?.lat]);

  const { otherRoutes, transitRoutes } = useMemo(() => {
    const others = rows
      .filter((r) => r.mode !== 'transit')
      .sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode));
    const transits = rows
      .filter((r) => r.mode === 'transit')
      .sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        return a.durationSec - b.durationSec;
      });
    return { otherRoutes: others, transitRoutes: transits };
  }, [rows]);

  const footer = showCancelFooter ? (
    <Space>
      {onSkipWithDefaults && (
        <Button
          onClick={() => {
            onSkipWithDefaults();
            onClose();
          }}
        >
          暂不对比，默认驾车加入
        </Button>
      )}
      <Button onClick={onClose}>取消</Button>
    </Space>
  ) : null;

  return (
    <Modal
      title={modalTitle ?? '选择两地之间的交通方式'}
      open={open}
      onCancel={onClose}
      width={760}
      footer={footer}
      destroyOnClose
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      {from && to && (
        <Paragraph type="secondary" className="!mb-3">
          <Text strong>{from.name}</Text> → <Text strong>{to.name}</Text>
          {currentMode && (
            <Tag color="blue" className="ml-2">
              当前：{modeLabel(currentMode)}
            </Tag>
          )}
        </Paragraph>
      )}

      <Alert
        type="info"
        showIcon
        className="mb-3"
        message="说明"
        description={
          <span>
            公共交通会按<strong>较快捷、少换乘、少步行、较经济、不乘地铁</strong>等策略向高德请求多条方案；
            每条方案展示具体线路（如地铁 1 号线 → 88 路）。选择后仍记为「公交/地铁」交通方式。
          </span>
        }
      />

      {err && <Alert type="error" message={err} className="mb-3" />}

      {loading && (
        <div className="flex justify-center py-12">
          <Spin tip="正在请求驾车 / 步行 / 骑行及多条公交地铁方案…" />
        </div>
      )}

      {!loading && !err && rows.length > 0 && (
        <Space direction="vertical" className="w-full" size="middle">
          {otherRoutes.map((r) => (
            <RouteCard key={routeKey(r)} route={r} onPick={onPick} onClose={onClose} />
          ))}

          {transitRoutes.length > 0 && (
            <div>
              <Text strong className="mb-2 block text-sm text-slate-700">
                公共交通方案
                {transitRoutes.filter((r) => r.ok).length > 1
                  ? `（共 ${transitRoutes.filter((r) => r.ok).length} 条可选）`
                  : null}
              </Text>
              <Space direction="vertical" className="w-full" size="small">
                {transitRoutes.map((r) => (
                  <RouteCard key={routeKey(r)} route={r} onPick={onPick} onClose={onClose} />
                ))}
              </Space>
            </div>
          )}
        </Space>
      )}
    </Modal>
  );
}
