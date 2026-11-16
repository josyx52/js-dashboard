-- Real Mar: clientes, mensagens, pedidos. NÃO aplicada automaticamente.
create table if not exists rm_clientes (
  id uuid primary key default gen_random_uuid(),
  telefone text unique not null,
  nome text,
  created_at timestamptz not null default now()
);
create table if not exists rm_mensagens (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references rm_clientes(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  external_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists rm_mensagens_cliente_idx on rm_mensagens(cliente_id, created_at desc);
create table if not exists rm_pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references rm_clientes(id),
  nome text, morada text, zona text,
  itens jsonb not null,
  taxa_entrega_eur numeric(10,2) not null default 0,
  total_eur numeric(10,2) not null,
  estado text not null default 'novo',
  created_at timestamptz not null default now()
);
-- RLS ligada sem políticas: só a service key (Worker) acede.
alter table rm_clientes enable row level security;
alter table rm_mensagens enable row level security;
alter table rm_pedidos enable row level security;
