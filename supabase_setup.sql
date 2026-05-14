-- ============================================================
-- RUMO AO MILHÃO — Setup das tabelas no Supabase
-- Execute este script no SQL Editor do seu projeto Supabase:
-- Supabase Dashboard → SQL Editor → New query → cole e rode
-- ============================================================

-- 1. Empreendimentos
create table if not exists public.empreendimentos (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- 2. Clientes
create table if not exists public.clientes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- 3. Vendas
create table if not exists public.vendas (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

-- 4. Configuração do app (uma linha por usuário)
create table if not exists public.app_config (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security (RLS) — cada usuário vê só os seus dados
-- ============================================================

alter table public.empreendimentos enable row level security;
alter table public.clientes enable row level security;
alter table public.vendas enable row level security;
alter table public.app_config enable row level security;

-- Policies: empreendimentos
drop policy if exists "empreendimentos_select" on public.empreendimentos;
drop policy if exists "empreendimentos_insert" on public.empreendimentos;
drop policy if exists "empreendimentos_update" on public.empreendimentos;
drop policy if exists "empreendimentos_delete" on public.empreendimentos;

create policy "empreendimentos_select" on public.empreendimentos
  for select using (auth.uid() = user_id);
create policy "empreendimentos_insert" on public.empreendimentos
  for insert with check (auth.uid() = user_id);
create policy "empreendimentos_update" on public.empreendimentos
  for update using (auth.uid() = user_id);
create policy "empreendimentos_delete" on public.empreendimentos
  for delete using (auth.uid() = user_id);

-- Policies: clientes
drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
drop policy if exists "clientes_delete" on public.clientes;

create policy "clientes_select" on public.clientes
  for select using (auth.uid() = user_id);
create policy "clientes_insert" on public.clientes
  for insert with check (auth.uid() = user_id);
create policy "clientes_update" on public.clientes
  for update using (auth.uid() = user_id);
create policy "clientes_delete" on public.clientes
  for delete using (auth.uid() = user_id);

-- Policies: vendas
drop policy if exists "vendas_select" on public.vendas;
drop policy if exists "vendas_insert" on public.vendas;
drop policy if exists "vendas_update" on public.vendas;
drop policy if exists "vendas_delete" on public.vendas;

create policy "vendas_select" on public.vendas
  for select using (auth.uid() = user_id);
create policy "vendas_insert" on public.vendas
  for insert with check (auth.uid() = user_id);
create policy "vendas_update" on public.vendas
  for update using (auth.uid() = user_id);
create policy "vendas_delete" on public.vendas
  for delete using (auth.uid() = user_id);

-- Policies: app_config
drop policy if exists "app_config_select" on public.app_config;
drop policy if exists "app_config_insert" on public.app_config;
drop policy if exists "app_config_update" on public.app_config;
drop policy if exists "app_config_delete" on public.app_config;

create policy "app_config_select" on public.app_config
  for select using (auth.uid() = user_id);
create policy "app_config_insert" on public.app_config
  for insert with check (auth.uid() = user_id);
create policy "app_config_update" on public.app_config
  for update using (auth.uid() = user_id);
create policy "app_config_delete" on public.app_config
  for delete using (auth.uid() = user_id);

-- Pronto! As tabelas estão configuradas.
-- Agora os dados de empreendimentos, clientes, vendas e contratos
-- serão salvos e recuperados corretamente do Supabase.
