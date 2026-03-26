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
    
    // Способ 1: официальный метод
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    
    // Способ 2: через mainButton или другой хак
    tg.setHeaderColor?.('bg_color');
    
    // Способ 3: блокировка свайпа через обработчик событий
    const preventPullToRefresh = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      
      // Если мы в верхней части страницы и пытаемся потянуть вниз
      if (scrollTop <= 0 && touch.clientY > 50) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    
    return () => {
      document.removeEventListener('touchmove', preventPullToRefresh);
    };
  }
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