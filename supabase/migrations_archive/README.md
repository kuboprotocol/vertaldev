# Archived migrations (not applied by tooling)

These 244 files used to live in `supabase/migrations/`, but production
(`sccizjlpwezsgaxkclot`, "kubovibe") never recorded them in
`supabase_migrations.schema_migrations`. Production was built from the
consolidated blocks `part_001`–`part_005` (2026-09-10) plus later migrations
applied one by one, often under different version numbers (e.g. local
`20261111220000_user_wallet` = production `20261112024254_user_wallet`), and
missing objects were restored by `supabase/manual/`.

Because the two histories diverged, the Supabase GitHub integration failed on
every push to `main` with "Remote migration versions not found in local
migrations directory." On 2026-11-27, `supabase/migrations/` was made to
match production's history exactly (63 versions): the versions only
production had were recovered verbatim from `schema_migrations.statements`
(and `20261126200000_vertal_mailbox` from branch `feat/vertal-mail`), and the
versions only the repo had were moved here, unchanged.

Do not move these files back into `supabase/migrations/`: the integration
would try to run them on production. They stay here as reference for what
each feature created. Some of them were applied to production by hand without
being recorded (for example the 2026-11-25 Vertal Chat scheduler,
Prospector, Growth Team and CRM migrations); others never reached production
(as of 2026-11-27, `20261126120000_vertal_code_ai_memory` had not: its
`vertal_code_ai_memories` table did not exist). Check production before
relying on any of them; to ship one, copy it into `supabase/migrations/`
under a new, later version.

## New migrations

Put new migrations in `supabase/migrations/` with a version later than the
latest one there. Merging to `main` makes the Supabase integration apply it to
production, unless it was already applied with the same version (for example
via the Management API / MCP `apply_migration`, which records it).
