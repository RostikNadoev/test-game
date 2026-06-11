import { Home, Trophy, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/rating', icon: Trophy, label: 'Rating' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[460px] px-4 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#09090d] via-[#09090d]/90 to-transparent" />

      <div className="app-panel relative rounded-[24px] p-1.5">
        <div className="grid grid-cols-3 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'pressable nav-item relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[19px]',
                    isActive ? 'nav-item-active text-white' : 'text-slate-500',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.4 : 1.7}
                      className={isActive ? 'text-white' : 'text-slate-500'}
                    />

                    <span
                      className={[
                        'text-safe text-[8.5px] font-bold uppercase tracking-[0.13em]',
                        isActive ? 'text-white' : 'text-slate-500',
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};