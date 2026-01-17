ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT,
  ADD COLUMN IF NOT EXISTS attrs JSONB,
  ADD COLUMN IF NOT EXISTS price JSONB;

UPDATE catalog_items SET
  sku = COALESCE(sku, id),
  kind = COALESCE(kind, 'module'),
  attrs = COALESCE(attrs, '{}'::jsonb),
  price = COALESCE(price, '{"currency":"USD","amount":0}'::jsonb);

ALTER TABLE catalog_items
  ALTER COLUMN sku SET NOT NULL,
  ALTER COLUMN kind SET NOT NULL,
  ALTER COLUMN attrs SET NOT NULL,
  ALTER COLUMN price SET NOT NULL;

CREATE TABLE IF NOT EXISTS pricing_rulesets (
  version TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  rules JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
