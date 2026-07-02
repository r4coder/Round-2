# Velocity Zone Manager

A fleet zone management dashboard for TerraSync's Velocity platform. Operators draw, edit, and manage GeoJSON polygon zones for robotic mower fleets across commercial turf properties.

Implements tickets **TER-S01** (Foundation) and **TER-S02** (Business logic / mower coverage validator).

---

## Quick Start

```bash
git clone <repo-url>
cd velocity-zone-manager
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Demo login: `demo@velocity.com` / `demo1234`

The database seeds automatically on first boot with **Bengaluru Golf Club** (Golf Course) and 3 pre-drawn zones.

---

## Architecture

```
/frontend    React 18 + TypeScript + OpenLayers + Tailwind CSS (Vite)
/backend     Python Flask REST API + SQLAlchemy + Flask-JWT-Extended
/postgres    PostGIS 15-3.3 (postgis/postgis Docker image)
docker-compose.yml
```

### Three services

| Service   | Port | Image |
|-----------|------|-------|
| postgres  | 5432 | postgis/postgis:15-3.3 |
| backend   | 5000 | python:3.11-slim (custom) |
| frontend  | 3000 | node:20-alpine (Vite dev server) |

---

## Geometry Storage: PostGIS vs JSONB

**Decision: PostGIS `GEOMETRY(Polygon, 4326)`**

Rationale: PostGIS gives accurate area calculations (`ST_Area(geom::geography)` returns square meters), spatial indexing via GIST, and future spatial queries (`ST_Intersects` for conflict detection, `ST_Extent` for zoom-to-extent) without pulling data into Python. JSONB would require Shapely for every area calculation, adds a Python dependency, and moves geometry logic out of the database where it belongs. The one tradeoff is the PostGIS extension requirement — mitigated by using the official `postgis/postgis` Docker image.

Acreage calculation: `ST_Area(geometry::geography) / 4046.86` — the `::geography` cast gives area in square meters with geodetic accuracy, then divided by 4046.86 m²/acre.

---

## API Contract

### Auth
```
POST /auth/signup     { email, password }
POST /auth/login      { email, password }
```

### Properties
```
GET    /properties              ?search=&type=
POST   /properties
GET    /properties/:id
PUT    /properties/:id
DELETE /properties/:id
```

### Zones
```
GET    /properties/:id/zones
POST   /properties/:id/zones
PUT    /properties/:id/zones/:zone_id
DELETE /properties/:id/zones/:zone_id
GET    /properties/:id/zones/summary    → TER-S02
GET    /properties/:id/zones/export     → GeoJSON FeatureCollection
POST   /properties/:id/zones/import     ← GeoJSON FeatureCollection
```

---

## TER-S02: Mower Coverage Validator

- `mower_count = 0` → `400` with message `"A zone must have at least one assigned mower."`
- `understaffed: true` computed when `acreage > mower_count × 2`; never stored
- Validation shared via `backend/services/zone_service.py` — used by both create and update
- Frontend surfaces the backend error message inline in the zone form
- Understaffed zones: orange fill on map + "⚠ Understaffed" badge in sidebar
- `GET /properties/:id/zones/summary` returns: total zones, total acreage, total mowers, understaffed count

---

## GeoJSON Workflow

1. **Draw**: click "+ Draw Zone" → draw polygon on map → fill zone form → saved to PostGIS
2. **Edit geometry**: drag polygon vertices directly on map → auto-saved on mouseup
3. **Edit attributes**: click zone in sidebar → "Edit attrs" → zone form modal
4. **Import**: click "↑ Import GeoJSON" → select `.geojson` file → polygons rendered and persisted
5. **Export**: click "↓ Export GeoJSON" → downloads valid FeatureCollection
6. **Zoom to extent**: map fits all zones on load; default center is India if no zones exist

GeoJSON import validation rejects non-FeatureCollection files and non-Polygon geometry with descriptive errors.

---

## Seed Data

`postgres/init.sql` runs on first boot and creates:
- Demo user: `demo@velocity.com` / `demo1234`
- Property: **Bengaluru Golf Club** (Golf Course, 180 acres)
- Zones:
  - **Hole 1 Fairway** — Fairway, 3 mowers, Active
  - **North Rough** — Rough, 2 mowers, Active
  - **East Perimeter** — Perimeter, 4 mowers, Active

---

## Development Notes

- JWT tokens are long-lived (no expiry) for demo convenience; use `timedelta` in production
- Vite dev server proxies `/auth` and `/properties` to Flask — no CORS issues during development
- `docker compose up --build` tested from a clean directory (no local node_modules, no pre-loaded .env)

---

## AI Workflow

### Q1 — Which AI tools did you use, and what specifically?

Used **Claude (Anthropic)** throughout. Specifically:

- **Boilerplate acceleration**: Generated the initial Flask blueprint structure, SQLAlchemy model stubs, and Vite + Tailwind setup. These are high-confidence, low-ambiguity patterns where AI output is reliable.
- **OpenLayers interaction wiring**: Asked Claude to draft the `Draw` and `Modify` interaction setup — specifically the `drawend` event handler that extracts coordinates and closes the polygon ring, and the `modifyend` handler that maps edited vertices back to GeoJSON.
- **PostGIS SQL**: Asked for the `ST_Area(geometry::geography) / 4046.86` acreage formula and the summary query with `FILTER (WHERE ...)` syntax.
- **TypeScript types**: Generated the initial `types/index.ts` file from the API contract I described.

### Q2 — One example accepted with no changes

**Prompt:**
> Write a PostgreSQL query that returns total zones, total acreage in acres (using PostGIS ST_Area with a geography cast), total mowers assigned, and count of understaffed zones (where acreage > mower_count * 2) for a given property_id.

**Output used verbatim (the core SQL):**
```sql
SELECT
    COUNT(*) as total_zones,
    COALESCE(SUM(ST_Area(geometry::geography) / 4046.86), 0) as total_acreage,
    COALESCE(SUM(mower_count), 0) as total_mowers,
    COUNT(*) FILTER (
        WHERE ST_Area(geometry::geography) / 4046.86 > mower_count * 2
    ) as understaffed_count
