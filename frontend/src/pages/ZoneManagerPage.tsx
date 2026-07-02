import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import type { Property, Zone, ZoneSummary, ZoneType, ZoneStatus, GeoJSONPolygon, GeoJSONFeatureCollection } from '../types'
import ZoneSidebar from '../components/ZoneSidebar'
import ZoneForm from '../components/ZoneForm'
import MapContainer from '../components/MapContainer'

export default function ZoneManagerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const propId = Number(id)

  const [property, setProperty] = useState<Property | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [summary, setSummary] = useState<ZoneSummary | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSONPolygon | null>(null)
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [loadError, setLoadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async (): Promise<Zone[] | null> => {
    try {
      const [propRes, zonesRes, summaryRes] = await Promise.all([
        api.get<Property>(`/properties/${propId}`),
        api.get<Zone[]>(`/properties/${propId}/zones`),
        api.get<ZoneSummary>(`/properties/${propId}/zones/summary`),
      ])
      setProperty(propRes.data)
      setZones(zonesRes.data)
      setSummary(summaryRes.data)
      setLoadError('')
      return zonesRes.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      // eslint-disable-next-line no-console
      console.error('Failed to load property/zones data', err)
      if (status === 404) {
        // Property genuinely doesn't exist (or isn't yours) — leaving makes sense.
        navigate('/properties')
      } else {
        // Transient/network/server error — stay put and show it, instead of
        // silently bouncing the user back to the properties list, which can
        // look exactly like "my zones disappeared."
        setLoadError(
          status
            ? `Failed to load zones (server returned ${status}). Your data is safe — try refreshing.`
            : 'Failed to reach the server. Check your connection and try refreshing.'
        )
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [propId, navigate])

  useEffect(() => { loadData() }, [loadData])

  const handlePolygonDrawn = useCallback((geometry: GeoJSONPolygon) => {
    setPendingGeometry(geometry)
    setEditingZone(null)
    setShowZoneForm(true)
    setIsDrawing(false)
  }, [])

  const handleGeometryEdited = useCallback(async (zoneId: number, geometry: GeoJSONPolygon) => {
    try {
      await api.put(`/properties/${propId}/zones/${zoneId}`, { geometry })
      loadData()
    } catch (err) {
      console.error('Failed to save geometry edit', err)
    }
  }, [propId, loadData])

  const handleZoneFormSave = useCallback(async (data: {
    name: string; type: ZoneType; mower_count: number; status: ZoneStatus
  }) => {
    try {
      if (editingZone) {
        await api.put(`/properties/${propId}/zones/${editingZone.id}`, data)
      } else if (pendingGeometry) {
        await api.post(`/properties/${propId}/zones`, { ...data, geometry: pendingGeometry })
      }
      setShowZoneForm(false)
      setPendingGeometry(null)
      setEditingZone(null)
      loadData()
    } catch (err: unknown) {
      // Extract backend error message and re-throw so ZoneForm shows it inline
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      throw new Error(msg || 'Failed to save zone.')
    }
  }, [editingZone, pendingGeometry, propId, loadData])

  const handleDeleteZone = useCallback(async (zoneId: number) => {
    if (!confirm('Delete this zone?')) return
    await api.delete(`/properties/${propId}/zones/${zoneId}`)
    if (selectedZoneId === zoneId) setSelectedZoneId(null)
    loadData()
  }, [propId, selectedZoneId, loadData])

  const handleEditZoneAttrs = useCallback((zone: Zone) => {
    setEditingZone(zone)
    setPendingGeometry(null)
    setShowZoneForm(true)
  }, [])

  const handleExport = async () => {
    const res = await api.get<GeoJSONFeatureCollection>(`/properties/${propId}/zones/export`)
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${property?.name ?? 'zones'}-zones.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportSuccess('')
    try {
      const text = await file.text()
      const geojson = JSON.parse(text) as unknown
      const res = await api.post(`/properties/${propId}/zones/import`, geojson)
      // eslint-disable-next-line no-console
      console.log('Import response:', res.data)
      const importedCount = (res.data as { imported?: number })?.imported ?? 0
      const refreshed = await loadData()
      if (refreshed) {
        setImportSuccess(
          `Imported ${importedCount} zone(s). Sidebar/zone list now shows ${refreshed.length} total zone(s).`
        )
      } else {
        setImportError(
          `Import reported success (${importedCount} zone(s)) but the follow-up reload failed — see the banner above and your browser console for details.`
        )
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      // eslint-disable-next-line no-console
      console.error('Import failed:', err)
      setImportError(msg || 'Invalid GeoJSON — must be a FeatureCollection of Polygons.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Top bar */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0 flex-wrap gap-y-2">
        <button
          onClick={() => navigate('/properties')}
          className="text-gray-400 hover:text-white text-sm transition-colors shrink-0"
        >
          ← Properties
        </button>
        <span className="text-gray-700">|</span>
        <span className="font-semibold text-white truncate">{property?.name}</span>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full shrink-0">{property?.type}</span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setIsDrawing(d => !d); setImportError('') }}
            className={`text-sm font-medium rounded-lg px-3 py-1.5 transition-colors shrink-0 ${
              isDrawing
                ? 'bg-amber-600 text-white'
                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
            }`}
          >
            {isDrawing ? '✏️ Drawing… (dbl-click to finish)' : '+ Draw Zone'}
          </button>

          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 transition-colors shrink-0">
            ↑ Import GeoJSON
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json"
              onChange={handleImport}
              className="hidden"
            />
          </label>

          <button
            onClick={handleExport}
            disabled={zones.length === 0}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-sm rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            ↓ Export GeoJSON
          </button>
        </div>
      </header>

      {/* Load error banner (network/server failure — user is kept on the page) */}
      {loadError && (
        <div className="bg-red-900/40 border-b border-red-800 text-red-300 text-sm px-4 py-2 flex items-center justify-between shrink-0">
          <span>⚠ {loadError}</span>
          <button onClick={() => loadData()} className="text-red-300 hover:text-white ml-4 underline">Retry</button>
        </div>
      )}

      {/* Import success banner */}
      {importSuccess && (
        <div className="bg-emerald-900/40 border-b border-emerald-800 text-emerald-300 text-sm px-4 py-2 flex items-center justify-between shrink-0">
          <span>✓ {importSuccess}</span>
          <button onClick={() => setImportSuccess('')} className="text-emerald-400 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Import error banner */}
      {importError && (
        <div className="bg-red-900/40 border-b border-red-800 text-red-300 text-sm px-4 py-2 flex items-center justify-between shrink-0">
          <span>⚠ Import failed: {importError}</span>
          <button onClick={() => setImportError('')} className="text-red-400 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <ZoneSidebar
          zones={zones}
          summary={summary}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onEditZone={handleEditZoneAttrs}
          onDeleteZone={handleDeleteZone}
        />

        <div className="flex-1 relative">
          <MapContainer
            zones={zones}
            selectedZoneId={selectedZoneId}
            isDrawing={isDrawing}
            onPolygonDrawn={handlePolygonDrawn}
            onGeometryEdited={handleGeometryEdited}
            onSelectZone={setSelectedZoneId}
          />
        </div>
      </div>

      {showZoneForm && (
        <ZoneForm
          zone={editingZone}
          onSave={handleZoneFormSave}
          onCancel={() => {
            setShowZoneForm(false)
            setPendingGeometry(null)
            setEditingZone(null)
            setIsDrawing(false)
          }}
        />
      )}
    </div>
  )
}