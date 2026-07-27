import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Header } from "./components/Layout/Header";
import { BottomNav } from "./components/Layout/BottomNav";
import { SoloPageLoader } from "./components/Solo/SoloPageLoader";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import { Rating } from "./pages/Rating";
import { SoloGames } from "./pages/SoloGames";
import { Lobbies } from "./pages/Lobbies";
import { CreateLobby } from "./pages/CreateLobby";
import { LobbyRoom } from "./pages/LobbyRoom";
import { LOCKED_GAME_ROUTES } from "./data/games";
import {
  applyTelegramViewportMetrics,
  getTelegramWebApp,
} from "./types/telegram";
import appLoaderGif from "./assets/app-loader.gif";
import slingBackground from "./assets/games/sling/background_meadow.webp";

const FruitCascadeSoloGame = lazy(() =>
  import("./pages/solo/FruitCascadeSoloGame").then((module) => ({
    default: module.FruitCascadeSoloGame,
  })),
);
const Royal5x5SoloGame = lazy(() =>
  import("./pages/solo/Royal5x5SoloGame").then((module) => ({
    default: module.Royal5x5SoloGame,
  })),
);
const CrystalMinesSoloGame = lazy(() =>
  import("./pages/solo/CrystalMinesSoloGame").then((module) => ({
    default: module.CrystalMinesSoloGame,
  })),
);
const TurboTowerSoloGame = lazy(() =>
  import("./pages/solo/TurboTowerSoloGame").then((module) => ({
    default: module.TurboTowerSoloGame,
  })),
);
const NeonScratchSoloGame = lazy(() =>
  import("./pages/solo/NeonScratchSoloGame").then((module) => ({
    default: module.NeonScratchSoloGame,
  })),
);
const GridLockGame = lazy(() => import("./pages/GridLockGame"));
const NeonMatrixGame = lazy(() => import("./pages/NeonMatrixGame"));
const PaperIoGame = lazy(() => import("./pages/PaperIoGame"));
const TowerStackGame = lazy(() => import("./pages/TowerStackGame"));
const PhysicsDuel = lazy(() => import("./pages/PhysicsDuel"));
const PlinkoPvpGame = lazy(() => import("./pages/PlinkoPvpGame"));
const DunkShotGame = lazy(() => import("./pages/DunkShotGame"));
const FlappyRaceGame = lazy(() => import("./pages/FlappyRaceGame"));
const DiscFootballGame = lazy(() => import("./pages/DiscFootballGame"));
const DoodleJumpGame = lazy(() => import("./pages/DoodleJumpGame"));
const CrossyRoadGame = lazy(() => import("./pages/CrossyRoadGame"));
const CoinChaseGame = lazy(() => import("./pages/CoinChaseGame"));
const CubeFillGame = lazy(() => import("./pages/CubeFillGame"));
const BallzDuelGame = lazy(() => import("./pages/BallzDuelGame"));
const DrawDropGame = lazy(() => import("./pages/DrawDropGame"));
const SlingSiegeGame = lazy(() => import("./pages/SlingSiegeGame"));

const FOOTER_ROUTES = ["/", "/solo", "/profile", "/rating"];
const SOLO_ROUTE_PREFIX = "/solo";
const FRUIT_CASCADE_ROUTE = "/solo/fruit-cascade";

const APP_LOADER_FALLBACK_MS = 3600;
const SOLO_PAGE_LOADER_MS = 620;

