import { useEffect, useState } from 'react'
import { adminApi } from '../api/client'
import type { AdminDashboardStats, WalletTransaction } from '../api/types'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [tx, setTx] = useState<WalletTransaction[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .dashboard()
      .then((res) => {
        setStats(res.stats)
        setTx(res.recent_transactions)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'load failed'))
  }, [])

  if (error) return <p className="text-rose-400">{error}</p>
  if (!stats) return <p className="text-slate-400">Loading dashboard...</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-slate-400">Live platform overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={stats.total_users} />
        <StatCard label="Blocked users" value={stats.blocked_users} />
        <StatCard label="Active solo sessions" value={stats.active_solo_sessions} />
        <StatCard label="Active lobbies" value={stats.active_lobbies} />
        <StatCard label="Playing matches" value={stats.playing_matches} />
        <StatCard label="New users today" value={stats.new_users_today} />
        <StatCard label="Total GAME balance" value={stats.total_balance_game.toFixed(2)} />
        <StatCard label="Total TON balance" value={stats.total_balance_ton.toFixed(4)} />
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-3 font-medium">Recent wallet transactions</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Type</th>
              <th>Currency</th>
              <th>Amount</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {tx.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.user_id}</td>
                <td>{row.type}</td>
                <td>{row.currency}</td>
                <td>{row.amount}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
