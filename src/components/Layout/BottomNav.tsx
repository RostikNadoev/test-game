import { Home, Trophy, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', icon: Home, label: 'Главная' },
  { to: '/rating', icon: Trophy, label: 'Рейтинг' },
  { to: '/profile', icon: User, label: 'Профиль' },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[460px] px-3 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <div className="relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0a0a11]/90 p-1 shadow-[0_-14px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative grid grid-cols-3 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'group relative flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-[17px] transition-colors duration-200',
                  isActive ? 'text-white' : 'text-white/32 active:text-white/70',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-0 rounded-[17px] border border-white/[0.07] bg-white/[0.06]" />
                  )}
                  <item.icon
                    size={20}
                    strokeWidth={isActive ? 2.4 : 2}
                    className={[
                      'relative z-10 transition-transform duration-200 group-active:scale-90',
                      isActive ? 'text-[#F2C766]' : '',
                    ].join(' ')}
                  />
                  <span className="relative z-10 text-[9px] font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};
