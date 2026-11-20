-- =====================================================================
-- VAIDEBALSA — Espera típica pelo histórico próprio
-- SQL Editor > New query > colar TUDO > Run.
-- =====================================================================
-- Mediana das esperas medidas nas últimas 8 semanas, no MESMO dia da
-- semana e na mesma faixa de horário (hora atual ±1), por lado.
-- Enquanto houver poucas medições, o site usa a estimativa de referência.
create or replace function public.espera_tipica()
returns table (lado text, medicoes integer, mediana integer)
language sql stable security definer set search_path = public as $$
  with agora as (
    select extract(dow from now() at time zone 'America/Sao_Paulo')::int as dia,
           extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora
  )
  select l.lado,
         count(e.minutos)::int,
         round(percentile_cont(0.5) within group (order by e.minutos))::int
    from (values ('sao-sebastiao'), ('ilhabela')) as l(lado)
    cross join agora
    left join esperas e
      on e.lado = l.lado
     and e.minutos between 1 and 300
     and e.fim > now() - interval '56 days'
     and extract(dow from e.inicio at time zone 'America/Sao_Paulo')::int = agora.dia
     and abs(extract(hour from e.inicio at time zone 'America/Sao_Paulo')::int - agora.hora) <= 1
   group by l.lado;
$$;

grant execute on function public.espera_tipica() to anon, authenticated;
