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
import { NeonDriftGame } from './pages/NeonDriftGame'; // Импорт новой игры
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
  }, []);

  return (
    <BrowserRouter>
      <div className="relative h-full flex flex-col pt-[100px] bg-[#0A0A0F] overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
            <Route path="/game/:gameId/create" element={<CreateLobby />} />
            
            {/* Игровые роуты */}
            <Route path="/game/neondrift/play" element={<NeonDriftGame />} />
            <Route path="/game/race/play" element={<RaceGame />} />
            <Route path="/game/airhockey/play" element={<AirHockeyGame />} />
            <Route path="/game/archer/play" element={<ArcherGame />} />
            
            <Route path="/profile" element={<Profile />} />
            <Route path="/rating" element={<Rating />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;