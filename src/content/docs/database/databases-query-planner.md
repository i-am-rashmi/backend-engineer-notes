---
title: "Databases : Query planner"
---


When you write a SQL query, you are just writing a string of text. You are telling the database _what_ you want, but you aren't telling it _how_ to get it.


Think of the database like a GPS navigation app 🗺️. You type in your destination, and the database has to figure out the fastest route to get you there, considering traffic, road closures, and distance.


When your query hits the database, it goes through three main phases:

1. **The Parser:** Checks your grammar. Did you spell `SELECT` correctly? Does the table actually exist?
2. **The Optimizer (The Brain):** Looks at all the possible ways to fetch the data and calculates the "cost" of each route. It picks the cheapest/fastest one.
3. **The Executor:** Takes the winning plan from the Optimizer and actually runs the operations (scanning disks, looking up indexes, joining tables).

The true magic happens in the **Optimizer**. It has to make incredibly complex decisions in a matter of milliseconds. 


A useful mental split:


```plain text
Client sends query
     ↓
Query Parser (turns SQL into an internal representation)
     ↓
Query Planner/Optimizer (decides HOW to execute it — which index, join order, etc.)
     ↓
Execution Engine (runs the plan)
     ↓
Storage Engine  ← this is what we've actually been discussing
     ↓
Disk / Memory
```


Every relational database with a declarative query language (SQL) needs to translate "what you want" into "how to get it." That translation layer is the query planner/optimizer. The core ideas are the same everywhere:

- Parse the query into a logical tree
- Enumerate possible physical execution strategies (which index, which join order, which join algorithm)
- Estimate cost of each strategy using statistics about the data
- Pick the cheapest one

Where databases differ is **how they estimate cost, how much of the search space they explore, and how much control they give you.**


# Query Planner — Complete Notes (SQL → NoSQL)


## 0. The Big Picture: Query Journey


```plain text
Query Parser → Query Planner/Optimizer → Execution Engine → Storage Engine → Disk/Memory
```

- **Parser**: checks syntax (is the SQL well-formed?) and semantics (do the tables/columns exist, do you have permission?). Fails here = rejected before any planning happens.
- **Planner/Optimizer**: the “GPS” — decides _how_ to fetch what you asked for. Builds a logical plan, then picks a physical plan based on cost.
- **Execution Engine**: the “driver” — follows the chosen plan, does filtering, aggregation, sorting.
- **Storage Engine**: the layer that actually reads/writes bytes to disk/memory (B-trees, LSM trees, etc.)

The planner only exists because SQL is **declarative** (you say _what_, not _how_). This is the root reason NoSQL databases can drop or shrink this layer — see Section 6.


---


## 1. Logical Plans & Relational Algebra


SQL text → **parse tree** → **logical plan** (abstract operator tree) before any physical decisions are made.


Core logical operators:
- **Selection (σ)** — filtering rows (`WHERE age > 21`)
- **Projection (π)** — choosing columns (`SELECT name`)
- **Scan / Join** — accessing or combining tables


**Ordering matters**: Filter must happen _before_ Projection. If you project away a column first, you can’t filter on it afterward — the data’s gone. Logical flow: `Scan → Filter → Project`.


---


## 2. Statistics & Cardinality Estimation


The planner needs to **predict row counts** before running anything — counting a billion rows live isn’t feasible in milliseconds. So it samples data in the background and builds:


### Most Common Values (MCV) list


For low-cardinality columns (e.g. `status`), the planner just memorizes frequencies: “active = 95%, inactive = 5%.”


### Histograms


For high-cardinality columns (e.g. `age`, `price`), data is sorted and split into equal-sized buckets:
- Bucket 1: ages 18–24 (10% of rows)
- Bucket 2: ages 25–29 (10% of rows)
- …


This lets the planner estimate selectivity for range queries (`age BETWEEN 20 AND 25`) without scanning.


### Selectivity — the core concept


**Selectivity = % of the table a query returns.**
- High selectivity (query returns most of the table) → Full Table Scan wins (sequential I/O beats constant random jumps).
- Low selectivity (query returns a small slice) → Index Scan wins (few random jumps beats reading everything).


