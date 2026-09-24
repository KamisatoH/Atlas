import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { MapWorkspace } from '@/pages/MapWorkspace';
import { AtlasHero } from '@/pages/AtlasHero';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#18181b',
          colorPrimaryHover: '#27272a',
          colorPrimaryActive: '#09090b',
          colorLink: '#3f3f46',
          colorLinkHover: '#18181b',
          borderRadius: 10,
          borderRadiusLG: 14,
          colorBgLayout: '#f4f4f5',
          colorBgContainer: '#ffffff',
          colorBorder: '#e4e4e7',
          colorText: '#18181b',
          colorTextSecondary: '#71717a',
          fontFamily:
            "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif",
          boxShadowSecondary:
            '0 12px 32px rgba(24, 24, 27, 0.08), 0 1px 2px rgba(24, 24, 27, 0.06)',
        },
        components: {
          Button: {
            primaryShadow: '0 3px 10px rgba(24, 24, 27, 0.18)',
            defaultBorderColor: '#d4d4d8',
            fontWeight: 500,
          },
          Table: {
            headerBg: '#fafafa',
            headerColor: '#71717a',
            rowHoverBg: '#f4f4f5',
          },
          Tag: {
            defaultBg: '#f4f4f5',
          },
          Modal: {
            borderRadiusLG: 16,
          },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AtlasHero />} />
          <Route path="/workspace" element={<MapWorkspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
