import AMapLoader from '@amap/amap-jsapi-loader';
import { amapServiceForCtor, withAmapRateLimit } from '@/lib/amapRateLimit';
import type { TransportMode, TripStop } from '@/types/trip';

export interface RouteStepLine {
  title: string;
  detail?: string;
}

export interface ComparedRoute {
  mode: TransportMode;
  title: string;
  ok: boolean;
  error?: string;
  durationSec: number;
  distanceM: number;
  summary: string[];
  steps: RouteStepLine[];
  /** 同交通方式下的方案区分（如多条公交/地铁） */
  optionKey?: string;
  /** 策略说明，如「较快捷」「少换乘」 */
  policyHint?: string;
}

const PLUGINS = [
  'AMap.Driving',
  'AMap.Walking',
  'AMap.Riding',
  'AMap.Transfer',
  'AMap.Geocoder',
];

const MAX_TRANSIT_OPTIONS = 12;

/** 高德 Transfer 换乘策略 */
const TRANSIT_POLICY_QUERIES: { policy: number; hint: string }[] = [
  { policy: 0, hint: '较快捷' },
  { policy: 2, hint: '少换乘' },
  { policy: 3, hint: '少步行' },
  { policy: 1, hint: '较经济' },
  { policy: 5, hint: '不乘地铁' },
];

async function ensureAMap(): Promise<any> {
  const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
  if (!key) throw new Error('未配置 VITE_AMAP_KEY');
  const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined;
  if (sec) {
    (window as any)._AMapSecurityConfig = { securityJsCode: sec };
  }
  return AMapLoader.load({ key, version: '2.0', plugins: PLUGINS });
}

function lngLat(AMap: any, s: TripStop) {
  return new AMap.LngLat(s.lng, s.lat);
}

async function cityForTransit(AMap: any, from: TripStop): Promise<string> {
  return withAmapRateLimit(
    'geocoder',
    () =>
      new Promise((resolve) => {
        const geo = new AMap.Geocoder();
        geo.getAddress(lngLat(AMap, from), (status: string, res: any) => {
          if (status === 'complete' && res?.regeocode?.addressComponent) {
            const ac = res.regeocode.addressComponent;
            const c = ac.city || ac.district || ac.province || '';
            resolve(typeof c === 'string' ? c : '');
          } else resolve('');
        });
      })
  );
}

