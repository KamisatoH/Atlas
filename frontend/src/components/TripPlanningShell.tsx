import type { ReactNode } from 'react';
import { Button, Typography } from 'antd';
import { CalendarOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type TripPlanningEntryButtonProps = {
  summary?: string;
  onClick: () => void;
};

/** 收起时在地图上唤出行程规划 */
export function TripPlanningEntryButton({ summary, onClick }: TripPlanningEntryButtonProps) {
  return (
    <Button
      type="primary"
      size="large"
      icon={<CalendarOutlined />}
      className="trip-planning-entry"
      onClick={onClick}
    >
      <span className="trip-planning-entry-label">行程规划</span>
      {summary ? <span className="trip-planning-entry-summary">{summary}</span> : null}
    </Button>
  );
}

export type TripPlanningShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** 行程规划侧栏（展开态） */
export function TripPlanningShell({ open, onClose, children }: TripPlanningShellProps) {
  if (!open) return null;

  return (
    <aside className="trip-planning-shell trip-planning-shell--open">
      <div className="trip-planning-shell-bar shrink-0">
        <div className="shell-bar-title">
          <span className="shell-bar-icon shell-bar-icon--trip">
            <CalendarOutlined />
          </span>
          <Text strong className="text-sm text-slate-800">
            行程规划
          </Text>
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="收起行程规划"
          className="shell-close-btn"
          onClick={onClose}
        >
          收起
        </Button>
      </div>
      <div className="trip-planning-shell-body min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
