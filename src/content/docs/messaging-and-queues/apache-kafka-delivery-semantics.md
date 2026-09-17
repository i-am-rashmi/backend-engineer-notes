---
title: "Apache Kafka : Delivery Semantics"
---


# Kafka Delivery Semantics & Exactly-Once Processing


Builds directly on the fundamentals (commit log, partitions, ISR, `acks`) — this covers what actually happens to a message end to end, the ways duplication and loss creep in, and the three layers of fix Kafka provides: idempotent producers, idempotent consumers, and transactional writes.


---


## 1. The Full Message Lifecycle


Before looking at what goes wrong, it helps to see the entire journey a message takes, since every failure scenario below is really just “something breaks between two of these steps.”


**Phase 1 — The Write (Producer → Broker)**

1. **Send** — the producer batches events and sends them over the network to the Leader broker for that partition.
2. **Write** — the Leader broker appends the message to its local log on disk.
3. **Replicate** — Follower brokers fetch the new message from the Leader to stay in sync.
4. **Acknowledge** — once the write is safely stored, the Leader sends an Ack back to the producer. How much “safely stored” actually means is controlled by the producer’s `acks` setting: `acks=all` waits for the ISR’s Followers to replicate before acking; `acks=1` only waits for the Leader itself.

**Phase 2 — The Read (Broker → Consumer)**

1. **Fetch** — the consumer sends a request to the Leader: “give me the next batch starting from my last known offset.”
2. **Deliver** — the broker returns the batch of messages.
3. **Process** — the consumer runs its business logic (sending an email, deducting money, whatever the application does).
4. **Commit** — once processing is fully done, the consumer tells the broker “I’ve successfully processed up to offset 105,” and the broker durably records that new offset.

Every delivery-semantics problem below is a crash or network failure landing in the gap between two of these eight steps — the message existing on one side of the gap but the acknowledgment of it not making it across.


---


## 2. The Three Delivery Semantics


Depending on how the producer and consumer are configured, three distinct guarantees are possible — worth having all three named clearly, since “Exactly-Once” only makes sense in contrast to the other two:

- **At-Most-Once** — a message is delivered zero or one times, never more. Achieved by _not_ retrying failed sends and by committing consumer offsets _before_ processing rather than after. Simple and fast, but messages can be silently lost on any failure — generally only acceptable for data where occasional loss is truly harmless (some metrics/telemetry).
- **At-Least-Once** — a message is delivered one or more times, never zero. This is Kafka’s default behavior once retries are enabled: if an acknowledgment is lost or delayed, the producer safely assumes the write failed and resends, and because the log is append-only, that resend is written as a brand-new event — a duplicate. Similarly, if a consumer crashes after processing but before committing its offset, the next consumer to pick up that partition re-fetches and reprocesses the same message. Nothing is ever lost, but duplicates are a real, expected possibility that the application has to handle.
- **Exactly-Once** — each message has an effect equivalent to being processed exactly one time, with no loss and no duplication. This isn’t a single setting — it’s a combination of mechanisms (idempotent producers, idempotent consumers, and/or transactional writes) layered on top of At-Least-Once delivery, covered in the rest of this document.

**The concrete failure that motivates all of this:** imagine a producer sending “Deduct $50 from User A’s account.” Steps 1–3 above happen perfectly — the message is safely written to the log — but the network glitches right at step 4, and the Ack never reaches the producer. From the producer’s point of view, the request simply timed out; it has no way to know whether the write actually succeeded. Its default, safe assumption is that the send failed, so it retries — and because Kafka just appends whatever it receives, that retry becomes a second, duplicate “Deduct $50” event in the log. A consumer processing both messages would deduct $100 instead of $50 — a genuinely dangerous bug for anything involving money, and the reason “at-least-once plus careful design” usually beats trying to force the network to be perfect.


---


## 3. Fixing the Producer Side: Idempotent Producers


The fix for the exact scenario above lives entirely on the producer side, enabled via `enable.idempotence=true`.


