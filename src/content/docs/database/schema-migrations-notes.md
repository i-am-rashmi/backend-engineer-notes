---
title: "schema-migrations-notes"
---


# Schema Migrations & Zero-Downtime ALTER TABLE — Complete Notes


## 0. The Core Problem


At small scale, `ALTER TABLE` “just works.” At scale (millions/billions of rows, high traffic), it’s one of the most dangerous operations you can run — because most structural changes grab a heavyweight lock, and on a huge table, that lock can be held for minutes or hours, taking the entire application down.


**The fix requires two separate skills:**
1. **Lock avoidance** — running individual DDL statements in a way that doesn’t block live traffic.
2. **Sequencing** — safely coordinating _multiple_ schema changes and _multiple_ app deployments so the app is never talking to a schema it doesn’t understand (the **Expand/Contract pattern**).


---


## 1. Lock Avoidance


### Why locking happens at all


A structural change like `ALTER TABLE ... ADD COLUMN` or `CREATE INDEX` typically grabs an **Access Exclusive Lock** — the “closed for renovations” sign. While held, **nothing** can read or write the table, not even simple `SELECT`s.


**Worked example:** a 2-billion-row `users` table, `CREATE INDEX` (no `CONCURRENTLY`) takes 45 minutes to build. Every login attempt — a `SELECT` on `users` — is forced to wait for the entire 45 minutes. Those waiting queries hold their **connection pool** slots (ties directly to the connection-pooling notes) — within seconds, the pool exhausts, new requests can’t even get a connection, and the whole app goes down for the full 45 minutes.


### The fix: `CONCURRENTLY` (PostgreSQL)


```sql
CREATE INDEX CONCURRENTLY idx_user_email ON users(email);
```


Takes a much lighter lock, allowing `SELECT`/`INSERT`/`UPDATE` to continue normally while the index builds in the background.


**The trade-off:** it’s slower — often 2x+ the plain build time — because the database has to scan the table multiple times and patiently wait for concurrent transactions to finish, rather than just locking everyone out and barreling through. Nearly always worth it: a 2-hour background build with zero downtime beats a 45-minute build that takes the app offline.


### Lock hierarchy — the part the session didn’t cover (gap)


Not every DDL statement needs the same heavy lock — knowing the actual lock levels (Postgres terms, but the general hierarchy concept transfers) is what separates “I know to use `CONCURRENTLY`” from actually being able to reason about _any_ migration:


| Operation                             | Typical lock                                                           | Blocks reads?                 | Blocks writes? |
| ------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- | -------------- |
| `CREATE INDEX CONCURRENTLY`           | Share Update Exclusive                                                 | No                            | No (mostly)    |
| `ADD COLUMN` (nullable, no default)   | Access Exclusive, but near-instant                                     | Briefly                       | Briefly        |
| `ADD COLUMN ... DEFAULT <value>`      | Access Exclusive — **can rewrite the whole table**                     | Yes, for the rewrite duration | Yes            |
| `ADD COLUMN ... NOT NULL`             | Access Exclusive — requires a full table scan to verify                | Yes                           | Yes            |
| `ALTER COLUMN TYPE`                   | Access Exclusive, full table rewrite                                   | Yes                           | Yes            |
| `ADD CONSTRAINT ... NOT VALID`        | Light lock, doesn’t validate existing rows                             | No                            | No             |
| `VALIDATE CONSTRAINT` (separate step) | Lighter lock, only needs a `SHARE` lock, scans without blocking writes | No                            | No             |


**Key gotcha (gap — genuinely tripped-over in production):** in older PostgreSQL versions, `ADD COLUMN ... DEFAULT 'some_value'` rewrote the **entire table** to populate the default for every existing row — turning what looks like an instant metadata change into a multi-hour, fully-locking operation on a huge table. **Postgres 11+ optimized constant defaults** to be a fast metadata-only change (the default is stored once and applied logically on read) — but this optimization does **not** apply to non-constant defaults (e.g., `DEFAULT now()`, `DEFAULT gen_random_uuid()`), which still trigger a full rewrite. Always check your specific Postgres version’s behavior before assuming “adding a column with a default is free.”


**Similarly, adding** **`NOT NULL`** **directly still requires a full-table scan** to verify no existing row violates it, holding a heavy lock for the scan’s duration. The safe pattern: add the constraint as `NOT VALID` first (instant, doesn’t check existing rows), then run `VALIDATE CONSTRAINT` as a **separate statement**, which only takes a lighter lock and can run concurrently with normal traffic — same end state, much safer path to get there. This exact `NOT VALID` → `VALIDATE` two-step pattern also applies to foreign keys.


### Practical safety net (gap — operational habit, not covered in session)


