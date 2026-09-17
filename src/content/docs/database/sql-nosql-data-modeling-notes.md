---
title: "sql-nosql-data-modeling-notes"
---


# Data Modeling — SQL & NoSQL — Complete Notes


## 0. The Core Mental Shift

- **SQL models entities.** “What _is_ a User? What _is_ an Order?” Data is normalized to avoid duplication; queries stitch entities together via `JOIN`.
- **NoSQL models queries.** “What does this exact screen need to display?” Data is denormalized and pre-shaped to match specific access patterns.

**Analogy:** SQL is a grocery store — perfectly organized by category, but making a hamburger means walking to five aisles (joins). NoSQL is a meal-prep kit — everything needed for one specific meal is pre-packaged together in one box (a single document/read).


**The golden rule of NoSQL modeling:** _data that is read together should be stored together._ Every NoSQL design decision below is really just this rule applied to a specific problem.


---


## 1. Advanced Relational (SQL) Modeling


### 1.1 Normalization — quick primer (gap, only implied in session)


Standard textbook progression, worth being able to state precisely:
- **1NF** — atomic values only (no comma-separated lists crammed into one column).
- **2NF** — every non-key column depends on the _whole_ primary key (matters for composite keys).
- **3NF** — no column depends on another _non-key_ column (eliminates transitive dependencies).


Most production schemas target 3NF by default — it’s the “safe baseline” that avoids update/insert/delete anomalies. Everything in this section is about **deliberately, knowingly breaking 3NF** for specific, justified reasons — not about not knowing the rules.


### 1.2 Strategic Denormalization — the point-in-time trap


**Scenario:** an e-commerce schema normalized into `users`, `products`, `orders`, `order_items`. A receipt is computed by joining `order_items` to `products` and multiplying `quantity × current_price`.


**The flaw isn’t just performance — it’s correctness.** If `products.current_price` changes (a sale, a price increase), **every historical receipt silently changes too**, because the join always reads the _current_ price, not the price at time of purchase.


**Fix:** duplicate the relevant data at the moment of the transaction — add `price_at_purchase` (and often `product_name_at_purchase`) directly onto `order_items`. This is **strategic denormalization**: intentionally storing a redundant copy because the _business meaning_ of the data is fundamentally point-in-time, not “always reflect the current source of truth.” Bonus: fewer joins needed for the common “load a receipt” read path.


**General principle:** denormalize when the data represents a **historical fact** (what happened) rather than a **current state** (what is true now) — facts shouldn’t retroactively change; state can.


### 1.3 Polymorphic Associations & the Exclusive Arc


**Scenario:** comments can belong to a Video, Article, or Photo — three separate tables.


**Naive approach — generic polymorphic association:** a single `media_id` + `media_type` column pair on `comments`. Flexible (adding a `Podcasts` table later needs zero schema change to `comments`), but **you cannot create a standard Foreign Key** — SQL FKs must point at exactly one target table, not “whichever table `media_type` says.” Result: **no referential integrity** — deleting a video doesn’t automatically clean up its comments; your application code becomes fully responsible, which is a well-known source of orphaned-data bugs.


**Fix — Exclusive Arc pattern:** replace the generic pair with **three separate, nullable FK columns** (`video_id`, `article_id`, `photo_id`), each with a real Foreign Key to its own table. Add a `CHECK` constraint to enforce that **exactly one** is populated:


```sql
CHECK (
  (video_id IS NOT NULL)::int +
  (article_id IS NOT NULL)::int +
  (photo_id IS NOT NULL)::int = 1
)
```


Gets you both flexibility _and_ full referential integrity — at the cost of a schema change (a new nullable column + updated CHECK) whenever a new commentable entity type is added, unlike the fully generic version.


