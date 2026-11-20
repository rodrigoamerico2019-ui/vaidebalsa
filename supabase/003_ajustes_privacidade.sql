-- =====================================================================
-- VAIDEBALSA — Ajustes de privacidade e segurança (verificação de 20/11/2026)
-- SQL Editor > New query > colar > Run.
-- =====================================================================

-- 1) Ninguém consegue mais LISTAR todas as fotos do bucket.
--    As fotos continuam abrindo pelo link público usado no mural
--    (bucket público não depende desta policy para exibir a foto).
drop policy if exists "ver foto" on storage.objects;

-- 2) Funções internas não podem ser chamadas pelo site/visitantes.
revoke execute on function public.limpar_antigos() from public, anon, authenticated;
revoke execute on function public.distancia_m(float8, float8, float8, float8) from public, anon, authenticated;