function isSoloPath(pathname: string) {
  return (
    pathname === SOLO_ROUTE_PREFIX ||
    pathname.startsWith(`${SOLO_ROUTE_PREFIX}/`)
  );
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

    durationMs += delayCentiseconds > 0 ? delayCentiseconds * 10 : 100;
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
    <div className="relative mx-auto flex h-full w-full max-w-[var(--app-shell-max-width)] items-center justify-center overflow-hidden bg-[#09090d]">
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

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [soloLoadingPath, setSoloLoadingPath] = useState<string | null>(null);
  const previousPathRef = useRef(location.pathname);
  const mainRef = useRef<HTMLElement | null>(null);

  const isSoloRoute = isSoloPath(location.pathname);
  const isFruitCascadeRoute = location.pathname === FRUIT_CASCADE_ROUTE;
  const isFlappyRaceRoute = location.pathname === "/game/flappy_race/play";
  const isDoodleJumpRoute = location.pathname === "/game/doodle_jump/play";
  const isPrismCubeRoute = location.pathname === "/game/prism_cube/play";
  const isCoinChaseRoute = location.pathname === "/game/coin_chase/play";
  const isCubeFillRoute = location.pathname === "/game/cube_fill/play";
  const isBallzDuelRoute = location.pathname === "/game/ballz_duel/play";
  const isDrawDropRoute = location.pathname === "/game/draw_drop/play";
  const isSlingSiegeRoute = location.pathname === "/game/sling_siege/play";
  const hasFullScreenArcadeBackground =
    isFlappyRaceRoute ||
    isDoodleJumpRoute ||
    isPrismCubeRoute ||
    isCoinChaseRoute ||
    isCubeFillRoute ||
    isBallzDuelRoute ||
    isSlingSiegeRoute;
  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isLockedGameRoute = LOCKED_GAME_ROUTES.has(location.pathname);
  const shouldShowSoloLoader = soloLoadingPath === location.pathname;
  const shouldMountRoutes = !shouldShowSoloLoader;

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    const wasSoloRoute = isSoloPath(previousPath);
    const enteredSoloHub =
      location.pathname === SOLO_ROUTE_PREFIX && !wasSoloRoute;

    previousPathRef.current = location.pathname;

    if (!enteredSoloHub) return;

    const path = location.pathname;
    const frameId = window.requestAnimationFrame(() => {
      setSoloLoadingPath(path);
    });

    const timer = window.setTimeout(() => {
      setSoloLoadingPath(null);
    }, SOLO_PAGE_LOADER_MS);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (isInitialLoading) return;

    const frameId = window.requestAnimationFrame(() => {
      const scrollOptions: ScrollToOptions = {
        top: 0,
        left: 0,
        behavior: "smooth",
      };

      mainRef.current?.scrollTo(scrollOptions);
      window.scrollTo(scrollOptions);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    isInitialLoading,
    location.key,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    const tg = getTelegramWebApp();

    tg?.ready?.();
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();
    applyTelegramViewportMetrics();
    tg?.onEvent?.("contentSafeAreaChanged", applyTelegramViewportMetrics);
    tg?.onEvent?.("viewportChanged", applyTelegramViewportMetrics);
    window.visualViewport?.addEventListener(
      "resize",
      applyTelegramViewportMetrics,
    );
    window.addEventListener("resize", applyTelegramViewportMetrics);

    if (!tg?.isVersionAtLeast || tg.isVersionAtLeast("8.0")) {
      tg?.lockOrientation?.();
    }

    return () => {
      tg?.offEvent?.("contentSafeAreaChanged", applyTelegramViewportMetrics);
      tg?.offEvent?.("viewportChanged", applyTelegramViewportMetrics);
      window.visualViewport?.removeEventListener(
        "resize",
        applyTelegramViewportMetrics,
      );
      window.removeEventListener("resize", applyTelegramViewportMetrics);
    };
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const themeColor = isDrawDropRoute
      ? "#ffffff"
      : isSlingSiegeRoute
        ? "#79bfe0"
      : isFruitCascadeRoute
        ? "#10081f"
      : isCubeFillRoute
        ? "#171137"
        : isBallzDuelRoute
          ? "#0b1c2e"
          : isSoloRoute
            ? "#060b14"
            : "#09090d";

    tg?.setHeaderColor?.(themeColor);
    tg?.setBackgroundColor?.(themeColor);
  }, [
    isDrawDropRoute,
    isSlingSiegeRoute,
    isBallzDuelRoute,
    isCubeFillRoute,
    isFruitCascadeRoute,
    isSoloRoute,
  ]);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;

    if (!backButton) return;

    const handleBack = () => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/");
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
    return <AppInitialLoader onFinish={() => setIsInitialLoading(false)} />;
  }

  return (
    <div
      className={[
        "app-shell",
        isSoloRoute ? "solo-app-shell bg-[#060b14]" : "",
        isDrawDropRoute
          ? "bg-white"
          : hasFullScreenArcadeBackground
            ? "bg-transparent"
            : "bg-[#09090d]",
        isFruitCascadeRoute ? "fruit-cascade-app-shell" : "",
      ].join(" ")}
    >
      {hasFullScreenArcadeBackground && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: isFlappyRaceRoute
              ? "radial-gradient(circle at 72% 16%, rgba(82,255,229,0.2), transparent 46%), linear-gradient(180deg, #071827 0%, #0b3550 50%, #126765 100%)"
              : isPrismCubeRoute
                ? "radial-gradient(circle at 70% 15%, rgba(91,231,255,0.22), transparent 44%), radial-gradient(circle at 18% 34%, rgba(255,111,202,0.15), transparent 45%), linear-gradient(180deg, #050817 0%, #11194a 54%, #070a16 100%)"
                : isCoinChaseRoute
                  ? "radial-gradient(circle at 50% 0%, rgba(255,214,74,0.08), transparent 42%), linear-gradient(180deg, #12070f 0%, #1b0915 46%, #0b050b 100%)"
                : isCubeFillRoute
                  ? "radial-gradient(circle at 50% 0%, rgba(111,82,224,0.26), transparent 38%), radial-gradient(circle at 10% 78%, rgba(80,55,184,0.18), transparent 38%), linear-gradient(180deg, #20164a 0%, #151033 48%, #0c0a20 100%)"
                : isBallzDuelRoute
                  ? "radial-gradient(circle at 70% 8%, rgba(86,227,255,0.15), transparent 42%), radial-gradient(circle at 16% 78%, rgba(255,214,74,0.08), transparent 36%), linear-gradient(180deg, #071425 0%, #07101b 100%)"
                : isSlingSiegeRoute
                  ? `linear-gradient(180deg, rgba(14,31,44,.08), rgba(10,18,21,.3)), url(${slingBackground}) center / cover no-repeat`
                : "radial-gradient(circle at 18% 12%, rgba(157,124,255,0.26), transparent 48%), linear-gradient(180deg, #080b2d 0%, #252879 52%, #7959a6 100%)",
          }}
        />
      )}

      <Header />

      <main
        ref={mainRef}
        className={[
          "relative z-10 w-full min-w-0 flex-1 overflow-x-hidden",
          isSoloRoute ? "solo-main" : "",
          isFruitCascadeRoute ? "fruit-cascade-main" : "",
          isLockedGameRoute || isFruitCascadeRoute
            ? "overflow-hidden pb-0"
            : "overflow-y-auto pb-24",
        ].join(" ")}
      >
        {shouldMountRoutes ? (
          <Suspense fallback={<SoloPageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />

              <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
              <Route path="/game/:gameId/create" element={<CreateLobby />} />
              <Route
                path="/game/:gameId/lobby/:lobbyId"
                element={<LobbyRoom />}
              />

              <Route path="/solo" element={<SoloGames />} />
              <Route
                path="/solo/fruit-cascade"
                element={<FruitCascadeSoloGame />}
              />
              <Route path="/solo/royal-5x5" element={<Royal5x5SoloGame />} />
              <Route
                path="/solo/crystal-mines"
                element={<CrystalMinesSoloGame />}
              />
              <Route
                path="/solo/turbo-tower"
                element={<TurboTowerSoloGame />}
              />
              <Route
                path="/solo/neon-scratch"
                element={<NeonScratchSoloGame />}
              />

              <Route path="/game/plinko_pvp/play" element={<PlinkoPvpGame />} />
              <Route path="/game/descent_duel/play" element={<PhysicsDuel />} />
              <Route path="/game/paper_io/play" element={<PaperIoGame />} />
              <Route
                path="/game/tower_stack/play"
                element={<TowerStackGame />}
              />
              <Route path="/game/grid_lock/play" element={<GridLockGame />} />
              <Route
                path="/game/neon_matrix/play"
                element={<NeonMatrixGame />}
              />
              <Route path="/game/dunk_shot/play" element={<DunkShotGame />} />
              <Route
                path="/game/flappy_race/play"
                element={<FlappyRaceGame />}
              />
              <Route
                path="/game/disc_football/play"
                element={<DiscFootballGame />}
              />
              <Route
                path="/game/doodle_jump/play"
                element={<DoodleJumpGame />}
              />
              <Route
                path="/game/crossy_road/play"
                element={<CrossyRoadGame />}
              />
              <Route
                path="/game/coin_chase/play"
                element={<CoinChaseGame />}
              />
              <Route
                path="/game/cube_fill/play"
                element={<CubeFillGame />}
              />
              <Route
                path="/game/ballz_duel/play"
                element={<BallzDuelGame />}
              />
              <Route path="/game/draw_drop/play" element={<DrawDropGame />} />
              <Route path="/game/sling_siege/play" element={<SlingSiegeGame />} />

              <Route path="/profile" element={<Profile />} />
              <Route path="/rating" element={<Rating />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        ) : (
          <SoloPageLoader />
        )}
      </main>

      {isFooterRoute && <BottomNav />}
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