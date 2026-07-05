import { useEffect, useRef, useState } from 'react';
import { AutoComplete, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import AMapLoader from '@amap/amap-jsapi-loader';
import { withAmapRateLimit } from '@/lib/amapRateLimit';
import { extractCityFromAmapPoi } from '@/lib/cityLabel';
import type { PoiHit } from '@/types/poi';

export type { PoiHit } from '@/types/poi';

export function PoiSearch({
  onSelect,
  placeholder = '搜索景点 / 餐厅 / 酒店',
  city,
}: {
  onSelect: (p: PoiHit) => void;
  placeholder?: string;
  /** 限定搜索的地级市名，如「杭州市」 */
  city?: string | null;
}) {
  const [options, setOptions] = useState<{ value: string; poi: PoiHit }[]>([]);
  const psRef = useRef<any>(null);

  useEffect(() => {
    const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
    if (!key) return;
    const sec = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined;
    if (sec) {
      (window as any)._AMapSecurityConfig = { securityJsCode: sec };
    }
    AMapLoader.load({ key, version: '2.0', plugins: ['AMap.PlaceSearch'] }).then((AMap) => {
      psRef.current = new AMap.PlaceSearch({ pageSize: 10, citylimit: false });
    });
  }, []);

  useEffect(() => {
    if (!psRef.current) return;
    if (city) {
      psRef.current.setCity(city);
      psRef.current.setCityLimit?.(true);
    } else {
      psRef.current.setCity('全国');
      psRef.current.setCityLimit?.(false);
    }
  }, [city]);

  const search = (text: string) => {
    if (!text?.trim() || !psRef.current) {
      setOptions([]);
      return;
    }
    void withAmapRateLimit('placeSearch', () =>
      new Promise<void>((resolve) => {
        psRef.current.search(text, (status: string, result: any) => {
          if (status !== 'complete' || !result?.poiList?.pois) {
            setOptions([]);
            resolve();
            return;
          }
          const list = result.poiList.pois as any[];
          setOptions(
            list.map((p) => ({
              value: `${p.name} · ${p.address ?? ''}`,
              poi: {
                name: p.name as string,
                lng: Number(p.location?.lng ?? p.location?.getLng?.() ?? 0),
                lat: Number(p.location?.lat ?? p.location?.getLat?.() ?? 0),
                address: p.address as string | undefined,
                city: extractCityFromAmapPoi(p) ?? city ?? undefined,
              },
            }))
          );
          resolve();
        });
      })
    );
  };

  return (
    <AutoComplete
      className="poi-search-input w-full"
      options={options}
      onSearch={search}
      onSelect={(value) => {
        const hit = options.find((o) => o.value === value);
        if (hit) onSelect(hit.poi);
      }}
      placeholder={city ? `在${city}内搜索…` : placeholder}
    >
      <Input allowClear size="middle" prefix={<SearchOutlined className="text-slate-400" />} />
    </AutoComplete>
  );
}
