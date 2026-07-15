const TOKEN_KEY = 'admin_token'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAdminToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`/api/v1/admin${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : 'request failed'
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ username: string; role: string }>('/auth/me'),

  dashboard: () =>
    request<{ stats: import('./types').AdminDashboardStats; recent_transactions: import('./types').WalletTransaction[] }>(
      '/dashboard',
    ),

  listUsers: (params: URLSearchParams) =>
    request<{ users: import('./types').AdminUserListItem[]; total: number }>(`/users?${params}`),

  getUser: (id: number) => request<import('./types').AdminUserDetail>(`/users/${id}`),

  blockUser: (id: number, reason: string) =>
    request(`/users/${id}/block`, { method: 'POST', body: JSON.stringify({ reason }) }),

  unblockUser: (id: number, reason: string) =>
    request(`/users/${id}/unblock`, { method: 'POST', body: JSON.stringify({ reason }) }),

  adjustWallet: (id: number, payload: { currency: string; operation: string; amount: number; reason: string }) =>
    request(`/users/${id}/wallet/adjust`, { method: 'POST', body: JSON.stringify(payload) }),

  sessions: () => request<import('./types').AdminSessionsResponse>('/sessions'),

  abandonSolo: (id: string, reason: string) =>
    request(`/sessions/solo/${id}/abandon`, { method: 'POST', body: JSON.stringify({ reason }) }),

  games: () => request<{ games: import('./types').GameSetting[] }>('/games'),

  patchGame: (code: string, payload: Record<string, unknown>) =>
    request(`/games/${code}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  audit: (params: URLSearchParams) =>
    request<{ items: import('./types').AdminAuditLog[]; total: number }>(`/audit?${params}`),
}