**Worked example:** 1M users, 950K active / 50K inactive, B-tree index on `status`.
- `WHERE status = 'active'` → **Full Table Scan** (950K random jumps to fetch full rows would cost more than reading the whole table once).
- `WHERE status = 'inactive'` → **Index Scan** (only 50K jumps needed).


### The Column Independence blind spot


By default, planners assume columns are **statistically independent** — like flipping unrelated coins.


**Example:** `city = 'Seattle' AND state = 'Washington'`, where Seattle = 1% of rows, Washington = 2% of rows.
- Planner’s (wrong) math: `0.01 × 0.02 = 0.0002` → estimates ~200 matching rows out of 1M.
- Reality: anyone in Seattle is automatically in Washington → correlation is 100% → actual match = 10,000 rows (50x underestimate).


**Consequence:** underestimating rows can make the planner allocate too little memory for execution, causing a **disk spill** (see Section 4) and a query that “suddenly” grinds to a halt in production.


**Fix — Extended Statistics** (PostgreSQL syntax, concept generalizes):


```sql
CREATE STATISTICS city_state_stats (dependencies)
ON city, state FROM users;
ANALYZE users;
```


This tells the planner to compute joint statistics for correlated columns instead of multiplying independent probabilities.


### Stale statistics trap


Statistics are only as good as the last background refresh. If a bulk delete/insert happens and stats haven’t been recalculated yet, the planner works from **outdated memory** and picks the wrong physical plan (e.g., still assumes 95% active after 80% of active rows were just deleted → wrongly chooses a Full Table Scan).


**Fix:** routine maintenance that forces stat recalculation (e.g., `ANALYZE` / `VACUUM ANALYZE` in Postgres) — this is a first-class architect responsibility, not a one-time setup step.


---


## 3. Physical Costing


Once cardinality is estimated, the planner assigns an abstract **cost score** — a unitless mix of CPU and I/O effort, **not milliseconds**.


Two dominant cost factors:
- **CPU processing** — very cheap (nanoseconds)
- **Disk I/O** — expensive (milliseconds); the real cost driver


Disk I/O splits further into:
- **Sequential read** — reading blocks in physical order (Full Table Scan). Cheap baseline.
- **Random read** — jumping to scattered blocks (Index Scan). Penalized heavily.


**PostgreSQL example cost constants** (illustrative of the general concept, not universal):
- `cpu_tuple_cost = 0.01`
- `seq_page_cost = 1.0`
- `random_page_cost = 4.0`


### Why this matters for hardware architecture


These defaults assume spinning HDDs, where a physical arm has to mechanically swing to reach random data — genuinely ~4x slower than sequential reads.


On modern **NVMe SSDs** (no moving parts), random and sequential reads cost roughly the same. If you leave `random_page_cost` at HDD-era defaults, the planner stays artificially “scared” of indexes and keeps choosing Full Table Scans even when an index would be faster.


**Architect action:** lower `random_page_cost` toward ~1.1–1.2 after migrating to SSD-backed storage, so the planner’s cost model matches the real hardware.


---


## 4. Join Algorithms


When you write a JOIN, you specify _what_ to combine — the planner decides _how_. Three physical strategies:


### Nested Loop Join (the exhaustive search)


Take each row from Table A, scan all of Table B looking for a match; repeat for every row in A.
- Cost: `|A| × |B|` comparisons in the worst case (no index).
- Example: 1,000 × 1,000 rows = 1,000,000 comparisons. At 10,000 rows each → 100,000,000 comparisons (quadratic blowup).
- **Index Nested Loop**: if the inner table has an index on the join key, this collapses to near-instant lookups instead of a full scan — cheap and common for small outer sets.
- Best when one side is small or well-indexed.


### Hash Join (the mailroom / dictionary)

1. **Build phase**: load the smaller table’s join keys into an in-memory hash map (“numbered mailboxes”).
2. **Probe phase**: scan the larger table once, looking up matches in the hash map instantly.
- Great for large, unsorted equality joins.
- Bounded by memory (`work_mem` in Postgres, similarly named settings elsewhere). If the hash table doesn’t fit in the memory budget, it **spills to disk** — the query then grinds to a halt because disk is far slower than RAM.
- **Fix for spills:** raise the memory limit (session-scoped for one heavy report, not globally) or fix the cardinality estimate that caused the planner to under-allocate memory in the first place.

