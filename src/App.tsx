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
      
      // ГЛАВНОЕ: Блокируем нативный свайп Telegram (Bot API 7.7+)
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
        console.log('✅ Vertical swipes disabled');
      }

      // Настройка цветов темы
      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
      
      // Дополнительная блокировка для старых версий
      if (tg.isVerticalSwipesEnabled !== undefined) {
        tg.isVerticalSwipesEnabled = false;
      }
    }

    // Добавляем мета-тег для запрета масштабирования
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );

    // Блокируем контекстное меню
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', preventContextMenu);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, []);

  return (
    <div className="w-full h-full bg-[#0A0A0F]">
      {!isGameMode && <Header />}
      
      <main className="flex-1 relative">
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