import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { NewGame } from './pages/NewGame'; // Создадим этот файл следующим
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
    }

    const preventDefault = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  return (
    <BrowserRouter>
      <div className="relative h-full flex flex-col pt-[100px] bg-[#0A0A0F] overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto pb-20 -webkit-overflow-scrolling-touch">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
            <Route path="/game/:gameId/create" element={<CreateLobby />} />
            <Route path="/game/newgame/play" element={<NewGame />} />
            <Route path="/game/race/play" element={<RaceGame />} />
            <Route path="/game/airhockey/play" element={<AirHockeyGame />} />
            <Route path="/game/archer/play" element={<ArcherGame />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/rating" element={<Rating />} />
            <Route path="/games" element={<Home />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;