---
title: "Databases : ACID and Isolation Levels"
---


# ACID, Transactions & Isolation Levels — Complete Notes


Based on DDIA Chapter 7, extended with the full architect-level deep dive (2PL vs SSI, WAL mechanics, MVCC bloat, 2PC vs Sagas).


---


## 1. What a Transaction Is


A **transaction** groups several reads/writes into a single logical unit so an application doesn’t have to worry about partial failure or concurrent interference. The database promises **ACID** guarantees around that unit.


---


## 2. ACID, One Letter at a Time


### A — Atomicity ⚛️


**“All or nothing.”** If a transaction has multiple steps (e.g., deduct $100 from checking, add $100 to savings) and the database crashes between them, it automatically **rolls back** the completed step rather than leaving the system in a half-done state.

- Without atomicity: a crash mid-transfer makes $100 vanish — deducted from checking, never added to savings.
- Implemented via the database’s **write-ahead log** (Section 6) — on restart, the engine replays or rolls back in-flight transactions based on what was and wasn’t durably logged.

### C — Consistency ⚖️


The database moves from one **valid application state to another**, per rules _you_ define (e.g., “total money across both accounts must stay constant”). Note: this is the application’s/schema’s notion of consistency (constraints, invariants) — **not** the same “C” used in the CAP theorem, which is about replica agreement. Two unrelated uses of the same word — worth being precise about which one you mean in an interview or design doc.


### I — Isolation 🛡️


Governs what happens when multiple transactions touch overlapping data **at the same time**. This is where nearly all real-world complexity lives — covered in depth below.


### D — Durability 💾


Once a transaction is **committed**, it survives crashes, power loss, and restarts. Implemented via **write-ahead logging (WAL)** — see Section 6 for the full mechanics.


---


## 3. Why Isolation Is Hard: The Core Anomalies


Perfect isolation = run every transaction strictly one-at-a-time. Safe, but far too slow for real workloads. Isolation levels let you trade safety for speed. Each level is defined by which anomalies it prevents.


### Lost Update


Two transactions read the same value, both compute independently, both write — one overwrite silently clobbers the other.
> Shared account with $500. Two ATMs both read $500, both compute `$500 - $400 = $100`, both save `$100`. Reality: $800 was withdrawn, but the bank thinks only $400 was.


### Dirty Read 🕵️


A transaction reads data written by another transaction that **hasn’t committed yet** — and might never commit.
> Transaction A deposits $1,000 (uncommitted). Transaction B reads the inflated balance and approves a purchase. A then rolls back. B just acted on money that officially never existed.
> **Fixed by:** Read Committed (the minimum bar — you only ever see committed data).


### Read Skew / Non-Repeatable Read 📉


Within a single transaction, reading the same logical entity twice gives inconsistent results because another transaction committed a change in between.
> Alice checks Checking ($500), then — before she checks Savings — a committed transfer moves $100 from Savings to Checking. She then reads Savings ($400). Total shown: $900. $100 appears to vanish.
> **Fixed by:** Repeatable Read / **Snapshot Isolation** — the transaction sees a consistent snapshot of the whole database as of the moment it started, so it doesn’t see the employer’s transfer at all, and correctly sees $500 + $500 = $1,000.


### Write Skew 👻


Two transactions **read overlapping data**, then each **write to different rows** based on what they read — individually valid, jointly violates an invariant. Snapshot isolation does **not** catch this, because there’s no direct row-level collision.
> Hospital rule: at least 1 doctor on call. 2 doctors on call. Both call in sick simultaneously. Each transaction’s snapshot sees “2 doctors,” computes `2 - 1 = 1`, satisfies the rule, and commits. Final reality: 0 doctors on call.


### Phantom Read


A transaction reads a _set_ of rows matching a condition (e.g., “count doctors on call”), and another transaction changes which rows match that condition (inserts/deletes, not just updates) before the first finishes. Closely related to write skew — the hospital example is really a phantom-driven write skew.


---


## 4. The Three (Practical) Isolation Levels


| Level                                    | Prevents Dirty Reads? | Prevents Read Skew? | Prevents Write Skew/Phantoms? | Speed   |
| ---------------------------------------- | --------------------- | ------------------- | ----------------------------- | ------- |
| **Read Committed**                       | Yes                   | No                  | No                            | Fastest |
| **Repeatable Read** (Snapshot Isolation) | Yes                   | Yes                 | No                            | Fast    |
| **Serializable**                         | Yes                   | Yes                 | Yes                           | Slowest |