Always wrap production DDL with a short `lock_timeout` (and often `statement_timeout`) so that if the migration _does_ end up waiting behind a long-running transaction for a lock, it fails fast and retries later instead of queuing up behind it indefinitely and blocking everything else that then queues up behind _it_:


```sql
SET lock_timeout = '2s';
SET statement_timeout = '5s';
```


This converts “silent multi-minute outage” into “a clearly logged, retriable failure” — a small habit that prevents a large class of real incidents.


---


## 2. The Expand/Contract Pattern


Used whenever you need to change structure in a way the _running application_ isn’t compatible with (renaming a column, changing a type) — since the DB and app deploy independently and can’t change atomically together.


**The core problem it solves:** if you just rename a column directly, the running app (which still queries the old name) breaks instantly with “column does not exist” — because schema changes and code deployments are two separate events, not one atomic operation.


### Phase 1 — Expand (database)


Add the _new_ structure alongside the old, without touching the old:


```sql
ALTER TABLE users ADD COLUMN given_name text;
```


Now both `first_name` and `given_name` exist. Nothing about the running app has changed yet — this step is invisible to it.


### Phase 2 — Dual Write (application code)


Deploy new application code that **writes to both columns** on every insert/update, while **still reading only from the old column** (`first_name`). This is the step that makes the transition safe: any brand-new data is now correctly present in both places, and nothing about existing read behavior has changed.


### Phase 3 — Backfill (existing data)


Dual-writing only covers _new_ writes going forward — the billions of existing rows still have `given_name = NULL`. This needs an explicit backfill (Section 3).


### Phase 4 — Cutover (application code)


Once backfill is complete and verified, deploy another app update that **switches reads** to the new column (`given_name`). Dual-writing typically continues for a safety window even after cutover, so you can roll back to the previous app version without any data loss if a bug surfaces.


### Phase 5 — Contract (database)


Once you’re confident the new column has been the sole read path for a safe period, and you no longer need the rollback safety net, remove the old column:


```sql
ALTER TABLE users DROP COLUMN first_name;
```


**Why the ordering matters — the safety-net insight:** by leaving `first_name` untouched until the very last step, every prior phase is trivially reversible — if a bug appears in the new code, you can roll back to the previous app version and the old column still has every bit of the original data, unaffected. **The Contract phase is the only genuinely irreversible step in the whole pattern**, which is exactly why it happens last, and only after everything else has been validated in production.


---


## 3. Backfilling Billions of Rows


**Why you can’t just run one giant** **`UPDATE`****:** a single `UPDATE users SET given_name = first_name;` across 2 billion rows holds locks the whole time, generates a massive transaction log (WAL) burst, and causes serious **replication lag** as replicas struggle to apply that huge burst of changes (directly ties to the WAL/replication notes) — a huge, all-at-once write is exactly the kind of load that overwhelms both locking and replication simultaneously.


### The fix: batching (chunking)


Run the update as **many small transactions** instead of one huge one — e.g., 1,000 rows per batch, with a brief pause between batches to let the database (and replicas) catch their breath.


**Benefits:**
- **Short locks** — each batch only holds a lock for milliseconds, so live queries never get meaningfully stuck.
- **No replication lag spike** — replicas process a steady trickle instead of one huge burst.
- **Resumable** — if the script crashes mid-way, you don’t lose all progress; you just resume from wherever it stopped.


### Keyset pagination — how to track “where you left off”


Use the table’s **primary key** (a sequential `id`), not `OFFSET`:


```sql
UPDATE users SET given_name = first_name WHERE id > 0    AND id <= 1000;
UPDATE users SET given_name = first_name WHERE id > 1000 AND id <= 2000;
-- ...continues in a loop
```


**Why not** **`OFFSET`****?** `OFFSET 1000000 LIMIT 1000` forces the database to scan and discard the first million rows _every single time_ — it gets progressively slower as you go deeper into the table. Because `id` has a primary key index, jumping to `WHERE id > 1000000` is a fast, direct index lookup regardless of how deep into the table you are — this is the entire reason keyset pagination scales and `OFFSET`-based pagination doesn’t.


### Gaps — what the session didn’t cover, worth knowing


**1. Idempotency of the backfill script.** A batch script that crashes and resumes needs to be safe to re-run without corrupting data — e.g., if a batch partially applied before a crash, re-running `UPDATE ... WHERE given_name IS NULL AND id BETWEEN X AND Y` (rather than blindly re-running the same range) ensures already-completed rows are simply skipped (no-op), rather than double-processed. This matters even more for backfills that aren’t simple copies (e.g., computing a derived value) — those need explicit guards against double-application.


**2. Retry/backoff on lock contention.** A batch can occasionally collide with normal application traffic and fail to acquire its lock quickly. Production backfill scripts should catch that failure, back off briefly, and retry the batch — rather than crashing the whole job over one transient contention event.


