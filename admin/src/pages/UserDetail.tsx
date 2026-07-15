import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi } from '../api/client'
import type { AdminUserDetail } from '../api/types'

export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [walletCurrency, setWalletCurrency] = useState('game')
  const [walletOperation, setWalletOperation] = useState('credit')
  const [walletAmount, setWalletAmount] = useState('10')
  const [walletReason, setWalletReason] = useState('')
  const [message, setMessage] = useState('')

  function reload() {
    if (!userId) return
    adminApi
      .getUser(userId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'load failed'))
  }

  useEffect(() => {
    reload()
  }, [userId])

  async function toggleBlock() {
    if (!detail || !reason.trim()) {
      setMessage('Reason is required')
      return
    }
    try {
      if (detail.user.is_blocked) {
        await adminApi.unblockUser(userId, reason)
      } else {
        await adminApi.blockUser(userId, reason)
      }
      setReason('')
      setMessage('User status updated')
      reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'action failed')
    }
  }

  async function adjustWallet() {
    if (!walletReason.trim()) {
      setMessage('Wallet reason is required')
      return
    }
    try {
      await adminApi.adjustWallet(userId, {
        currency: walletCurrency,
        operation: walletOperation,
        amount: Number(walletAmount),
        reason: walletReason,
      })
      setWalletReason('')
      setMessage('Wallet adjusted')
      reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'wallet adjust failed')
    }
  }

  if (error) return <p className="text-rose-400">{error}</p>
  if (!detail) return <p className="text-slate-400">Loading user...</p>

  const { user, stats, solo_stats: soloStats } = detail

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/users" className="text-sm text-sky-300 hover:underline">
          ← Users
        </Link>
        <h2 className="text-2xl font-semibold">{user.display_name || user.username || `User #${user.id}`}</h2>
      </div>

      {message ? <p className="text-sm text-sky-300">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2">
          <h3 className="font-medium">Profile</h3>
          <p>Telegram ID: {user.telegram_id}</p>
          <p>GAME: {user.balance_game.toFixed(2)}</p>
          <p>TON: {user.balance_ton.toFixed(4)}</p>
          <p>Rating: {stats.rating}</p>
          <p>W/L: {stats.wins}/{stats.losses}</p>
          <p>Solo spins: {soloStats.total_spins}</p>
          <p>Status: {user.is_blocked ? <span className="badge-red">blocked</span> : <span className="badge-green">active</span>}</p>
          {user.blocked_reason ? <p className="text-sm text-rose-300">Reason: {user.blocked_reason}</p> : null}
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium">Block / Unblock</h3>
          <textarea className="input min-h-20" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className={user.is_blocked ? 'btn-secondary' : 'btn-danger'} onClick={toggleBlock}>
            {user.is_blocked ? 'Unblock user' : 'Block user'}
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium">Wallet adjust</h3>
          <select className="input" value={walletCurrency} onChange={(e) => setWalletCurrency(e.target.value)}>
            <option value="game">GAME</option>
            <option value="ton">TON</option>
          </select>
          <select className="input" value={walletOperation} onChange={(e) => setWalletOperation(e.target.value)}>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <input className="input" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} />
          <textarea
            className="input min-h-20"
            placeholder="Reason"
            value={walletReason}
            onChange={(e) => setWalletReason(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={adjustWallet}>
            Apply adjustment
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="mb-3 font-medium">Recent wallet transactions</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Currency</th>
              <th>Amount</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {detail.recent_wallet_tx.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
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
