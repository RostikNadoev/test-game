import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { CreateLobby } from './pages/CreateLobby';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { RaceGame } from './pages/RaceGame';
import { AirHockeyGame } from './pages/AirHockeyGame';
import { ArcherGame } from './pages/ArcherGame';
import { PaperGame } from './pages/PaperGame';
import MiniGolfBeautiful from './pages/MiniGolfGame';
import NewGame from './pages/NewGame';
import PoolGame from './pages/PoolGame';
import { ChaseGame } from './pages/ChaseGame';
import { BlackjackDuelGame } from './pages/BlackjackDuelGame';
import { GridLockGame } from './pages/GridLockGame';
import { TicTacToeDuelGame } from './pages/TicTacToeDuelGame';
import { RockPaperScissorsDuelGame } from './pages/RockPaperScissorsDuelGame';
import { HexFallGame } from './pages/HexFallGame';
import { ApartmentHideoutGame } from './pages/ApartmentHideoutGame';
import { SlingClashGame } from './pages/SlingClashGame';
import { ParkDuelGame } from './pages/ParkDuelGame';
import { ChronoSlashGame } from './pages/ChronoSlashGame';

const FOOTER_ROUTES = ['/', '/profile', '/rating'];

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick?: (callback: () => void) => void;
  };
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
};

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isPoolRoute = location.pathname === '/game/pool/play';
  const isChaseRoute = location.pathname === '/game/chase/play';
  const isBlackjackRoute = location.pathname === '/game/blackjack/play';
  const isGridLockRoute = location.pathname === '/game/gridlock/play';
  const isTicTacToeRoute = location.pathname === '/game/tictactoe/play';
  const isRpsRoute = location.pathname === '/game/rps/play';
  const isHexFallRoute = location.pathname === '/game/hexfall/play';
  const isHideoutRoute = location.pathname === '/game/hideout/play';
  const isSlingClashRoute = location.pathname === '/game/slingclash/play';
  const isParkDuelRoute = location.pathname === '/game/parkduel/play';
  const isChronoSlashRoute = location.pathname === '/game/chronoslash/play';

  const isLockedGameRoute =
    isPoolRoute ||
    isChaseRoute ||
    isBlackjackRoute ||
    isGridLockRoute ||
    isTicTacToeRoute ||
    isRpsRoute ||
    isHexFallRoute ||
    isHideoutRoute ||
    isSlingClashRoute ||
    isParkDuelRoute ||
    isChronoSlashRoute;

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    if (!tg) return;

    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#0A0A0F');
    tg.setBackgroundColor?.('#0A0A0F');
  }, []);

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    const backButton = tg?.BackButton;

    if (!backButton) return;

    const handleBack = () => navigate(-1);

    if (isFooterRoute) {
      backButton.hide();
      return;
    }

    backButton.show();
    backButton.onClick(handleBack);

    return () => {
      backButton.offClick?.(handleBack);
      backButton.hide();
    };
  }, [isFooterRoute, navigate, location.pathname]);

  useEffect(() => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;

    if (typeof orientation?.lock !== 'function') return;

    orientation.lock(isPoolRoute ? 'landscape' : 'portrait').catch(() => undefined);
  }, [isPoolRoute]);

  return (
    <div className="relative min-h-screen h-full flex flex-col pt-[100px] bg-[#0A0A0F] overflow-hidden">
      <Header />

      <main className={`flex-1 ${isLockedGameRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-20'}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
          <Route path="/game/:gameId/create" element={<CreateLobby />} />

          <Route path="/game/hideout/play" element={<ApartmentHideoutGame />} />
          <Route path="/game/hexfall/play" element={<HexFallGame />} />
          <Route path="/game/rps/play" element={<RockPaperScissorsDuelGame />} />
          <Route path="/game/tictactoe/play" element={<TicTacToeDuelGame />} />
          <Route path="/game/gridlock/play" element={<GridLockGame />} />
          <Route path="/game/blackjack/play" element={<BlackjackDuelGame />} />
          <Route path="/game/slingclash/play" element={<SlingClashGame />} />
          <Route path="/game/parkduel/play" element={<ParkDuelGame />} />
          <Route path="/game/chronoslash/play" element={<ChronoSlashGame />} />
          <Route path="/game/newgame/play" element={<NewGame />} />
          <Route path="/game/chase/play" element={<ChaseGame />} />
          <Route path="/game/race/play" element={<RaceGame />} />
          <Route path="/game/airhockey/play" element={<AirHockeyGame />} />
          <Route path="/game/archer/play" element={<ArcherGame />} />
          <Route path="/game/paper/play" element={<PaperGame />} />
          <Route path="/game/pingpong/play" element={<MiniGolfBeautiful />} />
          <Route path="/game/pool/play" element={<PoolGame />} />

          <Route path="/profile" element={<Profile />} />
          <Route path="/rating" element={<Rating />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;