- **Read Committed** — default in most databases (e.g., PostgreSQL). Guarantees you only ever read/overwrite committed data. Nothing more.
- **Repeatable Read / Snapshot Isolation** — takes a consistent snapshot at transaction start; all reads within the transaction see that frozen view regardless of concurrent commits. Solves read skew “for free” without blocking writers.
- **Serializable** — guarantees the outcome is _equivalent to_ some serial (one-at-a-time) execution, even though transactions physically run concurrently. Catches write skew and phantoms.

**Worked example — hospital, under Serializable:** Alice’s transaction commits first (2 → 1 doctors, rule satisfied). When Bob’s transaction tries to commit, the database detects that the data his decision depended on was changed underneath him, and **aborts his transaction with a serialization failure**. His app catches the error, retries, sees 1 doctor left, computes `1 - 1 = 0`, and correctly denies his request.


---


## 5. Setting Isolation Level in Practice + MVCC


Isolation level is set **per transaction**, not globally. Raw SQL:


```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
UPDATE schedule SET status = 'sick' WHERE doctor = 'Alice';
COMMIT;
```


In a backend framework, this is usually just a declared setting — e.g. Spring’s `@Transactional(isolation = SERIALIZABLE)` — the framework issues the equivalent SQL for you. You’re directly telling the engine which rule set applies to that specific block of work.

- **Read-only report** → `REPEATABLE READ`: fast, consistent snapshot, no locking overhead.
- **Critical write with invariants** (e.g., hospital scheduling) → `SERIALIZABLE`: maximum protection against phantoms/write skew.

This mixing works because of **MVCC (Multi-Version Concurrency Control)**: instead of overwriting a row in place, the database keeps **multiple versions** of each row alive simultaneously, each tagged with the transaction that created it. Different concurrent transactions each see the version appropriate to their own snapshot.


**The classic cross-check:** a 5-minute `REPEATABLE READ` report started at T=0, and a `SERIALIZABLE` transaction commits an update to a row at T=1 minute — when the report finally reads that row later, it reads the **old data**, exactly as it existed at T=0. That’s the entire point of snapshot isolation: the report is isolated from every commit after its snapshot was taken, regardless of what isolation level the _other_ transaction used.


---


## 6. How Serializable Is Actually Implemented: 2PL vs SSI


“Serializable” is a _guarantee_, not an implementation. Two dominant real-world mechanisms:


### 🛑 Two-Phase Locking (2PL) — Pessimistic


Assumes collisions are common. Uses physical **shared/exclusive locks** (including **predicate locks** for range/set conditions, to catch phantoms). If Transaction A holds a lock a row/range, Transaction B’s conflicting query **physically waits in a queue** until A finishes.
- Prevents anomalies via **blocking**, not abort-and-retry.
- Prone to **deadlocks** — two transactions each waiting on a lock the other holds. The database detects this via a wait-for graph and kills one transaction to break the cycle.
- Better fit when collisions are frequent — waiting is cheaper than repeatedly aborting and retrying.


### 🏃 Serializable Snapshot Isolation (SSI) — Optimistic


Assumes collisions are rare (this is what PostgreSQL uses for `SERIALIZABLE`). Builds on ordinary snapshot isolation — reads and writes proceed **without locking**. In the background, the database maintains a **dependency graph** using lightweight **siREAD locks** that just record what each active transaction read/wrote, without blocking anyone.
- Right before `COMMIT`, the database checks that dependency graph for a cycle (a pattern that could only occur in a non-serializable execution). If found, it **aborts one transaction** with a specific error — PostgreSQL raises SQL state **`40001`** **(serialization_failure)**.
- The application **must** catch this specific error and retry the transaction from scratch — on retry it reads fresh data and re-evaluates (e.g., Bob’s retried transaction sees 1 doctor left, correctly gets denied).
- **Best practice: add jitter** (a small random delay) before retrying — if many transactions collide and retry simultaneously with no delay, they can collide again on the retry.
- Far better than 2PL when the vast majority of transactions **don’t** actually touch overlapping data (e.g., users updating their own separate profile rows) — no one waits in line for a collision that was never going to happen.


**Operational distinction that matters for on-call work:** a 2PL-style database shows contention as **lock waits** in monitoring (queries stuck, not erroring); an SSI-style database shows contention as **serialization failure errors** the app must retry. Different failure signatures, different runbooks/alerts.


---


## 7. Durability Mechanics: The Write-Ahead Log (WAL)


The hardware problem: updating specific rows inside data files on disk means random seeks (slow). Updating RAM is fast but volatile — a power loss wipes anything not yet on disk.


**The trick: an append-only log.** Appending to the end of a file requires no seeking — it’s a straight sequential write, which is fast even on spinning disk and cheap on SSD.


