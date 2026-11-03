---
title: "Distributed System: Idempotency & Delivery Semantics"
---


2026-11-03 · @Rashmi


## 1. Idempotency


An operation is **idempotent** if applying it many times **leaves the system in the same end state as applying it once.**

- **It's about state, not response.** A second `DELETE /orders/42` may return 404 instead of 200, but the end state is the same, so it is still idempotent.
- **Non-idempotent** means each repeat moves the state _further_: increment a balance, append a row, charge a card, send an email.
- **Why it matters:** in a distributed system, retries are unavoidable. If the retried operation is not idempotent, a retry becomes a duplicate effect (deduct ₹50 twice).

| Operation                   | Idempotent?    | Why                           |
| --------------------------- | -------------- | ----------------------------- |
| `SET balance = 500`         | Yes            | Same final value every time   |
| `balance += 100`            | No             | Each run adds again           |
| `UPSERT user WHERE id = 7`  | Yes            | Same row either way           |
| `INSERT INTO payments ...`  | No             | New row each time             |
| HTTP `GET`, `PUT`, `DELETE` | Yes (by spec)  | Repeat leaves same state      |
| HTTP `POST`, `PATCH`        | Not by default | Usually creates or increments |


## 2. Why duplicates happen


Neither the network nor the application is reliable, so components retry. Retries are the main source of duplicates.

- **Lost ack vs lost request look identical.** When a request times out, the sender cannot tell whether the request never arrived, or it was processed and only the ack was lost.
- **The sender has two choices.** Retry and risk a duplicate (at-least-once), or don't retry and risk losing it (at-most-once).
- **Exactly-once** _**delivery**_ **is impossible** over an unreliable network. This is the Two Generals problem.
- **Exactly-once** _**processing**_ **is achievable.** You get it by combining at-least-once delivery with idempotent processing. People also call this "effectively-once".

Key split: **delivery** (did the message arrive?) is solved with retries and acks. **Processing** (did the effect happen once?) is where idempotency lives, and where the hard work is.


## 3. The three delivery semantics


**At-least-once is the practical default; exactly-once is built on top of it, not instead of it.**


| Semantic                        | Guarantee           | How it's achieved                                                  | Risk                      | Use when                                                  |
| ------------------------------- | ------------------- | ------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------- |
| At-most-once                    | 0 or 1 times        | No retries; consumer commits _before_ processing                   | Silent loss               | Loss is harmless (some metrics, telemetry)                |
| At-least-once                   | 1 or more times     | Retry until ack; consumer commits _after_ processing               | Duplicates                | Default for most systems; pair with idempotent processing |
| Exactly-once (effectively-once) | Effect happens once | At-least-once + dedup (idempotent producer/consumer, transactions) | Cost, latency, complexity | Money, inventory, anything where a duplicate is a bug     |


## 4. Making processing idempotent (any system)


The rule: the dedup record and the business effect must commit atomically. Everything below serves that rule.


### 4.1 Prefer naturally idempotent operations

- Upsert instead of insert.
- Set absolute values (`SET balance = 500`) instead of deltas (`balance += 100`).
- Guarded state transitions: `UPDATE orders SET status = 'SHIPPED' WHERE id = 7 AND status = 'PENDING'`.

### 4.2 Idempotency keys

1. The **origin** generates one key per logical operation (UUID, or derived from business data such as `orderId + ":charge"`).
2. The key travels with the request or message and **stays the same on every retry**. A key regenerated per attempt is useless.
3. The consumer records the key and applies the effect.
4. A duplicate key means the work is already done: skip the effect, but still ack or commit the offset, otherwise it redelivers forever.

### 4.3 The atomicity trap (most common bug)


A naive "check key, then process" has two failure modes:

- **Crash between steps.** Process first, record later: a crash in between causes a duplicate. Record first, process later: a crash loses the operation.
- **Concurrent duplicates.** Two consumers or two API retries both check, both see "not seen", both process.

Fixes:

- **Same DB transaction:** insert into `processed_events` (UNIQUE on key) and do the business write together. A unique violation rolls back the whole transaction, so the effect is never applied twice.
- **DynamoDB:** conditional write with `attribute_not_exists(key)`.
- **External side effects** (email, third-party API) can't share your transaction. Use the outbox pattern, or pass your key to the provider's own idempotency key (e.g. Stripe's `Idempotency-Key` header).
[Outbox Pattern : Instead of sending an event directly to a message broker, the service saves both the business data (e.g., a new order) and the outgoing message into an outbox table inside the same local database transaction. 
Background Relay: A separate background process, worker, or CDC (Change Data Capture) connector continuously reads unhandled events from the outbox table. Broker Publishing: The relay process publishes the event to the message broker (such as AWS Prescriptive Guidance or [Microservices.io](http://microservices.io/)) and then marks the outbox entry as sent or deletes it.]

### 4.4 Synchronous APIs

- Store the original response with the key and **return it on a duplicate**, rather than an error or a silent no-op.
- Track an **in-progress** state so a retry that arrives while the first attempt is running gets `409` or waits, instead of running twice.

### 4.5 Housekeeping

- **TTL on keys:** retention must be longer than the maximum retry or redelivery window.
- **Ordering:** keys stop duplicates but not stale or out-of-order replays. Use version numbers or optimistic locking (`WHERE version = n`) when an old message could overwrite newer state.

## 5. Cheat sheet

- Exactly-once **delivery** is impossible; exactly-once **processing** = at-least-once delivery + idempotent processing.
- Idempotency is about end **state**, not identical responses.
- Idempotency key: generated once at the origin, reused on every retry.
- Dedup record + business effect must commit **atomically**, or you get duplicates or lost work.
- Duplicate detected → skip the effect, still ack / commit offset (and return the stored response for APIs).

Kafka-specific mechanics (idempotent producer, idempotent consumer, transactions, zombie fencing) are in Kafka Delivery Semantics & Exactly-Once.

