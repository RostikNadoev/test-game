import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi, getAdminToken } from '../api/client'

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = getAdminToken()
  const [ok, setOk] = useState<boolean | null>(token ? null : false)

  useEffect(() => {
    if (!token) {
      return
    }
    adminApi
      .me()
      .then(() => setOk(true))
      .catch(() => setOk(false))
  }, [token])

  if (ok === null) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>
  }
  if (!ok) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
