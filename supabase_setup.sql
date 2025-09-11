-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz DEFAULT now()
);

-- Allowed geofence zones
CREATE TABLE allowed_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name text,
  geom jsonb NOT NULL, -- GeoJSON polygon
  created_at timestamptz DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  recipient_id uuid,
  amount_cents integer,
  currency varchar(3),
  status varchar(32),
  lat double precision,
  lng double precision,
  created_at timestamptz DEFAULT now(),
  provider_id text,
  metadata jsonb
);
