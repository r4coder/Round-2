/**
 * Mowing path simulation — boustrophedon (back-and-forth) stripe pattern.
 *
 * Algorithm:
 * 1. Find polygon bounding box in lon/lat
 * 2. Auto-calculate stripe spacing based on polygon size (~20 stripes per zone)
 * 3. For each horizontal scan line, find intersections with polygon edges
 * 4. Alternate direction each row (left→right, right→left)
 * 5. Return flat [lon, lat] coordinate array for a LineString overlay
 */

import type { GeoJSONPolygon } from '../types'

/** Find all x-intersections of horizontal scan line y=scanY with a polygon ring */
function scanLineIntersections(ring: number[][], scanY: number): number[] {
  const xs: number[] = []
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
      const t = (scanY - y1) / (y2 - y1)
      xs.push(x1 + t * (x2 - x1))
    }
  }
  return xs.sort((a, b) => a - b)
}

export function generateMowingPath(geometry: GeoJSONPolygon): number[][] {
  const ring = geometry.coordinates[0]
  if (!ring || ring.length < 4) return []

  // Bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const height = maxY - minY
  const width  = maxX - minX
  if (height < 1e-8 || width < 1e-8) return []

  // Auto-scale spacing: target ~20 stripes, min 0.0001°, max 0.005°
  // This ensures the pattern is visible regardless of zone size
  const targetStripes = 20
  const spacing = Math.min(0.005, Math.max(0.0001, height / targetStripes))

  const path: number[][] = []
  let rowIndex = 0

  for (
    let scanY = minY + spacing / 2;
    scanY < maxY;
    scanY += spacing
  ) {
    const xs = scanLineIntersections(ring, scanY)
    if (xs.length < 2) { rowIndex++; continue }

    // Use outermost pair only (handles concave polygons gracefully)
    const x0 = xs[0]
    const x1 = xs[xs.length - 1]

    // Alternate direction for boustrophedon pattern
    if (rowIndex % 2 === 0) {
      path.push([x0, scanY], [x1, scanY])
    } else {
      path.push([x1, scanY], [x0, scanY])
    }
    rowIndex++
  }

  return path
}
