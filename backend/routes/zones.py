from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import text, func
from extensions import db
from models import Property, Zone
from services.zone_service import validate_zone_payload
import json

zones_bp = Blueprint("zones", __name__)


def _get_property_or_403(prop_id: int, user_id: int):
    """Fetch property and verify ownership."""
    return Property.query.filter_by(id=prop_id, user_id=user_id).first_or_404()


def _build_zone_from_data(data: dict, zone: Zone = None) -> Zone:
    """Apply validated data dict to a Zone instance (create or update)."""
    if zone is None:
        zone = Zone()
    if "name" in data:
        zone.name = data["name"].strip()
    if "type" in data:
        zone.type = data["type"]
    if "mower_count" in data:
        zone.mower_count = int(data["mower_count"])
    if "status" in data:
        zone.status = data["status"]
    if "geometry" in data:
        geojson_str = json.dumps(data["geometry"])
        zone.geometry = text(f"ST_GeomFromGeoJSON('{geojson_str}')")
    return zone


def _zone_row_to_dict(r, prop_id: int) -> dict:
    """Convert a raw SQL row (from batched zone query) to a response dict."""
    acreage = round(float(r[5]), 2)
    return {
        "id": r[0], "property_id": prop_id,
        "name": r[1], "type": r[2], "mower_count": r[3], "status": r[4],
        "acreage": acreage, "understaffed": acreage > r[3] * 2,
        "geometry": r[6],
        "created_at": r[7].isoformat() if r[7] else None,
        "updated_at": r[8].isoformat() if r[8] else None,
    }


ZONE_SELECT = """
    SELECT id, name, type, mower_count, status,
           ST_Area(geometry::geography) / 4046.86 AS acres,
           ST_AsGeoJSON(geometry)::json AS geom_json,
           created_at, updated_at
    FROM zones WHERE id = :id
"""


# ─── GET /properties/:id/zones ───────────────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones", methods=["GET"])
@jwt_required()
def list_zones(prop_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)

    # Batch acreage in a single query to avoid N+1
    rows = db.session.execute(
        text("""
            SELECT id, name, type, mower_count, status,
                   ST_Area(geometry::geography) / 4046.86 AS acres,
                   ST_AsGeoJSON(geometry)::json AS geom_json,
                   created_at, updated_at
            FROM zones
            WHERE property_id = :prop_id
            ORDER BY id
        """),
        {"prop_id": prop_id},
    ).fetchall()

    result = []
    for r in rows:
        acreage = round(float(r[5]), 2)
        understaffed = acreage > r[3] * 2
        result.append({
            "id": r[0],
            "property_id": prop_id,
            "name": r[1],
            "type": r[2],
            "mower_count": r[3],
            "status": r[4],
            "acreage": acreage,
            "understaffed": understaffed,
            "geometry": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
            "updated_at": r[8].isoformat() if r[8] else None,
        })
    return jsonify(result), 200


# ─── POST /properties/:id/zones ──────────────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones", methods=["POST"])
@jwt_required()
def create_zone(prop_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)
    data = request.get_json()

    error = validate_zone_payload(data)
    if error:
        return jsonify({"error": error}), 400

    geometry = data.get("geometry")
    if not geometry:
        return jsonify({"error": "Polygon geometry is required."}), 400

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Zone name is required."}), 400

    geojson_str = json.dumps(geometry)
    zone = Zone(
        property_id=prop_id,
        name=name,
        type=data.get("type", "Fairway"),
        mower_count=int(data["mower_count"]),
        status=data.get("status", "Active"),
        geometry=func.ST_GeomFromGeoJSON(geojson_str),
    )
    db.session.add(zone)
    db.session.commit()
    row = db.session.execute(text(ZONE_SELECT), {"id": zone.id}).fetchone()
    return jsonify(_zone_row_to_dict(row, prop_id)), 201


# ─── PUT /properties/:id/zones/:zone_id ──────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones/<int:zone_id>", methods=["PUT"])
@jwt_required()
def update_zone(prop_id, zone_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)
    zone = Zone.query.filter_by(id=zone_id, property_id=prop_id).first_or_404()
    data = request.get_json()

    # Merge current values with updates for validation
    merged = {
        "mower_count": data.get("mower_count", zone.mower_count),
        "type": data.get("type", zone.type),
        "status": data.get("status", zone.status),
    }
    error = validate_zone_payload(merged)
    if error:
        return jsonify({"error": error}), 400

    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "Zone name cannot be empty."}), 400
        zone.name = name
    if "type" in data:
        zone.type = data["type"]
    if "mower_count" in data:
        zone.mower_count = int(data["mower_count"])
    if "status" in data:
        zone.status = data["status"]

    if "geometry" in data:
        geojson_str = json.dumps(data["geometry"])
        db.session.execute(
            text("UPDATE zones SET geometry = ST_GeomFromGeoJSON(:geojson) WHERE id = :id"),
            {"geojson": geojson_str, "id": zone.id},
        )

    db.session.commit()
    row = db.session.execute(text(ZONE_SELECT), {"id": zone.id}).fetchone()
    return jsonify(_zone_row_to_dict(row, prop_id)), 200


