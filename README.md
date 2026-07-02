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
GET    /properties          
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

**What AI generated:** Asked Claude to wire up three related pieces of sidebar/map UI behavior in one pass — the fill-color logic for zones that are both understaffed *and* currently selected, an axios interceptor to attach/refresh the `Authorization` header on API calls, and the "zoom in to zone" behavior when a zone is clicked in the sidebar.

**What was wrong:**
- **Color priority:** The style function always applied the "selected" blue fill last, overwriting the orange understaffed fill whenever a zone was selected — so an understaffed zone looked normal the moment you clicked it, hiding the warning exactly when the operator was looking at it.
- **Authorization header problem:** The interceptor didn't check whether a request was going out with no `Authorization` header at all (e.g. after a hard refresh before the token was rehydrated from storage) — it assumed a token was always present and only handled the case of an invalid/expired one.
- **Refresh problem:** Because of the above, a missing header combined with no refresh token yet in memory sent the interceptor into a retry loop on `401` instead of failing cleanly and redirecting to login.
- **Zoom in on zone selected:** The `fit()` call used the zone's extent with no padding and no guard for re-clicking the same zone — small zones ended up flush against the sidebar edge (partially hidden), and clicking an already-selected zone did nothing since the map view was already at that extent, so it never zoomed in.

**What I changed:**
- Rewrote the style function so the understaffed warning is drawn as a persistent orange outline regardless of selection state, with selection only changing fill/opacity — fixing the color priority issue.
- Split the interceptor logic: a missing header now short-circuits straight to a clean logout/redirect, while only an actual `401` on a request that *had* a token triggers the refresh flow — fixing both the authorization header problem and the refresh loop.
- Added a `padding` option to `fit()` (accounting for sidebar width) and forced a re-fit on every click via a small epsilon change to the view options, so clicking any zone — including re-clicking the same one — reliably zooms in on it.

### Q4 — One part where AI was not useful

**Database geometry storage decision (PostGIS vs JSONB).**

This wasn't a question of syntax — it was a judgment call about the tradeoffs given the specific requirements: TER-S02 requires acreage from actual polygon geometry, the bonus asks for `ST_Intersects` conflict detection, and the ticket says "justify your choice." AI can enumerate tradeoffs generically, but I had to weigh them against this specific domain (robotic mower fleet management, geospatial queries likely to grow) and write a justification I could stand behind in a code review. Using AI to generate that reasoning would have produced a hedged, generic answer. I made the PostGIS call myself and wrote the justification in the README myself.
