import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Layout,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';
import {
  CalendarOutlined,
  CloudUploadOutlined,
  ExportOutlined,
  LoginOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  SaveOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { AmapView } from '@/components/AmapView';
import { ExportItinerarySheet } from '@/components/ExportItinerarySheet';
import { SearchExplorePanel } from '@/components/SearchExplorePanel';
import { TransportCompareModal } from '@/components/TransportCompareModal';
import { FreeAgentPanel } from '@/components/FreeAgentPanel';
import type { ResolvedAgentStop } from '@/lib/agentApply';
import { TripPanel } from '@/components/TripPanel';
import { AgentAssistantEntryButton, AgentAssistantShell } from '@/components/AgentAssistantShell';
import { TripPlanningEntryButton, TripPlanningShell } from '@/components/TripPlanningShell';
import { OnboardingTour } from '@/components/OnboardingTour';
import { ONBOARDING_STEPS } from '@/config/onboardingSteps';
import { isOnboardingCompleted, markOnboardingCompleted } from '@/lib/onboardingStorage';
import { http } from '@/api/http';
import { exportElementToPdf, exportElementToPng } from '@/lib/exportPdf';
import { normalizeCityLabel } from '@/lib/cityLabel';
import { planDayLabel } from '@/lib/planDate';
import { prepareAgentDayEntry, prepareAllAgentDayEntries } from '@/lib/agentApply';
import { useAuthStore, loginRequest, registerRequest } from '@/store/authStore';
import { recomputeTimes, useTripStore } from '@/store/tripStore';
import type { AgentTripPlan } from '@/types/agentChat';
import type { PoiHit } from '@/types/poi';
import type { PoiType, TransportMode, TripState, TripStop } from '@/types/trip';

const { Header, Content } = Layout;
const { Text } = Typography;

const TRANS_OPTS: { v: TransportMode; l: string }[] = [
  { v: 'driving', l: '驾车' },
  { v: 'transit', l: '公交/地铁' },
  { v: 'walking', l: '步行' },
  { v: 'riding', l: '骑行' },
];

function poiHitToTempStop(p: PoiHit): TripStop {
  return {
    id: `pending:${p.lng}:${p.lat}`,
    name: p.name,
    lng: p.lng,
    lat: p.lat,
    type: 'scenic',
    playMinutes: 90,
  };
}

export function MapWorkspace() {
  const planStartDate = useTripStore((s) => s.planStartDate);
  const trip = useTripStore((s) => s.trip);
  const days = trip.days;
  const activeDayIndex = trip.activeDayIndex;
  const setPlanStartDate = useTripStore((s) => s.setPlanStartDate);
  const setActiveDay = useTripStore((s) => s.setActiveDay);
  const addDay = useTripStore((s) => s.addDay);
  const updateDay = useTripStore((s) => s.updateDay);
  const addStop = useTripStore((s) => s.addStop);
  const updateStop = useTripStore((s) => s.updateStop);
  const removeStop = useTripStore((s) => s.removeStop);
  const reorderStops = useTripStore((s) => s.reorderStops);
  const setTravelMinutes = useTripStore((s) => s.setTravelMinutes);
  const replaceDayStops = useTripStore((s) => s.replaceDayStops);
  const replaceMultipleDayStops = useTripStore((s) => s.replaceMultipleDayStops);
  const loadState = useTripStore((s) => s.loadState);
  const reset = useTripStore((s) => s.reset);

  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const restore = useAuthStore((s) => s.restore);
  const clearAuth = useAuthStore((s) => s.clear);

  const [authOpen, setAuthOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [transportPair, setTransportPair] = useState<{ from: TripStop; to: TripStop } | null>(
    null
  );
  const [pendingAddPoi, setPendingAddPoi] = useState<{
    poi: PoiHit;
    type: PoiType;
    fromStop: TripStop;
  } | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<PoiHit | null>(null);
  const [selectedPoiType, setSelectedPoiType] = useState<PoiType>('scenic');
  const [searchCity, setSearchCity] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [tripPanelOpen, setTripPanelOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    if (isOnboardingCompleted()) return;
    const timer = window.setTimeout(() => {
      setAgentPanelOpen(false);
      setTripPanelOpen(false);
      setTourOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  const closeTour = useCallback(() => {
    markOnboardingCompleted();
    setTourOpen(false);
  }, []);

  const replayTour = useCallback(() => {
    setAgentPanelOpen(false);
    setTripPanelOpen(false);
    setTourOpen(true);
  }, []);

  const day = days[activeDayIndex];
  const stops = day?.stops ?? [];

  const stopsTimeKey = day?.stops
    .map(
      (s) =>
        `${s.id}:${s.playMinutes}:${s.travelMinutesToNext ?? ''}:${s.transportToNext ?? ''}:${s.departTime ?? ''}`
    )
    .join('|');

  const computed = useMemo(() => {
    if (!day) return { day: null, warnings: [] as string[] };
    return recomputeTimes(day);
  }, [day, day?.dayStart, stopsTimeKey]);

  const displayStops = computed.day?.stops ?? stops;
  const warnings = computed.warnings;

  const tripPanelSummary = useMemo(() => {
    const totalStops = days.reduce((n, d) => n + d.stops.length, 0);
    if (totalStops === 0) return undefined;
    const dayLabel = day?.title ?? `第 ${activeDayIndex + 1} 天`;
    if (days.length > 1) {
      return `${totalStops} 站 · ${dayLabel}`;
    }
    return `${displayStops.length} 站`;
  }, [days, day?.title, activeDayIndex, displayStops.length]);

  const onSegmentMinutes = useCallback(
    (fromStopId: string, minutes: number) => {
      setTravelMinutes(activeDayIndex, fromStopId, minutes);
    },
    [activeDayIndex, setTravelMinutes]
  );

  const handleSelectPoi = useCallback(
    (p: PoiHit) => {
      setSelectedPoi(p);
      const city = normalizeCityLabel(p.city);
      if (!city) return;
      setSearchCity((prev) => {
        if (prev === city) return prev;
        message.info(`当前城市切换为「${city}」`);
        return city;
      });
    },
    []
  );

  const handleReorderStops = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || !day) return;
      const ids = stops.map((s) => s.id);
      const [removed] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, removed);
      reorderStops(activeDayIndex, ids);
      message.success('已调整站点顺序，到达/离开时间已重新计算');
    },
    [activeDayIndex, day, reorderStops, stops]
  );

  const applyTransportChoice = (fromId: string, mode: TransportMode, durationSec: number) => {
    const minutes = Math.max(1, Math.ceil(durationSec / 60));
    updateStop(activeDayIndex, fromId, {
      transportToNext: mode,
      travelMinutesToNext: minutes,
    });
    const label = TRANS_OPTS.find((x) => x.v === mode)?.l ?? mode;
    message.success(`已使用「${label}」，路段约 ${minutes} 分钟`);
  };

  const commitAddPoiAfterTransport = useCallback(
    (
      poi: PoiHit,
      type: PoiType,
      previousLast: TripStop | null,
      transportMode: TransportMode,
      durationSec: number
    ) => {
      addStop(activeDayIndex, {
        name: poi.name,
        lng: poi.lng,
        lat: poi.lat,
        type,
        playMinutes: 90,
        transportToNext: 'driving',
      });
      if (previousLast) {
        const minutes = Math.max(1, Math.ceil(durationSec / 60));
        updateStop(activeDayIndex, previousLast.id, {
          transportToNext: transportMode,
          travelMinutesToNext: minutes,
        });
      }
      message.success(`已加入行程：${poi.name}`);
      setSelectedPoi(null);
    },
    [activeDayIndex, addStop, updateStop]
  );

  const handleAddPoi = useCallback(
    (p: PoiHit, type: PoiType) => {
      if (stops.length === 0) {
        commitAddPoiAfterTransport(p, type, null, 'driving', 30 * 60);
        return;
      }
      const fromStop = stops[stops.length - 1];
      setPendingAddPoi({ poi: p, type, fromStop: { ...fromStop } });
    },
    [stops, commitAddPoiAfterTransport]
  );

  const handleAddToTrip = () => {
    if (!selectedPoi) {
      message.info('请先在左侧搜索或双击地图选中一个地点');
      return;
    }
    handleAddPoi(selectedPoi, selectedPoiType);
    setTripPanelOpen(true);
  };

  const handleNearbyPoiAdd = useCallback(
    (p: PoiHit) => {
      const city = normalizeCityLabel(p.city);
      if (city) {
        setSearchCity((prev) => {
          if (prev === city) return prev;
          message.info(`当前城市切换为「${city}」`);
          return city;
        });
      }
      handleAddPoi(p, selectedPoiType);
    },
    [handleAddPoi, selectedPoiType]
  );

  const applyOneAgentDay = useCallback(
    async (
      plan: AgentTripPlan,
      resolved: ResolvedAgentStop[],
      targetDayIndex: number,
      options?: { silent?: boolean }
    ) => {
      const dateLabel = planDayLabel(planStartDate, targetDayIndex, 'long');
      const dayTitle =
        plan.title ??
        (dateLabel ? `${dateLabel} 行程` : days[targetDayIndex]?.title ?? `第 ${targetDayIndex + 1} 天`);

      const entry = await prepareAgentDayEntry(plan, resolved, targetDayIndex, dayTitle);
      replaceDayStops(entry.dayIndex, entry.stops, entry.dayPatch);
      setTripPanelOpen(true);

      const city = normalizeCityLabel(plan.city);
      if (city) setSearchCity(city);

      if (!options?.silent) {
        const totalTravel = entry.stops
          .slice(0, -1)
          .reduce((sum, s) => sum + (s.travelMinutesToNext ?? 0), 0);
        message.success(
          `已应用到${dateLabel ?? `第 ${targetDayIndex + 1} 天`}：${entry.stopCount} 站，路段合计约 ${totalTravel} 分钟`
        );
      }

      return entry;
    },
    [days, planStartDate, replaceDayStops]
  );

  const handleApplyAgentPlan = useCallback(
    async (plan: AgentTripPlan, resolved: ResolvedAgentStop[], targetDayIndex: number) => {
      await applyOneAgentDay(plan, resolved, targetDayIndex);
      if (targetDayIndex !== activeDayIndex) {
        setActiveDay(targetDayIndex);
      }
    },
    [activeDayIndex, applyOneAgentDay, setActiveDay]
  );

  const handleApplyAgentPlans = useCallback(
    async (items: Array<{ plan: AgentTripPlan; resolved: ResolvedAgentStop[] }>) => {
      const getDayTitle = (plan: AgentTripPlan, dayIndex: number) => {
        const dateLabel = planDayLabel(planStartDate, dayIndex, 'long');
        return (
          plan.title ??
          (dateLabel ? `${dateLabel} 行程` : days[dayIndex]?.title ?? `第 ${dayIndex + 1} 天`)
        );
      };

      const { entries, failedDayLabels } = await prepareAllAgentDayEntries(items, getDayTitle);

      if (!entries.length) {
        message.error('没有可应用的站点');
        return;
      }

      const city = items.map((x) => normalizeCityLabel(x.plan.city)).find(Boolean);
      if (city) setSearchCity(city);

      replaceMultipleDayStops(entries);
      setActiveDay(entries[0]?.dayIndex ?? 0);
      setTripPanelOpen(true);

      const totalStops = entries.reduce((n, e) => n + e.stopCount, 0);
      const missed = items.length - entries.length;

      if (failedDayLabels.length || missed > 0) {
        const parts: string[] = [];
        if (failedDayLabels.length) parts.push(`第 ${failedDayLabels.join('、')} 天路线计算失败`);
        if (missed > 0) parts.push(`${missed} 天未写入`);
        message.warning(`已应用 ${entries.length} 日（${totalStops} 站）；${parts.join('；')}`);
      } else {
        message.success(`已应用 ${entries.length} 日连续行程，共 ${totalStops} 个站点`);
      }
    },
    [days, planStartDate, replaceMultipleDayStops, setActiveDay]
  );

  const handleClearDayStops = useCallback(() => {
    replaceDayStops(activeDayIndex, []);
    message.success('已清空当前日站点');
  }, [activeDayIndex, replaceDayStops]);

  const snapshot = (): TripState => ({
    planStartDate,
    trip,
  });

  const saveIt = async (name: string) => {
    if (!token) {
      message.warning('请先登录');
      return;
    }
    await http.post('/itineraries', { name, payload: snapshot() });
    message.success('已保存');
    setSaveOpen(false);
  };

  const exportPdf = async () => {
    const el = exportRef.current;
    if (!el) return;
    const hasStops = trip.days.some((d) => d.stops.length);
    if (!hasStops) {
      message.warning('当前行程为空，请先添加目的地后再导出');
      return;
    }
    setExportingPdf(true);
    const hide = message.loading('正在生成 PDF…', 0);
    try {
      await exportElementToPdf(el, `atlas-${dayjs().format('YYYYMMDD-HHmm')}.pdf`);
      message.success('PDF 已导出');
    } catch (e) {
      console.error(e);
      message.error('PDF 导出失败，请重试');
    } finally {
      hide();
      setExportingPdf(false);
    }
  };

  const exportLongImage = async () => {
    const el = exportRef.current;
    if (!el) return;
    const hasStops = trip.days.some((d) => d.stops.length);
    if (!hasStops) {
      message.warning('当前行程为空，请先添加目的地后再导出');
      return;
    }
    const hide = message.loading('正在生成长图…', 0);
    try {
      const dataUrl = await exportElementToPng(el);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `atlas-${dayjs().format('YYYYMMDD-HHmm')}.png`;
      a.click();
      message.success('长图已导出');
    } catch (e) {
      console.error(e);
      message.error('长图导出失败');
    } finally {
      hide();
    }
  };

  const amapKeyMissing = !import.meta.env.VITE_AMAP_KEY;

  return (
    <Layout className="map-workspace-layout flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      <Header className="map-workspace-header !border-0 !px-4 !py-0 sm:!px-5">
        <div className="header-inner flex flex-wrap items-center gap-3 py-2.5">
          <div className="brand-block flex shrink-0 items-center gap-3">
            <span className="brand-logo" aria-hidden>
              A
            </span>
            <div>
              <Text strong className="brand-title block text-[15px] leading-tight tracking-tight">
                Atlas
              </Text>
              <Text className="brand-tagline block text-[11px] leading-none">
                地图 · AI 助手 · 行程
              </Text>
            </div>
          </div>

          <div className="header-nav-pills flex flex-wrap items-center gap-1.5">
            <Button
              type={agentPanelOpen ? 'primary' : 'default'}
              icon={<RobotOutlined />}
              className={`header-nav-btn header-nav-btn--ai ${agentPanelOpen ? 'is-active' : ''}`}
              data-tour="ai-assistant"
              onClick={() => setAgentPanelOpen((v) => !v)}
            >
              {agentPanelOpen ? '收起助手' : 'AI 助手'}
            </Button>
            <Button
              type={tripPanelOpen ? 'primary' : 'default'}
              icon={<CalendarOutlined />}
              className={`header-nav-btn header-nav-btn--trip ${tripPanelOpen ? 'is-active' : ''}`}
              data-tour="trip-planning"
              onClick={() => setTripPanelOpen((v) => !v)}
            >
              {tripPanelOpen ? '收起规划' : '行程规划'}
            </Button>
          </div>

          <div className="header-actions ml-auto flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="text"
              size="small"
              icon={<QuestionCircleOutlined />}
              className="!text-slate-400"
              aria-label="查看使用教程"
              onClick={replayTour}
            >
              教程
            </Button>
            {token ? (
              <Space size="small">
                <span className="user-chip hidden text-xs text-slate-600 sm:inline">{email}</span>
                <Button type="text" size="small" className="!text-slate-500" onClick={() => clearAuth()}>
                  退出
                </Button>
              </Space>
            ) : (
              <Button
                type="default"
                size="small"
                icon={<LoginOutlined />}
                className="header-login-btn"
                onClick={() => setAuthOpen(true)}
              >
                登录
              </Button>
            )}
          </div>
        </div>
      </Header>

      <Content className="workspace-content relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
        {amapKeyMissing && (
          <Alert
            type="warning"
            showIcon
            className="mb-2 shrink-0"
            message="请在 frontend/.env 配置 VITE_AMAP_KEY 后重启开发服务"
          />
        )}

        <div className="workspace-main flex min-h-0 min-w-0 flex-1 gap-3">
          <div className="map-shell relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)]" data-tour="map-explore">
              <SearchExplorePanel
                selectedPoi={selectedPoi}
                searchCity={searchCity}
                onSelectPoi={handleSelectPoi}
                onClearPoi={() => setSelectedPoi(null)}
                onClearCity={() => setSearchCity(null)}
              />
            </div>
            <div className="min-h-0 flex-1" data-tour="map-canvas">
              <AmapView
                stops={stops}
                dayIndex={activeDayIndex}
                onSegmentMinutes={onSegmentMinutes}
                highlightPoi={selectedPoi}
                onMapSelect={handleSelectPoi}
                onNearbyPoiAdd={handleNearbyPoiAdd}
              />
            </div>
            <div className="map-panel-entries" data-tour="map-entries">
              {!agentPanelOpen && (
                <AgentAssistantEntryButton onClick={() => setAgentPanelOpen(true)} />
              )}
              {!tripPanelOpen && (
                <TripPlanningEntryButton
                  summary={tripPanelSummary}
                  onClick={() => setTripPanelOpen(true)}
                />
              )}
            </div>
            <div className="map-footer-hint shrink-0">
              {agentPanelOpen || tripPanelOpen
                ? '路线显示于地图 · 侧栏可对话或编辑行程 · 地图数据 © 高德'
                : '顶栏可打开 AI 助手与行程规划 · 单击地图探索周边 · 地图数据 © 高德'}
            </div>
          </div>

          <AgentAssistantShell open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)}>
            <FreeAgentPanel
              planStartDate={planStartDate}
              day={day}
              days={days}
              activeDayIndex={activeDayIndex}
              displayStops={displayStops}
              searchCity={searchCity}
              onApplyPlan={handleApplyAgentPlan}
              onApplyPlans={handleApplyAgentPlans}
              onSetPlanStartDate={setPlanStartDate}
              onSetActiveDay={setActiveDay}
              onAddDay={addDay}
              onClearTrip={handleClearDayStops}
              embedded
            />
          </AgentAssistantShell>

          <TripPlanningShell open={tripPanelOpen} onClose={() => setTripPanelOpen(false)}>
            <TripPanel
              planStartDate={planStartDate}
              days={days}
              activeDayIndex={activeDayIndex}
              day={day}
              displayStops={displayStops}
              warnings={warnings}
              selectedPoi={selectedPoi}
              selectedPoiType={selectedPoiType}
              onPoiTypeChange={setSelectedPoiType}
              onAddToTrip={handleAddToTrip}
              onSetPlanStartDate={setPlanStartDate}
              onSetActiveDay={setActiveDay}
              onAddDay={addDay}
              onUpdateDay={updateDay}
              onUpdateStop={updateStop}
              onRemoveStop={removeStop}
              onTransportCompare={(from, to) => setTransportPair({ from, to })}
              onReorderStops={handleReorderStops}
              embedded
            />
          </TripPlanningShell>
        </div>

        <div className="workspace-toolbar mt-2 flex shrink-0 flex-wrap items-center gap-1 px-3 py-2" data-tour="toolbar">
          <div className="toolbar-group flex flex-wrap items-center gap-1">
            <span className="toolbar-label">导出</span>
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              loading={exportingPdf}
              onClick={exportPdf}
            >
              PDF
            </Button>
            <Button type="text" size="small" onClick={exportLongImage}>
              长图
            </Button>
            <Button type="text" size="small" icon={<CloudUploadOutlined />} disabled>
              同步高德
            </Button>
          </div>
          {token && (
            <>
              <span className="toolbar-divider hidden sm:block" aria-hidden />
              <div className="toolbar-group flex flex-wrap items-center gap-1">
                <span className="toolbar-label">云端</span>
                <Button type="text" size="small" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>
                  保存
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<UnorderedListOutlined />}
                  onClick={() => setListOpen(true)}
                >
                  我的方案
                </Button>
              </div>
            </>
          )}
          <Button type="text" size="small" danger className="ml-auto !px-2" onClick={reset}>
            清空行程
          </Button>
        </div>

        <div
          className="export-sheet-host"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: 720,
            pointerEvents: 'none',
            visibility: 'hidden',
            overflow: 'hidden',
            height: 0,
          }}
          aria-hidden
        >
          <ExportItinerarySheet ref={exportRef} planStartDate={planStartDate} trip={trip} />
        </div>
      </Content>

      <TransportCompareModal
        open={!!transportPair}
        from={transportPair?.from ?? null}
        to={transportPair?.to ?? null}
        currentMode={transportPair?.from.transportToNext}
        onClose={() => setTransportPair(null)}
        onPick={(m, durationSec) => {
          if (transportPair) applyTransportChoice(transportPair.from.id, m, durationSec);
        }}
      />

      <TransportCompareModal
        open={!!pendingAddPoi}
        modalTitle="加入行程：请选择交通方式"
        showCancelFooter
        onSkipWithDefaults={() => {
          if (!pendingAddPoi) return;
          const { poi, type, fromStop } = pendingAddPoi;
          commitAddPoiAfterTransport(poi, type, fromStop, 'driving', 30 * 60);
          setPendingAddPoi(null);
        }}
        from={pendingAddPoi?.fromStop ?? null}
        to={pendingAddPoi ? poiHitToTempStop(pendingAddPoi.poi) : null}
        currentMode={pendingAddPoi?.fromStop.transportToNext}
        onClose={() => setPendingAddPoi(null)}
        onPick={(m, durationSec) => {
          if (!pendingAddPoi) return;
          const { poi, type, fromStop } = pendingAddPoi;
          commitAddPoiAfterTransport(poi, type, fromStop, m, durationSec);
          setPendingAddPoi(null);
        }}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SaveModal open={saveOpen} onClose={() => setSaveOpen(false)} onSave={saveIt} />
      <ItineraryListDrawer open={listOpen} onClose={() => setListOpen(false)} onLoad={loadState} />

      <OnboardingTour
        open={tourOpen}
        steps={ONBOARDING_STEPS}
        onFinish={closeTour}
        onSkip={closeTour}
      />
    </Layout>
  );
}

