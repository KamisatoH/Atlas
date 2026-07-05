import { useCallback, useEffect, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { PoiHit } from '@/types/poi';
import { extractCityFromAmapPoi, extractCityFromRegeocode } from '@/lib/cityLabel';
import { amapServiceForRouteMode, withAmapRateLimit } from '@/lib/amapRateLimit';
import { tripNodeCaption } from '@/lib/tripLabels';
import type { TransportMode, TripStop } from '@/types/trip';
import { POI_TYPE_META } from '@/lib/poiTypeMeta';

const MODE_COLORS: Record<TransportMode, string> = {
  driving: '#1677ff',
  walking: '#52c41a',
  transit: '#faad14',
  riding: '#eb2f96',
};

export interface AmapViewProps {
  stops: TripStop[];
  dayIndex: number;
  onSegmentMinutes: (fromStopId: string, minutes: number) => void;
  /** 当前探索选中的 POI，用于地图高亮与定位 */
  highlightPoi?: PoiHit | null;
  /** 双击地图：逆地理编码后选中 POI（探索模式，不直接加入行程） */
  onMapSelect?: (poi: PoiHit) => void;
  /** 信息窗内点击周边 POI/店铺，直接加入当日行程 */
  onNearbyPoiAdd?: (poi: PoiHit) => void;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 双击加入行程：与原先单击选点一致的名称优先级 */
function buildPoiHitFromRegeo(result: any, lng: number, lat: number): PoiHit {
  let name = `地图选点（${lng.toFixed(4)}，${lat.toFixed(4)}）`;
  let address: string | undefined;
  let city: string | undefined;
  if (result?.regeocode) {
    const r = result.regeocode;
    address = r.formattedAddress;
    city = extractCityFromRegeocode(r) ?? undefined;
    const poi = r.pois?.[0];
    if (poi?.name) {
      name = poi.name as string;
      address = (poi.address as string | undefined) || address;
    } else if (r.formattedAddress) {
      name = r.formattedAddress as string;
    }
  }
  return { name, lng, lat, address, city };
}

function parseAmapPoiLocation(p: any): { lng: number; lat: number } | null {
  const loc = p?.location;
  if (typeof loc === 'string') {
    const parts = loc.split(',');
    if (parts.length >= 2) {
      const lng = Number(parts[0]);
      const lat = Number(parts[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    }
  }
  if (loc != null && typeof loc === 'object') {
    const lng = Number(loc.lng ?? loc.getLng?.());
    const lat = Number(loc.lat ?? loc.getLat?.());
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  return null;
}

function sortNearbyPois(pois: any[]): any[] {
  const shopFirst = (a: any, b: any) => {
    const sa = String(a?.type ?? '');
    const sb = String(b?.type ?? '');
    const shop = (t: string) =>
      /购|餐|饮|店|商|酒店|住宿|丽人|娱乐|休闲|金融|服务/i.test(t) ? 1 : 0;
    return shop(sb) - shop(sa);
  };
  return [...pois].sort(shopFirst).slice(0, 10);
}

function buildNearbyPoiHits(
  regeocode: any,
  primaryPoi?: PoiHit
): { poi: PoiHit; type: string; distance: string; isPrimary?: boolean }[] {
  const pois = Array.isArray(regeocode?.pois) ? regeocode.pois : [];
  const defaultCity = extractCityFromRegeocode(regeocode) ?? undefined;
  const items: { poi: PoiHit; type: string; distance: string; isPrimary?: boolean }[] = [];
  const seen = new Set<string>();

  const pushItem = (
    poi: PoiHit,
    type: string,
    distance: string,
    isPrimary?: boolean
  ) => {
    const key = `${poi.name}:${poi.lng.toFixed(5)}:${poi.lat.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ poi, type, distance, isPrimary });
  };

  if (primaryPoi?.name) {
    pushItem(
      {
        ...primaryPoi,
        city: primaryPoi.city ?? defaultCity,
      },
      '当前点击',
      '0',
      true
    );
  }

  for (const p of sortNearbyPois(pois)) {
    const loc = parseAmapPoiLocation(p);
    const name = String(p?.name ?? '').trim();
    if (!loc || !name) continue;
    if (primaryPoi && name === primaryPoi.name) continue;
    pushItem(
      {
        name,
        lng: loc.lng,
        lat: loc.lat,
        address: (p.address as string | undefined) || undefined,
        city: extractCityFromAmapPoi(p) ?? defaultCity,
      },
      String(p?.type ?? ''),
      p?.distance != null && p.distance !== '' ? String(p.distance) : '',
      false
    );
  }

  return items.slice(0, 10);
}

/** 单击查看：信息窗内展示地址与可点击的周边 POI */
function buildRegeoInfoView(
  regeocode: any,
  lng: number,
  lat: number,
  primaryPoi?: PoiHit
): { html: string; nearbyPois: PoiHit[] } {
  const addr = escapeHtml(String(regeocode?.formattedAddress ?? '（无结构化地址）'));
  const nearbyItems = buildNearbyPoiHits(regeocode, primaryPoi);
  const nearbyPois = nearbyItems.map((x) => x.poi);

  const parts: string[] = [
    '<div class="mf-map-info" style="font-size:12px;max-width:300px;max-height:40vh;overflow-y:auto;overflow-x:hidden;line-height:1.45;">',
    '<div style="font-weight:600;margin-bottom:6px;color:#1f2937;">此位置信息</div>',
    `<div style="color:#4b5563;margin-bottom:8px;">${addr}</div>`,
  ];

  if (nearbyItems.length) {
    parts.push(
      '<div style="font-weight:600;margin:6px 0 4px;color:#1f2937;">周边 POI / 店铺</div>',
      '<div style="color:#94a3b8;font-size:10px;margin-bottom:4px;">点击条目可加入当日行程</div>'
    );
    nearbyItems.forEach((item, idx) => {
      const type = escapeHtml(item.type);
      const pAddr = escapeHtml(String(item.poi.address ?? ''));
      const dist = item.distance ? ` · 约 ${escapeHtml(item.distance)} m` : '';
      const primaryStyle = item.isPrimary
        ? 'background:#ecfdf5;border:1px solid #6ee7b7;'
        : '';
      parts.push(
        `<div class="mf-nearby-poi" data-poi-idx="${idx}" style="border-top:1px solid #e5e7eb;padding:6px 4px;cursor:pointer;border-radius:6px;${primaryStyle}">`,
        `<div style="font-weight:500;color:#1f2937;">${escapeHtml(item.poi.name)}${item.isPrimary ? ' <span style="color:#059669;font-size:10px;">(当前点击)</span>' : ''}</div>`,
        type ? `<div style="color:#6b7280;font-size:11px;">${type}</div>` : '',
        pAddr ? `<div style="color:#6b7280;font-size:11px;">${pAddr}</div>` : '',
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">`,
        `<span style="color:#9ca3af;font-size:10px;">${dist}</span>`,
        `<span class="mf-nearby-poi-action" style="color:#34d399;font-size:10px;font-weight:500;">+ 加入行程</span>`,
        `</div>`,
        '</div>'
      );
    });
  } else {
    parts.push(
      '<div style="color:#9ca3af;font-size:11px;">周边无 POI 列表（可稍移动后再试）</div>'
    );
  }

  parts.push(
    `<div style="margin-top:8px;color:#cbd5e1;font-size:10px;">${lng.toFixed(5)}, ${lat.toFixed(5)}</div>`,
    '<div style="margin-top:6px;color:#94a3b8;font-size:10px;">提示：双击地图可选中点击位置</div>',
    '</div>'
  );
  return { html: parts.join(''), nearbyPois };
}

function bindNearbyPoiHandlers(
  root: HTMLElement,
  nearbyPois: PoiHit[],
  onAdd: ((poi: PoiHit) => void) | undefined
) {
  if (!onAdd) return;
  root.querySelectorAll<HTMLElement>('[data-poi-idx]').forEach((node) => {
    const idx = Number(node.dataset.poiIdx);
    const poi = nearbyPois[idx];
    if (!poi) return;
    node.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAdd(poi);
    });
  });
}

