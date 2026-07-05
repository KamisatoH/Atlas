import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { MapWorkspace } from '@/pages/MapWorkspace';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#059669',
          colorLink: '#059669',
          colorLinkHover: '#047857',
          borderRadius: 12,
          borderRadiusLG: 16,
          colorBgLayout: '#eef2f6',
          colorBgContainer: '#ffffff',
          colorBorder: '#e2e8f0',
          colorText: '#1e293b',
          colorTextSecondary: '#64748b',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          boxShadowSecondary:
            '0 4px 24px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        },
        components: {
          Button: {
            primaryShadow: '0 2px 8px rgba(5, 150, 105, 0.22)',
            defaultBorderColor: '#e2e8f0',
            fontWeight: 500,
          },
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#64748b',
            rowHoverBg: '#f0fdf4',
          },
          Tag: {
            defaultBg: '#f1f5f9',
          },
          Modal: {
            borderRadiusLG: 16,
          },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapWorkspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
