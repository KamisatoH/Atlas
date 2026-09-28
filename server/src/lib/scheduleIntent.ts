export type ScheduleIntent = 'leisure' | 'agenda' | 'mixed';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function userScheduleText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');
}

const AGENDA_SIGNAL =
  /提车|取车|看车|试驾|保养|维修|上牌|办事|办理|办证|开会|会议|面试|就医|复诊|体检|拜访|签约|接人|送人|考试|上课|培训|演出|婚礼|预约|交付|取货|领奖|看房|搬家|出差|客户|洽谈/;
const LEISURE_SIGNAL =
  /旅游|旅行|游玩|景点|景区|攻略|打卡|逛街|美食|小吃|博物馆|公园|古镇|夜景|度假|徒步|露营|拍照|出片/;

/** 将地点型请求区分为游玩、办事日程或二者混合。 */
export function resolveScheduleIntent(messages: ChatMessage[]): ScheduleIntent {
  const text = userScheduleText(messages);
  const agenda = AGENDA_SIGNAL.test(text);
  const leisure = LEISURE_SIGNAL.test(text);
  if (agenda && leisure) return 'mixed';
  if (agenda) return 'agenda';
  return 'leisure';
}

export function hasAgendaSignal(text: string): boolean {
  return AGENDA_SIGNAL.test(text);
}
