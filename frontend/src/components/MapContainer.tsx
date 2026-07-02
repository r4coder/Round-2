import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { fromLonLat, toLonLat } from 'ol/proj'
import { Draw, Modify } from 'ol/interaction'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import { Polygon, LineString } from 'ol/geom'
import { Style, Fill, Stroke } from 'ol/style'
import { extend, createEmpty, isEmpty, containsExtent } from 'ol/extent'
import type { Zone, GeoJSONPolygon } from '../types'
import type { Geometry } from 'ol/geom'
import { generateMowingPath } from '../utils/mowingPath'

interface Props {
  zones: Zone[]
  selectedZoneId: number | null
  isDrawing: boolean
  onPolygonDrawn: (geometry: GeoJSONPolygon) => void
  onGeometryEdited: (zoneId: number, geometry: GeoJSONPolygon) => void
  onSelectZone: (id: number | null) => void
}

const ZONE_FILL: Record<string, string> = {
  Fairway:   'rgba(34,197,94,0.25)',
  Rough:     'rgba(234,179,8,0.25)',
  Perimeter: 'rgba(59,130,246,0.25)',
  Exclusion: 'rgba(239,68,68,0.25)',
}
const ZONE_STROKE: Record<string, string> = {
  Fairway:   '#22c55e',
  Rough:     '#eab308',
  Perimeter: '#3b82f6',
  Exclusion: '#ef4444',
}

const UNDERSTAFFED_FILL   = 'rgba(251,146,60,0.35)'
const UNDERSTAFFED_STROKE = '#f97316'
const SELECTED_FILL       = 'rgba(99,102,241,0.35)'
const SELECTED_STROKE     = '#6366f1'
const CONFLICT_FILL       = 'rgba(220,38,38,0.40)'
const CONFLICT_STROKE     = '#dc2626'
const MOWING_STROKE       = 'rgba(16,185,129,0.85)'

const DEFAULT_CENTER = fromLonLat([78.9629, 20.5937])
const DEFAULT_ZOOM   = 5

const geoFormat = new GeoJSON()

function computeConflicts(zones: Zone[]): Set<number> {
  const conflicted = new Set<number>()
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      if (!zones[i].geometry || !zones[j].geometry) continue
      if (ringsOverlap(
        zones[i].geometry.coordinates[0],
        zones[j].geometry.coordinates[0]
      )) {
        conflicted.add(zones[i].id)
        conflicted.add(zones[j].id)
      }
    }
  }
  return conflicted
}

function ringsOverlap(a: number[][], b: number[][]): boolean {
  const aMinX = Math.min(...a.map(p => p[0])), aMaxX = Math.max(...a.map(p => p[0]))
  const aMinY = Math.min(...a.map(p => p[1])), aMaxY = Math.max(...a.map(p => p[1]))
  const bMinX = Math.min(...b.map(p => p[0])), bMaxX = Math.max(...b.map(p => p[0]))
  const bMinY = Math.min(...b.map(p => p[1])), bMaxY = Math.max(...b.map(p => p[1]))
  if (aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY) return false
  if (pointInRing(a[0][0], a[0][1], b)) return true
  if (pointInRing(b[0][0], b[0][1], a)) return true
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsIntersect(a[i], a[i+1], b[j], b[j+1])) return true
  return false
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