**Commit sequence:**
1. App sends an `UPDATE`.
2. Database updates the row **in RAM** (the buffer pool).
3. Database **appends** a record of the change to the WAL, on durable storage — sequential write.
4. Database replies “committed” to the app.
5. The actual data file pages (“dirty pages”) are flushed to disk **later, in the background** — this deferred flush is called **checkpointing**. The commit doesn’t wait for it.


**Crash recovery:** if power is lost right after step 4, RAM is wiped — the in-memory update never reached the data files — but the WAL entry survived on disk. On restart, before accepting connections, the database reads the WAL and **replays** every logged action that hadn’t yet made it into the data files.


**How it knows where to start replaying:**
- Every WAL entry gets a unique, ordered **Log Sequence Number (LSN)**.
- Periodically, a **checkpoint** is written: “everything up to LSN #5000 is safely flushed to data files.”
- If the crash happened at LSN #5050, recovery only needs to replay the last 50 entries, not the entire log history.
- The general recovery algorithm family for this replay-and-undo process is known as **ARIES** in the literature.


**Practical tuning implication:** `fsync`-ing the WAL to durable storage is usually the real write-latency bottleneck in OLTP workloads — not the data files themselves (those update lazily). Where the WAL physically lives (fast NVMe, ideally a separate device from data files) and how many transactions get batched into one `fsync` call are real levers. The WAL stream is also typically what **replication** ships to replicas — they just replay the same log.


---


## 8. MVCC Operational Costs: Bloat & Vacuuming


MVCC’s trick for lock-free snapshots: an `UPDATE` doesn’t overwrite a row in place — it **inserts a new tuple** (row version) and marks the old one **dead**, so new transactions simply ignore it. A background process (**`VACUUM`** in PostgreSQL) later reclaims dead tuples.


**The constraint that causes trouble:** `VACUUM` cannot delete a dead row version if **any active transaction might still need it** for its snapshot — determined by the “oldest active transaction” horizon across the whole database.


**Worked scenario:** a busy e-commerce DB does 10,000 updates/minute. An analyst opens a `REPEATABLE READ` report that runs for 4 hours.
- That single open transaction **pins the vacuum horizon** for its entire 4-hour lifetime.
- Every row updated anywhere in the database during those 4 hours has its old version kept around, “just in case” the analyst’s snapshot needs it.
- Result: **massive bloat** —
- 💾 Disk fills with gigabytes of dead tuples.
- 🐢 Indexes bloat too (pointers to dead rows), so even new, unrelated queries slow down — they scan past dead entries to reach live ones.


**Why this matters operationally:** a single forgotten long-running transaction (a developer’s open psql session, an unclosed ORM transaction) can bloat an entire production database overnight — a very real, very common incident category, structurally similar to the stale-statistics trap from query planning: an invisible piece of internal state silently degrading performance until someone investigates.


---


## 9. Distributed Transactions: 2PC vs Sagas


Everything above assumes **one database instance**. Once you split into microservices — e.g., an Order Service and an Inventory Service, each with its own database — single-node ACID no longer spans the boundary. A purchase needs to (a) save the order and (b) deduct inventory, atomically, across two separate databases.


### Two-Phase Commit (2PC) — strong consistency, blocking


A central **Coordinator** runs two phases:
1. **Prepare:** asks every participant, “lock your rows and promise you can commit.” Each replies “Prepared” (locks held) or refuses.
2. **Commit:** once _everyone_ says Prepared, the coordinator broadcasts the final “Commit.”


**The notorious failure mode:** if the Coordinator dies **after** Phase 1 completes (everyone Prepared) but **before** Phase 2 fires, every participant is stuck — they’ve promised not to unilaterally abort or commit, so they **hold their locks indefinitely** waiting for a coordinator that may never come back. Any other transaction touching those locked rows blocks too. This blocking hazard plus network coordination latency is why 2PC is rarely used at scale in modern microservice systems.


### Saga Pattern — eventual consistency, non-blocking


Breaks the distributed transaction into a **chain of independent local transactions**, each committed immediately:
1. Order Service creates the order, commits its **own local transaction** right away.
2. It emits an async message (e.g., via Kafka) to the Inventory Service.
3. Inventory Service deducts stock and commits its **own local transaction**.


No cross-database locks, no blocking — fast and resilient. But **Atomicity is lost across the whole system**: the Order Service already permanently committed step 1 before knowing whether step 3 will succeed.


**If a downstream step fails:** since the upstream commit can’t be rolled back with a database `ROLLBACK` (it’s already durably committed), the system issues a **Compensating Transaction** — a new, separate transaction that semantically undoes the effect. E.g., if Inventory is out of stock, it messages back “Inventory failed,” and Order Service runs a new transaction to mark the order `CANCELLED` and trigger a refund — mirroring what a real store does when an online order turns out to be unfulfillable.


