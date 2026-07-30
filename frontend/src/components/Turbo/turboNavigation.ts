import type { NavigateFunction } from 'react-router-dom';
import type { LobbyPlayerInfo, TurboStatus } from '../../api';
import { getGameByCode } from '../../data/games';

export const TURBO_SERIES_KEY = 'twingames_turbo_series_id';
export const ACTIVE_LOBBY_KEY = 'twingames_active_lobby_id';

export const prepareTurboSeries = (status: TurboStatus) => {
  if (!status.series_id) return false;

  window.sessionStorage.setItem(TURBO_SERIES_KEY, status.series_id);
  window.sessionStorage.removeItem(ACTIVE_LOBBY_KEY);
  window.sessionStorage.removeItem('twingames_active_game');
  window.sessionStorage.removeItem('twingames_players_info');
  window.sessionStorage.removeItem('twingames_blackjack_players_info');
  return true;
};

export const storeTurboRound = (status: TurboStatus) => {
  const lobby = status.current_lobby;
  if (!lobby || !status.current_game || !status.series_id) return;

  window.sessionStorage.setItem(TURBO_SERIES_KEY, status.series_id);
  window.sessionStorage.setItem(ACTIVE_LOBBY_KEY, lobby.id);
  window.sessionStorage.setItem('twingames_active_game', status.current_game);
  window.sessionStorage.setItem(
    'twingames_players_info',
    JSON.stringify(lobby.players_info || []),
  );
  window.sessionStorage.setItem(
    'twingames_blackjack_players_info',
    JSON.stringify(lobby.players_info || []),
  );
};

export const enterTurboRound = (
  status: TurboStatus,
  navigate: NavigateFunction,
) => {
  const lobby = status.current_lobby;
  const game = status.current_game ? getGameByCode(status.current_game) : null;
  if (!lobby || !game) return false;

  storeTurboRound(status);
  const playersInfo = (lobby.players_info || []) as LobbyPlayerInfo[];
  navigate(game.playPath, {
    replace: true,
    state: {
      lobbyId: lobby.id,
      game: lobby.game,
      playersInfo,
      turboSeriesId: status.series_id,
    },
  });
  return true;
};
