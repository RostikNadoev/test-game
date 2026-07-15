import { useEffect, useState } from 'react'
import { adminApi } from '../api/client'
import type { GameSetting } from '../api/types'

export function GamesPage() {
  const [games, setGames] = useState<GameSetting[]>([])
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  function reload() {
    adminApi
      .games()
      .then((res) => setGames(res.games))
      .catch((err) => setError(err instanceof Error ? err.message : 'load failed'))
  }

  useEffect(() => {
    reload()
  }, [])

  async function save(game: GameSetting) {
    if (!reason.trim()) {
      setMessage('Reason is required for game updates')
      return
    }
    try {
      await adminApi.patchGame(game.code, {
        enabled: game.enabled,
        title: game.title,
        min_bet: game.min_bet,
        max_bet: game.max_bet,
        maintenance_message: game.maintenance_message ?? '',
        reason,
      })
      setMessage(`Updated ${game.code}`)
      reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'update failed')
    }
  }

  function updateLocal(code: string, patch: Partial<GameSetting>) {
    setGames((prev) => prev.map((g) => (g.code === code ? { ...g, ...patch } : g)))
  }

  if (error) return <p className="text-rose-400">{error}</p>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Game Settings</h2>
        <p className="text-sm text-slate-400">Enable/disable games and tune bet limits</p>
      </div>

      <div className="card space-y-2">
        <label className="text-sm text-slate-400">Update reason</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        {message ? <p className="text-sm text-sky-300">{message}</p> : null}
      </div>

      <div className="space-y-4">
        {games.map((game) => (
          <div key={game.code} className="card grid gap-3 lg:grid-cols-6">
            <div>
              <p className="font-medium">{game.code}</p>
              <p className="text-xs uppercase text-slate-500">{game.kind}</p>
            </div>
            <input className="input" value={game.title} onChange={(e) => updateLocal(game.code, { title: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={game.enabled}
                onChange={(e) => updateLocal(game.code, { enabled: e.target.checked })}
              />
              Enabled
            </label>
            <input
              className="input"
              type="number"
              value={game.min_bet}
              onChange={(e) => updateLocal(game.code, { min_bet: Number(e.target.value) })}
            />
            <input
              className="input"
              type="number"
              value={game.max_bet}
              onChange={(e) => updateLocal(game.code, { max_bet: Number(e.target.value) })}
            />
            <button type="button" className="btn-primary" onClick={() => save(game)}>
              Save
            </button>
            <div className="lg:col-span-6">
              <input
                className="input"
                placeholder="Maintenance message"
                value={game.maintenance_message ?? ''}
                onChange={(e) => updateLocal(game.code, { maintenance_message: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
