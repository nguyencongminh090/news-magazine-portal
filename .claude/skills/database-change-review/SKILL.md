---
name: database-change-review
description: Review a change that touches a relational database (SQLite or PostgreSQL) against the tree's database rules, tier by tier, and report findings with the rule and note behind each
---

# Database change review

Use this on a diff, pull request or plan that adds or changes queries, schema, migrations, transactions, connections, backups or roles.
It applies the rules in `rules/coding-standards/items/database.md` (read it from the tree, do not copy it); the linked notes explain why.

## Steps

1. **Find the engine and tier.** SQLite or PostgreSQL? Embedded tool, single server, or replicated/multi-tenant? Read `knowledge/database/items/db-scale-tiers.md`.
   The tier decides which `[server]` rules are mandatory and which are advice. If the engine is MySQL, MongoDB or anything else, say so: the rules and notes cover only SQLite and PostgreSQL.
2. **List what the change touches.** Queries, schema, migration files, transactions, pool or timeout settings, backup or retention jobs, roles and grants, tests. Skip sections of the rule file that the change does not touch.
3. **Check each touched section** of the rule file. Mark every MUST/NEVER as pass, fail or not applicable; read the linked note only for the rules that fail or look doubtful.
   - Queries and types: bound parameters, `ORDER BY` plus `LIMIT`, no N+1, plan checked at realistic volume (`pg-explain-stats`, `db-query-plan-index-tuning`), no float money, UTC instants.
   - Transactions: no network call inside, read-modify-write protected (`pg-isolation-locking`), retries idempotent, queue claims use `SKIP LOCKED` (`pg-queue-upsert-idempotency`).
   - Connections: pool sum under the server limit, `statement_timeout` and `idle_in_transaction_session_timeout` set (`pg-connection-pooling-timeouts`).
   - Migrations: versioned, safe while old code runs, `lock_timeout`, `CONCURRENTLY`, `NOT VALID`, batched backfill, backup before destructive steps (`pg-online-migrations-locks`, `db-sqlite-migrations-user-version`).
   - Lifecycle and security: retention for growing tables, restore tested, least-privilege roles, RLS context per transaction (`db-backup-restore-retention`, `pg-backup-pitr-replicas`, `pg-roles-rls-multitenancy`).
   - Tests: run on the production engine (`db-testing-real-engine`).
4. **Run or ask for evidence** where a rule needs it: the `EXPLAIN` output, the migration run on production-shaped data, a restore test log. A claim without evidence is "unverified", not "pass".
5. **Report** a table: rule (quote the MUST/NEVER), location in the diff, verdict, fix, note to read. Order by severity: data loss or outage risk first, then correctness, then performance, then style.
   Say which rules were not checked and why.

## Do not

- Do not edit the rule file or notes during a review; if a rule is wrong or missing, file feedback with `tools/feedback`.
- Do not invent PostgreSQL behaviour from memory when a note exists; read the note, and where a note says "author advice", report it as advice, not as a documented fact.
- Do not review application authorization logic here: use `authz-least-privilege`. Do not use this for bug triage: use `systematic-debugging`.
