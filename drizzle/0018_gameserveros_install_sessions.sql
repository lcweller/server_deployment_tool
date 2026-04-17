CREATE TABLE IF NOT EXISTS gameserveros_install_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_code_hash text NOT NULL UNIQUE,
  poll_token_hash text NOT NULL UNIQUE,
  host_id uuid REFERENCES hosts (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gameserveros_install_sessions_expires
  ON gameserveros_install_sessions (expires_at);
