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
      'Atlas 以对话规划为起点：先生成可执行路线，再随时回到地图与日程中手动调整。',
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
    title: '规划路线 · 对话起步',
    target: '[data-tour="planning-workbench"]',
    placement: 'left',
    padding: 8,
    description:
      '输入城市、天数和偏好，可生成单日或多日连续行程。应用后可在同一工作台切换到「自主规划」，编辑站点、时长与交通。',
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
    description: '教程就到这里。地图与规划工作台会始终并排，随时可以继续调整。',
    placement: 'center',
  },
];