**Gap — the alternative pattern, worth knowing by name:** **Single Table Inheritance (STI)** — one shared table with a `type` discriminator column and a superset of all possible columns (many left NULL per row) — versus **Class Table Inheritance** — a shared base table plus one subtype table per entity type, joined by shared ID. Both are common alternatives to the exclusive arc, each with their own trade-offs (STI: simple but sparse/wasteful; Class Table Inheritance: normalized but requires a join to get full details). Worth knowing these exist so “exclusive arc” isn’t presented as the _only_ answer to polymorphic modeling in an interview.


### 1.4 Concurrency Control: Preventing Race Conditions


**Scenario:** last VIP ticket, two users buy simultaneously. A naive `SELECT` then `UPDATE` lets both succeed — overselling.


**Pessimistic Locking —** **`SELECT ... FOR UPDATE`****:**


```sql
SELECT quantity FROM tickets WHERE id = 1 FOR UPDATE;
```


Immediately locks the row. A second transaction’s identical query **physically waits** until the first commits or rolls back. Simple and airtight, but every contending transaction pays a wait — appropriate when conflicts are **expected to be frequent** on the same rows (this is exactly the pessimistic-vs-optimistic trade-off from the transactions/isolation notes, applied here at the application-query level rather than the isolation-level).


**Optimistic Locking — version column:**
1. Add a `version` (or `updated_at`) column to the table.
2. Read normally: `SELECT quantity, version FROM tickets WHERE id = 1;` — no lock taken.
3. On write, **condition the update on the version you originally read**:


```sql
UPDATE tickets SET quantity = 0, version = 2
WHERE id = 1 AND version = 1;
```

- If nobody else wrote in between, the row still has `version = 1` → the update matches, succeeds, and bumps the version.
- If someone else already committed a change (bumping the row to `version = 2`), this `WHERE` clause matches **zero rows** — the update silently affects nothing.
- **Application code must explicitly check the affected-row count.** Zero rows updated = someone else won the race; the app then tells the user “sold out” (or retries, depending on the operation).

**When to choose which:** optimistic locking assumes collisions are rare and avoids ever blocking readers/writers — better throughput under low contention. Pessimistic locking is safer and simpler to reason about when the _same_ row is genuinely likely to be contended (e.g., a single limited-inventory item during a flash sale) — optimistic locking under heavy contention just means most requests fail their version check and have to retry, which can itself become wasteful churn.


### 1.5 Gap — the hybrid option: JSON columns in SQL


Modern relational databases (Postgres `JSONB`, MySQL `JSON`) let you store semi-structured or genuinely variable-shape data **inside a relational table**, queryable and indexable (Postgres supports GIN indexes on `JSONB`). This is a real, common middle ground — e.g., storing a flexible `attributes` blob on a `products` row for category-specific fields (a shirt has `size`/`color`; a book has `isbn`/`author`) without either a sprawling sparse-columns table or a full move to a document database. Worth knowing this exists so “SQL vs NoSQL” isn’t presented as a strict binary — it’s genuinely common to use both within a single Postgres database.


---


## 2. NoSQL Design Patterns


### 2.1 Embedding vs. Referencing


**Embedding** — nest related data directly inside the parent document. Fast: one read gets everything. But documents have hard size limits (e.g., MongoDB’s 16MB) — the **Unbounded Array Anti-pattern**: embedding an array that can grow without bound (e.g., all reviews for a viral product) eventually hits the cap and starts **rejecting writes**.


**Referencing** — store a separate collection, link by ID (closer to SQL). Avoids the size problem, but costs you the single-read speed advantage — back to multiple queries.


### 2.2 The Subset Pattern — the compromise


Look at what the **UI actually needs on first load** — e.g., a product page shows only the 10 most recent reviews initially, with a separate “see all” action.
- **Embed only the subset** (10 most recent reviews) directly in the Product document — fast initial load, stays well under size limits.
- **Store the complete set** in a separate `Reviews` collection — the full archive, queried only when the user asks for more.


**Important detail (the part worth being explicit about):** the embedded subset is **not** a reference — it’s a **full duplicate** of those 10 reviews’ data, stored in two places simultaneously. This is deliberate denormalization, not a shortcut.


