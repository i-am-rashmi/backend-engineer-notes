---
title: "Apache Kafka : Failure Handling"
---


# Kafka Failure Handling — Poison Messages, DLQs, Retries & Replay Safety


Covers what happens when processing a message actually fails — the two fundamentally different kinds of failure, and the distinct architecture each one demands.


---


## 1. The Poison Message Problem


Consider an `email-service` consumer reading from a `user-logins` topic, expecting every message to be well-formed JSON like `{"user_id": 123, "email": "test@test.com"}`. If an upstream bug causes a producer to occasionally send something malformed — a plain string like `user_id=123, email=test@test.com` — the consumer fetches it, attempts to parse it, and throws immediately.


The danger isn’t the single failed message — it’s what happens next. Recall the standard consumer lifecycle: fetch, deliver, process, commit. If the parse failure crashes the consumer _before_ it commits the offset for that message, Kafka has no record that it was ever attempted. When the consumer automatically restarts, it asks for everything from its last committed offset — which is still pointing at the very message that just crashed it. It fetches the same broken message again, fails to parse it again, and crashes again. This produces an infinite loop: the consumer restarts, fails, restarts, fails, forever, on that exact offset — and because it can never successfully commit past that point, every legitimate message sitting behind it in the partition (offset 106, 107, 108, and everything after) is permanently stuck in a traffic jam that will never clear. This is a **Poison Message** (or poison pill): a single malformed record that doesn’t just fail itself, but paralyzes an entire partition’s forward progress.


The immediate fix is to stop letting the parse failure crash the consumer at all — wrap the processing logic in a try/catch, and in the catch block, formally commit the offset anyway so the pointer moves forward and the rest of the partition keeps flowing. But this creates a new problem: the message is now silently dropped. Even though it was malformed, it might represent something the business genuinely can’t afford to lose — a payment attempt, a login event — so simply swallowing and discarding it isn’t an acceptable resolution on its own.


### The Dead Letter Queue


The actual fix: before committing the offset, the catch block takes the raw, broken message, wraps it with useful metadata (the error message, the timestamp it failed, the original topic and partition/offset it came from), and publishes that package to a dedicated new topic — conventionally named something like `user-logins-dlq` — the **Dead Letter Queue (DLQ)**. Only after that publish succeeds does it commit the original offset and move on.


From there, a DLQ is typically wired to an automated alert: when a message lands in it, an engineer is notified, inspects the malformed data, determines the fix (often a one-off script correcting the formatting), and re-injects the corrected message back into the system. The DLQ turns “silent data loss” into “visible, investigable, recoverable failure” — nothing disappears, it just moves to a place specifically designed for human intervention.


**A parsing error like this is a non-transient error** — it doesn’t matter how many times you retry `JSON.parse("broken_string")`, it will always fail the exact same way. This distinction matters, because it’s not the only kind of failure a consumer can hit.


---


## 2. Transient Errors and the Non-Blocking Retry Pattern


Contrast the poison message case with a different failure: the message itself is perfectly valid JSON, parses cleanly, but when the consumer tries to save it to a downstream database, that database happens to be mid-restart and refuses the connection. This is a **transient error** — it’s very likely to succeed if simply retried a moment later, unlike a malformed message that will never parse no matter how many times you try.


Routing a transient error straight to the DLQ is wasteful — it means paging an engineer to manually intervene over something that would have resolved itself in five seconds if the database had just been given time to come back. But the opposite instinct — put a `sleep()` in the consumer and retry in a loop right there — is just as dangerous as the poison message scenario: it blocks the entire partition for the duration of the sleep, creating the same kind of traffic jam, just for a different underlying reason.


The production-grade answer is the **Non-Blocking Retry Pattern**: since Kafka has no built-in per-message timer/delay mechanism the way some other message brokers do, the retry delay is implemented using a series of cascading, dedicated **retry topics**, each with its own separate consumer:

1. **Main topic** — the downstream call fails. The consumer catches the error, attaches a header like `Retry-Count: 1`, publishes the message to a `retry-1` topic, and commits its own offset on the main topic immediately — keeping the main partition’s traffic flowing without any blocking.
2. **`retry-1`** **topic** — a dedicated consumer reads this topic but is deliberately programmed to wait (e.g., 1 minute) before attempting to process. If the downstream call still fails, it increments the header to `Retry-Count: 2` and republishes to a `retry-2` topic.
3. **`retry-2`** **topic** — a further dedicated consumer, waiting longer still (e.g., 5 minutes) before retrying.
4. **DLQ** — once the message has exhausted its configured retry limit (e.g., 3 attempts total), it’s routed to the DLQ for manual engineer intervention, exactly as in the poison-message flow.

The core idea worth internalizing: the “waiting” happens on a completely separate topic and consumer from the main flow, so a struggling downstream dependency never blocks or delays anything unrelated on the primary topic — only the specific messages that actually need to wait are held up, and only in their own dedicated lane.