/** 根据点击在地图容器内的像素位置，选择锚点与偏移，使信息窗铺在可视区域内且不触发地图平移 */
function pickInfoWindowPlacement(map: any, AMap: any, lnglat: any) {
  const pxRaw = map.lngLatToContainer(lnglat);
  const x = typeof pxRaw?.getX === 'function' ? pxRaw.getX() : Number(pxRaw?.x ?? 0);
  const y = typeof pxRaw?.getY === 'function' ? pxRaw.getY() : Number(pxRaw?.y ?? 0);
  const sz = map.getSize?.();
  const cw = typeof sz?.getWidth === 'function' ? sz.getWidth() : Number(sz?.width ?? 600);
  const ch = typeof sz?.getHeight === 'function' ? sz.getHeight() : Number(sz?.height ?? 400);

  const POPUP_EST_H = 200;
  const POPUP_HALF_W = 150;
  const M = 16;

  let anchor = 'bottom-center';
  let ox = 0;
  let oy = -10;

  if (y < M + POPUP_EST_H) {
    anchor = 'top-center';
    oy = 10;
  } else if (y > ch - M - 100) {
    // 靠近容器下缘：信息窗仍在点上方，略加大与锚点距离以免贴底
    anchor = 'bottom-center';
    oy = -14;
  }

  if (x < M + POPUP_HALF_W) {
    ox = Math.min(100, M + POPUP_HALF_W - x);
  } else if (x > cw - M - POPUP_HALF_W) {
    ox = Math.max(-100, cw - M - POPUP_HALF_W - x);
  }

  return { anchor, offset: new AMap.Pixel(ox, oy) };
}

