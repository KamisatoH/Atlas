import AMapLoader from '@amap/amap-jsapi-loader';
import { withAmapRateLimit } from '@/lib/amapRateLimit';
import { extractCityFromAmapPoi } from '@/lib/cityLabel';
import type { PoiHit } from '@/types/poi';

let placeSearchPromise: Promise<any> | null = null;
/** 串行化 PlaceSearch 请求，避免并发回调互相覆盖（第三日批量解析时易触发） */
let searchQueue: Promise<unknown> = Promise.resolve();

async function getPlaceSearch(): Promise<any> {
  if (placeSearchPromise) return placeSearchPromise;
  placeSearchPromise = (async () => {
    const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
    if (!key) throw new Error('未配置 VITE_AMAP_KEY');
    const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined;
    if (sec) {
      (window as any)._AMapSecurityConfig = { securityJsCode: sec };
    }
    const AMap = await AMapLoader.load({ key, version: '2.0', plugins: ['AMap.PlaceSearch'] });
    return new AMap.PlaceSearch({ pageSize: 5, citylimit: false });
  })();
  return placeSearchPromise;
}

function runPlaceSearch(ps: any, name: string, city?: string | null): Promise<PoiHit | null> {
  if (city) {
    ps.setCity(city);
    ps.setCityLimit?.(true);
  } else {
    ps.setCity('全国');
    ps.setCityLimit?.(false);
  }

  return withAmapRateLimit('placeSearch', () =>
    new Promise((resolve) => {
      ps.search(name.trim(), (status: string, result: any) => {
        if (status !== 'complete' || !result?.poiList?.pois?.length) {
          resolve(null);
          return;
        }
        const p = result.poiList.pois[0];
        resolve({
          name: p.name as string,
          lng: Number(p.location?.lng ?? p.location?.getLng?.() ?? 0),
          lat: Number(p.location?.lat ?? p.location?.getLat?.() ?? 0),
          address: p.address as string | undefined,
          city: extractCityFromAmapPoi(p) ?? city ?? undefined,
        });
      });
    })
  );
}

/** 按名称解析 POI 坐标（应用 AI 路线时使用） */
export async function resolvePlaceByName(
  name: string,
  city?: string | null
): Promise<PoiHit | null> {
  const task = searchQueue.then(async () => {
    const ps = await getPlaceSearch();
    let hit = await runPlaceSearch(ps, name, city);
    if (!hit && city) {
      hit = await runPlaceSearch(ps, name, null);
    }
    if (!hit) {
      const simplified = name.replace(/[（(【\[].*[）)】\]]/g, '').trim();
      if (simplified.length >= 2 && simplified !== name.trim()) {
        hit = await runPlaceSearch(ps, simplified, city);
        if (!hit && city) hit = await runPlaceSearch(ps, simplified, null);
      }
    }
    return hit;
  });
  searchQueue = task.catch(() => undefined);
  return task;
}
