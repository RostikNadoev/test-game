import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/client'
import type { AdminUserListItem } from '../api/types'

export function UsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [blocked, setBlocked] = useState('')
  const [error, setError] = useState('')

  function load() {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (blocked) params.set('blocked', blocked)
    adminApi
      .listUsers(params)
      .then((res) => {
        setUsers(res.users)
        setTotal(res.total)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'load failed'))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Users</h2>
        <p className="text-sm text-slate-400">{total} users total</p>
      </div>

      <div className="card flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-xs" value={blocked} onChange={(e) => setBlocked(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <button type="button" className="btn-primary" onClick={load}>
          Search
        </button>
      </div>

      {error ? <p className="text-rose-400">{error}</p> : null}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Rating</th>
              <th>GAME</th>
              <th>TON</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link className="text-sky-300 hover:underline" to={`/users/${user.id}`}>
                    {user.id}
                  </Link>
                </td>
                <td>{user.tg_user}</td>
                <td>{user.rating}</td>
                <td>{user.balance_game.toFixed(2)}</td>
                <td>{user.balance_ton.toFixed(4)}</td>
                <td>{user.is_blocked ? <span className="badge-red">blocked</span> : <span className="badge-green">active</span>}</td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