**“Idempotent”** is a mathematical term: performing an operation multiple times has the exact same effect as performing it once. Kafka achieves this by borrowing an idea from network protocols like TCP — sequence numbers.


When an idempotent producer starts up, the Kafka cluster assigns it a unique **Producer ID (PID)**. Every message it sends carries that PID plus a strictly increasing **Sequence Number** (0, 1, 2, 3…). Now replay the failure scenario: the broker successfully writes messages with sequence numbers 0, 1, and 2. It tries to Ack message 2, but the network drops the Ack. The producer times out and retries sending message 2 again — same PID, same sequence number. The broker recognizes it has _already_ written that exact (PID, sequence number) pair, silently drops the duplicate, and sends back a success Ack so the producer can move on. The message is written to the log exactly once, even though the network glitch and retry happened exactly as before.


This mechanism has one important limitation worth being explicit about: a PID is only guaranteed unique for the lifetime of that specific producer instance. If the producer process itself crashes and restarts, it’s issued a **brand new PID** by the cluster — meaning idempotence alone doesn’t protect against a genuinely dead-and-restarted producer resending work under a fresh identity, and it doesn’t protect anything once you need coordination _across_ multiple partitions or topics (which is exactly the gap transactional writes close in Section 5).


---


## 4. Fixing the Consumer Side: Idempotent Consumers


An idempotent producer only guarantees the message lands in the Kafka log exactly once — it does nothing about what happens after that, on the consumer side.


Revisit the Read phase: fetch, deliver, process, commit. Imagine the consumer successfully fetches the “$50 deduction” message, connects to the database, and deducts the money — but a split second before it can send the offset commit back to Kafka, the consumer’s server crashes. Because the offset was never updated, when a new consumer picks up that partition, it fetches that exact same message again — and deducts $50 a second time. This happens **even with an idempotent producer**, because the message genuinely was only written once; the duplication here is entirely on the _read and process_ side. This is why standard Kafka, even with idempotent producers enabled, still only gives **At-Least-Once delivery to consumers** by default.


The fix is to make the consumer’s own processing idempotent, typically via an **Idempotency Key** baked into the application’s own data model rather than anything Kafka provides automatically. Concretely: every message carries a unique identifier (e.g., a `Transaction_ID` like `TXN-123`), and the destination table has a `UNIQUE` constraint on that column. The flow then plays out safely:

1. The consumer reads the message, deducts $50, and saves `TXN-123` to the database in the same write.
2. The consumer crashes before committing its Kafka offset.
3. It restarts and fetches the exact same message again.
4. It tries to deduct $50 and insert `TXN-123` again.
5. The database’s `UNIQUE` constraint rejects the second insert outright — the duplicate is safely ignored, and the money is never deducted twice.

This pattern — accepting At-Least-Once delivery but designing the consumer’s own writes to be naturally idempotent — is often simpler and cheaper to build and reason about than chasing full end-to-end Exactly-Once guarantees, and is the practical answer to why “at-least-once plus idempotent consumers” is such a common, durable choice in real systems rather than a compromise to be embarrassed about.


---


## 5. Fixing Multi-Step Processing: Transactional Writes


Idempotent consumers work cleanly when the consumer’s side effect is a single database write with a natural uniqueness constraint. But what if the consumer isn’t writing to a database at all — what if it’s a stream-processing app that reads from Topic A, performs some computation, and writes the result to Topic B? If that app crashes partway through, Topic B can end up holding a “ghost” result with no corresponding confirmed read of Topic A — there’s no database `UNIQUE` constraint anywhere to lean on, because the destination is another Kafka topic, not a table.


### The database transaction analogy


It helps to first ground this in an ordinary database transaction. Transferring ₹1,000 from checking to savings requires two separate steps: deduct from checking, then add to savings. If the server crashes right after step one but before step two, the money vanishes — unless the two steps are wrapped in a **transaction**, an all-or-nothing package: `BEGIN` starts it, `COMMIT` saves everything permanently if every step succeeded, and `ROLLBACK` undoes everything if any step failed partway through, returning the system to exactly its prior state.


### Applying this to Kafka