**Keeping the subset correct on write:** when a new review arrives, the app must (1) insert the full review into the `Reviews` collection, **and** (2) push it into the Product document’s embedded array while **evicting the oldest** entry to keep the subset bounded. MongoDB has native operators for exactly this (`$push` with `$slice` to cap array length in one atomic update) — worth knowing the mechanism has first-class database support rather than requiring a manual read-modify-write.


### 2.3 The Real Cost of Denormalization: Write Fan-Out


If a piece of data (e.g., a user’s `display_name`) is duplicated across five different documents/screens for read speed, an update to that value means the backend must **track down and update every duplicate**.


**Gap — how this is actually solved at scale (the session named the problem but not the mechanism):** you rarely do this fan-out synchronously and inline with the user’s edit request — that would make a simple profile update block on writing to five (or five hundred) other locations. In practice:
- **Asynchronous, event-driven fan-out** — the update publishes an event (e.g., to Kafka, ties directly to your CDC/logical-replication notes), and separate consumers update each duplicated location in the background. The user’s own edit succeeds immediately; the duplicates catch up shortly after — an explicit acceptance of **eventual consistency** on the duplicated copies.
- **Accept staleness where it’s genuinely fine** — e.g., a display name showing briefly stale on an old chat message is usually an acceptable trade-off; the alternative (blocking every write on a full fan-out) usually isn’t worth the latency cost for cosmetic data.
- This is the direct, practical answer to “what happens when duplicated data needs to update” — and it’s the same asynchronous-propagation shape as multi-leader replication conflict handling and CDC pipelines from your other notes; the pattern recurs constantly once you’re comfortable spotting it.


### 2.4 Partition Key Design & Hot Partitions


Wide-column/key-value stores (Cassandra, DynamoDB) split data across many physical nodes using a **Partition Key**. Every row sharing a partition key lives on the same physical node.


**Scenario:** a chat app partitions by `channel_id`. A single viral channel with millions of active users sends all its traffic to **one physical server**, while the other 99 sit idle — a **Hot Partition**, destroying the entire point of horizontal scaling.


**Wrong fix — append** **`user_id`****:** spreads _writes_ well, but breaks the natural read pattern (“give me the 50 most recent messages in this channel”) — with data scattered by user, that query would need to scan every user’s partition and merge/sort in memory. This is exactly the read-vs-write tension partition key design always involves.


**Right fix — append a time bucket:** compound key like `channel_id#2026-08-06` (day-level, or hour-level for even higher-volume channels). Naturally chops an unbounded channel into manageable, time-ordered chunks — each day’s messages land on a fresh partition, and “most recent messages” stays a fast, single-partition query since messages near “now” are naturally co-located.


**General principle:** a good partition key needs to satisfy **two simultaneous constraints** — spread load evenly across nodes (avoid hot spots) **and** keep data that’s queried together physically co-located (avoid scatter-gather reads). These two goals are often in tension, and resolving that tension is the actual skill, not just “pick something with high cardinality.”


### 2.5 Gap — Single-Table Design (the DynamoDB-specific deep end)


Not covered in the session, but essential for anyone doing real DynamoDB work: DynamoDB’s query model is deliberately restrictive (efficient lookups only by partition key, optionally + sort key range), which pushes practitioners toward **jamming multiple, unrelated entity types into one physical table**, using **generic, overloaded key names** (`PK`, `SK`) whose _meaning_ differs by row:


```plain text
PK: USER#123        SK: PROFILE           → user's own profile data
PK: USER#123        SK: ORDER#456         → one of that user's orders
PK: ORDER#456        SK: ITEM#1           → a line item on that order
```


This lets a single `Query` (e.g., “everything with `PK = USER#123`”) retrieve a user’s profile _and_ all their orders in one request — the “meal-prep kit” principle taken to its logical extreme. It’s powerful but has a real learning curve and makes the table close to unreadable without accompanying documentation/access-pattern diagrams — worth knowing the name and shape of this pattern, since it’s the single most distinctive thing about serious DynamoDB modeling versus MongoDB-style multi-collection modeling.


