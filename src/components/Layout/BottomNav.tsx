import { Home, Gamepad2, Trophy, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const BottomNav = () => {
  const navItems = [
    { to: '/', icon: Home, label: 'Главная' },
    { to: '/games', icon: Gamepad2, label: 'Игры' },
    { to: '/rating', icon: Trophy, label: 'Рейтинг' },
    { to: '/profile', icon: User, label: 'Профиль' },
  ];

  return (
    <nav className="bg-card/90 backdrop-blur-md border-t border-white/10 fixed bottom-0 left-0 right-0 z-50" style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div className="flex justify-around items-center py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                isActive 
                  ? 'text-accent' 
                  : 'text-gray-400 hover:text-white'
              }`
            }
          >
            <item.icon size={24} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};