/** 用于路径重算：仅当坐标/交通方式变化，避免耗时回写导致死循环 */
function routeSignature(stops: TripStop[]): string {
  return stops
    .map(
      (s, i) =>
        `${s.id}:${s.lng.toFixed(5)}:${s.lat.toFixed(5)}:${s.transportToNext ?? 'driving'}:${i}`
    )
    .join('|');
}

function disposeNativeDrivingServices(services: any[]) {
  services.forEach((s) => disposeOneDriving(s));
  services.length = 0;
}

function disposeOneDriving(s: any) {
  try {
    s.clear?.();
  } catch {
    /* ignore */
  }
  try {
    s.destroy?.();
  } catch {
    /* ignore */
  }
}

function removePolylines(map: any, polylines: any[]) {
  polylines.forEach((o) => {
    try {
      map.remove(o);
    } catch {
      /* ignore */
    }
  });
  polylines.length = 0;
}

/** 驾车优先使用实时路况策略，以便路线按拥堵分段着色（依赖高德原生绘制） */
function pickDrivingPolicy(AMap: any): number {
  const P = AMap.DrivingPolicy;
  if (!P) return 0;
  if (P.REAL_TRAFFIC !== undefined) return P.REAL_TRAFFIC;
  if (P.AVOID_CONGESTION !== undefined) return P.AVOID_CONGESTION;
  if (P.LEAST_TIME !== undefined) return P.LEAST_TIME;
  return 0;
}

