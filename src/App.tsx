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

function AppContent() {
  const location = useLocation();
  const isGameMode = location.pathname.includes('/play');

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    
    if (tg) {
      console.log('🚀 Telegram WebApp init...');
      tg.ready();
      tg.expand();
      
      // ГЛАВНОЕ: ЗАПРЕЩАЕМ свайпы вниз
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
        console.log('🚫 Vertical swipes disabled');
      }
      
      // Запрашиваем полноэкранный режим
      if (tg.requestFullscreen) {
        try {
          tg.requestFullscreen();
          console.log('📱 Fullscreen requested');
        } catch (e) {}
      }
      
      // Настройка цветов
      tg.setHeaderColor('#0A0A0F');
      tg.setBackgroundColor('#0A0A0F');
      
      // Принудительно фиксируем высоту
      const h = Math.max(
        tg.viewportStableHeight || 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0
      );
      
      document.documentElement.style.setProperty('--tg-viewport-height', `${h}px`);
      document.documentElement.style.setProperty('--app-height', `${h}px`);
      
      document.body.style.height = `${h}px`;
      document.body.style.minHeight = `${h}px`;
      
      const root = document.getElementById('root');
      if (root) {
        root.style.height = `${h}px`;
        root.style.minHeight = `${h}px`;
      }
    }
    
    // Мета-тег для запрета масштабирования
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }
    
    // Блокировка контекстного меню
    const blockContextMenu = (e: Event) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', blockContextMenu);
    
    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
    };
  }, []);
  
  // Агрессивная блокировка жестов (как в рабочем приложении)
  useEffect(() => {
    const blockGestures = () => {
      let startY = 0;
      
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          startY = e.touches[0].clientY;
        }
      };
      
      const handleTouchMove = (e: TouchEvent) => {
        // Блокируем мультитач (масштабирование)
        if (e.touches.length > 1) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        if (e.touches.length === 1) {
          const currentY = e.touches[0].clientY;
          const diffY = currentY - startY;
          
          // Если пытаемся свайпнуть вниз из верхней части - блокируем
          if (diffY > 0 && startY < 100 && window.scrollY === 0) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }
      };
      
      // Блокировка двойного тапа
      let lastTouchEnd = 0;
      const handleTouchEnd = (e: TouchEvent) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
          e.stopPropagation();
        }
        lastTouchEnd = now;
      };
      
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });
      document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      
      // Блокировка двойного клика
      document.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, { passive: false });
      
      return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('touchcancel', handleTouchEnd);
      };
    };
    
    const cleanup = blockGestures();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);
  
  return (
    <div className="w-full h-full bg-[#0A0A0F]">
      {!isGameMode && <Header />}
      
      <main className="w-full h-full overflow-y-auto">
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