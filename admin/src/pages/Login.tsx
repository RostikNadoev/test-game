import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, setAdminToken } from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.login(username, password)
      setAdminToken(res.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">TwinGames</p>
          <h1 className="text-2xl font-semibold">Admin Login</h1>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-slate-400">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
