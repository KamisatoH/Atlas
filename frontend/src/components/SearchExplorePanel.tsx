import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';
import { PoiSearch } from '@/components/PoiSearch';
import type { PoiHit } from '@/types/poi';

const { Text, Paragraph } = Typography;

export function SearchExplorePanel({
  selectedPoi,
  searchCity,
  onSelectPoi,
  onClearPoi,
  onClearCity,
}: {
  selectedPoi: PoiHit | null;
  searchCity: string | null;
  onSelectPoi: (p: PoiHit) => void;
  onClearPoi: () => void;
  onClearCity?: () => void;
}) {
  return (
    <div className="search-explore-panel pointer-events-auto w-full max-w-[min(100%,22rem)]">
      <div className="panel-title-row mb-2.5 flex items-center gap-2">
        <span className="panel-title-icon">
          <SearchOutlined />
        </span>
        <div className="min-w-0 flex-1">
          <Text strong className="block text-sm text-slate-800">
            探索目的地
          </Text>
          <Text type="secondary" className="block text-[11px]">
            从地图灵感开始，把地点送进你的旅行工作台
          </Text>
        </div>
      </div>

      {searchCity && (
        <div className="search-city-banner mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5">
          <Text className="text-xs text-emerald-800">
            当前城市切换为「<Text strong>{searchCity}</Text>」
          </Text>
          {onClearCity && (
            <Button type="link" size="small" className="!h-auto !p-0 text-[11px]" onClick={onClearCity}>
              全国搜索
            </Button>
          )}
        </div>
      )}

      <PoiSearch city={searchCity} onSelect={onSelectPoi} placeholder="搜索景点、餐厅、酒店…" />
      <div className="search-suggestion-row mt-2 flex flex-wrap gap-1.5">
        <span className="search-suggestion-pill">双击地图选点</span>
        <span className="search-suggestion-pill">点击周边店铺加入</span>
        <span className="search-suggestion-pill">酒店也能作为每日起终点</span>
      </div>
      <Text type="secondary" className="mt-1.5 block text-xs leading-relaxed">
        搜索或双击地图选点；选定地点后将按所属城市限定后续搜索。
      </Text>

      {selectedPoi && (
        <div className="poi-preview-card mt-3 rounded-xl border border-emerald-100 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
          <div className="mb-1 flex items-start gap-2">
            <EnvironmentOutlined className="mt-0.5 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <Text strong className="block leading-snug text-slate-800">
                {selectedPoi.name}
              </Text>
              {selectedPoi.city && (
                <Tag bordered={false} color="green" className="!mr-0 !mt-1 text-[10px]">
                  {selectedPoi.city}
                </Tag>
              )}
              {selectedPoi.address && (
                <Paragraph
                  type="secondary"
                  className="!mb-0 mt-0.5 text-xs leading-relaxed"
                  ellipsis={{ rows: 2 }}
                >
                  {selectedPoi.address}
                </Paragraph>
              )}
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="small" type="text" onClick={onClearPoi}>
              取消选中
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