# ─── DELETE /properties/:id/zones/:zone_id ───────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones/<int:zone_id>", methods=["DELETE"])
@jwt_required()
def delete_zone(prop_id, zone_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)
    zone = Zone.query.filter_by(id=zone_id, property_id=prop_id).first_or_404()
    db.session.delete(zone)
    db.session.commit()
    return jsonify({"message": "Zone deleted."}), 200


# ─── GET /properties/:id/zones/summary ───────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones/summary", methods=["GET"])
@jwt_required()
def zones_summary(prop_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)

    result = db.session.execute(
        text("""
            SELECT
                COUNT(*) as total_zones,
                COALESCE(SUM(ST_Area(geometry::geography) / 4046.86), 0) as total_acreage,
                COALESCE(SUM(mower_count), 0) as total_mowers,
                COUNT(*) FILTER (
                    WHERE ST_Area(geometry::geography) / 4046.86 > mower_count * 2
                ) as understaffed_count
            FROM zones
            WHERE property_id = :prop_id
        """),
        {"prop_id": prop_id},
    ).fetchone()

    return jsonify({
        "total_zones": int(result[0]),
        "total_acreage": round(float(result[1]), 2),
        "total_mowers": int(result[2]),
        "understaffed_count": int(result[3]),
    }), 200


# ─── GET /properties/:id/zones/export ────────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones/export", methods=["GET"])
@jwt_required()
def export_zones(prop_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)

    # Batch everything in one query — no N+1
    rows = db.session.execute(
        text("""
            SELECT id, name, type, mower_count, status,
                   ST_Area(geometry::geography) / 4046.86 AS acres,
                   ST_AsGeoJSON(geometry)::json AS geom_json
            FROM zones
            WHERE property_id = :prop_id
            ORDER BY id
        """),
        {"prop_id": prop_id},
    ).fetchall()

    features = []
    for r in rows:
        acreage = round(float(r[5]), 2)
        understaffed = acreage > r[3] * 2
        features.append({
            "type": "Feature",
            "id": r[0],
            "geometry": r[6],
            "properties": {
                "id": r[0],
                "name": r[1],
                "type": r[2],
                "mower_count": r[3],
                "status": r[4],
                "acreage": acreage,
                "understaffed": understaffed,
            },
        })

    return jsonify({"type": "FeatureCollection", "features": features}), 200


# ─── POST /properties/:id/zones/import ───────────────────────────────────────
@zones_bp.route("/<int:prop_id>/zones/import", methods=["POST"])
@jwt_required()
def import_zones(prop_id):
    user_id = int(get_jwt_identity())
    _get_property_or_403(prop_id, user_id)
    data = request.get_json()

    # GeoJSON validation
    if not data or data.get("type") != "FeatureCollection":
        return jsonify({"error": "File must be a valid GeoJSON FeatureCollection."}), 400

    features = data.get("features", [])
    if not features:
        return jsonify({"error": "FeatureCollection contains no features."}), 400

    # Validate all features are polygons before persisting anything
    for i, feature in enumerate(features):
        geom = feature.get("geometry", {})
        if geom.get("type") not in ("Polygon",):
            return jsonify({
                "error": f"Feature {i + 1} is not a Polygon. Only Polygon geometry is supported."
            }), 400

    created_ids = []
    for feature in features:
        props = feature.get("properties") or {}
        geom = feature["geometry"]
        geojson_str = json.dumps(geom)

        mower_count = int(props.get("mower_count", 1))
        if mower_count < 1:
            mower_count = 1

        zone = Zone(
            property_id=prop_id,
            name=props.get("name", "Imported Zone"),
            type=props.get("type", "Fairway") if props.get("type") in ("Fairway", "Rough", "Perimeter", "Exclusion") else "Fairway",
            mower_count=mower_count,
            status=props.get("status", "Active") if props.get("status") in ("Active", "Inactive") else "Active",
            geometry=func.ST_GeomFromGeoJSON(geojson_str),
        )
        db.session.add(zone)
        db.session.flush()  # get zone.id for created_ids — geometry already set, safe
        created_ids.append(zone.id)

    # Commit first so ST_Area queries see committed geometry
    db.session.commit()

    # Batch the response the same way list_zones does — single query, no N+1
    if not created_ids:
        return jsonify({"imported": 0, "zones": []}), 201

    placeholders = ",".join(str(i) for i in created_ids)
    rows = db.session.execute(
        text(f"""
            SELECT id, name, type, mower_count, status,
                   ST_Area(geometry::geography) / 4046.86 AS acres,
                   ST_AsGeoJSON(geometry)::json AS geom_json,
                   created_at, updated_at
            FROM zones
            WHERE id IN ({placeholders})
            ORDER BY id
        """)
    ).fetchall()

    result = []
    for r in rows:
        acreage = round(float(r[5]), 2)
        understaffed = acreage > r[3] * 2
        result.append({
            "id": r[0], "property_id": prop_id,
            "name": r[1], "type": r[2], "mower_count": r[3], "status": r[4],
            "acreage": acreage, "understaffed": understaffed,
            "geometry": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
            "updated_at": r[8].isoformat() if r[8] else None,
        })
    return jsonify({"imported": len(result), "zones": result}), 201
