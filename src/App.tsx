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

const FOOTER_ROUTES = ['/', '/profile', '/rating'];

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const isFooterRoute = FOOTER_ROUTES.includes(location.pathname);
  const isPoolRoute = location.pathname === '/game/pool/play';
  const isChaseRoute = location.pathname === '/game/chase/play';
  const isLockedGameRoute = isPoolRoute || isChaseRoute;

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;

    if (!tg) return;

    tg.ready();
    tg.expand();

    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }

    tg.setHeaderColor('#0A0A0F');
    tg.setBackgroundColor('#0A0A0F');
  }, []);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
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
    const orientation = (screen as any)?.orientation;

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