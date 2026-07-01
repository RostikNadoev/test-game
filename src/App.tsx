import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { GameIntroOverlay } from './components/GameIntroOverlay';
import { SoloPageLoader } from './components/Solo/SoloPageLoader';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { SoloGames } from './pages/SoloGames';
import { FruitCascadeSoloGame } from './pages/solo/FruitCascadeSoloGame';
import { Royal5x5SoloGame } from './pages/solo/Royal5x5SoloGame';
import { CrystalMinesSoloGame } from './pages/solo/CrystalMinesSoloGame';
import { TurboTowerSoloGame } from './pages/solo/TurboTowerSoloGame';
import { NeonScratchSoloGame } from './pages/solo/NeonScratchSoloGame';
import { RaceGame } from './pages/RaceGame';
import { AirHockeyGame } from './pages/AirHockeyGame';
import { BlackjackDuelGame } from './pages/BlackjackDuelGame';
import { GridLockGame } from './pages/GridLockGame';
import { RockPaperScissorsDuelGame } from './pages/RockPaperScissorsDuelGame';
import { DiceDuelGame } from './pages/DiceDuelGame';
import { NeonMatrixGame } from './pages/NeonMatrixGame';
import { VirusMarketGame } from './pages/VirusMarketGame';
import { PaperIoGame } from './pages/PaperIoGame';
import { TowerStackGame } from './pages/TowerStackGame';
import { PhysicsDuel } from './pages/PhysicsDuel';
import PlinkoPvpGame from './pages/PlinkoPvpGame';
import { GAME_TITLE_BY_PLAY_PATH, LOCKED_GAME_ROUTES } from './data/games';
import appLoaderGif from './assets/app-loader.gif';

const FOOTER_ROUTES = ['/', '/solo', '/profile', '/rating'];
const SOLO_ROUTE_PREFIX = '/solo';
const FRUIT_CASCADE_ROUTE = '/solo/fruit-cascade';

const APP_LOADER_FALLBACK_MS = 3600;
const SOLO_PAGE_LOADER_MS = 620;

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

function isSoloPath(pathname: string) {
  return pathname === SOLO_ROUTE_PREFIX || pathname.startsWith(`${SOLO_ROUTE_PREFIX}/`);
}

async function getGifDurationMs(src: string) {
  const response = await fetch(src);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let durationMs = 0;

  for (let index = 0; index < bytes.length - 9; index += 1) {
    const isGraphicsControlExtension =
      bytes[index] === 0x21 &&
      bytes[index + 1] === 0xf9 &&
      bytes[index + 2] === 0x04;

    if (!isGraphicsControlExtension) continue;

    const delayCentiseconds = bytes[index + 4] | (bytes[index + 5] << 8);

    durationMs += delayCentiseconds > 0
      ? delayCentiseconds * 10
      : 100;
  }

  return durationMs > 0 ? durationMs : APP_LOADER_FALLBACK_MS;
}