### Merge Join (the zipper)


Requires both inputs **pre-sorted** by the join key (either via `ORDER BY`, a sorted index, or an explicit sort step).
- Walk both sorted lists with a pointer each, matching in one smooth pass — no loops, no memory-hungry hash table.
- Efficient at scale, especially when data is already sorted (e.g., via a B-tree index) or too large to build a hash table in memory.
- A B-tree index is the natural “best friend” of Merge Join since it can deliver data pre-sorted for free.


### Choosing join order for multi-table queries


For N tables, there are N! possible join orders. The planner must find the cheapest one:
- **Small joins (≤ ~8 tables, Postgres default** **`join_collapse_limit`****)**: exhaustive search via **Dynamic Programming** — every ordering is costed and the cheapest wins.
- **Large joins (beyond that threshold, e.g. 10+ tables → 3.6M+ orderings)**: exhaustive search becomes too slow to be useful, so the planner switches to a **heuristic/approximate search**. PostgreSQL specifically uses **GEQO (Genetic Query Optimizer)** — it evolves a population of candidate join orders (generate → evaluate → “breed” the best → mutate → repeat) to find a “good enough” plan in milliseconds instead of an optimal one in minutes.


---


## 5. Diagnostics: Reading `EXPLAIN` / `EXPLAIN ANALYZE`

- **`EXPLAIN`** — shows the planner’s chosen route and its **estimated** costs/rows, without running the query.
- **`EXPLAIN ANALYZE`** — actually **executes** the query and shows both estimated _and_ actual rows/time, so you can compare the planner’s guess to reality.

**⚠️ Caution:** never run `EXPLAIN ANALYZE` on `DELETE`/`UPDATE` in production without wrapping it in a transaction you intend to roll back — it really executes the statement.


### What to look for


The single biggest diagnostic signal: **estimated rows vs. actual rows**. A large gap (e.g., estimated 50, actual 50,000) means the planner is “flying blind” on stale or insufficient statistics — and it may have picked an entirely wrong join algorithm as a result.


**Worked example from a real incident:**


```plain text
Nested Loop (cost=0.50..12450.00 rows=5 width=45) (actual time=0.050..15400.230 rows=50000 loops=1)
  -> Seq Scan on customers c (cost=0.00..250.00 rows=50 width=20) (actual time=0.015..5.100 rows=50000 loops=1)
        Filter: (status = 'ACTIVE')
        Rows Removed by Filter: 10000
  -> Index Scan using idx_orders_customer_id on orders o (cost=0.50..240.00 rows=1 width=25) (actual time=0.200..0.305 rows=1 loops=50000)
        Index Cond: (customer_id = c.id)
        Filter: (total_amount > 1000)
```

- Planner estimated 50 active customers → actual was 50,000 → stats were badly stale.
- Because it thought there were only 50 outer rows, it chose a **Nested Loop** (fine for 50 loops, catastrophic for 50,000 loops into an index scan → 15+ seconds).
- **Fix:** run `ANALYZE customers;` to refresh stats. With accurate cardinality, the planner would likely switch to a **Hash Join** instead, since it’s designed for large-large joins via an in-memory dictionary rather than repeated looping.

---


## 6. Architect-Level Mechanics


### Parameter Sniffing (cached plan problem)


Applications typically use **prepared statements** (a parameterized template sent once, reused many times) rather than raw SQL strings, to save repeated parsing/planning overhead:


```sql
SELECT * FROM users WHERE city = $1;
```


The planner builds a physical plan based on the **first parameter value it sees**, then caches it for reuse.


**Failure mode:** if the first call is for a rare value (e.g., “Seattle”, 1% of rows), the planner caches an **Index Scan**. If the next 5,000 calls are for a common value (e.g., “New York”, 99% of rows), the database blindly reuses that Index Scan plan — forcing enormous random I/O when a Full Table Scan would have been dramatically faster.


