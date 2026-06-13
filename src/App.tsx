import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { GameIntroOverlay } from './components/GameIntroOverlay';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { RaceGame } from './pages/RaceGame';
import { AirHockeyGame } from './pages/AirHockeyGame';
import { BlackjackDuelGame } from './pages/BlackjackDuelGame';
import { GridLockGame } from './pages/GridLockGame';
import { RockPaperScissorsDuelGame } from './pages/RockPaperScissorsDuelGame';
import { DiceDuelGame } from './pages/DiceDuelGame';
import { NeonMatrixGame } from './pages/NeonMatrixGame';
import { VirusMarketGame } from './pages/VirusMarketGame';
import { CrashDuelGame } from './pages/CrashDuelGame';
import { PaperIoGame } from './pages/PaperIoGame';
import { TowerStackGame } from './pages/TowerStackGame';
import { PhysicsDuel } from './pages/PhysicsDuel';
import PlinkoPvpGame from './pages/PlinkoPvpGame';
import { GAME_TITLE_BY_PLAY_PATH, LOCKED_GAME_ROUTES } from './data/games';
import appLoaderGif from './assets/app-loader.gif';

const FOOTER_ROUTES = ['/', '/profile', '/rating'];

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  isOrientationLocked?: boolean;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick?: (callback: () => void) => void;
  };
};

function getTelegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [introCompletedPath, setIntroCompletedPath] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isLockedGameRoute = LOCKED_GAME_ROUTES.has(location.pathname);
  const gameIntroTitle = GAME_TITLE_BY_PLAY_PATH[location.pathname] || null;

  const shouldShowGameIntro = Boolean(gameIntroTitle && introCompletedPath !== location.pathname);
  const shouldMountRoutes = !shouldShowGameIntro;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsInitialLoading(false);
    }, 4100);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!gameIntroTitle) {
      setIntroCompletedPath(null);
    }
  }, [gameIntroTitle]);

  useEffect(() => {
    const tg = getTelegramWebApp();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    tg?.setHeaderColor?.('#09090d');
    tg?.setBackgroundColor?.('#09090d');

    if (!tg?.isVersionAtLeast || tg.isVersionAtLeast('8.0')) {
      tg?.lockOrientation?.();
    }
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;

    if (!backButton) return;

    const handleBack = () => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    };

    if (isInitialLoading || isFooterRoute) {
      backButton.hide();
      return;
    }

    backButton.show();
    backButton.onClick(handleBack);

    return () => {
      backButton.offClick?.(handleBack);
      backButton.hide();
    };
  }, [isInitialLoading, isFooterRoute, navigate]);

  if (isInitialLoading) {
    return (
      <div className="relative mx-auto flex h-full min-h-screen w-full max-w-[480px] items-center justify-center overflow-hidden bg-[#09090d]">
        <img
          src={appLoaderGif}
          alt=""
          className="h-45 w-45 object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex h-full min-h-screen w-full max-w-[480px] flex-col overflow-hidden overflow-x-hidden bg-[#09090d] pt-[var(--telegram-top-offset)]">
      <Header />

      <main
        className={`relative z-10 w-full min-w-0 flex-1 overflow-x-hidden ${
          isLockedGameRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-24'
        }`}
      >
        {shouldMountRoutes ? (
          <Routes>
            <Route path="/" element={<Home />} />

            <Route path="/game/plinko_pvp/play" element={<PlinkoPvpGame />} />
            <Route path="/game/descent_duel/play" element={<PhysicsDuel />} />
            <Route path="/game/paper_io/play" element={<PaperIoGame />} />
            <Route path="/game/tower_stack/play" element={<TowerStackGame />} />
            <Route path="/game/crash_duel/play" element={<CrashDuelGame />} />
            <Route path="/game/virus_market/play" element={<VirusMarketGame />} />
            <Route path="/game/rps_duel/play" element={<RockPaperScissorsDuelGame />} />
            <Route path="/game/grid_lock/play" element={<GridLockGame />} />
            <Route path="/game/blackjack_duel/play" element={<BlackjackDuelGame />} />
            <Route path="/game/dice_duel/play" element={<DiceDuelGame />} />
            <Route path="/game/neon_matrix/play" element={<NeonMatrixGame />} />
            <Route path="/game/street_race/play" element={<RaceGame />} />
            <Route path="/game/air_hockey/play" element={<AirHockeyGame />} />

            <Route path="/profile" element={<Profile />} />
            <Route path="/rating" element={<Rating />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <div className="h-full w-full bg-[#09090d]" />
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