/** 规范地级市展示名（如「杭州市」） */
export function normalizeCityLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '[]') return null;
  return s;
}

/** 从高德 POI 结果提取地级市名 */
export function extractCityFromAmapPoi(p: {
  cityname?: string;
  pname?: string;
  adname?: string;
}): string | null {
  const city = normalizeCityLabel(p.cityname);
  if (city) return city;
  const prov = normalizeCityLabel(p.pname);
  if (prov && /^(北京市|上海市|天津市|重庆市)/.test(prov)) {
    return prov;
  }
  return null;
}

/** 从逆地理编码 addressComponent 提取地级市名 */
export function extractCityFromRegeocode(regeocode: {
  addressComponent?: {
    city?: string | string[];
    province?: string | string[];
  };
}): string | null {
  const ac = regeocode?.addressComponent;
  if (!ac) return null;
  const pick = (v?: string | string[]) => {
    if (Array.isArray(v)) return normalizeCityLabel(v[0]);
    return normalizeCityLabel(v);
  };
  const city = pick(ac.city);
  if (city) return city;
  const prov = pick(ac.province);
  if (prov && /^(北京市|上海市|天津市|重庆市)/.test(prov)) {
    return prov;
  }
  return null;
}
