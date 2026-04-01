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
import { PaperGame } from './pages/PaperGame';
import MiniGolfBeautiful from './pages/MiniGolfGame';
import NewGame from './pages/NewGame';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();

      // Отключаем свайп вниз/вверх, которым Telegram может сворачивать Mini App
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }

      // Просим fullscreen, если клиент это умеет
      if (typeof tg.requestFullscreen === 'function') {
        try {
          tg.requestFullscreen();
        } catch (e) {
          // молча игнорим, если платформа не поддерживает
        }
      }

      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="relative h-screen flex flex-col bg-[#0A0A0F] overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto pt-[10px] pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
            <Route path="/game/:gameId/create" element={<CreateLobby />} />

            <Route path="/game/newgame/play" element={<NewGame />} />
            <Route path="/game/race/play" element={<RaceGame />} />
            <Route path="/game/airhockey/play" element={<AirHockeyGame />} />
            <Route path="/game/archer/play" element={<ArcherGame />} />
            <Route path="/game/paper/play" element={<PaperGame />} />
            <Route path="/game/pingpong/play" element={<MiniGolfBeautiful />} />

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