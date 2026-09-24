import type { AgentChatContext } from './agentPrompts';

export type ClarificationField =
  | 'pace'
  | 'interest'
  | 'transport'
  | 'companions'
  | 'budget'
  | 'startArea'
  | 'accommodation'
  | 'arrival';

export type ServerClarification = {
  field: ClarificationField;
  question: string;
  options: Array<{
    value: string;
    label: string;
    description?: string;
    requiresDetail?: boolean;
    detailPlaceholder?: string;
  }>;
  allowSkip: true;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const CARD_BANK: Record<
  Extract<ClarificationField, 'pace' | 'arrival' | 'accommodation' | 'interest' | 'transport' | 'companions' | 'budget'>,
  ServerClarification
> = {
  pace: {
    field: 'pace',
    question: '这几天希望以怎样的节奏游玩？',
    options: [
      { value: 'relaxed', label: '轻松漫游', description: '每天留出更多休息与随逛时间' },
      { value: 'balanced', label: '均衡体验', description: '经典地点与休息节奏兼顾' },
      { value: 'compact', label: '紧凑打卡', description: '在合理范围内多安排地点' },
    ],
    allowSkip: true,
  },
  arrival: {
    field: 'arrival',
    question: '首日的到达情况是？',
    options: [
      {
        value: 'train',
        label: '高铁或火车抵达',
        description: '按车站和到达时间安排首日',
        requiresDetail: true,
        detailPlaceholder: '例如：上海虹桥站，11:30',
      },
      {
        value: 'flight',
        label: '飞机抵达',
        description: '按机场和落地时间安排首日',
        requiresDetail: true,
        detailPlaceholder: '例如：浦东机场，14:00',
      },
      { value: 'local', label: '已在当地', description: '可从上午开始安排' },
      { value: 'unknown', label: '暂未确定', description: '先按常规上午出发规划' },
    ],
    allowSkip: true,
  },
  accommodation: {
    field: 'accommodation',
    question: '住宿安排在哪里？',
    options: [
      {
        value: 'booked',
        label: '已订住宿',
        description: '将酒店作为每日起终点',
        requiresDetail: true,
        detailPlaceholder: '填写酒店名称或住宿区域',
      },
      { value: 'center', label: '住市中心', description: '按市中心住宿规划' },
      { value: 'hub', label: '住交通枢纽附近', description: '方便首末日抵离' },
      { value: 'unknown', label: '暂未确定', description: '先按核心片区安排' },
    ],
    allowSkip: true,
  },
  interest: {
    field: 'interest',
    question: '这趟旅行更想体验什么？',
    options: [
      { value: 'classic', label: '经典地标', description: '优先城市代表性景点' },
      { value: 'culture', label: '人文历史', description: '博物馆、街区与建筑' },
      { value: 'food', label: '美食漫游', description: '餐饮与特色街区优先' },
      { value: 'nature', label: '自然休闲', description: '公园、山水与慢游' },
    ],
    allowSkip: true,
  },
  transport: {
    field: 'transport',
    question: '主要采用哪种出行方式？',
    options: [
      { value: 'transit', label: '地铁公交优先', description: '成本可控，适合城市内游览' },
      { value: 'driving', label: '打车或自驾优先', description: '减少换乘，适合行李较多时' },
      { value: 'walking', label: '步行慢游优先', description: '优先安排相邻片区' },
    ],
    allowSkip: true,
  },
  companions: {
    field: 'companions',
    question: '同行人的体力与出行需求是？',
    options: [
      { value: 'adults', label: '成人同行', description: '按常规步行与换乘安排' },
      { value: 'elderly', label: '有老人同行', description: '少步行、增加休整与打车备选' },
      { value: 'children', label: '带儿童出行', description: '控制节奏，优先亲子友好地点' },
      { value: 'solo', label: '独自出行', description: '按个人节奏灵活安排' },
    ],
    allowSkip: true,
  },
  budget: {
    field: 'budget',
    question: '这趟行程的消费倾向是？',
    options: [
      { value: 'economical', label: '经济实惠', description: '公共交通与平价餐饮优先' },
      { value: 'moderate', label: '均衡体验', description: '在体验与花费间平衡' },
      { value: 'flexible', label: '体验优先', description: '为便利与特色体验留出预算' },
    ],
    allowSkip: true,
  },
};

const FIELD_SIGNALS: Record<ClarificationField, RegExp> = {
  pace: /轻松|慢游|悠闲|休闲|不赶|佛系|均衡|适中|紧凑|特种兵|打卡/,
  interest: /美食|吃|餐厅|小吃|人文|历史|博物馆|亲子|带娃|自然|公园|徒步|购物|艺术|摄影/,
  transport: /地铁|公交|公共交通|步行|走路|打车|出租车|自驾|开车|骑行|单车/,
  companions: /带娃|孩子|儿童|亲子|老人|长辈|父母|情侣|朋友|独自|一个人/,
  budget: /预算|省钱|低预算|经济|平价|高端|豪华|不限预算/,
  startArea: /从.+(?:出发|开始)|出发地|起点/,
  accommodation: /酒店|住宿|民宿|住在|住.+(?:附近|一带|区域)|入住/,
  arrival: /高铁|火车|动车|飞机|航班|机场|车站|(?:[\u4e00-\u9fa5]{2,8})站|抵达|到达|落地|下午\s*\d{1,2}[：:]\d{2}|上午\s*\d{1,2}[：:]\d{2}/,
};

function userText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');
}