function segmentsIntersect(p1: number[], p2: number[], p3: number[], p4: number[]): boolean {
  const d1x = p2[0]-p1[0], d1y = p2[1]-p1[1]
  const d2x = p4[0]-p3[0], d2y = p4[1]-p3[1]
  const cross = d1x*d2y - d1y*d2x
  if (Math.abs(cross) < 1e-12) return false
  const dx = p3[0]-p1[0], dy = p3[1]-p1[1]
  const t = (dx*d2y - dy*d2x) / cross
  const u = (dx*d1y - dy*d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function makeZoneStyle(zone: Zone, selected: boolean, conflicted: boolean): Style {
  if (selected) {
    return new Style({
      fill:   new Fill({ color: SELECTED_FILL }),
      stroke: new Stroke({ color: SELECTED_STROKE, width: 3 }),
    })
  }
  if (conflicted) {
    return new Style({
      fill:   new Fill({ color: CONFLICT_FILL }),
      stroke: new Stroke({ color: CONFLICT_STROKE, width: 2.5, lineDash: [8, 4] }),
    })
  }
  if (zone.understaffed) {
    return new Style({
      fill:   new Fill({ color: UNDERSTAFFED_FILL }),
      stroke: new Stroke({ color: UNDERSTAFFED_STROKE, width: 2 }),
    })
  }
  return new Style({
    fill:   new Fill({ color: ZONE_FILL[zone.type]   ?? 'rgba(148,163,184,0.2)' }),
    stroke: new Stroke({ color: ZONE_STROKE[zone.type] ?? '#94a3b8', width: 1.5 }),
  })
}

const DRAW_STYLE = new Style({
  fill:   new Fill({ color: 'rgba(52,211,153,0.18)' }),
  stroke: new Stroke({ color: '#34d399', width: 2, lineDash: [6, 4] }),
})

export default function MapContainer({
  zones, selectedZoneId, isDrawing, onPolygonDrawn, onGeometryEdited, onSelectZone
}: Props) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const mapInstance   = useRef<Map | null>(null)
  const zoneSourceRef = useRef(new VectorSource())
  const pathSourceRef = useRef(new VectorSource())
  const drawRef       = useRef<Draw | null>(null)
  const zonesRef      = useRef<Zone[]>(zones)
  const zoomedRef     = useRef(false)
  const prevSelectedRef = useRef<number | null>(null)
  const lastFitTriggerRef = useRef<{ zones: Zone[] | null; showConflicts: boolean | null }>({
    zones: null, showConflicts: null,
  })

  zonesRef.current = zones

  const [showMowingPaths, setShowMowingPaths] = useState(false)
  const [showConflicts,   setShowConflicts]   = useState(true)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const zoneLayer = new VectorLayer({ source: zoneSourceRef.current, zIndex: 1 })
    const pathLayer = new VectorLayer({ source: pathSourceRef.current, zIndex: 2 })

    const map = new Map({
      target: mapRef.current,
      layers: [new TileLayer({ source: new OSM() }), zoneLayer, pathLayer],
      view: new View({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }),
    })

    map.on('click', (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === zoneLayer,
      })
      if (feature) {
        onSelectZone(feature.get('zoneId') as number ?? null)
      } else {
        onSelectZone(null)
      }
    })

    const modify = new Modify({ source: zoneSourceRef.current })
    modify.on('modifyend', (e) => {
      e.features.forEach((feature) => {
        const zoneId = feature.get('zoneId') as number | undefined
        if (!zoneId) return
        const geom = feature.getGeometry() as Polygon
        const coords = geom.getCoordinates()[0].map((c) => toLonLat(c))
        if (coords[0][0] !== coords[coords.length-1][0] ||
            coords[0][1] !== coords[coords.length-1][1]) {
          coords.push(coords[0])
        }
        onGeometryEdited(zoneId, { type: 'Polygon', coordinates: [coords] })
      })
    })
    map.addInteraction(modify)

    mapInstance.current = map
    return () => { map.setTarget(undefined); mapInstance.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zoom in on the selected zone; zoom back out to fit everything on deselect.
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const view = map.getView()

    if (selectedZoneId !== null) {
      const zone = zonesRef.current.find(z => z.id === selectedZoneId)
      if (!zone?.geometry) return
      try {
        const feature = geoFormat.readFeature(
          { type: 'Feature', geometry: zone.geometry, properties: {} },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        ) as Feature<Geometry>
        const geom = feature.getGeometry()
        if (geom) {
          view.fit(geom.getExtent(), {
            padding: [100, 100, 100, 100], duration: 500, maxZoom: 20,
          })
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to zoom to zone "${zone.name}" (id ${zone.id})`, err)
      }
    } else if (prevSelectedRef.current !== null) {
      // Just deselected — zoom back out to show all zones again.
      const allExtent = createEmpty()
      zonesRef.current.forEach((zone) => {
        if (!zone.geometry) return
        try {
          const feature = geoFormat.readFeature(
            { type: 'Feature', geometry: zone.geometry, properties: {} },
            { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
          ) as Feature<Geometry>
          const geom = feature.getGeometry()
          if (geom) extend(allExtent, geom.getExtent())
        } catch {
          // already logged elsewhere; skip silently here
        }
      })
      if (!isEmpty(allExtent)) {
        view.fit(allExtent, { padding: [80, 80, 80, 80], duration: 500, maxZoom: 17 })
      }
    }

    prevSelectedRef.current = selectedZoneId
  }, [selectedZoneId])

  useEffect(() => {
    const source = zoneSourceRef.current
    source.clear()
    if (zones.length === 0) return

    const conflicts = showConflicts ? computeConflicts(zones) : new Set<number>()
    const allExtent = createEmpty()

    zones.forEach((zone) => {
      if (!zone.geometry) return
      try {
        const feature = geoFormat.readFeature(
          { type: 'Feature', geometry: zone.geometry, properties: {} },
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        ) as Feature<Geometry>
        feature.set('zoneId', zone.id)
        feature.setStyle(makeZoneStyle(zone, zone.id === selectedZoneId, conflicts.has(zone.id)))
        source.addFeature(feature)
        const geom = feature.getGeometry()
        if (geom) extend(allExtent, geom.getExtent())
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to render zone "${zone.name}" (id ${zone.id}) — skipping it, but continuing with the rest.`, zone.geometry, err)
      }
    })

    const zonesOrConflictsChanged =
      lastFitTriggerRef.current.zones !== zones || lastFitTriggerRef.current.showConflicts !== showConflicts
    lastFitTriggerRef.current = { zones, showConflicts }

    if (zonesOrConflictsChanged && !isEmpty(allExtent) && mapInstance.current) {
      const map = mapInstance.current
      const view = map.getView()
      const viewportExtent = map.getSize() ? view.calculateExtent(map.getSize()) : null
      const alreadyVisible = viewportExtent ? containsExtent(viewportExtent, allExtent) : false

      // Fit on first load, or whenever the zones (e.g. a fresh import) fall
      // outside what's currently on screen — otherwise newly added zones
      // can silently render off-viewport and look like they never appeared.
      if (!zoomedRef.current || !alreadyVisible) {
        view.fit(allExtent, {
          padding: [80, 80, 80, 80], duration: 600, maxZoom: 17,
        })
        zoomedRef.current = true
      }
    }
  }, [zones, selectedZoneId, showConflicts])

  useEffect(() => {
    const source = pathSourceRef.current
    source.clear()
    if (!showMowingPaths) return
    zones.forEach((zone) => {
      if (!zone.geometry) return
      const pathCoords = generateMowingPath(zone.geometry)
      if (pathCoords.length < 2) return
      const projectedCoords = pathCoords.map(([lon, lat]) => fromLonLat([lon, lat]))
      const lineFeature = new Feature(new LineString(projectedCoords))
      lineFeature.setStyle(new Style({
        stroke: new Stroke({ color: MOWING_STROKE, width: 1.5 }),
      }))
      source.addFeature(lineFeature)
    })
  }, [zones, showMowingPaths])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    if (drawRef.current) {
      map.removeInteraction(drawRef.current)
      drawRef.current = null
    }
    if (!isDrawing) return
    const draw = new Draw({
      source: new VectorSource(),
      type: 'Polygon',
      style: DRAW_STYLE,
    })
    draw.on('drawend', (e) => {
      const geom = e.feature.getGeometry() as Polygon
      const coords = geom.getCoordinates()[0].map((c) => toLonLat(c))
      if (coords[0][0] !== coords[coords.length-1][0] ||
          coords[0][1] !== coords[coords.length-1][1]) {
        coords.push(coords[0])
      }
      onPolygonDrawn({ type: 'Polygon', coordinates: [coords] })
    })
    map.addInteraction(draw)
    drawRef.current = draw
    return () => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current)
        drawRef.current = null
      }
    }
  }, [isDrawing, onPolygonDrawn])

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => setShowMowingPaths(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium shadow-lg transition-colors ${
            showMowingPaths
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
              : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-600'
          }`}
        >
          🌿 {showMowingPaths ? 'Mowing Paths ON' : 'Mowing Paths'}
        </button>
        <button
          onClick={() => setShowConflicts(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium shadow-lg transition-colors ${
            showConflicts
              ? 'bg-red-700 text-white ring-2 ring-red-400'
              : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-600'
          }`}
        >
          ⚡ {showConflicts ? 'Conflicts ON' : 'Conflict Check'}
        </button>
      </div>

      <div className="absolute bottom-4 left-4 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2.5 text-xs text-gray-300 space-y-1.5 z-10 shadow-xl">
        <p className="text-gray-500 font-medium uppercase tracking-wide text-xs mb-1">Legend</p>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-emerald-500/40 border border-emerald-500" />Fairway</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-yellow-500/40 border border-yellow-500" />Rough</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-blue-500/40 border border-blue-500" />Perimeter</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-red-500/40 border border-red-500" />Exclusion</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-orange-400/40 border border-orange-400" />Understaffed</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-indigo-500/40 border border-indigo-500" />Selected</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-red-600/50 border-2 border-dashed border-red-600" />Conflict</div>
      </div>

      {isDrawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-10 pointer-events-none font-medium">
          Click to place points · Double-click to finish polygon
        </div>
      )}
    </div>
  )
}