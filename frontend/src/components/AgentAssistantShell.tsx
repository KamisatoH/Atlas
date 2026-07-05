import type { ReactNode } from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type AgentAssistantEntryButtonProps = {
  onClick: () => void;
};

/** 收起时在地图上唤出 AI 助手 */
export function AgentAssistantEntryButton({ onClick }: AgentAssistantEntryButtonProps) {
  return (
    <Button
      type="primary"
      size="large"
      icon={<RobotOutlined />}
      className="agent-assistant-entry"
      onClick={onClick}
    >
      <span className="agent-assistant-entry-label">AI 助手</span>
    </Button>
  );
}

export type AgentAssistantShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** AI 助手侧栏（展开态） */
export function AgentAssistantShell({ open, onClose, children }: AgentAssistantShellProps) {
  if (!open) return null;

  return (
    <aside className="agent-assistant-shell agent-assistant-shell--open">
      <div className="agent-assistant-shell-bar shrink-0">
        <div className="shell-bar-title">
          <span className="shell-bar-icon shell-bar-icon--ai">
            <RobotOutlined />
          </span>
          <Text strong className="text-sm text-slate-800">
            AI 助手
          </Text>
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="收起 AI 助手"
          className="shell-close-btn"
          onClick={onClose}
        >
          收起
        </Button>
      </div>
      <div className="agent-assistant-shell-body min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
