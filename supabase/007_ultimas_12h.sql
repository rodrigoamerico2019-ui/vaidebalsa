-- =====================================================================
-- VAIDEBALSA — Gráfico das últimas 12 horas (janela móvel)
-- SQL Editor > New query > colar TUDO > Run.
-- =====================================================================
-- Para cada lado e cada hora das últimas 12 horas, devolve a espera
-- típica em minutos juntando esperas medidas (peso 3) e fotos da fila
-- (verde=10, amarelo=40, vermelho=75 min). Posts escondidos não entram.
create or replace function public.espera_12h()
returns table (lado text, hora timestamptz, minutos integer, medidas integer, relatos integer)
language sql stable security definer set search_path = public as $$
  with pontos as (
    select e.lado, date_trunc('hour', e.fim) as hora,
           e.minutos::numeric as min, 3.0 as peso, 1 as eh_medida
      from esperas e
     where e.fim > now() - interval '12 hours' and e.minutos between 1 and 300
    union all
    select p.lado, date_trunc('hour', p.criado_em),
           case p.espera when 'verde' then 10 when 'amarelo' then 40 else 75 end,
           greatest(0.2, 1 + p.confere - 1.5 * p.mudou), 0
      from posts p
     where p.criado_em > now() - interval '12 hours' and not p.oculto
  )
  select pontos.lado, pontos.hora,
         round(sum(pontos.min * pontos.peso) / sum(pontos.peso))::int,
         sum(pontos.eh_medida)::int,
         (count(*) - sum(pontos.eh_medida))::int
    from pontos
   group by pontos.lado, pontos.hora
   order by pontos.lado, pontos.hora;
$$;

grant execute on function public.espera_12h() to anon, authenticated;