**Directly connected principle — enumerate access patterns** _**before**_ **modeling.** In NoSQL specifically (much more than SQL), you’re expected to list out every query your application will ever run _before_ designing the schema — because unlike SQL, you generally can’t cheaply add a new query pattern later without either a new index or a data-model change. “What are all my access patterns” is a genuinely load-bearing first step, not an afterthought.


---


## 3. The Architectural Choice


### 3.1 CAP Theorem


In a distributed system, you can only fully guarantee **two of three**:
- **Consistency (C)** — every read reflects the most recent write.
- **Availability (A)** — every request gets a non-error response, even if the data might be stale.
- **Partition Tolerance (P)** — the system keeps operating despite network failures between nodes.


**Since modern distributed systems must tolerate network partitions (P is non-negotiable in practice), the real choice is C vs. A** when a partition actually occurs.

- **Banking / payments → Consistency.** A transfer must be atomic and immediately reflected everywhere — “eventual consistency” on money is unacceptable (my balance decreasing before your balance increases, visibly, would cause real panic and real bugs).
- **Social feeds, view counters, chat → Availability.** Staying online and fast matters more than every user seeing the exact same view-count at the exact same millisecond.

**SQL databases traditionally lean toward Consistency** (ACID transactions guarantee complex multi-table updates succeed or fail as one atomic unit). **NoSQL databases traditionally lean toward Availability** — the trade-off underlying “eventually consistent” state.


### 3.2 Gap — BASE and PACELC (not covered in session)

- **BASE** is the NoSQL-side counterpart to ACID, worth being able to state explicitly: **B**asically **A**vailable, **S**oft state (data may change over time even without new input, as it propagates), **E**ventually consistent. It’s less a rigorous standard than a description of the trade-off NoSQL systems accept.
- **PACELC** extends CAP with an important nuance CAP alone misses: **even when there’s no partition at all**, you still face a trade-off between **L**atency and **C**onsistency on every single request — “if Partitioned, choose Availability or Consistency; **Else** (normal operation), choose Latency or Consistency.” This matters because CAP only describes behavior _during_ a partition, but the C-vs-latency trade-off is present in a well-behaved system’s _everyday_ operation too — e.g., a synchronous multi-region write for strong consistency costs real latency even with zero network problems. Worth naming this explicitly in a system design interview, since CAP alone is a genuinely incomplete model of the actual trade-offs.

### 3.3 Polyglot Persistence


**The real-world answer is rarely “pick one.”** A single application commonly uses **multiple database types**, each matched to a specific subsystem’s actual requirements.

> **Worked example — ride-sharing app (Uber-style):** billing/payment records → **SQL** (strict consistency, ACID transactions for money). Real-time GPS coordinates flooding in every second from thousands of drivers → **NoSQL** (massive write throughput, availability over strict consistency, data is inherently ephemeral/append-heavy).

This is **Polyglot Persistence** — using the right storage paradigm per subsystem rather than forcing one database technology to serve every need. It’s exactly how large-scale systems (Uber, Netflix, Amazon) are actually built in practice, and a senior-level answer to “which database should we use” is very often “it depends which subsystem — here’s the breakdown,” not a single universal pick.


---


## 4. Practical / Interview-Level Talking Points

