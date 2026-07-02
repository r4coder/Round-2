import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from extensions import db
from routes.auth import auth_bp
from routes.properties import properties_bp
from routes.zones import zones_bp


def create_app():
    app = Flask(__name__)

    # Config
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", "postgresql://velocity:velocity_secret@localhost:5432/velocity"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET", "dev-secret-change-me")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = False  # Long-lived for demo; use timedelta in prod

    # Extensions
    db.init_app(app)
    JWTManager(app)
    CORS(
        app,
        resources={r"/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # Blueprints
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(properties_bp, url_prefix="/properties")
    app.register_blueprint(zones_bp, url_prefix="/properties")

    @app.route("/health")
    def health():
        return {"status": "ok"}, 200

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)