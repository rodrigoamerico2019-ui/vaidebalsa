-- =====================================================================
-- VAIDEBALSA — Gráfico da espera do dia
-- SQL Editor > New query > colar TUDO > Run.
-- =====================================================================
-- Para cada lado e cada hora de hoje (horário de Brasília), devolve a
-- espera típica em minutos, juntando:
--   • esperas medidas pelo Modo fila (minutos reais)
--   • relatos com foto (convertidos: verde=10, amarelo=40, vermelho=75 min)
-- Medições valem 3x mais que relatos. Posts escondidos não entram.
create or replace function public.espera_hoje()
returns table (lado text, hora integer, minutos integer, medidas integer, relatos integer)
language sql stable security definer set search_path = public as $$
  with hoje as (
    select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' as inicio
  ), pontos as (
    select e.lado,
           extract(hour from e.fim at time zone 'America/Sao_Paulo')::int as hora,
           e.minutos::numeric as min, 3.0 as peso, 1 as eh_medida
      from esperas e, hoje
     where e.fim >= hoje.inicio and e.minutos between 1 and 300
    union all
    select p.lado,
           extract(hour from p.criado_em at time zone 'America/Sao_Paulo')::int,
           case p.espera when 'verde' then 10 when 'amarelo' then 40 else 75 end,
           greatest(0.2, 1 + p.confere - 1.5 * p.mudou), 0
      from posts p, hoje
     where p.criado_em >= hoje.inicio and not p.oculto
  )
  select pontos.lado, pontos.hora,
         round(sum(pontos.min * pontos.peso) / sum(pontos.peso))::int,
         sum(pontos.eh_medida)::int,
         (count(*) - sum(pontos.eh_medida))::int
    from pontos
   group by pontos.lado, pontos.hora
   order by pontos.lado, pontos.hora;
$$;

grant execute on function public.espera_hoje() to anon, authenticated;
