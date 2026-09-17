---
title: "Apache Kafka : Ordering and Outbox patterns"
---


# Kafka Ordering, the Outbox Pattern & Change Data Capture


Builds on the delivery-semantics notes (idempotent producers, PIDs, sequence numbers) — this covers how ordering actually breaks and gets fixed in practice, and then the architectural pattern for safely getting data out of a traditional database and into Kafka without ever losing or duplicating an event.


---


## 1. Ordering — Key Selection and Its Consequences


As established in the fundamentals, Kafka’s ordering guarantee is strictly per-partition: order is only preserved within a single partition, never across an entire topic. This becomes concrete in a scenario like an e-commerce order lifecycle, where a single purchase triggers three events in rapid succession — `Order_Created`, `Order_Packed`, `Order_Shipped` — sent to an `order-events` topic with 6 partitions.


If no key is attached, the producer defaults to spreading messages round-robin across partitions purely for load balance. That means `Order_Created` might land on Partition 0, `Order_Packed` on Partition 1, and `Order_Shipped` on Partition 2. A consumer group with one consumer per partition, reading in parallel, could easily process `Order_Shipped` before `Order_Created` even exists — the system would be trying to ship an order it doesn’t yet know exists.


The fix is the same Key mechanism covered earlier: hashing an `Order_ID` so every event for that specific order lands on the same partition, preserving its timeline. But _which_ field to use as the key is itself a real architectural decision with consequences that only show up under specific traffic patterns — this is what “key selection consequences” actually means in practice.


### The hot partition trap


Imagine an e-commerce platform hosting many different sellers, and someone chooses `Merchant_ID` as the key instead of `Order_ID`, reasoning that keeping each seller’s own event stream in order is what matters. This works fine until traffic is uneven across merchants — a tiny local shop generating 2 orders a day sits on the same footing as a massive retailer launching a hotly anticipated product and generating 10,000 orders a second. Because every event for that one merchant hashes to the same single partition, that partition’s broker gets hammered — CPU and disk pinned at 100% — while every other broker in the cluster sits nearly idle. This is a **Hot Partition** (or data skew): a key selection choice that made perfect logical sense for the ordering requirement, but created a severe physical imbalance because the underlying data distribution wasn’t actually even across that key’s possible values.


The general principle this points to: a good partition key needs **high cardinality** — many distinct, roughly evenly-distributed values — so that no single value can accidentally absorb a disproportionate share of traffic. `Order_ID` naturally has this property (each order is essentially unique); `Merchant_ID` does not, once merchant sizes vary wildly. This is the same tension that shows up in any distributed partitioning scheme — the key has to satisfy both “keep related things together” and “spread load evenly,” and those two goals can genuinely conflict depending on what the real-world data actually looks like.


---


## 2. Ordering — Reordering on Retry


Even with a perfectly chosen key guaranteeing all of an order’s events land on the same partition, ordering can still break — not from routing, but from the producer’s own retry behavior under network conditions.


To achieve high throughput, Kafka producers don’t wait for one message to be acknowledged before sending the next — they send multiple requests **in-flight** simultaneously. Imagine a producer sends Event A (`Order_Created`) and, a millisecond later, Event B (`Order_Paid`) — both destined for the same partition. If Event A happens to hit a transient network glitch and fails while Event B successfully reaches the broker, the producer detects A’s failure and automatically retries it. If that retry succeeds, Event B is now sitting in the log **before** Event A — even though they were sent in the correct order, and even though both landed on the correct, single partition. The timeline is scrambled purely by the mechanics of retrying under concurrent in-flight requests.


### How the Idempotent Producer fixes this too


This is solved by exactly the same mechanism that solves duplicate delivery: the Producer ID (PID) and per-message Sequence Number from idempotent producers. With idempotence enabled, Event A gets Sequence 0 and Event B gets Sequence 1, both sent concurrently (governed by `max.in.flight.requests.per.connection`). If A’s send fails and the producer retries it while B has already landed, the broker — which tracks exactly which sequence number it expects next for that PID — receives Sequence 1 and realizes it’s still missing Sequence 0. Rather than accepting it out of order, the broker **rejects** Sequence 1 outright with an `OutOfOrderSequence` error.


