export type AdminUserListItem = {
  id: number
  telegram_id: number
  tg_user: string
  photo_url: string
  balance_ton: number
  balance_game: number
  is_blocked: boolean
  blocked_reason?: string
  rating: number
  created_at: string
}

export type AdminDashboardStats = {
  total_users: number
  blocked_users: number
  total_balance_game: number
  total_balance_ton: number
  active_solo_sessions: number
  active_lobbies: number
  playing_matches: number
  new_users_today: number
}

export type WalletTransaction = {
  id: number
  user_id: number
  type: string
  currency: string
  amount: number
  status: string
  meta: string
  created_at: string
}

export type GameSetting = {
  code: string
  kind: 'pvp' | 'solo'
  enabled: boolean
  title: string
  min_bet: number
  max_bet: number
  maintenance_message?: string
  sort_order: number
}

export type AdminAuditLog = {
  id: number
  admin_username: string
  action: string
  target_type?: string
  target_id?: string
  reason?: string
  before_json: string
  after_json: string
  ip?: string
  created_at: string
}

export type AdminUserDetail = {
  user: {
    id: number
    telegram_id: number
    username: string
    display_name: string
    photo_url: string
    balance_ton: number
    balance_game: number
    is_blocked: boolean
    blocked_reason?: string
    created_at: string
  }
  stats: {
    rating: number
    wins: number
    losses: number
  }
  solo_stats: {
    total_spins: number
    total_wagered: number
    total_won: number
  }
  recent_wallet_tx: WalletTransaction[]
  recent_solo_rounds: Array<{ id: string; game: string; bet_coins: number; payout_coins: number; created_at: string }>
  recent_solo_sessions: Array<{ id: string; game: string; status: string; bet_coins: number; created_at: string }>
  recent_matches: Array<{ id: number; game: string; status: string; bet_coins: number; created_at: string }>
}

export type AdminSessionsResponse = {
  solo_sessions: Array<{
    id: string
    user_id: number
    tg_user: string
    game: string
    bet_coins: number
    status: string
    multiplier: number
    created_at: string
  }>
  lobbies: Array<{
    id: string
    name: string
    game: string
    status: string
    bet_coins: number
    player_count: number
    created_at: string
  }>
  matches: Array<{
    id: number
    lobby_id: string
    game: string
    status: string
    bet_coins: number
    player1_id: number
    player2_id: number
    created_at: string
  }>
}