function AppInitialLoader({ onFinish }: { onFinish: () => void }) {
  const onFinishRef = useRef(onFinish);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    let isCancelled = false;

    const prepareLoader = async () => {
      try {
        const gifDurationMs = await getGifDurationMs(appLoaderGif);

        if (!isCancelled) {
          setDurationMs(gifDurationMs);
        }
      } catch {
        if (!isCancelled) {
          setDurationMs(APP_LOADER_FALLBACK_MS);
        }
      }
    };

    void prepareLoader();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (durationMs === null) return;

    const timer = window.setTimeout(() => {
      onFinishRef.current();
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [durationMs]);

  return (
    <div className="relative mx-auto flex h-full min-h-screen w-full max-w-[480px] items-center justify-center overflow-hidden bg-[#09090d]">
      {durationMs !== null && (
        <img
          key={`app-loader-${durationMs}`}
          src={appLoaderGif}
          alt=""
          className="h-[290px] w-[290px] object-contain"
          draggable={false}
        />
      )}
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [introCompletedPath, setIntroCompletedPath] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [soloLoadingPath, setSoloLoadingPath] = useState<string | null>(null);
  const previousPathRef = useRef(location.pathname);

  const isSoloRoute = isSoloPath(location.pathname);
  const isFruitCascadeRoute = location.pathname === FRUIT_CASCADE_ROUTE;
  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isLockedGameRoute = LOCKED_GAME_ROUTES.has(location.pathname);
  const gameIntroTitle = GAME_TITLE_BY_PLAY_PATH[location.pathname] || null;

  const shouldShowGameIntro = Boolean(gameIntroTitle && introCompletedPath !== location.pathname);
  const shouldShowSoloLoader = soloLoadingPath === location.pathname;
  const shouldMountRoutes = !shouldShowGameIntro && !shouldShowSoloLoader;

  useEffect(() => {
    if (!gameIntroTitle) {
      setIntroCompletedPath(null);
    }
  }, [gameIntroTitle]);

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    const wasSoloRoute = isSoloPath(previousPath);
    const enteredSoloHub = location.pathname === SOLO_ROUTE_PREFIX && !wasSoloRoute;

    previousPathRef.current = location.pathname;

    if (!enteredSoloHub) {
      return;
    }

    setSoloLoadingPath(location.pathname);

    const timer = window.setTimeout(() => {
      setSoloLoadingPath(null);
    }, SOLO_PAGE_LOADER_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const tg = getTelegramWebApp();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    if (!tg?.isVersionAtLeast || tg.isVersionAtLeast('8.0')) {
      tg?.lockOrientation?.();
    }
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const themeColor = isFruitCascadeRoute ? '#10081f' : isSoloRoute ? '#060b14' : '#09090d';

    tg?.setHeaderColor?.(themeColor);
    tg?.setBackgroundColor?.(themeColor);
  }, [isFruitCascadeRoute, isSoloRoute]);

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
      <AppInitialLoader
        onFinish={() => setIsInitialLoading(false)}
      />
    );
  }

  return (
    <div
      className={[
        'relative mx-auto flex h-full min-h-screen w-full max-w-[480px] flex-col overflow-hidden overflow-x-hidden pt-[var(--telegram-top-offset)]',
        isSoloRoute ? 'solo-app-shell bg-[#060b14]' : 'bg-[#09090d]',
        isFruitCascadeRoute ? 'fruit-cascade-app-shell' : '',
      ].join(' ')}
    >
      <Header />

      <main
        className={[
          'relative z-10 w-full min-w-0 flex-1 overflow-x-hidden',
          isSoloRoute ? 'solo-main' : '',
          isFruitCascadeRoute ? 'fruit-cascade-main' : '',
          isLockedGameRoute || isFruitCascadeRoute ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-24',
        ].join(' ')}
      >
        {shouldMountRoutes ? (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/solo" element={<SoloGames />} />
            <Route path="/solo/fruit-cascade" element={<FruitCascadeSoloGame />} />
            <Route path="/solo/royal-5x5" element={<Royal5x5SoloGame />} />
            <Route path="/solo/crystal-mines" element={<CrystalMinesSoloGame />} />
            <Route path="/solo/turbo-tower" element={<TurboTowerSoloGame />} />
            <Route path="/solo/neon-scratch" element={<NeonScratchSoloGame />} />

            <Route path="/game/plinko_pvp/play" element={<PlinkoPvpGame />} />
            <Route path="/game/descent_duel/play" element={<PhysicsDuel />} />
            <Route path="/game/paper_io/play" element={<PaperIoGame />} />
            <Route path="/game/tower_stack/play" element={<TowerStackGame />} />
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
        ) : shouldShowSoloLoader ? (
          <SoloPageLoader />
        ) : (
          <div className={isSoloRoute ? 'h-full w-full bg-transparent' : 'h-full w-full bg-[#09090d]'} />
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
