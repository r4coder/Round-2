import type { Zone, ZoneSummary } from '../types'

interface Props {
  zones: Zone[]
  summary: ZoneSummary | null
  selectedZoneId: number | null
  onSelectZone: (id: number | null) => void
  onEditZone: (zone: Zone) => void
  onDeleteZone: (id: number) => void
}

const ZONE_TYPE_COLORS: Record<string, string> = {
  Fairway: 'bg-emerald-900 text-emerald-300',
  Rough: 'bg-yellow-900 text-yellow-300',
  Perimeter: 'bg-blue-900 text-blue-300',
  Exclusion: 'bg-red-900 text-red-300',
}

export default function ZoneSidebar({
  zones, summary, selectedZoneId, onSelectZone, onEditZone, onDeleteZone
}: Props) {
  return (
    <aside className="w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
      {/* Summary header */}
      {summary && (
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Property Summary</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Zones" value={summary.total_zones} />
            <Stat label="Total Acreage" value={`${summary.total_acreage.toFixed(1)} ac`} />
            <Stat label="Mowers Assigned" value={summary.total_mowers} />
            <Stat
              label="Understaffed"
              value={summary.understaffed_count}
              warn={summary.understaffed_count > 0}
            />
          </div>
        </div>
      )}

      {/* Zones list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-400">
            Zones ({zones.length})
          </h2>
        </div>
        {zones.length === 0 ? (
          <p className="text-gray-600 text-sm px-4 py-2">No zones yet. Draw one on the map.</p>
        ) : (
          <ul className="px-2 pb-4 space-y-1">
            {zones.map(zone => (
              <li
                key={zone.id}
                onClick={() => onSelectZone(selectedZoneId === zone.id ? null : zone.id)}
                className={`rounded-lg p-3 cursor-pointer transition-colors ${
                  selectedZoneId === zone.id
                    ? 'bg-gray-700 border border-gray-600'
                    : 'hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm truncate">{zone.name}</span>
                      {zone.understaffed && (
                        <span
                          title="Understaffed: less than 1 mower per 2 acres"
                          className="text-xs bg-amber-900 text-amber-300 border border-amber-700 px-1.5 py-0.5 rounded-full shrink-0"
                        >
                          ⚠ Understaffed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${ZONE_TYPE_COLORS[zone.type] ?? 'bg-gray-800 text-gray-400'}`}>
                        {zone.type}
                      </span>
                      <span className="text-xs text-gray-500">{zone.acreage.toFixed(2)} ac</span>
                      <span className="text-xs text-gray-500">{zone.mower_count} mower{zone.mower_count !== 1 ? 's' : ''}</span>
                      <span className={`text-xs ${zone.status === 'Active' ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {zone.status}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Actions — shown when selected */}
                {selectedZoneId === zone.id && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onEditZone(zone)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1 transition-colors"
                    >
                      Edit attrs
                    </button>
                    <button
                      onClick={() => onDeleteZone(zone.id)}
                      className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-400 rounded px-2 py-1 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function Stat({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}
