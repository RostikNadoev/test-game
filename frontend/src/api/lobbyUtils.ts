import type { ApiUser, Lobby, LobbyPlayerInfo } from './types';

export function resolvePlayersInfo(lobby: Lobby, currentUser?: ApiUser | null): LobbyPlayerInfo[] {
  if (lobby.players_info?.length) {
    return lobby.players_info;
  }

  return lobby.players.map((playerId) => {
    if (currentUser && playerId === currentUser.id) {
      return {
        id: currentUser.id,
        tg_user: currentUser.tg_user || `Player #${playerId}`,
        photo_url: currentUser.photo_url || '',
      };
    }

    return {
      id: playerId,
      tg_user: `Player #${playerId}`,
      photo_url: '',
    };
  });
}

export function getOpponentInfo(
  lobby: Lobby,
  currentUser?: ApiUser | null,
): LobbyPlayerInfo | null {
  if (!currentUser) return null;

  const playersInfo = resolvePlayersInfo(lobby, currentUser);
  return playersInfo.find((player) => player.id !== currentUser.id) || null;
}