The stream-processing app has to perform two logically linked actions for every message: write the computed result to Topic B, and commit its read offset for Topic A. If Kafka wraps these two actions in a single transaction, they become the same kind of all-or-nothing package — if the app crashes after writing to Topic B but before committing the Topic A offset, the whole transaction should be treated as failed.


This raises an immediate puzzle, though: Kafka’s log is strictly append-only and immutable. A database rollback physically deletes or reverts rows — but you can’t erase something already appended to a Kafka topic’s disk log. So how does a “rollback” actually work here?


### Control markers — the actual rollback mechanism


Kafka doesn’t erase the already-written result. Instead, once a transaction is decided (whether it succeeds or fails), Kafka appends a special, hidden **control marker** to the topic, immediately after the data it covers:

- A **Commit Marker** if the transaction succeeded.
- An **Abort Marker** if it failed (e.g., the app crashed mid-transaction, or the transaction simply timed out without completing).

Consumers that need true Exactly-Once semantics configure `isolation.level=read_committed`. A `read_committed` consumer reads the physical data exactly as it’s stored, but when it encounters a message followed by an Abort Marker, it **skips that message and everything else tied to the same aborted transaction entirely**, as if it never existed. If it instead sees a Commit Marker, it processes the preceding messages completely normally. (A consumer configured with the alternative, `read_uncommitted`, sees every message regardless of its eventual outcome, including ones later aborted — this is the pre-transactional, plain At-Least-Once view, useful when a consumer genuinely doesn’t need the stronger guarantee and wants lower latency instead.)


### Walking both flows explicitly


**Happy flow (success):**

1. The app tells Kafka: begin transaction.
2. It reads a message from Topic A.
3. It writes the computed result to Topic B — physically saved to disk at this point.
4. It commits its offset for Topic A as part of the same transaction — this is a detail worth being precise about: the offset commit isn’t a side action outside the transaction, it’s written to Kafka’s internal `__consumer_offsets` topic _as part of_ the same atomic transaction as the Topic B write, which is exactly what lets the two actions succeed or fail together.
5. The app tells Kafka: commit transaction.
6. Kafka appends a Commit Marker to Topic B (and to the offsets topic).
7. A `read_committed` downstream consumer fetches the result, sees the Commit Marker, and processes it normally.

**Failure flow (crash):**

1. The app tells Kafka: begin transaction.
2. It reads a message from Topic A.
3. It writes the computed result to Topic B — again, physically saved to disk.
4. The app’s server crashes completely before it can commit the offset or the transaction.
5. After a timeout, the cluster recognizes the transaction was never completed and treats it as failed.
6. Since the already-written result can’t be erased, Kafka appends an Abort Marker to Topic B instead.
7. A `read_committed` downstream consumer fetches the result, immediately sees the attached Abort Marker, and skips it entirely — the “ghost” data is never processed, never affects downstream state, and as far as that consumer’s business logic is concerned, it simply never existed.

This is genuinely the entire trick: Kafka doesn’t perform a rollback in the traditional sense at all. It **never deletes anything** — it just leaves a marker recording the outcome, and pushes the responsibility of respecting that marker onto any consumer that opts into `read_committed`. The combination of transactional writes on the producer/processing side and `read_committed` on the consumer side is what actually delivers Exactly-Once stream processing.


### What makes a producer safe to use across restarts, not just retries


Idempotent producers (Section 3) get a fresh PID on every restart, which is fine for surviving a single retry within one running process but not for surviving a genuine crash-and-restart mid-transaction. Transactional producers close this gap with a **`transactional.id`** — a stable, application-assigned identifier configured once and reused across restarts, rather than a cluster-assigned PID that changes every time. When a producer with a known `transactional.id` reconnects, the Transaction Coordinator (a broker-side role, analogous to the Group Coordinator but for transactions rather than consumer groups) bumps an internal **epoch** number tied to that ID. Any _earlier_ instance of the same producer still trying to write with the old epoch — a “zombie,” left over from before a crash or a botched deploy that didn’t actually die — gets **fenced off**: the broker rejects its writes outright, because a higher epoch is already active. This is structurally the same idea as Raft’s Terms deciding which leader’s authority is current after a split-brain reconciles — the newest identity always wins, and the stale one is cut off rather than allowed to keep acting.