This forces the producer to resolve the gap before anything else can proceed: it finishes retrying and successfully lands Sequence 0, and only then resends Sequence 1. The final order on disk is correct — 0, then 1 — recovered entirely by the broker refusing to accept an out-of-order sequence number rather than silently allowing the scramble. Enabling the idempotent producer therefore buys you two guarantees from a single mechanism: deduplication of retried messages, and protection against retries reordering the log.


### The producer’s internal bookkeeping — the Record Accumulator


The mechanism above only works because the producer doesn’t discard a message the instant it sends it over the network. Internally, every in-flight, not-yet-acknowledged message sits in the producer’s own memory, in a structure called the **Record Accumulator** — effectively a waiting room the producer uses to track exactly which sequence numbers are currently outstanding.


When the broker rejects Sequence 1 with `OutOfOrderSequence`, the producer checks this internal tracker, recognizes that Sequence 0 (from an earlier batch) is the one still missing, and — because it still has both 0 and 1 sitting safely in the Accumulator — pauses sending anything new to that partition, resends 0, and once that’s acknowledged, automatically resends 1 straight from the buffer. None of this requires any application code to intervene; it’s handled entirely inside the producer client.


Because this buffer holds unacknowledged messages in RAM while waiting for the network to recover, it has a real physical limit that needs to be configured and watched: **`buffer.memory`** (defaulting to 32MB). If the network stays down while the application keeps generating new events, that buffer eventually fills. Once full, the producer **blocks** the application from sending further messages for a configurable window (`max.block.ms`) rather than accepting more work it has nowhere to put — and if the buffer still hasn’t cleared by the time that window expires, it throws a `TimeoutException`. This is a deliberate safety valve, trading a clear, catchable exception for the much worse alternative of the producer’s own process running out of memory and crashing outright.


---


## 3. The Dual-Write Problem


Shift now from producing events directly to a genuinely common architectural situation: a service that owns both a traditional database and a responsibility to notify Kafka when something changes.


Consider a User Service backed by PostgreSQL. When a user updates their email, the code needs to do two things: update the `users` table, and publish a `UserEmailUpdated` event to Kafka so a downstream Marketing Service knows to stop emailing the old address. Written naively, this is a **Dual Write** — two separate operations against two entirely different systems, with no shared transaction spanning both.


The failure case is immediate and severe: if the database update succeeds but the server crashes a millisecond later, before the Kafka publish ever happens, the two systems silently diverge. The database knows the email changed; the Marketing Service has no idea. This is the **Dual-Write Problem**, and it’s one of the most common real sources of data corruption in microservice architectures — not from a bug in either system individually, but from the fundamental impossibility of atomically committing to two unrelated systems with a naive two-step write.


---


## 4. The Outbox Pattern


The fix reframes the problem entirely: instead of writing to the database _and_ separately writing over the network to Kafka, the application only ever talks to the database — and it writes to **two tables in the same database, in the same transaction**.

1. It updates the real `users` table as before.
2. It inserts an event record — e.g., `{"event": "UserEmailUpdated", "user_id": 123}` — into a dedicated new table, `outbox_events`.

Because both tables live inside the same database, an ordinary transaction wraps both writes: standard relational **Atomicity** (the “A” in ACID) guarantees either both the `users` update and the `outbox_events` insert succeed together, or neither does. This is worth being clear isn’t a PostgreSQL-specific trick — transactions are a standard feature of virtually every relational database (MySQL, Oracle, SQL Server), and even some NoSQL databases (MongoDB) now support multi-document transactions. The Outbox Pattern itself is likewise a universal software architecture pattern, not tied to any particular database — the “outbox” is simply an ordinary table you create yourself, and the “pattern” is the discipline of always writing to it in the same transaction as the real data change, on whichever database you’re using.


