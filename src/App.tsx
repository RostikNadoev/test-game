import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { GameIntroOverlay } from './components/GameIntroOverlay';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { CreateLobby } from './pages/CreateLobby';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { RaceGame } from './pages/RaceGame';
import { AirHockeyGame } from './pages/AirHockeyGame';
import { ArcherGame } from './pages/ArcherGame';
import MiniGolfBeautiful from './pages/MiniGolfGame';
import { BlackjackDuelGame } from './pages/BlackjackDuelGame';
import { GridLockGame } from './pages/GridLockGame';
import { TicTacToeDuelGame } from './pages/TicTacToeDuelGame';
import { RockPaperScissorsDuelGame } from './pages/RockPaperScissorsDuelGame';
import { HexFallGame } from './pages/HexFallGame';
import { SlingClashGame } from './pages/SlingClashGame';
import { IceBumpGame } from './pages/IceBumpGame';
import { DiceDuelGame } from './pages/DiceDuelGame';
import { NeonMatrixGame } from './pages/NeonMatrixGame';
import { VirusMarketGame } from './pages/VirusMarketGame';
import { CrashDuelGame } from './pages/CrashDuelGame';

const FOOTER_ROUTES = ['/', '/profile', '/rating'];

const GAME_TITLES: Record<string, string> = {
  '/game/hexfall/play': 'Hex Fall',
  '/game/rps/play': 'RPS Duel',
  '/game/tictactoe/play': 'Tic Tac Toe',
  '/game/gridlock/play': 'Grid Lock',
  '/game/blackjack/play': 'Blackjack Duel',
  '/game/diceduel/play': 'Dice Duel',
  '/game/neonmatrix/play': 'Neon Matrix',
  '/game/slingclash/play': 'Sling Clash',
  '/game/icebump/play': 'Ice Bump',
  '/game/virusmarket/play': 'Virus Market',
  '/game/crashduel/play': 'Crash Duel',
  '/game/race/play': 'Street Race',
  '/game/airhockey/play': 'Air Hockey',
  '/game/archer/play': 'Neon Duel',
  '/game/pingpong/play': 'Golf',
};

const LOCKED_GAME_ROUTES = new Set([
  '/game/hexfall/play',
  '/game/rps/play',
  '/game/tictactoe/play',
  '/game/gridlock/play',
  '/game/blackjack/play',
  '/game/diceduel/play',
  '/game/neonmatrix/play',
  '/game/slingclash/play',
  '/game/icebump/play',
  '/game/virusmarket/play',
  '/game/crashduel/play',
]);

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

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [introCompletedPath, setIntroCompletedPath] = useState<string | null>(null);

  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isLockedGameRoute = LOCKED_GAME_ROUTES.has(location.pathname);
  const gameIntroTitle = GAME_TITLES[location.pathname] || null;

  const shouldShowGameIntro = Boolean(gameIntroTitle && introCompletedPath !== location.pathname);
  const shouldMountRoutes = !shouldShowGameIntro;

  useEffect(() => {
    if (!gameIntroTitle) {
      setIntroCompletedPath(null);
    }
  }, [gameIntroTitle]);

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    if (!tg) return;

    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#050610');
    tg.setBackgroundColor?.('#050610');
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

  return (
    <div className="relative mx-auto flex h-full min-h-screen w-full max-w-[480px] flex-col overflow-hidden bg-[#050610] pt-[var(--telegram-top-offset)]">
      <Header />

      <main
        className={`relative z-10 w-full min-w-0 flex-1 ${
          isLockedGameRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-24'
        }`}
      >
        {shouldMountRoutes ? (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
            <Route path="/game/:gameId/create" element={<CreateLobby />} />

            <Route path="/game/hexfall/play" element={<HexFallGame />} />
            <Route path="/game/rps/play" element={<RockPaperScissorsDuelGame />} />
            <Route path="/game/tictactoe/play" element={<TicTacToeDuelGame />} />
            <Route path="/game/gridlock/play" element={<GridLockGame />} />
            <Route path="/game/blackjack/play" element={<BlackjackDuelGame />} />
            <Route path="/game/diceduel/play" element={<DiceDuelGame />} />
            <Route path="/game/neonmatrix/play" element={<NeonMatrixGame />} />
            <Route path="/game/slingclash/play" element={<SlingClashGame />} />
            <Route path="/game/icebump/play" element={<IceBumpGame />} />
            <Route path="/game/virusmarket/play" element={<VirusMarketGame />} />
            <Route path="/game/crashduel/play" element={<CrashDuelGame />} />
            <Route path="/game/race/play" element={<RaceGame />} />
            <Route path="/game/airhockey/play" element={<AirHockeyGame />} />
            <Route path="/game/archer/play" element={<ArcherGame />} />
            <Route path="/game/pingpong/play" element={<MiniGolfBeautiful />} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/rating" element={<Rating />} />
          </Routes>
        ) : (
          <div className="h-full w-full bg-[#050610]" />
        )}
      </main>

      {isFooterRoute && <BottomNav />}

      {shouldShowGameIntro && gameIntroTitle && (
        <GameIntroOverlay
          key={location.pathname}
          gameTitle={gameIntroTitle}
          onComplete={() => setIntroCompletedPath(location.pathname)}
        />
      )}
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