import { create } from 'zustand';
import { http, setAuthToken } from '@/api/http';

interface AuthState {
  token: string | null;
  email: string | null;
  setSession: (token: string, email: string) => void;
  clear: () => void;
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  email: null,
  setSession: (token, email) => {
    setAuthToken(token);
    set({ token, email });
  },
  clear: () => {
    setAuthToken(null);
    set({ token: null, email: null });
  },
  restore: () => {
    const t = localStorage.getItem('atlas_token');
    if (t) {
      setAuthToken(t);
      set({ token: t });
    }
  },
}));

export async function loginRequest(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: { email: string } }>('/auth/login', {
    email,
    password,
  });
  useAuthStore.getState().setSession(data.token, data.user.email);
}

export async function registerRequest(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: { email: string } }>('/auth/register', {
    email,
    password,
  });
  useAuthStore.getState().setSession(data.token, data.user.email);
}
