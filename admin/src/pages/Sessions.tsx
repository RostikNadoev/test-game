import { useEffect, useState } from 'react'
import { adminApi } from '../api/client'
import type { AdminSessionsResponse } from '../api/types'

export function SessionsPage() {
  const [data, setData] = useState<AdminSessionsResponse | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  function reload() {
    adminApi
      .sessions()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'load failed'))
  }

  useEffect(() => {
    reload()
  }, [])

  async function abandon(sessionId: string) {
    if (!reason.trim()) {
      setMessage('Reason is required')
      return
    }
    try {
      await adminApi.abandonSolo(sessionId, reason)
      setMessage(`Session ${sessionId} abandoned`)
      reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'abandon failed')
    }
  }

  if (error) return <p className="text-rose-400">{error}</p>
  if (!data) return <p className="text-slate-400">Loading sessions...</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Active Sessions</h2>
        <p className="text-sm text-slate-400">Solo sessions, lobbies, and playing matches</p>
      </div>

      <div className="card space-y-2">
        <label className="text-sm text-slate-400">Abandon reason (required for solo abandon)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        {message ? <p className="text-sm text-sky-300">{message}</p> : null}
      </div>

      <section className="card overflow-x-auto">
        <h3 className="mb-3 font-medium">Solo sessions ({data.solo_sessions.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Game</th>
              <th>Bet</th>
              <th>Multiplier</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.solo_sessions.map((s) => (
              <tr key={s.id}>
                <td className="font-mono text-xs">{s.id}</td>
                <td>
                  {s.tg_user} (#{s.user_id})
                </td>
                <td>{s.game}</td>
                <td>{s.bet_coins}</td>
                <td>{s.multiplier.toFixed(2)}x</td>
                <td>
                  <button type="button" className="btn-danger" onClick={() => abandon(s.id)}>
                    Abandon
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h3 className="mb-3 font-medium">Lobbies ({data.lobbies.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Game</th>
              <th>Status</th>
              <th>Players</th>
              <th>Bet</th>
            </tr>
          </thead>
          <tbody>
            {data.lobbies.map((l) => (
              <tr key={l.id}>
                <td className="font-mono text-xs">{l.id}</td>
                <td>{l.name}</td>
                <td>{l.game}</td>
                <td>{l.status}</td>
                <td>{l.player_count}</td>
                <td>{l.bet_coins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h3 className="mb-3 font-medium">Matches ({data.matches.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Lobby</th>
              <th>Game</th>
              <th>Players</th>
              <th>Bet</th>
            </tr>
          </thead>
          <tbody>
            {data.matches.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td className="font-mono text-xs">{m.lobby_id}</td>
                <td>{m.game}</td>
                <td>
                  {m.player1_id} vs {m.player2_id}
                </td>
                <td>{m.bet_coins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
