import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { CreateLobby } from './pages/CreateLobby';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { RaceGame } from './pages/RaceGame';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      
      // Блокировка свайпа на уровне API Telegram
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }

      // Настройка цветов интерфейса TG для бесшовности
      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
    }

    // Жесткая блокировка прокрутки всего окна (защита от rubber-band эффекта)
    const preventDefault = (e: TouchEvent) => {
      // Блокируем, если тач пытается двигать само окно
      if (e.touches.length === 1) {
        // можно добавить логику исключений, но для чистого приложения лучше так
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  return (
    <BrowserRouter>
      {/* pt-[100px] создает твой отступ. 
        h-full + overflow-hidden гарантируют неподвижность основы.
      */}
      <div className="relative h-full flex flex-col pt-[100px] bg-[#0A0A0F] overflow-hidden">
        
        {/* Хедер будет внутри контейнера с отступом или fixed */}
        <Header />
        
        {/* Внутренняя область скролла для контента страниц */}
        <main className="flex-1 overflow-y-auto pb-20 -webkit-overflow-scrolling-touch">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
            <Route path="/game/:gameId/create" element={<CreateLobby />} />
            <Route path="/game/race/play" element={<RaceGame />} />
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