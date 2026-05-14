# Rumo ao Milhão — Soluções Imobiliárias

## Visão Geral
Sistema de gestão imobiliária com React + Vite (frontend), Express (backend para auth + Gemini AI + contratos), e Supabase como banco de dados principal.

## Stack
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion
- Backend: Express (Node.js/TypeScript)
- Banco de dados: **Supabase (100% — preferência do usuário)**
- Auth: sessões locais via Express (bcrypt + localUsers no Replit PostgreSQL apenas para autenticação)
- AI: Google Gemini via @google/genai SDK (Replit AI Integration)

## Preferências do usuário
- **BANCO DE DADOS: 100% Supabase** — todos os dados (empreendimentos, clientes, vendas, app_config) devem ser lidos e gravados diretamente no Supabase via @supabase/supabase-js
- **REALTIME ATIVO** — o app usa Supabase Realtime (postgres_changes) para atualizar o estado em tempo real
- O Replit PostgreSQL (DATABASE_URL) é usado APENAS para a tabela `local_users` (autenticação)
- Nunca reverter para Drizzle ORM para operações de dados do app
- Manter as credenciais do Supabase nas variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

## Arquitetura de dados
Tabelas no Supabase:
- `empreendimentos`: { id text, user_id text, data jsonb }
- `clientes`: { id text, user_id text, data jsonb }
- `vendas`: { id text, user_id text, data jsonb }
- `app_config`: { user_id text, data jsonb }

## Fluxo de auth
1. Login via POST /api/auth/login → Express verifica bcrypt → retorna { id, email, isAdmin }
2. O frontend chama setCurrentUser(user.id) para inicializar o Supabase com o userId correto
3. Todas as queries Supabase filtram por user_id

## Endpoints Express (mantidos)
- /api/auth/* — login, logout, register, user info
- /api/admin/users — gestão de usuários (admin only)
- /api/gemini/* — proxy para Gemini AI (smart-paste, extract-files, analyze-map, extract-sale)
- /api/contrato/* — geração de contratos .docx