**Fixes:** force re-planning per execution for highly skewed columns, or write separate statements/branches for known skewed cases. (Note: SQL Server treats this as a first-class, heavily documented phenomenon with dedicated tooling like Query Store; Postgres and others have the same underlying issue with less built-in tooling around it.)


### Adaptive Query Optimization (gap in the original session — worth knowing)


Some databases go a step further than static plan caching: **Oracle’s Adaptive Query Optimization** (12c+) can actually change join methods _mid-execution_ if initial cardinality estimates turn out to be wrong at runtime, rather than waiting for the next query to re-plan. Most other major RDBMS (Postgres, MySQL, SQL Server) commit to a plan at the start and don’t adapt mid-flight — worth knowing this is not universal.


### Plan stability


Oracle’s **SQL Plan Baselines** let you pin a known-good plan so a stats refresh or data change can’t silently regress performance by picking a new, worse plan. This “plan stability as a feature” concept doesn’t have a close equivalent in vanilla Postgres.


### Cost-Based Optimizer (CBO) — the umbrella term


Everything above (statistics-driven cost estimation, selecting the cheapest physical plan) is what’s meant by calling a planner a **Cost-Based Optimizer**. This is the dominant model across virtually all mainstream RDBMS today (older “rule-based” optimizers that ignored data statistics are effectively deprecated/legacy).


### Distributed planning (gap — flagged, not covered in depth in the session)


In distributed SQL systems (e.g., CockroachDB, Google Spanner, Citus/Postgres sharding), the planner has an _additional_ job beyond single-node costing: deciding **where** each part of a join/scan should physically execute (which shard/node holds the data) and how to minimize cross-node data movement — often the single biggest cost factor in a distributed plan, bigger than CPU or local disk I/O. This is a natural next topic if you want to go deeper architecturally.


---


## 7. NoSQL: How the Same Layers Change


The universal driver: **the less flexible the query interface, the more “optimization” shifts from runtime (engine decides) to design-time (you decide when modeling data).**


### Document Databases (MongoDB)


```plain text
Parser (BSON query object) → Planner (empirical, trial-based) → Execution Engine → Storage Engine (WiredTiger)
```

- **Parsing** is fast — queries arrive as structured objects (`db.users.find({...})`), not text needing conversion into relational algebra.
- **Planning is real but different**: MongoDB doesn’t rely purely on precomputed statistics/cost formulas. For a new query shape, it runs **multiple candidate plans as a live trial** on a small number of documents and picks whichever wins empirically, then **caches** that winning plan for future identical queries (until enough writes happen or an index changes).
- **Advantage:** sidesteps the mathematical estimation errors that plague SQL cost models (like the column-independence problem) — no probability-vs-reality gap, because it’s not estimating, it’s measuring.
- **Disadvantage:** the trial itself costs CPU/RAM (running several candidate plans simultaneously), and a small trial sample can be **unrepresentative** — a plan that wins on the first 10 documents might lose badly across 1,000,000.
- Joins (`$lookup`) exist but are far less central than in SQL, since documents are designed to embed related data rather than normalize it across tables.

### Wide-Column Stores (Cassandra)


```plain text
Parser (CQL) → (no real planner) → Execution Engine (hash-route by partition key) → Storage Engine (LSM tree)
```

- CQL looks SQL-like but **forbids JOIN, GROUP BY, subqueries** — parsing is simple.
- **There is no query planner in the SQL sense.** Instead of modeling data once and letting a planner figure out how to serve arbitrary queries, Cassandra uses **query-driven modeling**: you design a dedicated table (denormalized) for each access pattern up front.
- Execution is close to deterministic: hash the partition key → route directly to the owning node. No cost comparison, no join ordering.
- **Trade-off:** duplicating the same data across multiple tables means a single logical update (e.g., a user’s name change) must be applied to every table that stores it — application-level responsibility, no automatic consistency across the duplicates.
- **Where it’s used:** massive-scale, append-heavy, rarely-updated workloads — IoT sensor streams, chat/message logs (Discord), streaming metrics (Netflix), transaction/audit logging.

