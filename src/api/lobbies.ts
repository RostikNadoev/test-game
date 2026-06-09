import { apiRequest } from './client';
import type {
  ActiveGameLobbiesResponse,
  CreateLobbyRequest,
  GamesResponse,
  JoinLobbyResponse,
  LeaveLobbyResponse,
  LobbyResponse,
  LobbiesResponse,
} from './types';

export const lobbiesApi = {
  games() {
    return apiRequest<GamesResponse>('/api/v1/lobbies/games');
  },

  create(payload: CreateLobbyRequest) {
    return apiRequest<LobbyResponse>('/api/v1/lobbies/create', {
      method: 'POST',
      body: payload,
    });
  },

  active(game?: string) {
    const query = game ? `?game=${encodeURIComponent(game)}` : '';
    return apiRequest<LobbiesResponse>(`/api/v1/lobbies/active${query}`);
  },

  activeByGame(game: string) {
    return apiRequest<ActiveGameLobbiesResponse>(
      `/api/v1/lobbies/active/${encodeURIComponent(game)}`,
    );
  },

  item(id: string) {
    return apiRequest<LobbyResponse>(`/api/v1/lobbies/item/${encodeURIComponent(id)}`);
  },

  join(lobbyId: string) {
    return apiRequest<JoinLobbyResponse>('/api/v1/lobbies/join', {
      method: 'POST',
      body: { lobby_id: lobbyId },
    });
  },

  leave(lobbyId: string) {
    return apiRequest<LeaveLobbyResponse>('/api/v1/lobbies/leave', {
      method: 'POST',
      body: { lobby_id: lobbyId },
    });
  },
};
