import { type CSSProperties } from 'react';
import { Gamepad2, Home, Trophy, User } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';

const navItems = [
  { to: '/', icon: Home, label: ['Home', 'Главная'] },
  { to: '/solo', icon: Gamepad2, label: ['Solo', 'Соло'] },
  { to: '/rating', icon: Trophy, label: ['Rating', 'Рейтинг'] },
  { to: '/profile', icon: User, label: ['Profile', 'Профиль'] },
];

export const BottomNav = () => {
  const location = useLocation();
  const { tr } = useLanguage();

  const activeIndex = Math.max(
    0,
    navItems.findIndex((item) =>
      item.to === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.to),
    ),
  );

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[var(--app-shell-max-width)] -translate-x-1/2 px-[var(--app-gutter)] pb-[calc(10px+env(safe-area-inset-bottom)+var(--telegram-bottom-offset))]">
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
                      {tr(item.label[0], item.label[1])}
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
