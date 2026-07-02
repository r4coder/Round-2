from extensions import db
from geoalchemy2 import Geometry
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
import json


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    properties = db.relationship("Property", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "email": self.email}


class Property(db.Model):
    __tablename__ = "properties"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    total_acreage = db.Column(db.Numeric(10, 2))
    notes = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    user = db.relationship("User", back_populates="properties")
    zones = db.relationship("Zone", back_populates="property", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "total_acreage": float(self.total_acreage) if self.total_acreage else None,
            "notes": self.notes,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Zone(db.Model):
    __tablename__ = "zones"

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    mower_count = db.Column(db.Integer, nullable=False, default=1)
    status = db.Column(db.String(20), nullable=False, default="Active")
    geometry = db.Column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    property = db.relationship("Property", back_populates="zones")

    def get_geojson_geometry(self):
        """Convert PostGIS geometry to GeoJSON dict."""
        if self.geometry is None:
            return None
        shape = to_shape(self.geometry)
        return mapping(shape)

    def get_acreage(self):
        """Calculate acreage from PostGIS geometry using ST_Area in degrees → acres.
        Uses the geography cast for accurate area in square meters, then converts.
        """
        from sqlalchemy import text
        from extensions import db as _db
        result = _db.session.execute(
            text("SELECT ST_Area(geometry::geography) / 4046.86 as acres FROM zones WHERE id = :id"),
            {"id": self.id}
        ).fetchone()
        if result:
            return round(float(result[0]), 2)
        return 0.0

    def to_dict(self, include_acreage=True):
        acreage = self.get_acreage() if include_acreage else None
        understaffed = (acreage > self.mower_count * 2) if acreage is not None else False

        return {
            "id": self.id,
            "property_id": self.property_id,
            "name": self.name,
            "type": self.type,
            "mower_count": self.mower_count,
            "status": self.status,
            "geometry": self.get_geojson_geometry(),
            "acreage": acreage,
            "understaffed": understaffed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_geojson_feature(self):
        acreage = self.get_acreage()
        understaffed = acreage > self.mower_count * 2
        return {
            "type": "Feature",
            "id": self.id,
            "geometry": self.get_geojson_geometry(),
            "properties": {
                "id": self.id,
                "name": self.name,
                "type": self.type,
                "mower_count": self.mower_count,
                "status": self.status,
                "acreage": acreage,
                "understaffed": understaffed,
            },
        }
