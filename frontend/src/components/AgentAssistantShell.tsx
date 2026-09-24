import type { ReactNode } from 'react';
import { Typography } from 'antd';
import { CalendarOutlined, CompassOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type AgentAssistantShellProps = {
  mode: 'ai' | 'manual';
  onModeChange: (mode: 'ai' | 'manual') => void;
  children: ReactNode;
};

/**
 * Atlas 的统一规划工作台：AI 先给出方案，行程页用于查看、补充和细调。
 * 两种方式共享同一份地图与行程状态，避免成为互相割裂的入口。
 */
export function AgentAssistantShell({ mode, onModeChange, children }: AgentAssistantShellProps) {
  return (
    <aside
      className={`agent-assistant-shell agent-assistant-shell--persistent agent-assistant-shell--${mode}`}
      data-tour="planning-workbench"
    >
      <div className="agent-assistant-shell-bar shrink-0">
        <div className="shell-bar-title">
          <span className="shell-bar-icon shell-bar-icon--ai">
            <CompassOutlined />
          </span>
          <div>
            <Text strong className="block text-sm text-slate-800">
              规划路线
            </Text>
          </div>
        </div>
        <div className="planner-mode-switch" role="tablist" aria-label="行程规划视图">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ai'}
            className={`planner-mode-tab ${mode === 'ai' ? 'is-active' : ''}`}
            onClick={() => onModeChange('ai')}
          >
            <CompassOutlined />
            对话规划
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            data-tour="planner-mode-manual"
            className={`planner-mode-tab ${mode === 'manual' ? 'is-active' : ''}`}
            onClick={() => onModeChange('manual')}
          >
            <CalendarOutlined />
            行程
          </button>
        </div>
      </div>
      <div className="agent-assistant-shell-body min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
