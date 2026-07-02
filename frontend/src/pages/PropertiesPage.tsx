import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import type { Property, PropertyType } from '../types'

const PROPERTY_TYPES: PropertyType[] = ['Golf Course', 'Airport', 'Corporate Campus', 'Other']

interface PropertyFormData {
  name: string
  type: PropertyType
  total_acreage: string
  notes: string
}

const emptyForm: PropertyFormData = { name: '', type: 'Golf Course', total_acreage: '', notes: '' }

export default function PropertiesPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [properties, setProperties] = useState<Property[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<PropertyFormData>(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadProperties = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (typeFilter) params.type = typeFilter
      const res = await api.get<Property[]>('/properties', { params })
      setProperties(res.data)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => { loadProperties() }, [loadProperties])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (p: Property) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      type: p.type,
      total_acreage: p.total_acreage?.toString() || '',
      notes: p.notes || '',
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload = {
        name: form.name,
        type: form.type,
        total_acreage: form.total_acreage ? parseFloat(form.total_acreage) : null,
        notes: form.notes,
      }
      if (editingId) {
        await api.put(`/properties/${editingId}`, payload)
      } else {
        await api.post('/properties', payload)
      }
      setShowForm(false)
      loadProperties()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setFormError(msg || 'Failed to save property.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this property and all its zones?')) return
    await api.delete(`/properties/${id}`)
    loadProperties()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-bold text-lg">⚡ Velocity</span>
          <span className="text-gray-500 text-sm">Zone Manager</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button onClick={logout} className="text-gray-400 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Properties</h1>
          <button
            onClick={openCreate}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            + New Property
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">All types</option>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Property list */}
        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : properties.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-lg">No properties yet.</p>
            <p className="text-sm mt-1">Create your first property to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {properties.map(p => (
              <div
                key={p.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between hover:border-gray-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white truncate">{p.name}</h3>
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full shrink-0">{p.type}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1 flex gap-4">
                    {p.total_acreage && <span>{p.total_acreage} acres</span>}
                    {p.notes && <span className="truncate max-w-xs">{p.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => navigate(`/properties/${p.id}/zones`)}
                    className="bg-emerald-900 hover:bg-emerald-800 text-emerald-300 text-sm rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Open Zones
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="text-gray-400 hover:text-white text-sm px-2 py-1.5 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-red-500 hover:text-red-400 text-sm px-2 py-1.5 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Property form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-white mb-5">
              {editingId ? 'Edit Property' : 'New Property'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Type *</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as PropertyType }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Total Acreage</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.total_acreage}
                  onChange={e => setForm(f => ({ ...f, total_acreage: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
                  rows={3}
                />
              </div>
              {formError && (
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium rounded-lg py-2.5 transition-colors"
                >
                  {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create property'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg py-2.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
