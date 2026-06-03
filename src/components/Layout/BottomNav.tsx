import { Home, Trophy, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const BottomNav = () => {
  const navItems = [
    { to: '/', icon: Home, label: 'Главная' },
    { to: '/rating', icon: Trophy, label: 'Рейтинг' },
    { to: '/profile', icon: User, label: 'Профиль' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[480px] px-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#080910]/90 p-1.5 shadow-[0_-18px_55px_rgba(0,0,0,0.46)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),transparent_48%,rgba(216,183,106,0.06))]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="relative grid grid-cols-3 gap-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'group relative flex min-h-[60px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[22px] transition-all duration-300',
                  isActive
                    ? 'text-white'
                    : 'text-white/34 hover:text-white/72',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <>
                      <span className="absolute inset-0 rounded-[22px] border border-white/[0.08] bg-white/[0.065] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
                      <span className="absolute left-1/2 top-2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#D8B76A]" />
                    </>
                  )}

                  <item.icon
                    size={21}
                    strokeWidth={isActive ? 2.4 : 2.1}
                    className={[
                      'relative z-10 transition duration-300 group-active:scale-90',
                      isActive ? 'text-[#D8B76A]' : '',
                    ].join(' ')}
                  />

                  <span className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.16em]">
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