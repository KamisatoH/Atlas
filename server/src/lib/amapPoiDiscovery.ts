import type { AgentChatContext } from './agentPrompts';
import { resolveScheduleIntent } from './scheduleIntent';

export type AmapPoiCandidate = {
  id: string;
  name: string;
  district?: string;
  address?: string;
  category?: string;
  location?: string;
  city?: string;
  rating?: string;
  openTimeToday?: string;
  matchedKeyword: string;
};

type AmapPoiResponse = {
  status?: string;
  info?: string;
  pois?: Array<{
    id?: string;
    name?: string;
    address?: string | string[];
    type?: string;
    location?: string;
    adname?: string;
    cityname?: string;
    business?: {
      rating?: string;
      opentime_today?: string;
    };
  }>;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const MAX_CANDIDATES = 12;
const PAGE_SIZE = 8;
const SEARCH_TIMEOUT_MS = 4500;

function allUserText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');
}

/**
 * 选择卡完成后的消息通常只剩“均衡体验”一类短回答，因此从整段用户消息中回看城市。
 * 这里只处理常见的自然语言形式；识别不到就安全跳过，不猜测城市。
 */
export function resolvePoiSearchCity(messages: ChatMessage[], context?: AgentChatContext): string | null {
  const fromContext = context?.city?.trim();
  if (fromContext) return fromContext;

  const text = allUserText(messages);
  const patterns = [
    /(?:去|到|在|玩转|游玩|游览|规划|安排|做|推荐)\s*([\u4e00-\u9fa5]{2,8}?)(?:市)?(?:玩|游玩|旅游|旅行|逛)?(?:的)?[零〇一二两三四五六七八九十百\d]{1,3}(?:天|日)/,
    /^\s*([\u4e00-\u9fa5]{2,8}?)(?:市)?(?:的)?[零〇一二两三四五六七八九十百\d]{1,3}(?:天|日)/m,
    /(?:去|到|在)\s*([\u4e00-\u9fa5]{2,8}?)(?:市)?(?:玩|游玩|旅游|旅行|逛)/,
    /(?:规划|安排|做|推荐)\s*([\u4e00-\u9fa5]{2,8}?)(?:市)?(?:的)?(?:行程|攻略|路线|旅行|旅游)/,
    /([\u4e00-\u9fa5]{2,8}(?:市|自治州|地区|盟))/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]?.trim();
    if (match) return match;
  }
  return null;
}

function interestKeyword(messages: ChatMessage[], context?: AgentChatContext): string {
  const text = allUserText(messages);
  if (/美食|餐厅|小吃|吃喝|夜市/.test(text)) return '特色美食';
  if (/人文|历史|博物馆|建筑|古迹|艺术|展览/.test(text)) return '博物馆';
  if (/自然|公园|山水|徒步|露营|赏花/.test(text)) return '公园';
  if (/亲子|儿童|带娃|乐园/.test(text)) return '亲子乐园';
  if (/购物|商场|买东西/.test(text)) return '购物中心';

  const interest = context?.clarificationAnswers?.interest?.split('：')[0]?.trim();
  switch (interest) {
    case 'culture':
      return '博物馆';
    case 'food':
      return '特色美食';
    case 'nature':
      return '公园';
    case 'classic':
    default:
      return '景点';
  }
}

function agendaPlaceKeyword(messages: ChatMessage[], city?: string | null): string | null {
  const text = allUserText(messages);
  const placeSuffix =
    '4\\s*[sS]店|医院|诊所|公司|大厦|园区|会展中心|展馆|学校|法院|车管所|办事大厅|服务中心|门店|商场|机场|车站';
  const patterns = [
    new RegExp(`(?:去|到|前往)\\s*([^，。！？\\n]{2,36}?(?:${placeSuffix}))`, 'i'),
    new RegExp(`([A-Za-z0-9\\u4e00-\\u9fa5·-]{2,30}?(?:${placeSuffix}))`, 'i'),
  ];
  for (const pattern of patterns) {
    const raw = text.match(pattern)?.[1];
    if (!raw) continue;
    const cleaned = raw
      .replace(city ? new RegExp(`^${city}(?:市)?`) : /$^/, '')
      .replace(/^(?:我想|我要|计划|准备|帮我|生成一个)/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2) return cleaned.slice(0, 36);
  }
  return null;
}

