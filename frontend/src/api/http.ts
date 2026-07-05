import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  timeout: 90000,
});

/** 将 axios 错误转为用户可读提示 */
export function describeApiError(e: unknown): string {
  if (!axios.isAxiosError(e)) {
    return '请求失败，请稍后重试。';
  }
  if (e.code === 'ECONNABORTED') {
    return '请求超时。若后端已启动，请检查 server/.env 中大模型 API 配置（OPENAI_BASE_URL / OPENAI_MODEL）。';
  }
  if (!e.response) {
    return '无法连接后端。请在 server 目录运行 `npm run dev`，并确认端口 3001 未被占用。';
  }
  if (e.response.status === 503) {
    const data = e.response.data as { error?: string; code?: string };
    if (data?.code === 'LLM_UNAVAILABLE') {
      return data.error ?? '大模型请求失败，请稍候重试';
    }
  }
  if (e.response.status === 502) {
    const data = e.response.data as { error?: string; code?: string };
    if (data?.code === 'LLM_PARSE_ERROR') {
      return data.error ?? '模型响应解析失败，请重试';
    }
  }
  if (e.response.status >= 500) {
    return '后端服务异常，请查看 server 终端中的报错日志。';
  }
  const msg = (e.response.data as { error?: string })?.error;
  return msg ? `请求失败：${msg}` : `请求失败（HTTP ${e.response.status}）。`;
}

export function setAuthToken(token: string | null) {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('atlas_token', token);
  } else {
    delete http.defaults.headers.common.Authorization;
    localStorage.removeItem('atlas_token');
  }
}

const existing = localStorage.getItem('atlas_token');
if (existing) {
  http.defaults.headers.common.Authorization = `Bearer ${existing}`;
}
