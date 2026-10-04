CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_pence INTEGER NOT NULL CHECK (price_pence >= 0),
  shipping_pence INTEGER NOT NULL CHECK (shipping_pence >= 0),
  currency TEXT NOT NULL DEFAULT 'gbp',
  edition_size INTEGER NOT NULL CHECK (edition_size > 0),
  sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL REFERENCES products(id),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_event_id TEXT UNIQUE,
  customer_email TEXT,
  customer_name TEXT,
  shipping_name TEXT,
  shipping_address JSONB,
  amount_product_pence INTEGER NOT NULL,
  amount_shipping_pence INTEGER NOT NULL,
  amount_total_pence INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'gbp',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  fulfilment_status TEXT NOT NULL DEFAULT 'PAID',
  reservation_state TEXT NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);

INSERT INTO products (id, name, price_pence, shipping_pence, currency, edition_size)
VALUES ('outlier', 'The Outlier', 40000, 1500, 'gbp', 30)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_pence = EXCLUDED.price_pence,
  shipping_pence = EXCLUDED.shipping_pence,
  currency = EXCLUDED.currency,
  edition_size = EXCLUDED.edition_size;
