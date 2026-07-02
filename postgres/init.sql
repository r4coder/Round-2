-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Golf Course', 'Airport', 'Corporate Campus', 'Other')),
    total_acreage NUMERIC(10, 2),
    notes TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Zones table
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Fairway', 'Rough', 'Perimeter', 'Exclusion')),
    mower_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    geometry GEOMETRY(Polygon, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zones_geometry_idx ON zones USING GIST (geometry);

-- Demo user (password: demo1234)
INSERT INTO users (email, password_hash)
VALUES ('demo@velocity.com', '$2b$12$52L9TX/sTh6il8M3nISne.O1EWBJD0McZhVHigHWaQd2DdokRNdHG')
ON CONFLICT (email) DO NOTHING;

-- Demo property
INSERT INTO properties (name, type, total_acreage, notes, user_id)
SELECT 'Bengaluru Golf Club', 'Golf Course', 180.00,
       'Demo property pre-loaded with 3 zones. Located in Bengaluru, Karnataka.',
       id
FROM users WHERE email = 'demo@velocity.com'
ON CONFLICT DO NOTHING;

-- Zone 1: Fairway — 14.9 acres, 8 mowers → STAFFED
INSERT INTO zones (property_id, name, type, mower_count, status, geometry)
SELECT p.id, 'Hole 1 Fairway', 'Fairway', 8, 'Active',
    ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [77.5920, 12.9750],
            [77.5945, 12.9750],
            [77.5945, 12.9730],
            [77.5920, 12.9730],
            [77.5920, 12.9750]
        ]]
    }')
FROM properties p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'demo@velocity.com' AND p.name = 'Bengaluru Golf Club'
ON CONFLICT DO NOTHING;

-- Zone 2: Rough — 22.4 acres, 2 mowers → UNDERSTAFFED (intentional demo)
INSERT INTO zones (property_id, name, type, mower_count, status, geometry)
SELECT p.id, 'North Rough', 'Rough', 2, 'Active',
    ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [77.5950, 12.9760],
            [77.5980, 12.9760],
            [77.5980, 12.9735],
            [77.5950, 12.9735],
            [77.5950, 12.9760]
        ]]
    }')
FROM properties p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'demo@velocity.com' AND p.name = 'Bengaluru Golf Club'
ON CONFLICT DO NOTHING;

-- Zone 3: Perimeter — 31.3 acres, 16 mowers → STAFFED
INSERT INTO zones (property_id, name, type, mower_count, status, geometry)
SELECT p.id, 'East Perimeter', 'Perimeter', 16, 'Active',
    ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [77.5985, 12.9755],
            [77.6015, 12.9755],
            [77.6015, 12.9720],
            [77.5985, 12.9720],
            [77.5985, 12.9755]
        ]]
    }')
FROM properties p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'demo@velocity.com' AND p.name = 'Bengaluru Golf Club'
ON CONFLICT DO NOTHING;