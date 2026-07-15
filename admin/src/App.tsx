import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { RequireAuth } from './components/RequireAuth'
import { AuditLogPage } from './pages/AuditLog'
import { DashboardPage } from './pages/Dashboard'
import { GamesPage } from './pages/Games'
import { LoginPage } from './pages/Login'
import { SessionsPage } from './pages/Sessions'
import { UserDetailPage } from './pages/UserDetail'
import { UsersPage } from './pages/Users'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="audit" element={<AuditLogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
