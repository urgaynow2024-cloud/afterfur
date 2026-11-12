# AFTERFUR Full Database Audit — Review Notes

**Script:** `docs/AFTERFUR_FULL_DATABASE_AUDIT.sql`  
**Scope:** Read-only, single-run Supabase SQL Editor audit (structure, security/RLS, automation, migration integrity signals, known issues, 0034/follows drift).  
**This review:** static/documentation update only. No database connection, no execution against production, no schema/data changes.

## Change summary (full restructure — fixes for both syntax errors)

### Exact causes of both syntax errors
1. **Premature statement termination (isolated patch introduced/exposed):** in the prior consolidation attempt, the first audit branch (`f00`, audit_execution) ended with `... ) as details;` while still inside `with audit_findings as ( ... )`. That semicolon terminated the entire SQL statement prematurely at the end of the first branch, leaving `union all` and all remaining branches outside a valid statement.
2. **`ERROR: 42601: syntax error at or near "with"` at `WITH expected_migrations` (line ~47):** because of the premature termination and improper branch concatenation, the parser then encountered `union all` followed by an independent `with expected_migrations(...)` clause in an invalid position (a standalone `WITH` cannot appear as a `UNION ALL` branch term inside an unfinished/invalid structure). PostgreSQL reported `syntax error at or near "with"` at that token.

**Root structural issue:** branches were not collected into one valid top-level statement; a branch-local `WITH` was emitted in a union-branch position and a stray semicolon broke the statement boundary. Deleting semicolons alone would not fix the invalid `WITH` placement.

### Restructure applied
- **Single top-level `WITH` statement:** the entire audit is one statement: `with <named check CTEs...>, audit_findings as (<union of all checks>) select ... from audit_findings order by ...;`
- **Every audit check as a named CTE (46 total, 00–06 + `99_complete`):** each check is defined as `cte_name as ( <query> )` before reference. Branch bodies are parenthesized subqueries, so checks that include their own local `WITH` (e.g. expected migration list, `checks`, `fks`, `objs`) remain valid inside that CTE body and do **not** appear as independent `WITH` clauses in a union branch.
- **One consolidation point:** `audit_findings` = `select * from <each CTE>` joined by `UNION ALL` (45 unions, 46 sources). Every source returns the same 6 columns with compatible types: `section text, check_name text, object_name text, status text, explanation text, details jsonb`.
- **One final result set:** final `SELECT` returns every finding with `section, check_name, object_name, status, explanation, details`, ordered by `section`, then status priority (**FAIL, WARNING, UNKNOWN, PASS**), then `check_name, object_name`.
- **No statement-boundary errors:** no semicolons inside CTE bodies; no independent `WITH` inside an unfinished statement/union branch; every CTE defined before reference.
- **Preserved:** all existing checks from sections 00–06 and 99 (structure, security/RLS/grants/functions, automation, migration-integrity signals, known issues, 0034/follows consistency). Migration history remains **not queried/referenced** (`schema_migrations`/`to_regclass` absent) and reported as `UNKNOWN` (unconfirmed) without stopping execution.
- **Safety:** strictly read-only (`SELECT`/CTE/catalog only), no temporary/permanent tables, no DDL/DML/migration execution, no data/RLS/permission changes.

### How to read the consolidated results

1. **Run once:** Supabase Dashboard → SQL Editor → paste the full contents of `docs/AFTERFUR_FULL_DATABASE_AUDIT.sql` → Run. Expect **one** result set containing all findings (including `99_complete`).
2. **Columns:** `section` (00_meta, 01_structure, 02_security, 03_automation, 04_migration_integrity, 05_known_issues, 06_migration_consistency, 99_complete), `check_name`, `object_name`, `status`, `explanation`, `details` (JSON/context).
3. **Prioritize:** within each section rows are ordered FAIL → WARNING → UNKNOWN → PASS. Address **FAIL** first, then **WARNING**, then investigate **UNKNOWN`.
4. **Interpret evidence correctly:** `04_migration_integrity` history rows = `UNKNOWN` (history not queried/unconfirmed, not proof applied/unapplied). `expected_repo_migration_file` = repo file present (embedded list), not application status. DB object existence (01–03, 05–06) = current catalog state — **never assume a migration was applied just because its objects/columns exist**. Application status confirmed remains `UNKNOWN` without authoritative migration-history verification.
5. **Key signals:** `05_known_issues`/`06_migration_consistency` cover `follows.created_at`, 0034 moderation objects (columns, indexes, CHECKs, moderated_by FKs) and `classification` vs `moderation_status`. `99_complete` confirms the script finished.

## Static validation & inspection (performed)

- **Complete-script inspection:** verified single top-level `WITH`, 46 named CTE definitions before use, `audit_findings` assembled via 45 `UNION ALL`s, 1 final `SELECT` with required columns/order, and terminating semicolon. No semicolons inside CTE bodies; no independent `WITH` in union-branch position; sections 00–06/99 present.
- **History/mutation safety:** `schema_migrations` / `to_regclass` = **0 matches**. No `INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE/DO` or migration-execution statements; no temp/permanent tables.
- **Production:** not connected to and not executed against any database.
- **Parser execution:** **not performed.** I cannot execute a safe local PostgreSQL syntax validation in this environment (no `psql`, no PostgreSQL parser library, and no database connection available), so validity is established by full structural/static inspection of the entire final SQL statement, not by live engine parsing/execution.

## Confirmation: missing migration-history relation can no longer stop the audit

The executable script contains no references to `supabase_migrations.schema_migrations` and no `to_regclass(...)` guards tied to it, so PostgreSQL will not raise `42P01` for that missing relation when parsing/running this audit. Missing/inaccessible migration history is reported as `UNKNOWN` and the audit continues through all other checks.

## Caveats

- Migration **application/recording status** cannot be confirmed by this audit without reading authoritative migration history; object existence is necessary-but-not-sufficient evidence and is explicitly not used as proof of application.
- History verification, if required, must be performed separately via an approved, environment-appropriate read-only method outside this script. No such access or changes were made here.
