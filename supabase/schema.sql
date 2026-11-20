-- =====================================================================
-- VAIDEBALSA — Mural ao vivo da fila + semáforo (versão 1)
-- Cole tudo no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- ---------- Locais dos embarques (trava de localização) ----------
-- Ilhabela: confirmado no OpenStreetMap (Barra Velha, Perequê).
-- São Sebastião: posição aproximada do centro/embarque — CONFERIR no Google Maps e ajustar.
create table if not exists public.embarques (
  lado      text primary key check (lado in ('sao-sebastiao','ilhabela')),
  lat       double precision not null,
  lon       double precision not null,
  raio_m    integer not null default 2000
);
insert into public.embarques (lado, lat, lon, raio_m) values
  ('sao-sebastiao', -23.8075, -45.4005, 2000),
  ('ilhabela',      -23.8202, -45.3762, 2000)
on conflict (lado) do nothing;

-- ---------- Posts ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  lado        text not null check (lado in ('sao-sebastiao','ilhabela')),
  espera      text not null check (espera in ('verde','amarelo','vermelho')), -- <20 / 20-60 / +60 min
  texto       varchar(140),
  foto_path   text,                       -- caminho no bucket "fotos"
  aparelho    text not null,              -- id aleatório do aparelho (não identifica a pessoa)
  confere     integer not null default 0,
  mudou       integer not null default 0,
  denuncias   integer not null default 0,
  oculto      boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index if not exists posts_criado_idx on public.posts (criado_em desc);
create index if not exists posts_lado_idx on public.posts (lado, criado_em desc);

create table if not exists public.reacoes (
  post_id   uuid references public.posts(id) on delete cascade,
  aparelho  text not null,
  tipo      text not null check (tipo in ('confere','mudou','denuncia')),
  criado_em timestamptz not null default now(),
  primary key (post_id, aparelho, tipo)
);

-- ---------- Segurança: ninguém escreve direto nas tabelas ----------
alter table public.posts    enable row level security;
alter table public.reacoes  enable row level security;
alter table public.embarques enable row level security;

drop policy if exists "ler posts recentes" on public.posts;
create policy "ler posts recentes" on public.posts
  for select to anon, authenticated
  using (not oculto and criado_em > now() - interval '45 minutes');
-- (sem policy de insert/update/delete: tudo passa pelas funções abaixo)

-- Distância em metros (fórmula de haversine)
create or replace function public.distancia_m(lat1 float8, lon1 float8, lat2 float8, lon2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ---------- Criar post (valida local, limite e campos) ----------
create or replace function public.criar_post(
  p_lado text, p_espera text, p_texto text, p_foto_path text,
  p_aparelho text, p_lat float8, p_lon float8
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
  v_id uuid;
begin
  if p_aparelho is null or length(p_aparelho) < 16 or length(p_aparelho) > 64 then
    raise exception 'aparelho_invalido';
  end if;
  if p_lat is null or p_lon is null then
    raise exception 'sem_localizacao';
  end if;
  -- precisa estar perto do embarque do lado escolhido
  select distancia_m(p_lat, p_lon, e.lat, e.lon) <= e.raio_m into v_ok
    from embarques e where e.lado = p_lado;
  if not coalesce(v_ok, false) then
    raise exception 'fora_da_fila';
  end if;
  -- no máximo 1 post a cada 10 minutos por aparelho
  if exists (select 1 from posts where aparelho = p_aparelho and criado_em > now() - interval '10 minutes') then
    raise exception 'aguarde';
  end if;
  if p_foto_path is not null and p_foto_path !~ '^[0-9a-f-]{36}\.(jpg|webp)$' then
    raise exception 'foto_invalida';
  end if;
  insert into posts (lado, espera, texto, foto_path, aparelho)
  values (p_lado, p_espera, nullif(trim(left(p_texto, 140)), ''), p_foto_path, p_aparelho)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Reagir: confere / mudou / denuncia ----------
create or replace function public.reagir(p_post uuid, p_aparelho text, p_tipo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_aparelho is null or length(p_aparelho) < 16 then raise exception 'aparelho_invalido'; end if;
  insert into reacoes (post_id, aparelho, tipo) values (p_post, p_aparelho, p_tipo)
  on conflict do nothing;
  if not found then return; end if;
  if p_tipo = 'confere' then
    update posts set confere = confere + 1 where id = p_post;
  elsif p_tipo = 'mudou' then
    update posts set mudou = mudou + 1 where id = p_post;
  else
    -- 3 denúncias escondem o post automaticamente
    update posts set denuncias = denuncias + 1, oculto = (denuncias + 1 >= 3) where id = p_post;
  end if;
end $$;

-- ---------- Semáforo: média ponderada dos últimos 30 min ----------
-- verde=1, amarelo=2, vermelho=3; peso = 1 + confere - 1.5*mudou (mín. 0,2)
create or replace function public.semaforo_atual()
returns table (lado text, nivel text, relatos integer, ultimo timestamptz)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.lado,
           case p.espera when 'verde' then 1 when 'amarelo' then 2 else 3 end as v,
           greatest(0.2, 1 + p.confere - 1.5 * p.mudou) as peso,
           p.criado_em
      from posts p
     where not p.oculto and p.criado_em > now() - interval '30 minutes'
  ), agg as (
    select lado, sum(v * peso) / sum(peso) as media, count(*)::int as relatos, max(criado_em) as ultimo
      from base group by lado
  )
  select l.lado,
         case when a.relatos is null then 'sem-dados'
              when a.media < 1.6 then 'verde'
              when a.media < 2.4 then 'amarelo'
              else 'vermelho' end,
         coalesce(a.relatos, 0),
         a.ultimo
    from (values ('sao-sebastiao'), ('ilhabela')) as l(lado)
    left join agg a on a.lado = l.lado;
$$;

grant execute on function public.criar_post(text,text,text,text,text,float8,float8) to anon, authenticated;
grant execute on function public.reagir(uuid,text,text) to anon, authenticated;
grant execute on function public.semaforo_atual() to anon, authenticated;
revoke execute on function public.distancia_m(float8,float8,float8,float8) from anon;

-- ---------- Fotos: bucket público, só imagens pequenas ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 1572864, array['image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1572864,
  allowed_mime_types = array['image/jpeg','image/webp'];

drop policy if exists "enviar foto" on storage.objects;
create policy "enviar foto" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'fotos' and name ~ '^[0-9a-f-]{36}\.(jpg|webp)$');

drop policy if exists "ver foto" on storage.objects;
create policy "ver foto" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'fotos');

-- ---------- Limpeza (rodar 1x por dia; ver README) ----------
-- Apaga posts com mais de 7 dias. As fotos do bucket são apagadas pela
-- função "limpar-fotos" ou manualmente no painel Storage.
create or replace function public.limpar_antigos()
returns integer language sql security definer set search_path = public as $$
  with d as (delete from posts where criado_em < now() - interval '7 days' returning 1)
  select count(*)::int from d;
$$;