- **Denormalize for** _**facts**_**, not** _**state**_**.** The `price_at_purchase` pattern generalizes: anything representing “what was true at a specific past moment” should be captured then, not recomputed later from current data that might have changed.
- **Referential integrity is a real cost of flexible polymorphic modeling** — know the exclusive-arc pattern by name and be able to explain _why_ a plain `media_id + media_type` pair can’t have a database-level FK; this is a very common real interview probe.
- **Optimistic vs. pessimistic locking is a contention-frequency decision**, not a “which is better” question — be ready to justify the choice based on expected collision rate on the specific row/resource in question.
- **“Update everywhere” (write fan-out) always needs an actual mechanism** — if you propose heavy denormalization in a design interview, immediately follow it with _how_ duplicates stay in sync (async events/CDC, accepted staleness window) — proposing denormalization without addressing propagation is an incomplete answer.
- **Partition key design is a two-constraint optimization, not a single “pick high cardinality” rule** — always articulate both the write-distribution goal and the read-locality goal, and show the tension between them (the `user_id` vs. `channel_id#date` example is the canonical way to demonstrate this).
- **PACELC > CAP as a mental model** for describing real trade-offs, since CAP only describes partition-time behavior — bring up the everyday latency-vs-consistency trade-off too, since it’s present even when nothing is broken.
- **Polyglot persistence is usually the mature answer**, not a single-database religious choice — “SQL vs NoSQL” as a company-wide decision is often the wrong framing; “which database for which subsystem” is the senior framing.

---


## 5. Quick-Reference Glossary

- **Normalization (1NF/2NF/3NF)** — progressively eliminating data redundancy and update anomalies; the “default” baseline before deliberate denormalization.
- **Strategic denormalization** — intentionally duplicating data, typically to preserve point-in-time historical accuracy or reduce join cost.
- **Polymorphic association** — a single FK-like column (+ type discriminator) that can reference multiple different tables; flexible but breaks standard Foreign Key constraints.
- **Exclusive Arc** — multiple separate nullable FK columns plus a `CHECK` constraint ensuring exactly one is populated; restores referential integrity for polymorphic relationships.
- **Single Table Inheritance / Class Table Inheritance** — two alternative patterns for modeling entity subtypes in SQL, each with different sparsity/join trade-offs.
- **Pessimistic locking (****`SELECT ... FOR UPDATE`****)** — locks a row immediately on read to prevent concurrent modification; other transactions block and wait.
- **Optimistic locking (version column)** — no lock on read; the write is conditioned on the version matching what was originally read, and fails (zero rows affected) if someone else won the race.
- **JSONB / semi-structured columns** — storing variable-shape data inside a relational table as a middle ground between rigid SQL and fully schemaless NoSQL.
- **Embedding** — nesting related data directly inside a parent document for single-read speed; risks the Unbounded Array Anti-pattern.
- **Referencing** — storing related data in a separate collection, linked by ID; avoids size limits, costs read speed.
- **Unbounded Array Anti-pattern** — embedding a collection that can grow without limit, eventually hitting the document size cap and rejecting writes.
- **Subset Pattern** — embedding only a bounded, UI-relevant slice (e.g., 10 most recent items) while keeping the full set in a separate collection.
- **Write fan-out** — the requirement to update every duplicated copy of a piece of data when its source value changes; typically solved with asynchronous, event-driven propagation rather than a synchronous update-everywhere.
- **Hot Partition (Hot Spot)** — a single partition/node receiving disproportionate load due to poor partition key choice, negating horizontal scalability.
- **Compound/composite partition key** — combining a natural entity key with a secondary attribute (e.g., a time bucket) to balance write distribution against read locality.
- **Single-Table Design** — a DynamoDB-specific pattern of storing multiple unrelated entity types in one physical table using generic, overloaded key attributes (`PK`/`SK`), optimized around enumerated access patterns.
- **Access pattern enumeration** — listing every query the application will ever need _before_ designing a NoSQL schema, since new query patterns are expensive to retrofit later.
- **CAP Theorem** — a distributed system can guarantee at most two of Consistency, Availability, Partition Tolerance simultaneously.
- **BASE** — Basically Available, Soft state, Eventually consistent; the NoSQL-side counterpart to ACID.
- **PACELC** — extends CAP: even absent a partition, systems trade Latency against Consistency during normal operation.
- **Polyglot Persistence** — using multiple different database technologies within one system, each matched to a specific subsystem’s actual requirements, rather than one database for everything.