function fmtDur(sec: number): string {
  if (!sec || sec < 0) return '—';
  const m = Math.ceil(sec / 60);
  if (m < 60) return `约 ${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `约 ${h} 小时 ${r} 分钟` : `约 ${h} 小时`;
}

function fmtDist(meters: number): string {
  if (!meters || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} 米`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

function pickTransferPolicy(AMap: any, policy: number): number {
  const P = AMap.TransferPolicy;
  if (!P) return policy;
  const map: Record<number, number | undefined> = {
    0: P.LEAST_TIME,
    1: P.LEAST_FEE,
    2: P.LEAST_TRANSFER,
    3: P.LEAST_WALK,
    4: P.MOST_COMFORT,
    5: P.NO_SUBWAY,
  };
  return map[policy] ?? policy;
}

function drivingLike(
  AMap: any,
  Ctor: string,
  from: TripStop,
  to: TripStop,
  mode: TransportMode,
  title: string
): Promise<ComparedRoute> {
  const service = amapServiceForCtor(Ctor);
  return withAmapRateLimit(
    service,
    () =>
      new Promise((resolve) => {
        try {
          const svc = new (AMap as any)[Ctor]({ hideMarkers: true });
          svc.search(lngLat(AMap, from), lngLat(AMap, to), (status: string, result: any) => {
            const routes = result?.routes ?? (result?.route ? [result.route] : []);
            if (status !== 'complete' || !routes[0]) {
              resolve({
                mode,
                title,
                ok: false,
                error: status === 'error' ? '无可用路线' : '未规划出路线',
                durationSec: 0,
                distanceM: 0,
                summary: [],
                steps: [],
              });
              return;
            }
            const r = routes[0];
            const dur = Number(r.time ?? 0);
            const dist = Number(r.distance ?? 0);
            const rawSteps = Array.isArray(r.steps) ? r.steps : [];
            const steps: RouteStepLine[] = rawSteps.slice(0, 40).map((st: any) => ({
              title: (st.instruction as string) || '路段',
              detail: st.road ? `道路：${st.road}` : st.action ? `动作：${st.action}` : undefined,
            }));
            const summary = [
              `全程 ${fmtDist(dist)}，预计 ${fmtDur(dur)}`,
              ...rawSteps
                .slice(0, 4)
                .map((st: any) => st.instruction)
                .filter(Boolean),
            ];
            resolve({
              mode,
              title,
              ok: true,
              durationSec: dur,
              distanceM: dist,
              summary,
              steps,
            });
          });
        } catch (e) {
          resolve({
            mode,
            title,
            ok: false,
            error: e instanceof Error ? e.message : '请求异常',
            durationSec: 0,
            distanceM: 0,
            summary: [],
            steps: [],
          });
        }
      })
  );
}

function pushTransitLine(
  steps: RouteStepLine[],
  summary: string[],
  kind: '公交' | '地铁' | '铁路' | '公共交通',
  name: string,
  detailParts: (string | false | undefined)[]
) {
  const detail = detailParts.filter(Boolean).join(' · ');
  steps.push({ title: kind, detail: detail ? `${name}（${detail}）` : name });
  summary.push(name);
}

/** 解析公交/地铁换乘方案（兼容高德 1.x / 2.x 字段） */
function parseTransitSegments(plan: any): { summary: string[]; steps: RouteStepLine[]; lineNames: string[] } {
  const summary: string[] = [];
  const steps: RouteStepLine[] = [];
  const lineNames: string[] = [];
  const segs = plan?.segments;
  if (!Array.isArray(segs)) {
    return { summary: ['未返回详细换乘结构'], steps: [], lineNames: [] };
  }

  for (const seg of segs) {
    if (seg?.walking) {
      const w = seg.walking;
      const d = w.distance != null ? fmtDist(Number(w.distance)) : '';
      const t = w.time != null ? fmtDur(Number(w.time)) : '';
      const line = [d && `步行 ${d}`, t && t].filter(Boolean).join('，');
      const ins = (w.instruction as string) || line || '步行';
      steps.push({ title: '步行', detail: ins });
      if (d || t) summary.push(ins);
    }

    if (seg?.transit) {
      const t = seg.transit;
      const lines = Array.isArray(t.lines) ? t.lines : t.line ? [t.line] : [];
      const dep = t.departure_stop?.name || t.oname;
      const arr = t.arrival_stop?.name || t.dname;
      for (const line of lines) {
        const name = (line?.name as string) || (t.oname as string) || '公共交通';
        const isSubway = /地铁|轨道|有轨|磁浮|轻轨/i.test(name);
        pushTransitLine(steps, summary, isSubway ? '地铁' : '公交', name, [
          dep && `上：${dep}`,
          arr && `下：${arr}`,
          line?.distance != null && fmtDist(Number(line.distance)),
        ]);
        lineNames.push(name);
      }
      if (lines.length === 0 && (t.oname || t.name)) {
        const name = (t.oname as string) || (t.name as string) || '公共交通';
        pushTransitLine(steps, summary, '公共交通', name, [dep && `上：${dep}`, arr && `下：${arr}`]);
        lineNames.push(name);
      }
    }

    if (seg?.bus?.buslines?.length) {
      for (const bl of seg.bus.buslines) {
        const name = (bl?.name as string) || '公交线路';
        const dep = seg.bus?.departure_stop?.name;
        const arr = seg.bus?.arrival_stop?.name;
        pushTransitLine(steps, summary, '公交', name, [dep && `上：${dep}`, arr && `下：${arr}`]);
        lineNames.push(name);
      }
    }

    if (seg?.subway?.lines?.length) {
      for (const line of seg.subway.lines) {
        const name = (line?.name as string) || '地铁';
        const dep = seg.subway?.departure_stop?.name;
        const arr = seg.subway?.arrival_stop?.name;
        pushTransitLine(steps, summary, '地铁', name, [dep && `上：${dep}`, arr && `下：${arr}`]);
        lineNames.push(name);
      }
    }

    if (seg?.railway) {
      const r = seg.railway;
      const name = (r.name as string) || (r.trip as string) || '铁路';
      pushTransitLine(steps, summary, '铁路', name, [
        r.departure_stop?.name && `发：${r.departure_stop.name}`,
        r.arrival_stop?.name && `到：${r.arrival_stop.name}`,
      ]);
      lineNames.push(name);
    }

    if (typeof seg?.instruction === 'string' && seg.instruction.trim()) {
      steps.push({ title: '路段', detail: seg.instruction });
      summary.push(seg.instruction);
    }
  }

  if (steps.length === 0 && plan?.instruction) {
    steps.push({ title: '方案', detail: plan.instruction });
  }

  return { summary, steps, lineNames };
}

function buildTransitTitle(lineNames: string[], index: number, policyHint?: string): string {
  const transitLines = lineNames.filter(Boolean);
  if (transitLines.length >= 2) {
    return transitLines.slice(0, 4).join(' → ');
  }
  if (transitLines.length === 1) {
    return transitLines[0];
  }
  return policyHint ? `公交/地铁（${policyHint}）` : `公交/地铁 方案 ${index + 1}`;
}

function planToComparedRoute(
  plan: any,
  index: number,
  policyHint?: string,
  optionKeySuffix?: string
): ComparedRoute {
  const dur = Number(plan.time ?? plan.cost?.time ?? 0);
  const dist = Number(plan.distance ?? 0);
  const { summary, steps, lineNames } = parseTransitSegments(plan);
  const transferCount = steps.filter((s) => s.title !== '步行' && s.title !== '路段').length;
  const head = [
    `全程 ${fmtDist(dist)}，预计 ${fmtDur(dur)}`,
    `含 ${transferCount} 段公交/地铁`,
    policyHint ? `策略：${policyHint}` : null,
  ].filter(Boolean) as string[];

  return {
    mode: 'transit',
    title: buildTransitTitle(lineNames, index, policyHint),
    optionKey: `transit-${optionKeySuffix ?? index}-${dur}`,
    policyHint,
    ok: true,
    durationSec: dur,
    distanceM: dist,
    summary: [...head, ...summary.filter((s) => !s.startsWith('步行')).slice(0, 10)],
    steps,
  };
}

function searchTransitWithPolicy(
  AMap: any,
  from: TripStop,
  to: TripStop,
  city: string,
  policy: number,
  policyHint: string
): Promise<ComparedRoute[]> {
  return withAmapRateLimit(
    'transfer',
    () =>
      new Promise((resolve) => {
        try {
          const svc = new AMap.Transfer({
            hideMarkers: true,
            ...(city ? { city } : {}),
            nightflag: true,
            policy: pickTransferPolicy(AMap, policy),
          });
          svc.search(lngLat(AMap, from), lngLat(AMap, to), (status: string, result: any) => {
            if (status !== 'complete') {
              resolve([]);
              return;
            }
            const plans =
              result?.plans || result?.routes || result?.route?.transits || result?.route;
            const list = Array.isArray(plans) ? plans : plans ? [plans] : [];
            resolve(
              list.map((plan: any, i: number) =>
                planToComparedRoute(plan, i, policyHint, `${policy}-${i}`)
              )
            );
          });
        } catch {
          resolve([]);
        }
      })
  );
}

/** 合并多策略下的公交/地铁方案，去重后按耗时排序（策略串行请求，遵守 Transfer 3 QPS） */
async function transitRoutes(
  AMap: any,
  from: TripStop,
  to: TripStop,
  city: string,
  options?: { fast?: boolean }
): Promise<ComparedRoute[]> {
  const queries = options?.fast ? [TRANSIT_POLICY_QUERIES[0]!] : TRANSIT_POLICY_QUERIES;
  const seen = new Set<string>();
  const merged: ComparedRoute[] = [];

  for (const { policy, hint } of queries) {
    const batch = await searchTransitWithPolicy(AMap, from, to, city, policy, hint);
    for (const route of batch) {
      if (!route.ok) continue;
      const fp = `${route.durationSec}:${route.title}`;
      if (seen.has(fp)) continue;
      seen.add(fp);
      merged.push(route);
    }
  }

  merged.sort((a, b) => a.durationSec - b.durationSec);

  if (merged.length === 0) {
    return [
      {
        mode: 'transit',
        title: '公交 / 地铁',
        ok: false,
        error: '暂无公共交通方案（可能跨城、数据未覆盖或需指定城市）',
        durationSec: 0,
        distanceM: 0,
        summary: [],
        steps: [],
      },
    ];
  }

  return merged.slice(0, MAX_TRANSIT_OPTIONS);
}

const MODE_CTOR: Record<Exclude<TransportMode, 'transit'>, { ctor: string; title: string }> = {
  driving: { ctor: 'Driving', title: '驾车' },
  walking: { ctor: 'Walking', title: '步行' },
  riding: { ctor: 'Riding', title: '骑行' },
};

/** 按指定交通方式规划两站间耗时（高德 JS API） */
export async function planSegmentByMode(
  from: TripStop,
  to: TripStop,
  mode: TransportMode
): Promise<{ minutes: number; ok: boolean }> {
  const AMap = await ensureAMap();
  if (mode === 'transit') {
    const city = await cityForTransit(AMap, from);
    const routes = await transitRoutes(AMap, from, to, city, { fast: true });
    const best = routes.find((r) => r.ok);
    return {
      minutes: best ? Math.max(1, Math.ceil(best.durationSec / 60)) : 30,
      ok: Boolean(best),
    };
  }
  const { ctor, title } = MODE_CTOR[mode];
  const r = await drivingLike(AMap, ctor, from, to, mode, title);
  return {
    minutes: r.ok ? Math.max(1, Math.ceil(r.durationSec / 60)) : 30,
    ok: r.ok,
  };
}

/** 按各站 transportToNext 批量同步路段耗时（单段失败不阻断整日） */
export async function syncStopsTravelTimes(stops: TripStop[]): Promise<TripStop[]> {
  if (stops.length < 2) return stops.map((s) => ({ ...s }));
  const out = stops.map((s) => ({ ...s }));
  for (let i = 0; i < out.length - 1; i++) {
    const mode = out[i].transportToNext ?? 'driving';
    try {
      const { minutes } = await planSegmentByMode(out[i], out[i + 1], mode);
      out[i] = { ...out[i], travelMinutesToNext: minutes };
    } catch (e) {
      console.warn('planSegmentByMode failed, use fallback minutes', e);
      out[i] = { ...out[i], travelMinutesToNext: out[i].travelMinutesToNext ?? 30 };
    }
  }
  return out;
}

/**
 * 请求各交通方式方案（浏览器端高德 JS API，与主地图共用 Key）。
 * 各服务经 amapRateLimit 排队；公共交通多策略串行查询。
 */
export async function compareRoutesBetween(from: TripStop, to: TripStop): Promise<ComparedRoute[]> {
  const AMap = await ensureAMap();
  const city = await cityForTransit(AMap, from);

  const driving = await drivingLike(AMap, 'Driving', from, to, 'driving', '驾车');
  const walking = await drivingLike(AMap, 'Walking', from, to, 'walking', '步行');
  const riding = await drivingLike(AMap, 'Riding', from, to, 'riding', '骑行');
  const transitList = await transitRoutes(AMap, from, to, city);

  return [driving, walking, riding, ...transitList];
}

export { fmtDur, fmtDist };
