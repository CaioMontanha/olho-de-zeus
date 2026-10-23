CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    base_latency_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
    id BIGSERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    latency_ms INTEGER NOT NULL,
    ok BOOLEAN NOT NULL,
    status_code INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS checks_service_time ON checks(service_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id BIGSERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id),
    severity TEXT CHECK(severity IN ('degraded', 'down')) NOT NULL,
    cause TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    simulated BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident ON incidents(service_id)
WHERE
    resolved_at IS NULL;

INSERT INTO
    services(slug, name, base_latency_ms)
VALUES
    ('frankfurter-api', 'Frankfurter API', 500) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS monitored_apis (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
    headers_encrypted TEXT NOT NULL DEFAULT '',
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    body_encrypted TEXT NOT NULL DEFAULT '',
    auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'basic', 'api_key')),
    auth_encrypted TEXT NOT NULL DEFAULT '',
    interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 15 AND 3600),
    timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
    paused BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitored_api_checks (
    id BIGSERIAL PRIMARY KEY,
    monitored_api_id BIGINT NOT NULL REFERENCES monitored_apis(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    latency_ms INTEGER NOT NULL,
    status_code INTEGER,
    ok BOOLEAN NOT NULL,
    error TEXT
);
CREATE INDEX IF NOT EXISTS monitored_api_checks_time ON monitored_api_checks(monitored_api_id, checked_at DESC);