export function AmapView({
  stops,
  dayIndex,
  onSegmentMinutes,
  highlightPoi,
  onMapSelect,
  onNearbyPoiAdd,
}: AmapViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const highlightMarkerRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const nativeDrivingRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const lastRouteSigRef = useRef<string>('');
  const routeGenRef = useRef(0);
  const onMapSelectRef = useRef(onMapSelect);
  onMapSelectRef.current = onMapSelect;
  const onNearbyPoiAddRef = useRef(onNearbyPoiAdd);
  onNearbyPoiAddRef.current = onNearbyPoiAdd;
  const onMarkerClickRef = useRef<(stop: TripStop) => void>(() => {});

  const stableReport = useCallback(
    (fromId: string, minutes: number) => {
      onSegmentMinutes(fromId, minutes);
    },
    [onSegmentMinutes]
  );

  useEffect(() => {
    const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
    if (!key || !wrapRef.current) return;

    const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined;
    if (sec) {
      (window as any)._AMapSecurityConfig = { securityJsCode: sec };
    }

    let cancelled = false;
    const plugins = [
      'AMap.PlaceSearch',
      'AMap.Geocoder',
      'AMap.Driving',
      'AMap.Walking',
      'AMap.Transfer',
      'AMap.Riding',
    ];

    AMapLoader.load({ key, version: '2.0', plugins })
      .then((AMap) => {
        if (cancelled || !wrapRef.current) return;
        const center =
          stops[0] != null ? [stops[0].lng, stops[0].lat] : [121.4737, 31.2304];
        const map = new AMap.Map(wrapRef.current, {
          zoom: 13,
          center,
          viewMode: '2D',
          doubleClickZoom: false,
        });
        mapRef.current = { map, AMap };
        setMapReady(true);
      })
      .catch((e) => console.error('AMap load failed', e));

    return () => {
      cancelled = true;
      mapRef.current?.map?.destroy?.();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const { map, AMap } = mapRef.current;

    markersRef.current.forEach((o) => {
      try {
        map.remove(o);
      } catch {
        /* ignore */
      }
    });
    markersRef.current = [];

    const clearAllRoutes = () => {
      disposeNativeDrivingServices(nativeDrivingRef.current);
      removePolylines(map, polylinesRef.current);
    };

    if (stops.length === 0) {
      clearAllRoutes();
      lastRouteSigRef.current = '';
      routeGenRef.current += 1;
      return;
    }

    const n = stops.length;
    const markers: any[] = [];
    stops.forEach((s, idx) => {
      const cap = tripNodeCaption(idx, n, 'short');
      const typeMeta = POI_TYPE_META[s.type] ?? POI_TYPE_META.other;
      const m = new AMap.Marker({
        position: [s.lng, s.lat],
        title: `${tripNodeCaption(idx, n, 'full')} · ${s.name}`,
        label: {
          content: `<span style="background:${typeMeta.color};color:#fff;padding:2px 5px;border-radius:4px;font-size:10px;">${cap}</span>`,
          direction: 'center',
        },
      });
      m.on('click', (ev: any) => {
        ev?.stopPropagation?.();
        onMarkerClickRef.current?.(s);
      });
      markers.push(m);
    });
    map.add(markers);
    markersRef.current = markers;
    map.setFitView(markers, false, [60, 60, 60, 60]);

    const sig = routeSignature(stops);

    if (stops.length < 2) {
      clearAllRoutes();
      lastRouteSigRef.current = sig;
      routeGenRef.current += 1;
      return;
    }

    if (sig !== lastRouteSigRef.current) {
      clearAllRoutes();
      lastRouteSigRef.current = sig;
      const generation = ++routeGenRef.current;

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const mode = a.transportToNext ?? 'driving';

        if (mode === 'driving') {
          tasks.push(
            planDrivingOnMap(AMap, map, a, b, pickDrivingPolicy(AMap)).then(
              ({ service, minutes, success }) => {
                if (generation !== routeGenRef.current) {
                  disposeOneDriving(service);
                  return;
                }
                if (success) {
                  nativeDrivingRef.current.push(service);
                } else {
                  disposeOneDriving(service);
                }
                stableReport(a.id, minutes);
              }
            )
          );
        } else {
          tasks.push(
            planRouteManualPolyline(AMap, a, b, mode, MODE_COLORS[mode]).then(
              ({ polyline, minutes }) => {
                if (generation !== routeGenRef.current) return;
                if (polyline) {
                  map.add(polyline);
                  polylinesRef.current.push(polyline);
                }
                stableReport(a.id, minutes);
              }
            )
          );
        }
      }
      void Promise.all(tasks);
    }
  }, [mapReady, stops, dayIndex, stableReport]);

  /** 探索选中点：独立高亮标记并定位 */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const { map, AMap } = mapRef.current;

    if (highlightMarkerRef.current) {
      try {
        map.remove(highlightMarkerRef.current);
      } catch {
        /* ignore */
      }
      highlightMarkerRef.current = null;
    }

    if (!highlightPoi) return;

    const marker = new AMap.Marker({
      position: [highlightPoi.lng, highlightPoi.lat],
      title: highlightPoi.name,
      zIndex: 200,
      label: {
        content: `<span style="background:#34d399;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">${escapeHtml(highlightPoi.name)}</span>`,
        direction: 'top',
      },
    });
    map.add(marker);
    highlightMarkerRef.current = marker;
    map.setCenter([highlightPoi.lng, highlightPoi.lat]);
  }, [mapReady, highlightPoi?.lng, highlightPoi?.lat, highlightPoi?.name]);

  /** 单击查看信息 / 双击选中：与 markers 更新无关，仅依赖 mapReady */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const { map, AMap } = mapRef.current;
    const geocoder = new AMap.Geocoder({ radius: 200, extensions: 'all' });
    let infoWindow: any = null;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    const CLICK_DELAY_MS = 320;

    const openInfoWindowAt = (
      lnglat: any,
      regeocode: any,
      lng: number,
      lat: number,
      primaryPoi?: PoiHit
    ) => {
      try {
        infoWindow?.close?.();
      } catch {
        /* ignore */
      }
      infoWindow = null;

      const { html, nearbyPois } = buildRegeoInfoView(regeocode, lng, lat, primaryPoi);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      bindNearbyPoiHandlers(wrapper, nearbyPois, (poi) => {
        onNearbyPoiAddRef.current?.(poi);
        try {
          infoWindow?.close?.();
        } catch {
          /* ignore */
        }
      });

      const { anchor, offset } = pickInfoWindowPlacement(map, AMap, lnglat);
      infoWindow = new AMap.InfoWindow({
        anchor,
        offset,
        autoMove: false,
        retainWhenClose: false,
      });
      infoWindow.setContent(wrapper);
      infoWindow.open(map, lnglat);
    };

    const showInfoWithPrimary = (lnglat: any, primaryPoi?: PoiHit) => {
      void withAmapRateLimit('geocoder', () =>
        new Promise<void>((resolve) => {
          geocoder.getAddress(lnglat, (status: string, result: any) => {
            const lng = lnglat.getLng();
            const lat = lnglat.getLat();
            const city =
              primaryPoi?.city ??
              (status === 'complete' ? extractCityFromRegeocode(result.regeocode) ?? undefined : undefined);

            const primary =
              primaryPoi ??
              (status === 'complete'
                ? buildPoiHitFromRegeo(result, lng, lat)
                : { name: `地图选点（${lng.toFixed(4)}，${lat.toFixed(4)}）`, lng, lat, city });

            if (status !== 'complete' || !result?.regeocode) {
              openInfoWindowAt(
                lnglat,
                { formattedAddress: primary.name, pois: [] },
                lng,
                lat,
                primary
              );
              resolve();
              return;
            }

            const regeocode = {
              ...result.regeocode,
              formattedAddress: primary.name
                ? `${primary.name}${result.regeocode.formattedAddress ? ` · ${result.regeocode.formattedAddress}` : ''}`
                : result.regeocode.formattedAddress,
            };
            openInfoWindowAt(lnglat, regeocode, lng, lat, { ...primary, city: primary.city ?? city });
            resolve();
          });
        })
      );
    };

    onMarkerClickRef.current = (stop: TripStop) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      const lnglat = new AMap.LngLat(stop.lng, stop.lat);
      showInfoWithPrimary(lnglat, {
        name: stop.name,
        lng: stop.lng,
        lat: stop.lat,
        address: stop.note,
      });
    };

    const showInfoAt = (lnglat: any) => showInfoWithPrimary(lnglat);

    const handleHotspotClick = (e: any) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      const lnglat = e?.lnglat;
      if (!lnglat) return;
      const lng = lnglat.getLng();
      const lat = lnglat.getLat();
      const primary: PoiHit = {
        name: String(e?.name ?? '地图 POI'),
        lng,
        lat,
        address: e?.address ? String(e.address) : undefined,
      };
      showInfoWithPrimary(lnglat, primary);
    };

    const handleClick = (e: any) => {
      const lnglat = e.lnglat;
      if (!lnglat) return;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        showInfoAt(lnglat);
      }, CLICK_DELAY_MS);
    };

    const handleDblClick = (e: any) => {
      const lnglat = e.lnglat;
      if (!lnglat) return;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      try {
        infoWindow?.close?.();
      } catch {
        /* ignore */
      }
      const select = onMapSelectRef.current;
      if (!select) return;

      void withAmapRateLimit('geocoder', () =>
        new Promise<void>((resolve) => {
          geocoder.getAddress(lnglat, (status: string, result: any) => {
            const lng = lnglat.getLng();
            const lat = lnglat.getLat();
            const hit = buildPoiHitFromRegeo(status === 'complete' ? result : null, lng, lat);
            select(hit);
            resolve();
          });
        })
      );
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    map.on('hotspotclick', handleHotspotClick);
    return () => {
      if (clickTimer) clearTimeout(clickTimer);
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.off('hotspotclick', handleHotspotClick);
      onMarkerClickRef.current = () => {};
      try {
        infoWindow?.close?.();
      } catch {
        /* ignore */
      }
    };
  }, [mapReady]);

  return <div ref={wrapRef} className="h-full min-h-0 w-full bg-slate-50" />;
}

