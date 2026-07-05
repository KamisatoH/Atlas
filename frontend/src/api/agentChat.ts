import { http } from '@/api/http';
import type { AgentChatRequest, AgentChatResponse } from '@/types/agentChat';

/** 调用后端大模型对话接口（Key 配置在 server/.env 的 OPENAI_API_KEY） */
export async function sendAgentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  const { data } = await http.post<AgentChatResponse>('/ai/chat', req);
  return data;
}

export type LlmConnectionStatus = 'connected' | 'disconnected' | 'checking';

/** 探测大模型是否已配置并可连接 */
export async function probeAgentAvailability(): Promise<LlmConnectionStatus> {
  try {
    const { data } = await http.get<{ connected: boolean }>('/ai/status');
    return data.connected ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}
