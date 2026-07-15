import { useEffect, useState } from 'react'
import { adminApi } from '../api/client'
import type { AdminAuditLog } from '../api/types'

export function AuditLogPage() {
  const [items, setItems] = useState<AdminAuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')

  function load() {
    const params = new URLSearchParams()
    if (action) params.set('action', action)
    adminApi
      .audit(params)
      .then((res) => {
        setItems(res.items)
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
        <h2 className="text-2xl font-semibold">Audit Log</h2>
        <p className="text-sm text-slate-400">{total} records</p>
      </div>

      <div className="card flex gap-3">
        <input
          className="input max-w-xs"
          placeholder="Filter by action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <button type="button" className="btn-primary" onClick={load}>
          Filter
        </button>
      </div>

      {error ? <p className="text-rose-400">{error}</p> : null}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Reason</th>
              <th>IP</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.admin_username}</td>
                <td>{row.action}</td>
                <td>
                  {row.target_type}:{row.target_id}
                </td>
                <td>{row.reason}</td>
                <td>{row.ip}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
