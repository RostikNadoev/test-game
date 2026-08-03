export type UserStats = {
  rating: number;
  wins: number;
  losses: number;
  total_games: number;
  winrate: number;
  favorite_mode: string;
};

export type ApiUser = {
  id: number;
  telegram_id: number;
  tg_user: string;
  photo_url: string;
  balance_ton: number;
  balance_game: number;
  stats: UserStats;
  created_at: string;
};

export type AuthTelegramRequest = {
  init_data: string;
};

export type AuthTelegramResponse = {
  token: string;
  user: ApiUser;
};

export type UserResponse = {
  user: ApiUser;
};

export type Balance = {
  ton: number;
  game: number;
};

export type BalanceResponse = {
  balance: Balance;
};

export type StatsResponse = {
  stats: UserStats;
};

export type ExchangeTonToGameRequest = {
  coins: number;
};

export type ExchangeTonToGameResponse = {
  success: boolean;
  rate?: string;
  coins?: number;
  spent_ton?: number;
  balance_game?: number;
  balance: {
    ton?: number;
    game: number;
  };
};

export type TopUpQuoteRequest = {
  coins: number;
};

export type TopUpQuoteResponse = {
  coins: number;
  required_ton: number;
  rate: string;
};

export type HealthResponse = {
  status: string;
  app: string;
  database: string;
};

export type WithdrawalStatus = 'pending' | 'completed';

export type WithdrawalItem = {
  id: number;
  type: 'withdrawal';
  status: WithdrawalStatus;
  game_amount: number;
  ton_amount: string;
  wallet_address: string;
  created_at: string;
  completed_at?: string | null;
};

export type WithdrawalHistoryResponse = {
  withdrawals: WithdrawalItem[];
  count: number;
};

export type CreateWithdrawalResponse = {
  withdrawal: WithdrawalItem;
  balance: {
    game: number;
  };
};

export type WithdrawalEligibility = {
  eligible: boolean;
  minimum_amount: number;
  wallet_verified: boolean;
  required_wallet?: string;
  games_completed: number;
  games_required: number;
  wagered_game: number;
  wager_required_game: number;
  deposit_wager_required: number;
  bonus_wager_required: number;
  balance_game: number;
  balance_ready: boolean;
  no_pending_withdrawal: boolean;
  no_active_game: boolean;
  wallet_cooldown_ready: boolean;
  wallet_cooldown_until?: string;
};

export type OnlinePresenceResponse = {
  online: number;
};

export type BackendGame = {
  code: string;
  display_name: string;
  min_bet?: number;
  max_bet?: number;
};

export type GamesResponse = {
  games: BackendGame[];
  count: number;
};

export type ReferralStatus = {
  code: string;
  invite_url: string;
  channel_url: string;
  reward_rating: number;
  invited_count: number;
  rewarded_count: number;
  earned_rating: number;
  incoming_pending: boolean;
  incoming_rewarded: boolean;
  subscription_verified: boolean;
};

export type ReferralCheckResponse = ReferralStatus & {
  subscribed: boolean;
  reward_granted: boolean;
};

export type LobbyStatus = 'waiting' | 'playing' | 'finished';

export type LobbyPlayerInfo = {
  id: number;
  tg_user: string;
  photo_url: string;
};

export type Lobby = {
  id: string;
  name: string;
  game: string;
  status: LobbyStatus;
  bet_coins: number;
  max_players: number;
  player_count: number;
  players: number[];
  players_info?: LobbyPlayerInfo[];
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type LobbyResponse = {
  lobby: Lobby;
};

export type LobbiesResponse = {
  lobbies: Lobby[];
  count: number;
  game?: string;
};

export type ActiveGameLobbiesResponse = {
  game: string;
  lobbies: Lobby[];
  count: number;
};

export type CreateLobbyRequest = {
  name: string;
  game: string;
  bet_coins: number;
};

export type JoinLobbyRequest = {
  lobby_id: string;
};

export type LeaveLobbyRequest = {
  lobby_id: string;
};

export type JoinLobbyResponse = {
  success: boolean;
  lobby: Lobby;
};

export type LeaveLobbyResponse =
  | {
      success: boolean;
      deleted: false;
      lobby: Lobby;
    }
  | {
      success: boolean;
      deleted: true;
    };

export type ApiErrorBody = {
  error?: string;
  details?: string;
  game?: string;
};

export type FinishMatchRequest = {
  lobby_id: string;
  game: string;
  winner_user_id?: number | null;
};

export type FinishMatchResponse = {
  success: boolean;
  pending?: boolean;
  message?: string;
  balance?: {
    ton: number;
    game: number;
  };
  stats?: UserStats;
};

export type LeaderboardEntry = {
  id: number;
  tg_user: string;
  photo_url: string;
  rating: number;
  wins: number;
};

export type LeaderboardResponse = {
  players: LeaderboardEntry[];
  count: number;
};

export type SoloGameInfo = {
  code: string;
  title: string;
  mode: 'instant' | 'session';
  min_bet: number;
  max_bet: number;
};

export type SoloStats = {
  total_spins: number;
  total_wagered: number;
  total_won: number;
  biggest_win: number;
  favorite_solo_game: string;
  last_played_at?: string | null;
};

export type SoloGamesResponse = {
  games: SoloGameInfo[];
  count: number;
};

export type SoloStatsResponse = {
  solo_stats: SoloStats;
};

export type SoloSpinResponse = {
  success: boolean;
  round_id: string;
  game: string;
  bet_coins: number;
  payout_coins: number;
  net_coins: number;
  outcome: unknown;
  balance: { game: number };
  solo_stats: SoloStats;
};

export type CrystalMinesPublicState = {
  picked: number[];
  safe_picks: number;
};

export type TurboTowerPublicState = {
  current_floor: number;
  cleared_floors: number;
  picked: number[];
};

export type Royal5x5PublicState = {
  current_row: number;
  opened_rows: number;
  picked_by_row: number[];
};

export type SoloSessionPublicState =
  | CrystalMinesPublicState
  | TurboTowerPublicState
  | Royal5x5PublicState;

export type SoloSessionStartResponse = {
  success: boolean;
  session_id: string;
  game: string;
  bet_coins: number;
  status: string;
  multiplier: number;
  opened_steps: number;
  public_state?: SoloSessionPublicState;
  balance: { game: number };
  solo_stats: SoloStats;
};

export type SoloSessionStepResponse = SoloSessionStartResponse & {
  event?: unknown;
  payout_coins?: number;
};

export type SoloCashoutResponse = SoloSessionStepResponse;

export type SoloHistoryRound = {
  id: string;
  game: string;
  bet_coins: number;
  payout_coins: number;
  net_coins: number;
  created_at: string;
};

export type SoloHistoryResponse = {
  rounds: SoloHistoryRound[];
  count: number;
};

export type TurboStatus = {
  status: 'idle' | 'searching' | 'playing' | 'finished';
  online_count: number;
  series_id?: string;
  bet_coins: number;
  round?: number;
  games?: string[];
  wins?: Record<string, number>;
  player_ids?: number[];
  current_game?: string;
  current_lobby?: Lobby;
  winner_user_id?: number;
  draw?: boolean;
  last_round_winner_user_id?: number;
  finish_reason?: 'disconnect';
};