### Key-Value Stores (Redis)


```plain text
Command (GET/SET/HGET/...) → Storage Engine (in-memory data structure) → Memory
```

- **No parser in the traditional sense** — no SQL/JSON tree to build, just a direct command lookup (`GET user:100`).
- **Zero query planning** — the database computes exactly where a key lives via a hash map; there’s nothing to compare or optimize between.
- Execution reads straight from RAM, bypassing disk — sub-millisecond latency.
- **Biggest limitation/risk (gap left open in the session — the answer):** since data mostly lives in RAM, you’re bounded by how much RAM you can afford/provision (much more expensive and finite per-GB than disk), and a crash/restart risks **losing data** that hasn’t been persisted — mitigated by mechanisms like RDB snapshots and AOF (Append-Only File) logging, but those add their own overhead and are not on-by-default guarantees in every configuration. In short: Redis trades durability and capacity for raw speed, and an architect has to explicitly re-add durability (persistence, replication) rather than getting it for free the way a disk-backed RDBMS does.

### DynamoDB (bonus — covered briefly earlier in the thread, included for completeness)


```plain text
API call (GetItem/Query/Scan) → Storage Engine (partition routing) → Disk/Memory
```

- No parser (you call an API, not write a query language) and no planner — each API call has exactly one execution strategy:
    - `GetItem` → hash partition key → direct route. O(1)-ish.
    - `Query` → hash partition key, then range-scan the sort key within that partition.
    - `Scan` → linear walk across all partitions — the “no shortcut available” fallback.
- All the “planning” work happens **at schema/index design time** (choosing partition keys, GSIs/LSIs) rather than at query time.

### Summary table


| DB        | Parser                   | Planner                                           | What replaces planning                           |
| --------- | ------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| MongoDB   | Yes (BSON)               | Yes — empirical/trial-based, not cost-model-based | —                                                |
| Cassandra | Yes (CQL, restricted)    | Effectively none                                  | Query-driven table design + partition key choice |
| Redis     | Minimal (command lookup) | None                                              | Data structure choice                            |
| DynamoDB  | Minimal (API call)       | None                                              | Schema/index design at modeling time             |


---


## 8. Quick-Reference Glossary

- **Selectivity** — % of rows a query returns; the single biggest factor in index-vs-scan decisions.
- **Cardinality estimation** — the planner’s predicted row count for a query step.
- **MCV list** — memorized frequencies of common values in a low-cardinality column.
- **Histogram** — bucketed distribution for high-cardinality columns, used to estimate range-query selectivity.
- **Column independence assumption** — the (often wrong) default assumption that filters on different columns are statistically unrelated.
- **Extended statistics** — explicitly telling the planner two+ columns are correlated so it stops multiplying independent probabilities.
- **Cost-Based Optimizer (CBO)** — a planner that assigns abstract cost scores (CPU + I/O) to candidate plans and picks the cheapest.
- **Sequential vs. random I/O** — reading disk blocks in order (cheap) vs. jumping around (expensive on HDD, ~equal on SSD).
- **Nested Loop / Hash Join / Merge Join** — the three physical join algorithms; each has a distinct cost profile and failure mode.
- **Spilling to disk** — when an in-memory operation (hash build, sort) exceeds its memory budget and falls back to slow disk-based temp storage.
- **Dynamic Programming (join order)** — exhaustive costing of all join orderings; feasible only for a small number of tables.
- **Genetic algorithm / GEQO** — heuristic join-order search for large multi-table joins, trading optimality for speed.
- **`EXPLAIN`** **vs** **`EXPLAIN ANALYZE`** — estimated-only plan vs. actual-execution plan with real row counts/timings.
- **Parameter sniffing** — a cached plan built for one parameter value being wrongly reused for very different, differently-skewed values.
- **Adaptive query optimization** — (Oracle) changing the physical plan mid-execution based on real-time cardinality feedback.
- **Plan baselines** — (Oracle) pinning a known-good plan to prevent stat-driven regressions.
- **Query-driven modeling** — (Cassandra) designing a dedicated denormalized table per access pattern instead of relying on a planner.
