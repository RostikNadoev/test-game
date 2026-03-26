import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { CreateLobby } from './pages/CreateLobby';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';
import { RaceGame } from './pages/RaceGame';
import { useEffect } from 'react';

// Выделяем контент в отдельный компонент, чтобы использовать useLocation
function AppContent() {
  const location = useLocation();
  const isGameMode = location.pathname.includes('/play');

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    
    if (tg) {
      tg.ready();
      tg.expand(); // Разворачиваем на всю высоту
      
      // Блокируем нативный свайп Telegram (Bot API 7.7+)
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }

      // Настройка цветов темы, чтобы не было "бордюров" при микродвижениях
      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
    }

    // Глобальная блокировка скролла через JS (резервный метод)
    const preventDefault = (e: TouchEvent) => {
      // Блокируем скролл везде, если мы в режиме игры
      // Или если контент не должен скроллиться
      if (isGameMode || document.body.classList.contains('no-scroll')) {
        if (e.touches.length > 1) return; // Разрешаем pinch-zoom если надо, но для игры лучше блокировать всё
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventDefault);
    };
  }, [isGameMode]);

  return (
    // Добавляем touch-none когда мы в игре, чтобы браузер даже не пытался обрабатывать жесты
    <div className={`fixed inset-0 flex flex-col bg-[#0A0A0F] ${isGameMode ? 'touch-none' : ''}`}>
      {!isGameMode && <Header />}
      
      <main className="flex-1 relative overflow-hidden">
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

      {!isGameMode && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;