**3. Throttling based on live system health, not just a fixed sleep.** A fixed `sleep(100ms)` between batches is a reasonable starting point, but a more robust backfill script actively **monitors replication lag** (or database CPU/load) and dynamically slows down if it detects the live system is under strain — rather than blindly running at a fixed pace regardless of what else is happening on the database at that moment.


**4. Verifying backfill correctness before cutover.** Before flipping reads over to the new column (Phase 4), you need actual confidence the backfill is accurate — not just “the script finished.” Common approaches: row-count comparison, checksums/hashing a sample (or all) of both columns, or a **shadow-read verification** — the app briefly reads from both old and new columns on a sample of requests, logs any mismatches, and only proceeds to full cutover once mismatches are at zero for a sustained period.


**5. Tooling — you rarely hand-roll all of this.** For your stack specifically (Java/Spring/Postgres), **Flyway** and **Liquibase** are the standard tools for _versioning and applying_ schema migrations as part of your deployment pipeline (tracking which migrations have run, ordering them, making them repeatable across environments) — they handle the “run this DDL as part of deploy #47” bookkeeping, but you still have to author the actual expand/contract sequence and lock-safe DDL yourself; the tool doesn’t make an unsafe migration safe. For very large MySQL tables specifically, **`gh-ost`** and **`pt-online-schema-change`** exist as dedicated tools that automate a version of the expand/contract + backfill dance (they create a shadow table, backfill it in the background, then atomically swap) — worth knowing these exist by name if MySQL is ever in your stack, since “roll your own expand/contract” is exactly what they’re built to avoid.


---


## 4. Practical / Interview-Level Talking Points

- **The Contract phase is the only truly irreversible step** — everything before it is designed to be rollback-safe. If asked to describe this pattern in an interview, emphasizing _why_ the ordering exists (safety net, not just habit) shows real understanding versus rote memorization of the phase names.
- **`OFFSET`****based pagination for backfills is a common junior mistake** — it looks correct and works fine in testing on a small table, then silently gets exponentially slower in production as the table grows. Recognizing “keyset pagination via primary key” as the fix is a good signal in a system design conversation.
- **`ADD COLUMN ... DEFAULT`** **being “instant” is version-dependent, not universal** — assuming it’s always a fast metadata change (true in modern Postgres for constant defaults) without checking your actual version/default type is a real way to accidentally schedule an outage.
- **Dual-writing needs an explicit decommission plan, not just “add it and forget it”** — teams sometimes leave dual-writes running indefinitely out of caution, quietly paying a permanent double-write cost and carrying stale-looking code. Treat the Contract phase as a task with a deadline, not an optional cleanup.
- **A migration that “usually” completes fast can still be dangerous** — the P99/worst-case matters more than the average, since a migration is exactly the kind of operation that can collide with an unusually long-running transaction and end up waiting far longer than typical. This is precisely why `lock_timeout` matters: it bounds the worst case instead of hoping the average holds.

---


## 5. Quick-Reference Glossary

- **Access Exclusive Lock** — the heaviest lock; blocks all reads and writes on the table while held.
- **`CREATE INDEX CONCURRENTLY`** — builds an index using a lighter lock so live traffic isn’t blocked, at the cost of a longer build time.
- **Expand/Contract (Parallel Change)** — a multi-phase pattern for safely changing schema structure without breaking a live, independently-deployed application.
- **Dual writing** — writing new/updated data to both the old and new schema structures simultaneously, during the transition window.
- **Backfill** — the process of populating the new structure for all _pre-existing_ rows that dual-writing doesn’t cover.
- **Keyset pagination (chunking)** — paginating by primary key range (`WHERE id > X AND id <= Y`) instead of `OFFSET`, so batch lookups stay fast regardless of depth into the table.
- **Cutover** — the deployment step where application reads switch from the old structure to the new one.
- **Contract** — the final, irreversible step of removing the old structure once the new one is fully validated in production.
- **`NOT VALID`** **/** **`VALIDATE CONSTRAINT`** — a two-step Postgres pattern for adding constraints (including `NOT NULL` via a check constraint, or foreign keys) without a single long, fully-blocking validation scan.
- **`lock_timeout`** **/** **`statement_timeout`** — session settings that make a migration fail fast and retriable instead of queuing indefinitely behind a lock or a slow statement.
- **Idempotent backfill** — a batch script safe to re-run without corrupting data, typically by explicitly skipping already-completed rows.
- **Shadow-read verification** — reading from both old and new structures on a sample of live traffic to confirm correctness before committing to cutover.
- **Flyway / Liquibase** — standard JVM-ecosystem tools for versioning and applying schema migrations as part of a deployment pipeline.
- **`gh-ost`** **/** **`pt-online-schema-change`** — dedicated MySQL tools that automate shadow-table-based online schema changes, encapsulating a version of the expand/contract + backfill pattern.
