import { LayoutDashboard, Gamepad2, Users, Activity, ScrollText, LogOut } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearAdminToken } from '../api/client'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: Activity },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
]

export function AdminLayout() {
  const navigate = useNavigate()

  function logout() {
    clearAdminToken()
    navigate('/login')
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-800 bg-panel lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-5 lg:block">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">TwinGames</p>
            <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-1">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                    isActive ? 'bg-sky-500/15 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="hidden px-3 pb-4 lg:block">
          <button type="button" onClick={logout} className="btn-secondary w-full">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-4 lg:hidden">
          <h2 className="font-medium">Admin</h2>
          <button type="button" onClick={logout} className="btn-secondary">
            <LogOut size={16} />
          </button>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
