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

export type BackendGame = {
  code: string;
  display_name: string;
};

export type GamesResponse = {
  games: BackendGame[];
  count: number;
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
  balance: {
    ton: number;
    game: number;
  };
  stats: UserStats;
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

export type SoloSessionStartResponse = {
  success: boolean;
  session_id: string;
  game: string;
  bet_coins: number;
  status: string;
  multiplier: number;
  opened_steps: number;
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