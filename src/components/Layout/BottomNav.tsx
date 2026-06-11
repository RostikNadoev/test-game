import { Home, Trophy, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navItems = [
  {
    to: '/',
    icon: Home,
    label: 'Home',
    accent: 'from-blue-500 to-cyan-400',
  },
  {
    to: '/rating',
    icon: Trophy,
    label: 'Rating',
    accent: 'from-yellow-400 to-orange-500',
  },
  {
    to: '/profile',
    icon: User,
    label: 'Profile',
    accent: 'from-purple-500 to-pink-500',
  },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[460px] px-4 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent" />

      <div className="card relative overflow-hidden rounded-[28px] p-1.5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(77,124,255,0.18),transparent_58%)]" />

        <div className="relative grid grid-cols-3 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'btn-press relative flex min-h-[58px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[22px] transition-all duration-200',
                    isActive ? 'text-white' : 'text-slate-500 active:text-slate-300',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-200',
                        item.accent,
                        isActive ? 'opacity-18' : '',
                      ].join(' ')}
                    />

                    {isActive && (
                      <>
                        <span
                          className={[
                            'absolute left-1/2 top-1 h-1 w-8 -translate-x-1/2 rounded-full bg-gradient-to-r shadow-[0_0_18px_currentColor]',
                            item.accent,
                          ].join(' ')}
                        />
                        <span
                          className={[
                            'absolute inset-x-2 bottom-1 h-8 rounded-full bg-gradient-to-r opacity-20 blur-xl',
                            item.accent,
                          ].join(' ')}
                        />
                      </>
                    )}

                    <span
                      className={[
                        'relative flex h-8 w-8 items-center justify-center rounded-2xl transition-all duration-200',
                        isActive
                          ? 'bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                          : 'bg-transparent',
                      ].join(' ')}
                    >
                      <Icon
                        size={19}
                        strokeWidth={isActive ? 2.7 : 1.7}
                        className={isActive ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.28)]' : ''}
                      />
                    </span>

                    <span
                      className={[
                        'relative text-[9px] font-black uppercase tracking-[0.16em] transition-all duration-200',
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