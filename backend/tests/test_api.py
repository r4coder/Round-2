"""
Unit tests for the Velocity Zone Manager API.
Run inside Docker: docker compose exec backend pytest tests/test_api.py -v
Or locally with a running Postgres: pytest tests/test_api.py -v
"""
import json
import pytest
from app import create_app
from extensions import db as _db
from models import User, Property, Zone
import bcrypt


@pytest.fixture(scope="session")
def app():
    application = create_app()
    application.config["TESTING"] = True
    application.config["SQLALCHEMY_DATABASE_URI"] = (
        "postgresql://velocity:velocity_secret@postgres:5432/velocity"
    )
    with application.app_context():
        yield application


@pytest.fixture(scope="session")
def client(app):
    return app.test_client()


@pytest.fixture(scope="session")
def auth_headers(client):
    """Register a test user and return JWT auth headers."""
    res = client.post(
        "/auth/signup",
        data=json.dumps({"email": "pytest@velocity.com", "password": "test1234"}),
        content_type="application/json",
    )
    # May already exist from a previous run
    if res.status_code == 409:
        res = client.post(
            "/auth/login",
            data=json.dumps({"email": "pytest@velocity.com", "password": "test1234"}),
            content_type="application/json",
        )
    assert res.status_code in (200, 201)
    token = res.get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def test_property(client, auth_headers):
    """Create a test property and return its id."""
    res = client.post(
        "/properties",
        data=json.dumps({"name": "Pytest Golf Club", "type": "Golf Course", "total_acreage": 50}),
        content_type="application/json",
        headers=auth_headers,
    )
    assert res.status_code == 201
    return res.get_json()


# ─── Auth tests ──────────────────────────────────────────────────────────────

class TestAuth:
    def test_signup_missing_fields(self, client):
        res = client.post(
            "/auth/signup",
            data=json.dumps({"email": "x@x.com"}),
            content_type="application/json",
        )
        assert res.status_code == 400
        assert "error" in res.get_json()

    def test_login_wrong_password(self, client):
        # First signup
        client.post(
            "/auth/signup",
            data=json.dumps({"email": "wrongpw@test.com", "password": "correct123"}),
            content_type="application/json",
        )
        res = client.post(
            "/auth/login",
            data=json.dumps({"email": "wrongpw@test.com", "password": "wrong"}),
            content_type="application/json",
        )
        assert res.status_code == 401
        assert "error" in res.get_json()

    def test_login_success(self, client, auth_headers):
        res = client.post(
            "/auth/login",
            data=json.dumps({"email": "pytest@velocity.com", "password": "test1234"}),
            content_type="application/json",
        )
        assert res.status_code == 200
        data = res.get_json()
        assert "token" in data
        assert "user" in data


# ─── Property tests ──────────────────────────────────────────────────────────

