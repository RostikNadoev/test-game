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
      console.log('🚀 Telegram WebApp init...');
      tg.ready();
      tg.expand();
      
      // ГЛАВНОЕ: ЗАПРЕЩАЕМ свайпы вниз
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
        console.log('🚫 Vertical swipes disabled via Telegram API');
      } else {
        console.warn('⚠️ disableVerticalSwipes not available');
      }
      
      // Fullscreen
      if (tg.requestFullscreen) {
        try {
          tg.requestFullscreen();
          console.log('📱 Fullscreen requested');
        } catch (e) {}
      }
      
      // Установка высоты
      const h = Math.max(
        tg.viewportStableHeight || 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0
      );
      
      document.documentElement.style.setProperty('--tg-viewport-height', `${h}px`);
      document.documentElement.style.setProperty('--app-height', `${h}px`);
      
      // Принудительно для body и root
      document.body.style.height = `${h}px`;
      document.body.style.minHeight = `${h}px`;
      const root = document.getElementById('root');
      if (root) {
        root.style.height = `${h}px`;
        root.style.minHeight = `${h}px`;
      }
      
      // Обработчик для изменений viewport
      const handleViewportChange = () => {
        if (tg.disableVerticalSwipes) {
          tg.disableVerticalSwipes();
        }
        if (tg.requestFullscreen) tg.requestFullscreen();
        tg.expand();
        
        const newH = tg.viewportStableHeight || window.innerHeight;
        document.documentElement.style.setProperty('--tg-viewport-height', `${newH}px`);
        document.documentElement.style.setProperty('--app-height', `${newH}px`);
      };
      
      tg.onEvent('viewportChanged', handleViewportChange);
      
      return () => {
        tg.offEvent('viewportChanged', handleViewportChange);
      };
    }
  }, []);
  
  // Дополнительный эффект для блокировки свайпов через JS
  useEffect(() => {
    // Агрессивная блокировка всех жестов
    const blockGesturesAggressively = () => {
      // Мета-тег для запрета масштабирования
      const metaViewport = document.querySelector('meta[name="viewport"]');
      if (metaViewport) {
        metaViewport.setAttribute('content', 
          'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        );
      }
      
      let startY = 0;
      
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          startY = e.touches[0].clientY;
        }
        // Просто проверяем наличие мультитача, без сохранения переменных
        if (e.touches.length === 2) {
          // Мультитач будет заблокирован в handleTouchMove
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
          
          // Если пытаемся свайпнуть вниз из верхней части
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
      
      // Блокировка контекстного меню
      const blockContextMenu = (e: Event) => {
        e.preventDefault();
        return false;
      };
      
      // Добавляем обработчики
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });
      document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      document.addEventListener('contextmenu', blockContextMenu);
      
      // Блокировка двойного клика для зума
      document.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, { passive: false });
      
      // Добавляем глобальные стили
      const style = document.createElement('style');
      style.textContent = `
        html, body {
          overscroll-behavior: none !important;
          -webkit-overflow-scrolling: none !important;
          touch-action: none !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        
        #root {
          touch-action: pan-y !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }
        
        * {
          -webkit-touch-callout: none !important;
          -webkit-user-select: none !important;
          user-select: none !important;
        }
        
        img {
          -webkit-user-drag: none !important;
          user-drag: none !important;
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('touchcancel', handleTouchEnd);
        document.removeEventListener('contextmenu', blockContextMenu);
        document.head.removeChild(style);
      };
    };
    
    const cleanup = blockGesturesAggressively();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);
  
  return (
    <BrowserRouter>
      <div className="relative min-h-screen pb-16">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
          <Route path="/game/:gameId/create" element={<CreateLobby />} />
          <Route path="/game/race/play" element={<RaceGame />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/rating" element={<Rating />} />
          <Route path="/games" element={<Home />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;