**The trade-off, stated plainly:**
- **2PC** — nobody observes partial progress; strongly consistent; slow and fragile (coordinator is a single point of blocking failure).
- **Saga** — fast, resilient, no single point of blocking; but there’s a real window where the system is **visibly inconsistent** (e.g., the user sees “order confirmed” before possibly getting a cancellation email later). The application has to be designed to tolerate that window.


---


## 10. Practical / Interview-Level Talking Points

- **Isolation level ≠ free lunch.** Higher isolation reduces anomalies but increases lock contention (2PL) or retry/abort rates (SSI). Setting `SERIALIZABLE` everywhere “to be safe” without building retry-with-jitter logic is a common, real anti-pattern — the app will start throwing unhandled `40001` errors under load.
- **Most ORMs default to Read Committed** and don’t surface isolation level as a first-class concern. A senior engineer overrides it **per transaction** for operations that actually need stronger guarantees (transfers, inventory decrements, scheduling constraints) rather than changing it globally.
- **Write skew is the anomaly people forget exists** — the one _not_ caught by Snapshot Isolation. Its shape (two transactions reading overlapping data, writing to disjoint rows) recurs constantly: seat booking, unique-username checks, rate limiting, inventory counts. Recognizing “this is a write-skew shape” is a genuinely transferable pattern-matching skill.
- **Deadlocks are a 2PL-specific failure mode**; SSI-style databases trade deadlocks for serialization-failure retries instead — different operational signature, same underlying root cause (conflicting concurrent access).
- **MVCC bloat and long-running transactions** are an ongoing operational tax, not a one-time setup concern — monitoring “oldest active transaction age” is a real production dashboard metric in Postgres-backed systems.
- **2PC vs Saga is the same fundamental trade-off as CAP-theorem-style consistency/availability discussions**, just expressed at the transaction-protocol level instead of the replication level — worth explicitly drawing that connection in a system design interview.

---


## 11. Quick-Reference Glossary

- **Transaction** — a grouped set of reads/writes treated as one logical unit.
- **Atomicity** — all steps of a transaction succeed, or none do.
- **Consistency (ACID sense)** — the transaction respects application-defined invariants; distinct from CAP’s “C.”
- **Isolation** — how much concurrent transactions are shielded from each other’s in-progress changes.
- **Durability** — once committed, survives crashes (via WAL).
- **Lost Update** — two writers overwrite each other’s work based on stale reads.
- **Dirty Read** — reading another transaction’s uncommitted (possibly-to-be-rolled-back) data.
- **Read Skew (Non-Repeatable Read)** — the same logical read returns different results within one transaction due to concurrent commits.
- **Write Skew** — two transactions read overlapping data, write to disjoint rows, jointly violate an invariant that neither individually violated.
- **Phantom Read** — a row _set_ matching a condition changes underneath a transaction due to concurrent inserts/deletes.
- **Snapshot Isolation** — each transaction sees a frozen view of the database as of its start time.
- **MVCC** — keeping multiple versions of each row so different transactions can see different, consistent snapshots without blocking each other.
- **Two-Phase Locking (2PL)** — pessimistic concurrency control via hold-until-commit locks (including predicate locks for ranges); can deadlock.
- **Predicate lock** — a lock over a _condition/range_ (not just a specific row), needed to prevent phantoms under 2PL.
- **Serializable Snapshot Isolation (SSI)** — optimistic concurrency control; tracks read/write dependencies via siREAD locks and aborts (SQL state `40001`) instead of blocking.
- **Jitter** — a small random delay added before retrying an aborted transaction, to avoid synchronized repeat collisions.
- **Write-Ahead Log (WAL)** — durable, append-only log of changes, written before a commit is acknowledged; basis for crash recovery and replication.
- **LSN (Log Sequence Number)** — unique ordered ID for each WAL entry, used to know exactly where recovery must resume.
- **Checkpointing** — periodically flushing dirty pages from RAM to data files and recording “everything up to this LSN is safe,” to bound recovery replay time.
- **ARIES** — the classical algorithm family for WAL-based crash recovery (analysis, redo, undo).
- **Vacuuming** — reclaiming dead tuple versions once no active transaction’s snapshot could still need them.
- **Bloat** — disk/index growth from dead tuples that can’t yet be vacuumed, often caused by long-running transactions pinning the vacuum horizon.
- **Two-Phase Commit (2PC)** — blocking distributed-transaction protocol using a prepare/commit coordinator; coordinator failure after Prepare leaves participants holding locks indefinitely.
- **Saga pattern** — non-atomic distributed transaction alternative: a chain of independently-committed local transactions plus compensating actions for rollback.
- **Compensating transaction** — a new transaction that semantically undoes the effect of an already-committed one (e.g., cancel + refund instead of a true rollback).