This solves the dual-write problem at the database layer: it’s now structurally impossible for the user’s email to update without a corresponding event row also being saved, because they either both happen or neither does. But the events are, at this point, just sitting inertly inside the database — they still need to actually reach Kafka.


---


## 5. Change Data Capture (CDC)


The naive way to get those outbox rows into Kafka would be for the application itself to publish them after the transaction commits — but that reintroduces exactly the dual-write problem the outbox was built to avoid. The next-naive alternative — a script that periodically runs `SELECT * FROM outbox_events` — avoids the dual-write issue but places a real, continuous load on the database (competing for connections and CPU with actual application traffic) and introduces polling delay between when an event is written and when it’s actually noticed.


**Change Data Capture (CDC)** solves both problems at once. Instead of querying the tables at all, a dedicated CDC tool (Debezium is the most popular open-source choice in the Kafka ecosystem) attaches directly to the database’s own internal **transaction log** — in PostgreSQL, this is the same Write-Ahead Log covered in the transactions/WAL notes. Every time PostgreSQL commits a transaction — including the dual write to `users` and `outbox_events` — it durably appends that change to the WAL as a normal part of committing. The CDC tool reads that log entry the moment it’s written and streams the corresponding event directly into Kafka.


This is a genuinely better approach than polling for reasons that follow directly from what a WAL actually is: reading a sequential, append-only log has almost no impact on the database’s primary workload, compared to running repeated `SELECT` queries that compete for threads and CPU. It also captures every single change instantly and completely, with no risk of missing something that happened between two polling intervals — the exact same “read the log, don’t touch the table” principle that makes Kafka itself efficient applies here to reading _out of_ the source database too.


Beyond Debezium, several other CDC tools exist worth knowing by name, each suited to a different context: **Oracle GoldenGate** for heavy-duty enterprise systems already invested in Oracle, **AWS DMS (Database Migration Service)** for streaming changes between databases hosted within AWS, **Maxwell** as a lightweight open-source daemon purpose-built for MySQL, and **Qlik Replicate** for enterprise environments wanting a visual, drag-and-drop setup across many different source and target systems.


Debezium itself typically works in two phases worth knowing: an initial **snapshot** phase, where it reads the full current state of the tracked tables to establish a baseline (since the WAL alone only contains _changes_, not the complete existing dataset), followed by the ongoing **streaming** phase, tailing the WAL continuously from that point forward.


---


## 6. Why the Outbox Table, Not Just Raw CDC on the Real Table?


A natural question follows: if CDC can read any table’s WAL entries directly, why bother with a separate `outbox_events` table at all? Why not just point Debezium straight at the `users` table?


This is technically possible — it’s usually called **Standard CDC**. But it creates a specific, serious problem: doing so exposes your database’s raw physical schema directly to every downstream consumer. A Kafka message generated this way is essentially a live mirror of the actual row — `{"user_id": 123, "email": "new@email.com", "password_hash": "xyz...", "last_login_date": "2026-09-04"}` — including internal columns that were never meant to be a public contract, and reflecting the table’s exact current structure.


The problem surfaces the moment that structure needs to change. Suppose the User Service team refactors and renames the `email` column to `primary_email_address` — an entirely internal decision from their point of view. If CDC is streaming directly off the `users` table’s WAL, the downstream Marketing Service — hard-coded to read a field called `email` — breaks instantly, because that field no longer exists in the stream. This is a textbook case of **Tight Coupling**: exposing a raw internal implementation detail (the literal database schema) directly to every external consumer means that internal detail can now never be safely changed again without breaking something downstream that has no reason to even know it exists.


The dedicated `outbox_events` table is what prevents this. It acts as a **stable contract** — a deliberately designed, versioned event shape that the application controls explicitly, decoupled from whatever the internal table structure happens to look like at any given moment. If the `email` column is renamed internally, the application code updates once, at the single point where it maps the internal field to the outbox event, translating `primary_email_address` back into the `"email"` key the contract has always promised. Every downstream consumer keeps working, completely unaware a migration ever happened — the whole point of the pattern is to let the internal schema evolve freely while the external event contract stays fixed. Formalizing that contract further with a schema registry and a defined format like Avro or Protobuf is a natural next step many teams take, giving the outbox event shape the same kind of enforced, versioned structure a database schema itself has — worth knowing this connection exists even if it’s a separate topic in its own right.


