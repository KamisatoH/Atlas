import { ArrowRightOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

type RouteOption = {
  city: string;
  duration: string;
  stops: string;
  travel: string;
  legs: [string, string, string];
  note: string;
};

const routes: RouteOption[] = [
  {
    city: '上海 · 杭州 · 黄山',
    duration: '3 日',
    stops: '7 地点',
    travel: '在途约 5 小时',
    legs: ['上海', '杭州', '黄山'],
    note: '高铁 1 小时 35 分 · 抵达后继续向山行',
  },
  {
    city: '成都 · 都江堰 · 青城山',
    duration: '2 日',
    stops: '6 地点',
    travel: '在途约 2 小时',
    legs: ['成都', '都江堰', '青城山'],
    note: '城际铁路 28 分 · 预留半日慢游时间',
  },
  {
    city: '广州 · 佛山 · 顺德',
    duration: '2 日',
    stops: '8 地点',
    travel: '在途约 1 小时',
    legs: ['广州', '佛山', '顺德'],
    note: '地铁与短途打车衔接 · 用餐时间已留白',
  },
];

export function AtlasHero() {
  const navigate = useNavigate();
  const [routeIndex, setRouteIndex] = useState(0);
  const route = routes[routeIndex];

  const nextRoute = () => setRouteIndex((current) => (current + 1) % routes.length);

  return (
    <main className="atlas-hero-page">
      <nav className="atlas-hero-nav" aria-label="主导航">
        <button className="atlas-wordmark" type="button" onClick={() => setRouteIndex(0)} aria-label="Atlas 首页">
          <span className="atlas-mark" aria-hidden="true">A</span>
          <span>Atlas</span>
        </button>
        <div className="atlas-nav-links">
          <button type="button" onClick={nextRoute}>示例路线</button>
          <button type="button" onClick={() => navigate('/workspace')}>打开工作台</button>
          <Button size="small" onClick={() => navigate('/workspace')}>登录</Button>
        </div>
      </nav>

      <section className="atlas-hero" aria-labelledby="atlas-hero-title">
        <div className="atlas-hero-copy">
          <p className="atlas-eyebrow"><span />智能行程规划</p>
          <h1 id="atlas-hero-title">把想去的地方，<br />排成走得通的旅程。</h1>
          <p className="atlas-hero-lede">全世界的水都将重逢</p>
          <div className="atlas-hero-actions">
            <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPosition="end" onClick={() => navigate('/workspace')}>
              开始规划行程
            </Button>
            <button className="atlas-quiet-action" type="button" onClick={nextRoute}>
              <PlayCircleOutlined aria-hidden="true" /> 查看示例路线
            </button>
          </div>
          <p className="atlas-proof">目的地 · 时间 · 交通方式 · 可随时调整</p>
        </div>

        <div className="atlas-route-stage" aria-label={`示例路线：${route.city}`}>
          <div className="atlas-map-texture" aria-hidden="true">
            <span className="atlas-contour contour-one" />
            <span className="atlas-contour contour-two" />
            <span className="atlas-contour contour-three" />
            <span className="atlas-grid" />
          </div>
          <div className="atlas-stage-topline">
            <span>示例行程</span>
            <button type="button" onClick={nextRoute}>换一条 <ArrowRightOutlined aria-hidden="true" /></button>
          </div>
          <div className="atlas-route-title">{route.city}</div>
          <svg className="atlas-route-svg" viewBox="0 0 720 370" preserveAspectRatio="none" aria-hidden="true">
            <path className="atlas-route-shadow" d="M82 276 C204 292 209 116 351 160 S479 287 641 78" />
            <path key={route.city} className="atlas-route-line" d="M82 276 C204 292 209 116 351 160 S479 287 641 78" />
          </svg>
          <ol className="atlas-stops">
            {route.legs.map((leg, index) => (
              <li key={leg} className={`atlas-stop atlas-stop-${index + 1}`}>
                <span className="atlas-stop-dot">{index + 1}</span>
                <span className="atlas-stop-name">{leg}</span>
                <span className="atlas-stop-time">{index === 0 ? '09:20' : index === 1 ? '11:05' : '16:40'}</span>
              </li>
            ))}
          </ol>
          <article className="atlas-route-note">
            <span className="atlas-note-pin" aria-hidden="true" />
            <div><strong>路线已排好</strong><small>{route.note}</small></div>
          </article>
          <div className="atlas-route-summary" aria-label="路线摘要">
            <div><strong>{route.duration}</strong><span>行程天数</span></div>
            <div><strong>{route.stops}</strong><span>推荐地点</span></div>
            <div><strong>{route.travel}</strong><span>交通时间</span></div>
          </div>
        </div>
      </section>

      <footer className="atlas-hero-footer"><span>ATLAS / ROUTE PLANNING TOOL</span><span>从一张地图开始</span></footer>
    </main>
  );
}
