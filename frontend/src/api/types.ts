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