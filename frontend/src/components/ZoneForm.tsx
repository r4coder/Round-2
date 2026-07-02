import React, { useState } from 'react'
import type { Zone, ZoneType, ZoneStatus } from '../types'

const ZONE_TYPES: ZoneType[] = ['Fairway', 'Rough', 'Perimeter', 'Exclusion']
const ZONE_STATUSES: ZoneStatus[] = ['Active', 'Inactive']

interface Props {
  zone: Zone | null  // null = creating new zone
  onSave: (data: { name: string; type: ZoneType; mower_count: number; status: ZoneStatus }) => Promise<void>
  onCancel: () => void
}

export default function ZoneForm({ zone, onSave, onCancel }: Props) {
  const [name, setName] = useState(zone?.name ?? '')
  const [type, setType] = useState<ZoneType>(zone?.type ?? 'Fairway')
  const [mowerCount, setMowerCount] = useState(zone?.mower_count ?? 1)
  // Note: no min=1 guard here — we intentionally let 0 reach the backend
  // so the TER-S02 inline error message is visible to the user
  const [status, setStatus] = useState<ZoneStatus>(zone?.status ?? 'Active')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({ name, type, mower_count: mowerCount, status })
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save zone.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-5">
          {zone ? 'Edit Zone' : 'New Zone'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Zone Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              required
              placeholder="e.g. Hole 1 Fairway"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Zone Type *</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as ZoneType)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              {ZONE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Mowers Assigned *</label>
            <input
              type="number"
              min="0"
              value={mowerCount}
              onChange={e => setMowerCount(parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ZoneStatus)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              {ZONE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Inline backend error — TER-S02 requirement */}
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium rounded-lg py-2.5 transition-colors"
            >
              {saving ? 'Saving…' : zone ? 'Save changes' : 'Create zone'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg py-2.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
