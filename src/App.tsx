import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { CreateLobby } from './pages/CreateLobby';
import { Profile } from './pages/Profile';
import { Rating } from './pages/Rating';

function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen pb-16">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:gameId/lobbies" element={<Lobbies />} />
          <Route path="/game/:gameId/create" element={<CreateLobby />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/rating" element={<Rating />} />
          <Route path="/games" element={<Home />} /> {/* Временный редирект */}
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;