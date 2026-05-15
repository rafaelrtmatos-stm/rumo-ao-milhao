-- ============================================================
-- RUMO AO MILHÃO — Correção completa para app sem login
-- Execute no Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Remove FK que exige usuário autenticado no Supabase Auth
alter table public.empreendimentos drop constraint if exists empreendimentos_user_id_fkey;
alter table public.clientes        drop constraint if exists clientes_user_id_fkey;
alter table public.vendas          drop constraint if exists vendas_user_id_fkey;
alter table public.app_config      drop constraint if exists app_config_user_id_fkey;

-- 2. Garante que user_id é text (compatível com qualquer ID fixo)
alter table public.empreendimentos alter column user_id type text using user_id::text;
alter table public.clientes        alter column user_id type text using user_id::text;
alter table public.vendas          alter column user_id type text using user_id::text;
alter table public.app_config      alter column user_id type text using user_id::text;

-- 3. Desativa RLS (app sem autenticação)
alter table public.empreendimentos disable row level security;
alter table public.clientes        disable row level security;
alter table public.vendas          disable row level security;
alter table public.app_config      disable row level security;

-- 4. Remove todas as policies antigas
drop policy if exists "empreendimentos_select" on public.empreendimentos;
drop policy if exists "empreendimentos_insert" on public.empreendimentos;
drop policy if exists "empreendimentos_update" on public.empreendimentos;
drop policy if exists "empreendimentos_delete" on public.empreendimentos;

drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
drop policy if exists "clientes_delete" on public.clientes;

drop policy if exists "vendas_select" on public.vendas;
drop policy if exists "vendas_insert" on public.vendas;
drop policy if exists "vendas_update" on public.vendas;
drop policy if exists "vendas_delete" on public.vendas;

drop policy if exists "app_config_select" on public.app_config;
drop policy if exists "app_config_insert" on public.app_config;
drop policy if exists "app_config_update" on public.app_config;
drop policy if exists "app_config_delete" on public.app_config;

-- Pronto! O app agora consegue salvar e ler sem login.
