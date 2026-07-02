from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import Property

properties_bp = Blueprint("properties", __name__)

VALID_TYPES = {"Golf Course", "Airport", "Corporate Campus", "Other"}


@properties_bp.route("", methods=["GET"])
@jwt_required()
def list_properties():
    user_id = int(get_jwt_identity())
    query = Property.query.filter_by(user_id=user_id)

    # Optional search by name or type
    search = request.args.get("search", "").strip()
    type_filter = request.args.get("type", "").strip()
    if search:
        query = query.filter(Property.name.ilike(f"%{search}%"))
    if type_filter:
        query = query.filter(Property.type == type_filter)

    properties = query.order_by(Property.created_at.desc()).all()
    return jsonify([p.to_dict() for p in properties]), 200


@properties_bp.route("", methods=["POST"])
@jwt_required()
def create_property():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    name = (data.get("name") or "").strip()
    prop_type = data.get("type")
    total_acreage = data.get("total_acreage")
    notes = data.get("notes", "")

    if not name:
        return jsonify({"error": "Property name is required."}), 400
    if prop_type not in VALID_TYPES:
        return jsonify({"error": f"Type must be one of: {', '.join(sorted(VALID_TYPES))}."}), 400

    prop = Property(
        name=name,
        type=prop_type,
        total_acreage=total_acreage,
        notes=notes,
        user_id=user_id,
    )
    db.session.add(prop)
    db.session.commit()
    return jsonify(prop.to_dict()), 201


@properties_bp.route("/<int:prop_id>", methods=["GET"])
@jwt_required()
def get_property(prop_id):
    user_id = int(get_jwt_identity())
    prop = Property.query.filter_by(id=prop_id, user_id=user_id).first_or_404()
    return jsonify(prop.to_dict()), 200


@properties_bp.route("/<int:prop_id>", methods=["PUT"])
@jwt_required()
def update_property(prop_id):
    user_id = int(get_jwt_identity())
    prop = Property.query.filter_by(id=prop_id, user_id=user_id).first_or_404()
    data = request.get_json()

    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "Property name cannot be empty."}), 400
        prop.name = name
    if "type" in data:
        if data["type"] not in VALID_TYPES:
            return jsonify({"error": f"Type must be one of: {', '.join(sorted(VALID_TYPES))}."}), 400
        prop.type = data["type"]
    if "total_acreage" in data:
        prop.total_acreage = data["total_acreage"]
    if "notes" in data:
        prop.notes = data["notes"]

    db.session.commit()
    return jsonify(prop.to_dict()), 200


@properties_bp.route("/<int:prop_id>", methods=["DELETE"])
@jwt_required()
def delete_property(prop_id):
    user_id = int(get_jwt_identity())
    prop = Property.query.filter_by(id=prop_id, user_id=user_id).first_or_404()
    db.session.delete(prop)
    db.session.commit()
    return jsonify({"message": "Property deleted."}), 200