class TestProperties:
    def test_list_properties_requires_auth(self, client):
        res = client.get("/properties")
        assert res.status_code == 401

    def test_create_property(self, client, auth_headers):
        res = client.post(
            "/properties",
            data=json.dumps({"name": "Test Airport", "type": "Airport"}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 201
        data = res.get_json()
        assert data["name"] == "Test Airport"
        assert data["type"] == "Airport"

    def test_create_property_invalid_type(self, client, auth_headers):
        res = client.post(
            "/properties",
            data=json.dumps({"name": "Bad Type", "type": "Theme Park"}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400
        assert "error" in res.get_json()

    def test_list_properties(self, client, auth_headers, test_property):
        res = client.get("/properties", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list)
        assert any(p["id"] == test_property["id"] for p in data)


# ─── Zone validation tests (TER-S02) ─────────────────────────────────────────

SAMPLE_POLYGON = {
    "type": "Polygon",
    "coordinates": [[
        [77.590, 12.974],
        [77.592, 12.974],
        [77.592, 12.972],
        [77.590, 12.972],
        [77.590, 12.974],
    ]],
}


class TestZoneValidation:
    def test_create_zone_zero_mowers_returns_400(self, client, auth_headers, test_property):
        """TER-S02: mower_count=0 must return 400 with human-readable message."""
        prop_id = test_property["id"]
        res = client.post(
            f"/properties/{prop_id}/zones",
            data=json.dumps({
                "name": "Zero Mower Zone",
                "type": "Fairway",
                "mower_count": 0,
                "status": "Active",
                "geometry": SAMPLE_POLYGON,
            }),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400
        data = res.get_json()
        assert "error" in data
        assert "mower" in data["error"].lower()

    def test_create_zone_negative_mowers_returns_400(self, client, auth_headers, test_property):
        prop_id = test_property["id"]
        res = client.post(
            f"/properties/{prop_id}/zones",
            data=json.dumps({
                "name": "Negative Mower Zone",
                "type": "Rough",
                "mower_count": -1,
                "status": "Active",
                "geometry": SAMPLE_POLYGON,
            }),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_create_zone_valid(self, client, auth_headers, test_property):
        prop_id = test_property["id"]
        res = client.post(
            f"/properties/{prop_id}/zones",
            data=json.dumps({
                "name": "Valid Zone",
                "type": "Fairway",
                "mower_count": 2,
                "status": "Active",
                "geometry": SAMPLE_POLYGON,
            }),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 201
        data = res.get_json()
        assert data["name"] == "Valid Zone"
        assert data["mower_count"] == 2
        assert "acreage" in data
        assert "understaffed" in data

    def test_update_zone_zero_mowers_returns_400(self, client, auth_headers, test_property):
        """TER-S02: update with mower_count=0 must also return 400."""
        prop_id = test_property["id"]
        # First create a valid zone
        create_res = client.post(
            f"/properties/{prop_id}/zones",
            data=json.dumps({
                "name": "Update Test Zone",
                "type": "Perimeter",
                "mower_count": 1,
                "status": "Active",
                "geometry": SAMPLE_POLYGON,
            }),
            content_type="application/json",
            headers=auth_headers,
        )
        assert create_res.status_code == 201
        zone_id = create_res.get_json()["id"]

        # Now try to update with 0 mowers
        res = client.put(
            f"/properties/{prop_id}/zones/{zone_id}",
            data=json.dumps({"mower_count": 0}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400
        assert "mower" in res.get_json()["error"].lower()

    def test_zone_summary_endpoint(self, client, auth_headers, test_property):
        """TER-S02: summary endpoint returns expected keys."""
        prop_id = test_property["id"]
        res = client.get(f"/properties/{prop_id}/zones/summary", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert "total_zones" in data
        assert "total_acreage" in data
        assert "total_mowers" in data
        assert "understaffed_count" in data


# ─── GeoJSON import tests ─────────────────────────────────────────────────────

class TestGeoJSONImport:
    def test_import_valid_feature_collection(self, client, auth_headers, test_property):
        prop_id = test_property["id"]
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": SAMPLE_POLYGON,
                    "properties": {"name": "Imported Zone", "type": "Rough", "mower_count": 1},
                }
            ],
        }
        res = client.post(
            f"/properties/{prop_id}/zones/import",
            data=json.dumps(geojson),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 201
        data = res.get_json()
        assert data["imported"] == 1

    def test_import_invalid_type_rejected(self, client, auth_headers, test_property):
        prop_id = test_property["id"]
        res = client.post(
            f"/properties/{prop_id}/zones/import",
            data=json.dumps({"type": "Feature", "geometry": SAMPLE_POLYGON, "properties": {}}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400
        assert "FeatureCollection" in res.get_json()["error"]

    def test_import_non_polygon_rejected(self, client, auth_headers, test_property):
        prop_id = test_property["id"]
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
                    "properties": {},
                }
            ],
        }
        res = client.post(
            f"/properties/{prop_id}/zones/import",
            data=json.dumps(geojson),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400
        assert "Polygon" in res.get_json()["error"]
