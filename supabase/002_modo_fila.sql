-- =====================================================================
-- VAIDEBALSA — Modo fila (medição automática da espera pelo GPS)
-- Rodar DEPOIS do schema.sql. SQL Editor > New query > colar > Run.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- Cada medição: lado, hora que entrou na fila e hora que embarcou.
-- Não guarda trajeto nem localização — só as horas.
create table if not exists public.esperas (
  id        uuid primary key default gen_random_uuid(),
  lado      text not null check (lado in ('sao-sebastiao','ilhabela')),
  aparelho  text not null,
  inicio    timestamptz not null default now(),
  fim       timestamptz,
  minutos   integer
);
create index if not exists esperas_fim_idx on public.esperas (lado, fim desc);
create index if not exists esperas_ativas_idx on public.esperas (lado, inicio desc) where fim is null;
alter table public.esperas enable row level security;   -- sem policies: só as funções acessam

-- ---------- Começar a medir (precisa estar na área da fila) ----------
create or replace function public.iniciar_espera(p_lado text, p_aparelho text, p_lat float8, p_lon float8)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_id uuid;
begin
  if p_aparelho is null or length(p_aparelho) < 16 or length(p_aparelho) > 64 then raise exception 'aparelho_invalido'; end if;
  if p_lat is null or p_lon is null then raise exception 'sem_localizacao'; end if;
  select distancia_m(p_lat, p_lon, e.lat, e.lon) <= e.raio_m into v_ok from embarques e where e.lado = p_lado;
  if not coalesce(v_ok, false) then raise exception 'fora_da_fila'; end if;
  if (select count(*) from esperas where aparelho = p_aparelho and inicio > now() - interval '1 hour') >= 3 then
    raise exception 'aguarde';
  end if;
  -- uma medição aberta por aparelho
  update esperas set fim = now(), minutos = null where aparelho = p_aparelho and fim is null;
  insert into esperas (lado, aparelho) values (p_lado, p_aparelho) returning id into v_id;
  return v_id;
end $$;

-- ---------- Concluir (só quando o celular já está atravessando) ----------
-- "Embarcou" = avançou pelo menos 400 m em direção ao embarque do outro lado,
-- o que só acontece em cima da balsa.
create or replace function public.concluir_espera(p_id uuid, p_aparelho text, p_lat float8, p_lon float8)
returns integer
language plpgsql security definer set search_path = public as $$
declare r esperas; a embarques; b embarques; v_prog float8; v_min integer;
begin
  select * into r from esperas
   where id = p_id and aparelho = p_aparelho and fim is null and inicio > now() - interval '5 hours';
  if not found then raise exception 'espera_invalida'; end if;
  select * into a from embarques where lado = r.lado;
  select * into b from embarques where lado <> r.lado limit 1;
  v_prog := distancia_m(a.lat, a.lon, b.lat, b.lon) - distancia_m(p_lat, p_lon, b.lat, b.lon);
  if v_prog < 400 then raise exception 'ainda_na_fila'; end if;
  v_min := greatest(1, round(extract(epoch from now() - r.inicio) / 60)::int);
  -- desvincula do aparelho: a medição fica anônima
  update esperas set fim = now(), minutos = v_min, aparelho = '-' where id = r.id;
  return v_min;
end $$;

-- ---------- Semáforo: relatos + esperas medidas ----------
-- Posts dos últimos 30 min (peso pelo Confere/Já mudou) + esperas medidas nos últimos 45 min (peso 3).
drop function if exists public.semaforo_atual();
create function public.semaforo_atual()
returns table (lado text, nivel text, relatos integer, ultimo timestamptz,
               medidas integer, espera_mediana integer, medindo integer)
language sql stable security definer set search_path = public as $$
  with p as (
    select p.lado,
           case p.espera when 'verde' then 1 when 'amarelo' then 2 else 3 end as v,
           greatest(0.2, 1 + p.confere - 1.5 * p.mudou) as peso,
           p.criado_em as t
      from posts p
     where not p.oculto and p.criado_em > now() - interval '30 minutes'
  ), m as (
    select e.lado, e.minutos, e.fim
      from esperas e
     where e.fim > now() - interval '45 minutes' and e.minutos between 1 and 300
  ), vals as (
    select p.lado, p.v, p.peso, p.t from p
    union all
    select m.lado, case when m.minutos < 20 then 1 when m.minutos <= 60 then 2 else 3 end, 3.0, m.fim from m
  ), agg as (
    select vals.lado, sum(vals.v * vals.peso) / sum(vals.peso) as media, max(vals.t) as ultimo
      from vals group by vals.lado
  ), cp as (select p.lado, count(*)::int as n from p group by p.lado
  ), cm as (
    select m.lado, count(*)::int as n,
           round(percentile_cont(0.5) within group (order by m.minutos))::int as mediana
      from m group by m.lado
  ), ativ as (
    select e.lado, count(*)::int as n from esperas e
     where e.fim is null and e.inicio > now() - interval '4 hours' group by e.lado
  )
  select l.lado,
         case when agg.media is null then 'sem-dados'
              when agg.media < 1.6 then 'verde'
              when agg.media < 2.4 then 'amarelo'
              else 'vermelho' end,
         coalesce(cp.n, 0),
         agg.ultimo,
         coalesce(cm.n, 0),
         cm.mediana,
         coalesce(ativ.n, 0)
    from (values ('sao-sebastiao'), ('ilhabela')) as l(lado)
    left join agg on agg.lado = l.lado
    left join cp  on cp.lado  = l.lado
    left join cm  on cm.lado  = l.lado
    left join ativ on ativ.lado = l.lado;
$$;

grant execute on function public.iniciar_espera(text,text,float8,float8) to anon, authenticated;
grant execute on function public.concluir_espera(uuid,text,float8,float8) to anon, authenticated;
grant execute on function public.semaforo_atual() to anon, authenticated;

-- ---------- Limpeza: inclui esperas antigas ----------
create or replace function public.limpar_antigos()
returns integer language sql security definer set search_path = public as $$
  with d1 as (delete from posts where criado_em < now() - interval '7 days' returning 1),
       d2 as (delete from esperas where fim is null and inicio < now() - interval '1 day' returning 1)
  select (select count(*) from d1)::int + (select count(*) from d2)::int;
$$;
-- Obs.: esperas concluídas (só lado + horários) ficam guardadas para a previsão por horário.
