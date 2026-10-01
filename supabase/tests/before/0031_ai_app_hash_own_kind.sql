-- Applied by scripts/verify-migrations.sh immediately BEFORE 0031 runs.
--
-- 0031 gives an AI app's rows a hash kind of their own. This keeps the
-- hash 0020 checked, so schema-assertions.sql can still prove 0020 rebuilt
-- dedupe.ts's bytes exactly, and that 0031 changed only the kind.
create table verify.hash_before_0031 as select
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', '2026-09-29', -1250, 'Lunch at Subway', 1) as one,
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', '2026-09-29', -1250, 'Lunch at Subway', 2) as two;