---


## 7. Outbox Table Housekeeping


There’s one operational detail the pattern can’t skip: the `outbox_events` table is a genuine, ordinary database table, and every event ever published still leaves a permanent row behind unless something cleans it up. At meaningful scale — say 10,000 events a second — that table grows explosively fast, and left unchecked, it will eventually fill the database’s disk.


Once the CDC tool has successfully read a transaction’s outbox row from the WAL and streamed it into Kafka, that row has served its entire purpose and can be safely removed. In practice, this is usually handled by a simple scheduled background process — a cron job or similar — that runs periodically (e.g., hourly) and deletes outbox rows older than some retention window (commonly around 24 hours). That window is deliberately not zero: leaving a short buffer means engineers can still query recent outbox rows directly while debugging a live issue, without losing the ability to inspect exactly what was published and when. Past that window, though, the table is routinely swept clean, keeping it small, fast, and cheap to maintain — the physical row’s job was only ever to survive long enough for the WAL-based CDC tool to notice it, not to serve as a permanent archive (Kafka’s own topic, with its own retention policy from the fundamentals notes, is what actually plays that role afterward).


Worth being explicit about one thing this whole chain does _not_ automatically guarantee: exactly-once delivery all the way to the downstream consumer. CDC tools generally provide at-least-once delivery into Kafka — if Debezium crashes after streaming an event but before durably recording its own progress through the WAL, it can re-emit that same event on restart. This means the same idempotent-consumer thinking from the delivery-semantics notes still applies at the far end of this pipeline: a downstream service like the Marketing Service should still be designed to tolerate an occasional duplicate `UserEmailUpdated` event, rather than assuming the Outbox Pattern and CDC together produce a strictly exactly-once guarantee on their own. The Outbox Pattern solves the _dual-write_ problem specifically — it doesn’t retroactively remove the need for idempotent handling further downstream.


---


## 8. Summary


Ordering inside a single partition is guaranteed, but two distinct things can still break the illusion of a correct global timeline: a poorly chosen key can create a **Hot Partition**, where uneven real-world data (like wildly different merchant sizes) concentrates load onto one broker regardless of how logically sound the key seemed — the fix is favoring high-cardinality keys that are both meaningful for ordering and evenly distributed. Separately, the producer’s own retry behavior under concurrent in-flight requests can reorder messages that were sent correctly but acknowledged out of sequence — fixed by the same idempotent-producer machinery (PID plus sequence number) that also solves duplicate delivery, with the broker actively rejecting out-of-order sequence numbers rather than silently accepting a scrambled log, all coordinated through the producer’s own Record Accumulator and bounded by `buffer.memory`.


Getting data safely out of a traditional database and into Kafka has its own, separate failure mode: naively writing to a database and then separately publishing to Kafka creates the **Dual-Write Problem**, where a crash between the two steps leaves the systems silently out of sync. The **Outbox Pattern** solves this by writing the real data change and an event record into two tables in the same database transaction, leaning on ordinary relational Atomicity to guarantee both happen or neither does. **Change Data Capture** then reads those outbox rows not by querying the table, but by tailing the database’s own transaction log (the WAL), which is both far lower-overhead than polling and captures every change instantly and completely. A dedicated outbox table — rather than CDC pointed directly at the real table — exists specifically to avoid **Tight Coupling**: it acts as a stable, application-controlled event contract, insulating downstream consumers from internal schema changes. Finally, the outbox table itself needs routine cleanup once its rows have been safely captured, typically via a scheduled job deleting old rows past a short debugging-buffer window — and even with all of this in place, downstream consumers still need to be idempotent, since CDC delivery into Kafka remains at-least-once, not exactly-once, end to end.

