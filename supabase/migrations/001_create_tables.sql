-- Run this in your Supabase project: Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS empreendimentos (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE empreendimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own empreendimentos" ON empreendimentos;
CREATE POLICY "Users manage own empreendimentos" ON empreendimentos
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own clientes" ON clientes;
CREATE POLICY "Users manage own clientes" ON clientes
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS vendas (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own vendas" ON vendas;
CREATE POLICY "Users manage own vendas" ON vendas
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS app_config (
  user_id UUID PRIMARY KEY DEFAULT auth.uid(),
  data JSONB NOT NULL DEFAULT '{"theme": "standard"}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own config" ON app_config;
CREATE POLICY "Users manage own config" ON app_config
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