function hasPlanningIntent(text: string, context?: AgentChatContext): boolean {
  if (context?.clarificationCount || Object.keys(context?.clarificationAnswers ?? {}).length) return true;
  return /行程|攻略|旅行|旅游|游玩|[一二三四五六七八九十\d]+(?:天|日)游|规划|安排|路线|景点|去.+玩/.test(text);
}

function isExistingPlanUpdate(text: string, context?: AgentChatContext): boolean {
  if (!context?.existingStopNames?.length && !context?.stopsByDay?.some((day) => day.stopNames.length)) return false;
  return /第\s*[一二三四五六七八九十\d]+\s*天|当前|这一天|加上|加入|删除|删掉|替换|调整|修改|重排|换成/.test(text);
}

function hasTripScope(text: string, context?: AgentChatContext): boolean {
  const hasCity = Boolean(context?.city?.trim()) || /[\u4e00-\u9fa5]{2,8}(?:市)?(?:.{0,4})(?:一|二|三|四|五|六|七|八|九|十|\d+)(?:天|日)/.test(text);
  const hasDays = (context?.totalDays ?? 0) >= 1 || /(?:[一二三四五六七八九十\d]+)(?:天|日)(?:游|行)?/.test(text);
  return hasCity && hasDays;
}

function knownFields(messages: ChatMessage[], context?: AgentChatContext): Set<ClarificationField> {
  const known = new Set<ClarificationField>(Object.keys(context?.clarificationAnswers ?? {}) as ClarificationField[]);
  const text = userText(messages);
  for (const [field, pattern] of Object.entries(FIELD_SIGNALS) as Array<[ClarificationField, RegExp]>) {
    // 只提及“坐高铁/飞机到达”还不足以安排首日，仍应补充车站/机场与大致时间。
    if (field === 'arrival') continue;
    if (pattern.test(text)) known.add(field);
  }
  const hasArrivalPlace = /(?:[\u4e00-\u9fa5]{2,12}(?:站|机场)|高铁站|火车站|航站楼)/.test(text);
  const hasArrivalTime = /(?:上午|中午|下午|晚上|凌晨)?\s*\d{1,2}[：:]\d{2}/.test(text);
  if (hasArrivalPlace && hasArrivalTime) known.add('arrival');
  return known;
}

function tripDayCount(text: string, context?: AgentChatContext): number {
  const match = text.match(/([一二三四五六七八九十\d]+)(?:天|日)(?:游|行)?/);
  if (!match?.[1]) return context?.totalDays ?? 1;
  const chinese: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  return Number(match[1]) || chinese[match[1]] || context?.totalDays || 1;
}

function hasExplicitPoiOrTheme(text: string): boolean {
  return FIELD_SIGNALS.interest.test(text) || /必去|想去|打算去|安排.+(?:景区|博物馆|公园|街|寺|山)/.test(text);
}

type CardCandidate = { field: keyof typeof CARD_BANK; score: number };

/**
 * 根据文本中已知事实与缺口打分，而不是固定轮询字段。
 * 分数代表该信息对 POI 选择、首日时间轴或路线可执行性的影响。
 */
function chooseNextField(
  messages: ChatMessage[],
  context: AgentChatContext | undefined,
  known: Set<ClarificationField>
): keyof typeof CARD_BANK | null {
  const text = userText(messages);
  const days = tripDayCount(text, context);
  const candidates: CardCandidate[] = [];
  const add = (field: keyof typeof CARD_BANK, score: number) => {
    if (!known.has(field)) candidates.push({ field, score });
  };

  // 节奏始终决定时间预算；若用户已经说“轻松/特种兵”等，则交给后续更具体的缺口。
  add('pace', 100);

  const arrivalMentioned = FIELD_SIGNALS.arrival.test(text);
  if (arrivalMentioned) add('arrival', 96);
  else if (days >= 2) add('arrival', 84);

  // 多日路线的酒店会决定每日起终点；一日游不为此额外追问。
  if (days >= 2) add('accommodation', 82);

  // 未给主题或必去点时，兴趣直接决定 POI 候选池。
  if (!hasExplicitPoiOrTheme(text)) add('interest', 86);

  // 老人、儿童、低预算或长行程会明显改变交通选择与步行强度。
  const specialMobility = /老人|长辈|父母|儿童|孩子|带娃|亲子/.test(text);
  const budgetSensitive = /预算|省钱|低预算|经济|平价/.test(text);
  if ((specialMobility || budgetSensitive || days >= 4) && !known.has('transport')) {
    candidates.push({ field: 'transport', score: 90 });
  }
  if (!known.has('companions') && /一起|同行|几个人|家庭/.test(text)) {
    candidates.push({ field: 'companions', score: 76 });
  }
  if (!known.has('budget') && days >= 4) {
    candidates.push({ field: 'budget', score: 70 });
  }

  candidates.sort((a, b) => b.score - a.score || a.field.localeCompare(b.field));
  return candidates[0]?.field ?? null;
}

/**
 * 固定题库状态机：只决定是否需要一张卡和下一张卡是什么，不调用大模型。
 * 城市/天数的开放式补充仍交由对话模型处理；已有行程修改及路线重排从不触发卡片。
 */
export function getServerClarification(messages: ChatMessage[], context?: AgentChatContext): ServerClarification | null {
  if (context?.replan || context?.skipClarification || (context?.clarificationCount ?? 0) >= 3) return null;
  const text = userText(messages);
  if (!hasPlanningIntent(text, context) || isExistingPlanUpdate(text, context) || !hasTripScope(text, context)) return null;

  const known = knownFields(messages, context);
  const next = chooseNextField(messages, context, known);
  return next ? CARD_BANK[next] : null;
}