FROM zones
WHERE property_id = :prop_id
```

This went straight into `routes/zones.py`. The `FILTER` clause and the `::geography` cast for geodetic accuracy were exactly what I needed — I knew the approach, AI saved me looking up the exact PostGIS syntax.

### Q3 — One example rejected or significantly edited

**What AI generated:** When I asked for the OpenLayers `Modify` interaction setup, it generated a handler that called `feature.getGeometry().getCoordinates()` and passed the raw EPSG:3857 coordinates directly to the `onGeometryEdited` callback as GeoJSON. The backend expects EPSG:4326 (WGS84) lon/lat.

**What was wrong:** The coordinates would have been in web Mercator metres — something like `[8643736, 1461288]` — which would fail silently at `ST_GeomFromGeoJSON` on the backend (or produce a wildly incorrect polygon near the null island if it didn't error). The AI didn't account for the projection transform.

**What I changed:** Added `toLonLat(c)` (from `ol/proj`) to each coordinate in the `modifyend` handler, and added the same transform in the `drawend` handler. Also added the ring-closing check (`if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first)`) which was missing — OpenLayers rings aren't always explicitly closed but GeoJSON spec requires it.

### Q4 — One part where AI was not useful

**Database geometry storage decision (PostGIS vs JSONB).**

This wasn't a question of syntax — it was a judgment call about the tradeoffs given the specific requirements: TER-S02 requires acreage from actual polygon geometry, the bonus asks for `ST_Intersects` conflict detection, and the ticket says "justify your choice." AI can enumerate tradeoffs generically, but I had to weigh them against this specific domain (robotic mower fleet management, geospatial queries likely to grow) and write a justification I could stand behind in a code review. Using AI to generate that reasoning would have produced a hedged, generic answer. I made the PostGIS call myself and wrote the justification in the README myself.
