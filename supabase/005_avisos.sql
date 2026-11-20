-- =====================================================================
-- VAIDEBALSA — Avisos da faixa "AO VIVO" (escritos por você)
-- SQL Editor > New query > colar TUDO > Run.
--
-- Como usar depois: Supabase > Table Editor > avisos > Insert row
--   texto  : até 120 caracteres (ex.: "Operação Feriado: balsa reforçada até domingo")
--   emoji  : opcional (ex.: ⚠️  🚧  ⛴️  📢)
--   link   : opcional, link da fonte oficial
--   fim    : até quando o aviso aparece (em branco = 3 dias)
--   ativo  : desmarque para tirar do ar na hora
-- =====================================================================
create table if not exists public.avisos (
  id        bigint generated always as identity primary key,
  texto     varchar(120) not null,
  emoji     varchar(8),
  link      text check (link is null or link ~ '^https://'),
  inicio    timestamptz not null default now(),
  fim       timestamptz,
  ativo     boolean not null default true,
  ordem     integer not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.avisos enable row level security;
grant select on public.avisos to anon, authenticated;

drop policy if exists "avisos vigentes" on public.avisos;
create policy "avisos vigentes" on public.avisos
  for select to anon, authenticated
  using (ativo and inicio <= now() and now() < coalesce(fim, inicio + interval '3 days'));

-- Exemplo (fica desativado; ative no Table Editor se quiser testar)
insert into public.avisos (texto, emoji, ativo)
select 'Exemplo: Operação Feriado — balsa com mais embarcações até domingo', '📢', false
where not exists (select 1 from public.avisos);
