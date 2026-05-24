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
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#090B17]/85 p-2 shadow-[0_-18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-400/10 via-fuchsia-500/10 to-amber-300/10" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

        <div className="relative grid grid-cols-3 gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'group relative flex min-h-[58px] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl transition-all duration-300',
                  isActive
                    ? 'text-white shadow-[0_10px_30px_rgba(34,211,238,0.22)]'
                    : 'text-slate-500 hover:text-white',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <>
                      <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/25 via-violet-500/25 to-fuchsia-500/25" />
                      <span className="absolute inset-x-5 top-1 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                    </>
                  )}

                  <item.icon
                    size={22}
                    strokeWidth={isActive ? 2.6 : 2.2}
                    className="relative z-10 transition-transform duration-300 group-active:scale-90"
                  />
                  <span className="relative z-10 text-[10px] font-black uppercase tracking-[0.14em]">
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