Each successive retry stage typically waits longer than the last — this progression (1 minute, then 5 minutes, and so on) is a form of **exponential** or graduated **backoff**, giving a struggling downstream dependency progressively more room to recover rather than hammering it at a constant rate. It’s also worth noting that each retry-stage consumer runs as its own independent consumer group — this keeps rebalancing and offset tracking for the “waiting” stages fully isolated from the main topic’s consumer group, so a slow retry stage never risks triggering rebalance activity on the primary, latency-sensitive consumer group.


For systems at a smaller scale, or where standing up multiple cascading topics feels like overkill, a lighter-weight alternative worth knowing exists: many Kafka client libraries expose a `pause()`/`resume()` API that lets a consumer temporarily stop fetching new records from a specific partition (while continuing to send heartbeats, so it isn’t mistaken for dead) and resume after a delay — handling simple transient-error backoff in-process, without the operational overhead of maintaining a chain of dedicated retry topics. The cascading-retry-topic pattern earns its complexity specifically when you need per-message, independently-tracked retry counts and delay stages at real production scale.


A related pattern worth naming for a downstream dependency that’s failing consistently (not just one blip): a **circuit breaker**. Rather than letting every single message individually discover that the downstream system is down and cycle through the full retry-topic chain one at a time, a circuit breaker tracks the failure rate and, once it crosses a threshold, “trips” — causing the consumer to stop attempting calls to that dependency entirely for a cooldown period, checking back periodically rather than hammering a system that’s clearly not going to respond. This complements the retry-topic pattern rather than replacing it; retry topics handle the delay/backoff for individual messages, while a circuit breaker prevents a widespread, sustained outage from generating a flood of doomed retry attempts across many messages simultaneously.


---


## 3. Replay Safety


DLQ messages aren’t meant to sit there forever — the whole point is that they eventually get fixed and reprocessed, or (once the root cause is resolved) simply resubmitted as-is. This reprocessing is called **replaying** the DLQ: an engineer writes a script that reads the DLQ’s messages and republishes them to the main topic to be handled again.


This raises a genuinely important edge case. Suppose a payment consumer calls the Stripe API to charge a card, and the charge itself succeeds — but the network fails right afterward, before the consumer can save the “Paid” receipt to its own database. From the consumer’s point of view, this looks exactly like a failure (it never got confirmation), so the message is treated as failed and eventually lands in the DLQ after exhausting retries. But the underlying charge actually _did_ go through. If an engineer later replays this message naively, the consumer will call Stripe again — and charge the customer’s card a second time for something that was already paid.


The property that prevents this is the exact same one covered under delivery semantics: **idempotency**. The consumer’s business logic needs a unique identifier — a `Payment_ID`, in this case — and before making the actual Stripe API call, it should first check its own database: “do I already have a recorded receipt for this `Payment_ID`?” If so, it skips the external call entirely, commits the offset, and moves on as if the work had just been redone safely. This means replaying the DLQ, however many times, however far in the future, is always safe — the system naturally deduplicates on its own rather than depending on an engineer to manually verify nothing was already processed before hitting “replay.” Idempotent consumer design isn’t just a nice property for handling ordinary duplicate delivery — it’s the specific mechanism that makes DLQ replay a safe operation at all, rather than a genuinely risky one requiring careful manual auditing every single time.


It’s also worth building **traceability metadata into the DLQ message itself** from the start (original topic, partition, offset, and the original record key) — replaying a message should ideally preserve its original key when republishing to the main topic, so it’s routed back to the same partition it would have originally landed on, keeping any ordering guarantees that mattered for that key intact even after the detour through the DLQ and back.


---


## 4. Summary


Failures during message processing split into two fundamentally different categories, and conflating them leads to the wrong architecture. **Non-transient errors** — a malformed message that will never parse no matter how many times it’s retried — become **poison messages** if the consumer simply crashes on them, because a crash-before-commit means Kafka keeps redelivering the exact same unprocessable message forever, permanently blocking every message behind it in that partition. The fix is to catch the failure, route the raw message (with diagnostic metadata) to a **Dead Letter Queue**, and commit past it — converting silent data loss or a stuck partition into a visible, alertable, recoverable failure.


**Transient errors** — a downstream dependency that’s temporarily unavailable but will likely succeed shortly — need the opposite treatment: not an immediate DLQ routing (wasteful and needs a human for something the system will fix itself), and not a blocking in-process retry loop (which reintroduces the same stuck-partition problem as a poison message). The **Non-Blocking Retry Pattern** solves this with a cascade of dedicated retry topics, each with its own consumer and increasing backoff delay, keeping the main topic’s traffic flowing while individual messages wait their turn in an isolated lane — with a **circuit breaker** as the complementary mechanism for when a dependency is down hard enough that individually retrying every message is pointless.


Both paths ultimately feed into the DLQ once retries are exhausted, and DLQ messages are meant to be **replayed** once the underlying issue is fixed. This is only genuinely safe if the consumer’s business logic is **idempotent** — checking a unique identifier before taking any external, side-effecting action — since a message can land in the DLQ due to an ambiguous failure (the real-world action succeeded, but the confirmation of that success was lost), and idempotency is what prevents a naive replay from silently duplicating that action, like charging a customer’s card twice.

