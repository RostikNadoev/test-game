import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Определяем интерфейсы прямо здесь
interface Lobby {
  id: string;
  gameId: string;
  gameName: string;
  name: string;
  betAmount: number;
  players: string[];
  status: 'waiting' | 'playing';
  createdAt: number;
}

interface UserStats {
  stars: number;
  coins: number;
}

interface AppState {
  user: UserStats;
  lobbies: Lobby[];
  addStars: (amount: number) => void;
  convertStarsToCoins: (amount: number) => void;
  createLobby: (lobby: Omit<Lobby, 'id' | 'createdAt' | 'players' | 'status'>) => void;
  joinLobby: (lobbyId: string) => void;
  startRaceGame: (lobbyId: string) => boolean;
  getLobbiesByGame: (gameId: string) => Lobby[];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: {
        stars: 150,
        coins: 500,
      },
      lobbies: [
        {
          id: '1',
          gameId: 'tanks',
          gameName: 'Tanks 2D',
          name: "Битва титанов",
          betAmount: 100,
          players: ['player1'],
          status: 'waiting',
          createdAt: Date.now(),
        },
        {
          id: '2',
          gameId: 'tanks',
          gameName: 'Tanks 2D',
          name: "Новички",
          betAmount: 50,
          players: ['player1'],
          status: 'waiting',
          createdAt: Date.now(),
        },
        {
          id: '3',
          gameId: 'race',
          gameName: 'Street Race',
          name: "Гоночная битва",
          betAmount: 100,
          players: ['player1'],
          status: 'waiting',
          createdAt: Date.now(),
        },
        {
          id: '4',
          gameId: 'race',
          gameName: 'Street Race',
          name: "Ночная гонка",
          betAmount: 150,
          players: ['player1'],
          status: 'waiting',
          createdAt: Date.now(),
        }
      ],
      
      addStars: (amount) => set((state) => ({
        user: { ...state.user, stars: state.user.stars + amount }
      })),
      
      convertStarsToCoins: (amount) => {
        const starsCost = amount;
        const coinsGet = amount * 100;
        set((state) => ({
          user: {
            stars: state.user.stars - starsCost,
            coins: state.user.coins + coinsGet
          }
        }));
      },
      
      createLobby: (lobbyData) => {
        const newLobby: Lobby = {
          id: Math.random().toString(36).substr(2, 9),
          ...lobbyData,
          players: ['currentUser'],
          status: 'waiting',
          createdAt: Date.now(),
        };
        set((state) => ({
          lobbies: [...state.lobbies, newLobby]
        }));
      },
      
      joinLobby: (lobbyId) => {
        set((state) => ({
          lobbies: state.lobbies.map(lobby => 
            lobby.id === lobbyId && lobby.players.length === 1
              ? { ...lobby, players: [...lobby.players, 'currentUser'], status: 'playing' }
              : lobby
          )
        }));
      },
      
      startRaceGame: (lobbyId) => {
        const lobby = get().lobbies.find(l => l.id === lobbyId);
        if (lobby && lobby.gameId === 'race') {
          return true;
        }
        return false;
      },
      
      getLobbiesByGame: (gameId) => {
        return get().lobbies.filter(l => l.gameId === gameId && l.status === 'waiting');
      },
    }),
    {
      name: 'tg-game-storage',
    }
  )
);