function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const submit = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      if (mode === 'login') await loginRequest(v.email, v.password);
      else await registerRequest(v.email, v.password);
      message.success('已登录');
      onClose();
    } catch {
      message.error('失败，请检查邮箱与密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={mode === 'login' ? '登录' : '注册'} destroyOnClose>
      <Form layout="vertical" onFinish={submit}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input type="email" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
          <Input.Password />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            {mode === 'login' ? '登录' : '注册'}
          </Button>
          <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}

function SaveModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [form] = Form.useForm();
  return (
    <Modal open={open} onCancel={onClose} onOk={() => form.submit()} title="保存方案" destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(v) => onSave(String(v.name || '未命名方案'))}>
        <Form.Item name="name" label="方案名称" initialValue="我的旅行方案">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ItineraryListDrawer({
  open,
  onClose,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (s: TripState) => void;
}) {
  const [rows, setRows] = useState<{ id: string; name: string; updatedAt: string }[]>([]);

  const refresh = async () => {
    const { data } = await http.get<{ items: typeof rows }>('/itineraries');
    setRows(data.items);
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  const loadOne = async (id: string) => {
    const { data } = await http.get<{ payload: TripState }>(`/itineraries/${id}`);
    onLoad(data.payload);
    message.success('已加载');
    onClose();
  };

  const remove = async (id: string) => {
    await http.delete(`/itineraries/${id}`);
    message.success('已删除');
    void refresh();
  };

  return (
    <Modal open={open} onCancel={onClose} title="我的方案" footer={null} width={420}>
      <Space direction="vertical" className="w-full">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
          >
            <div>
              <Text strong>{r.name}</Text>
              <br />
              <Text type="secondary" className="text-xs">
                {dayjs(r.updatedAt).format('YYYY-MM-DD HH:mm')}
              </Text>
            </div>
            <Space>
              <Button size="small" type="link" onClick={() => loadOne(r.id)}>
                加载
              </Button>
              <Button size="small" danger type="link" onClick={() => remove(r.id)}>
                删除
              </Button>
            </Space>
          </div>
        ))}
        {rows.length === 0 && <Text type="secondary">暂无保存的方案</Text>}
      </Space>
    </Modal>
  );
}