/**
 * 驾车：绑定 map，由高德绘制含路况/拥堵分段的路线；实例存入 nativeDrivingRef，重算前统一 clear+destroy。
 */
function planDrivingOnMap(
  AMap: any,
  map: any,
  from: TripStop,
  to: TripStop,
  policy: number
): Promise<{ service: any; minutes: number; success: boolean }> {
  const start = new AMap.LngLat(from.lng, from.lat);
  const end = new AMap.LngLat(to.lng, to.lat);

  return withAmapRateLimit(
    'driving',
    () =>
      new Promise((resolve) => {
        const driving = new AMap.Driving({
          map,
          hideMarkers: true,
          policy,
          autoFitView: false,
        });

        driving.search(start, end, (status: string, result: any) => {
          const routes = result?.routes ?? (result?.route ? [result.route] : []);
          const ok = status === 'complete' && !!routes[0];
          const minutes = ok
            ? Math.max(1, Math.ceil((routes[0].time ?? 1800) / 60))
            : 30;

          resolve({ service: driving, minutes, success: ok });
        });
      })
  );
}

/** 非驾车：不传 map，自建 Polyline，避免与驾车原生图层混用且便于 remove */
function planRouteManualPolyline(
  AMap: any,
  from: TripStop,
  to: TripStop,
  mode: TransportMode,
  color: string
): Promise<{ polyline: any | null; minutes: number }> {
  const start = new AMap.LngLat(from.lng, from.lat);
  const end = new AMap.LngLat(to.lng, to.lat);
  const service = amapServiceForRouteMode(mode);

  return withAmapRateLimit(
    service,
    () =>
      new Promise((resolve) => {
        const finish = (polyline: any | null, minutes: number) => resolve({ polyline, minutes });

        const routeCb = (status: string, result: any) => {
          const routes = result?.routes ?? (result?.route ? [result.route] : []);
          if (status !== 'complete' || !routes[0]) {
            finish(null, 30);
            return;
          }
          const route = routes[0];
          const path = extractPath(route);
          const minutes = Math.max(1, Math.ceil((route.time ?? 1800) / 60));
          if (!path?.length) {
            finish(null, minutes);
            return;
          }
          const polyline = new AMap.Polyline({
            path,
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.85,
            lineJoin: 'round',
          });
          finish(polyline, minutes);
        };

        const svcOpts = { hideMarkers: true };

        try {
          if (mode === 'walking') {
            new AMap.Walking(svcOpts).search(start, end, routeCb);
          } else if (mode === 'riding') {
            new AMap.Riding(svcOpts).search(start, end, routeCb);
          } else {
            new AMap.Transfer(svcOpts).search(start, end, routeCb);
          }
        } catch {
          finish(null, 30);
        }
      })
  );
}

function extractPath(route: any): any[] | null {
  if (Array.isArray(route.path) && route.path.length) return route.path;
  const steps = route.steps;
  if (!steps?.length) return null;
  const path: any[] = [];
  for (const st of steps) {
    if (st?.path?.length) path.push(...st.path);
  }
  return path.length ? path : null;
}
