import { type CSSProperties } from 'react';
import { Gamepad2, Home, Trophy, User } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/solo', icon: Gamepad2, label: 'Solo' },
  { to: '/rating', icon: Trophy, label: 'Rating' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export const BottomNav = () => {
  const location = useLocation();

  const activeIndex = Math.max(
    0,
    navItems.findIndex((item) =>
      item.to === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.to),
    ),
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[460px] px-4 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#09090d] via-[#09090d]/90 to-transparent" />

      <div
        className="bottom-dock"
        style={{
          '--active-index': activeIndex,
          '--nav-count': navItems.length,
        } as CSSProperties}
      >
        <span className="nav-active-bg" />

        <div className="relative z-10 grid grid-cols-4">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'pressable nav-link',
                    isActive ? 'is-active' : '',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="nav-icon-wrap">
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2.65 : 1.85}
                        className="nav-icon"
                      />
                    </span>

                    <span className="nav-label">
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