---


## 6. Practical Considerations


Transactional writes and `read_committed` aren’t free, and it’s worth being explicit about the cost side of this trade-off rather than treating Exactly-Once as a strictly-better default:

- **Latency** — a `read_committed` consumer has to wait for a transaction’s outcome (commit or abort marker) before it can safely deliver the messages covered by that transaction, which adds latency compared to a plain `read_uncommitted` consumer that processes data the instant it’s written.
- **`transaction.timeout.ms`** — bounds how long an open transaction is allowed to sit uncompleted before the broker forces it to abort; too short risks aborting legitimately slow-but-healthy work, too long delays how quickly a genuinely crashed transaction’s data becomes visible to `read_committed` consumers waiting on its outcome.
- **Throughput overhead** — control markers, coordinator round-trips, and the two-phase-like coordination between the data write and the offset commit all add real overhead compared to plain at-least-once processing.

This is exactly why the idempotent-consumer pattern from Section 4 remains the more common choice for simple “consume and write to a database” pipelines — it sidesteps all of this coordination overhead using nothing more than a unique constraint. Full transactional Exactly-Once tends to earn its cost specifically in multi-step stream-processing pipelines (read from one topic, transform, write to another) where there’s no natural database constraint to lean on instead — which is precisely the scenario Kafka Streams is built around, and why Kafka Streams exposes this whole mechanism through a single, simple configuration flag (`processing.guarantee=exactly_once_v2`) rather than requiring the application to hand-roll the transaction/marker logic itself.


---


## 7. Summary


Every Kafka message passes through two phases — the Write (send, write, replicate, acknowledge) and the Read (fetch, deliver, process, commit) — and every delivery-semantics problem is really a crash or network failure landing in the gap between two of those steps. This produces three possible guarantees: At-Most-Once (fast, can silently lose messages), At-Least-Once (Kafka’s real default — nothing is lost, but duplicates are expected and must be handled), and Exactly-Once (no loss, no duplication, built by layering extra mechanisms on top of At-Least-Once rather than replacing it).


On the producer side, a lost acknowledgment triggers a safe retry that would otherwise write a duplicate event — solved by **idempotent producers**, which pair a cluster-assigned Producer ID with a per-message sequence number so the broker can silently recognize and drop an exact retry. This only survives within one producer’s lifetime, though; a genuine crash-and-restart gets a fresh PID.


On the consumer side, a crash between processing and committing an offset causes the same message to be reprocessed by whichever consumer picks up the partition next — solved by **idempotent consumers**, using an application-level idempotency key (a unique transaction ID plus a database `UNIQUE` constraint) so a reprocessed duplicate is safely rejected rather than double-applied. This pattern is usually the simplest and cheapest way to get correctness for straightforward consume-and-persist pipelines.


For multi-step stream processing — read from one topic, compute, write to another — neither of the above is enough on its own, since there’s no natural uniqueness constraint to lean on across two Kafka topics. **Transactional writes** solve this by wrapping the result write and the source-offset commit into a single atomic unit, using Commit and Abort **control markers** appended to the log (since Kafka can never actually erase already-written data) to record the outcome, and requiring downstream consumers to opt into `isolation.level=read_committed` to respect those markers and skip any data tied to an aborted transaction. A stable `transactional.id` plus an internal epoch number additionally fences off “zombie” producer instances left over from a crash, so an old, stale process can’t keep writing under a newer producer’s identity — the same structural idea as Raft’s Terms resolving which leader’s authority is current.


None of this is free — `read_committed` adds latency waiting on transaction outcomes, and transactional coordination adds real throughput overhead — which is exactly why idempotent consumers remain the default choice for simple pipelines, and full transactional Exactly-Once is reserved for genuine multi-topic stream processing, where Kafka Streams exposes the whole mechanism behind a single `exactly_once_v2` configuration flag.