function searchKeywords(messages: ChatMessage[], city: string | null, context?: AgentChatContext): string[] {
  const text = allUserText(messages);
  const intent = resolveScheduleIntent(messages);
  const keywords: string[] = [];
  if (intent !== 'leisure') {
    const agendaKeyword = agendaPlaceKeyword(messages, city);
    if (agendaKeyword) keywords.push(agendaKeyword);
    if (intent === 'agenda') return keywords.slice(0, 1);
  }
  if (/网红|打卡|出片|新开|热门|小众/.test(text)) keywords.push('网红打卡');
  keywords.push(interestKeyword(messages, context));
  return [...new Set(keywords)].slice(0, 2);
}

function normalizeText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || undefined;
  const text = value?.trim();
  return text || undefined;
}

async function searchOne(key: string, city: string | null, keyword: string): Promise<AmapPoiCandidate[]> {
  const params = new URLSearchParams({
    key,
    keywords: keyword,
    page_size: String(PAGE_SIZE),
    page_num: '1',
    show_fields: 'business',
  });
  if (city) {
    params.set('region', city);
    params.set('city_limit', 'true');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://restapi.amap.com/v5/place/text?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as AmapPoiResponse;
    if (data.status !== '1' || !Array.isArray(data.pois)) {
      throw new Error(data.info || '高德 POI 搜索失败');
    }
    return data.pois
      .filter((poi) => poi.id && poi.name)
      .map((poi) => ({
        id: poi.id!,
        name: poi.name!.trim(),
        district: normalizeText(poi.adname),
        city: normalizeText(poi.cityname),
        address: normalizeText(poi.address),
        category: normalizeText(poi.type),
        location: normalizeText(poi.location),
        rating: normalizeText(poi.business?.rating),
        openTimeToday: normalizeText(poi.business?.opentime_today),
        matchedKeyword: keyword,
      }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 为模型提供少量、可在高德中落地的地点候选。任何配置或网络错误都由调用方降级处理。
 */
export async function discoverAmapPoiCandidates(
  messages: ChatMessage[],
  context?: AgentChatContext
): Promise<AmapPoiCandidate[]> {
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  const city = resolvePoiSearchCity(messages, context);
  const intent = resolveScheduleIntent(messages);
  if (!key || context?.replan || (!city && intent === 'leisure')) return [];

  const planningText = allUserText(messages);
  if (!/行程|攻略|旅行|旅游|游玩|路线|景点|美食|博物馆|公园|网红|打卡|推荐|[一二三四五六七八九十\d]+(?:天|日)/.test(planningText)) {
    return [];
  }

  const keywords = searchKeywords(messages, city, context);
  if (!keywords.length) return [];
  const searches = await Promise.allSettled(keywords.map((keyword) => searchOne(key, city, keyword)));
  const batches = searches
    .filter((search): search is PromiseFulfilledResult<AmapPoiCandidate[]> => search.status === 'fulfilled')
    .map((search) => search.value);
  if (!batches.length) {
    const failure = searches.find((search): search is PromiseRejectedResult => search.status === 'rejected');
    throw failure?.reason ?? new Error('高德 POI 搜索未返回结果');
  }
  const seen = new Set<string>();
  const result: AmapPoiCandidate[] = [];
  for (const candidate of batches.flat()) {
    const identity = candidate.id || `${candidate.name}:${candidate.location ?? ''}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(candidate);
    if (result.length >= MAX_CANDIDATES) break;
  }
  return result;
}
