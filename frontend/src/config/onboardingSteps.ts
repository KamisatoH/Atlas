export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  /** `[data-tour="…"]` 选择器；省略则为居中欢迎页 */
  target?: string;
  placement?: TourPlacement;
  padding?: number;
  /** 目标不存在时仍展示居中说明，不阻塞流程 */
  optional?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '欢迎使用 Atlas',
    description:
      'Atlas 是地图驱动的行程工具：在大地图上探索地点、用 AI 对话规划路线，并在行程面板里查看到达/离开时间与路段交通。跟着引导快速上手吧。',
    placement: 'center',
  },
  {
    id: 'map-explore',
    title: '自由选点 · 搜索探索',
    target: '[data-tour="map-explore"]',
    placement: 'bottom',
    padding: 10,
    description:
      '在左上角搜索景点、餐厅或酒店，选中后可在行程规划里加入。搜索会按当前城市限定范围，也可在地图上直接探索。',
  },
  {
    id: 'map-canvas',
    title: '自由选点 · 地图交互',
    target: '[data-tour="map-canvas"]',
    placement: 'top',
    padding: 6,
    description:
      '单击地图查看周边 POI，双击可选中位置；点击周边兴趣点可加入当日行程。路线与站点会实时显示在地图上。',
  },
  {
    id: 'ai-assistant',
    title: 'AI 助手 · 对话规划',
    target: '[data-tour="ai-assistant"]',
    placement: 'bottom',
    padding: 8,
    description:
      '告诉助手城市、天数和偏好，可生成单日或多日连续行程。生成后点击「应用」写入对应日期；若该日已有站点会先提示是否覆盖。',
  },
  {
    id: 'trip-planning',
    title: '行程规划 · 时间与站点',
    target: '[data-tour="trip-planning"]',
    placement: 'bottom',
    padding: 8,
    description:
      '在这里切换旅程日期、编辑每日站点顺序、调整游玩时长与交通方式。系统会根据路段耗时推算各站到达/离开时间。',
  },
  {
    id: 'map-shortcuts',
    title: '地图快捷入口',
    target: '[data-tour="map-entries"]',
    placement: 'left',
    padding: 8,
    optional: true,
    description:
      '侧栏收起时，地图右侧也会出现「AI 助手」和「行程规划」快捷按钮，方便在大地图全屏模式下随时唤出。',
  },
  {
    id: 'toolbar',
    title: '底栏工具',
    target: '[data-tour="toolbar"]',
    placement: 'top',
    padding: 8,
    description:
      '可导出 PDF/长图；登录后还可保存与加载方案。需要从零开始时使用「清空行程」。',
  },
  {
    id: 'finish',
    title: '准备出发',
    description: '教程就到这里。随时在顶栏打开 AI 助手与行程规划，用 Atlas 开始规划你的下一段旅程吧。',
    placement: 'center',
  },
];
