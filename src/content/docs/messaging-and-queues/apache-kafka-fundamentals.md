---
title: "Apache Kafka : Fundamentals"
---


# Apache Kafka — Fundamentals & Architecture


Covers Kafka’s core mechanics — the commit log, topics/partitions, brokers, producers, consumer groups, rebalancing, and lag — end to end. Delivery semantics, exactly-once, transactions, outbox/CDC, DLQs, and stream processing are deliberately left for the next file, as planned.


---


## 1. The Commit Log — Kafka’s Foundational Idea


A traditional relational database models the _current state_ of the world — when a user updates their shipping address, the database **overwrites** the old value; the previous state is gone. Kafka is built on a fundamentally different idea: the **append-only commit log**. When something happens — “User updated address to Bengaluru” — Kafka doesn’t overwrite anything. It writes the event to the **very end** of a log and leaves it there.


Two rules govern this log, and everything else about Kafka follows from them:

1. **Append-only** — new data is strictly added to the end; nothing is inserted or edited in the middle.
2. **Immutable** — once an event is written, it can never be modified.

**Analogy:** an accountant’s ledger, or a physical diary. You never erase a past entry — if a mistake happened, you append a _new correcting entry_ at the bottom. The full history stays intact and readable.


Because the log is immutable and never deleted the instant it’s read, **multiple independent applications can read the exact same data at their own pace**, rewind and replay past events, and process massive volumes across distributed servers — a fundamentally different capability from a traditional message queue, which typically deletes a message the moment it’s consumed.


**Commit Log** — an append-only, immutable, ordered sequence of records; the foundational data structure Kafka is built on.
**Event** — a single fact or occurrence written to the log (e.g., “User A updated their profile picture”).


---


## 2. Offsets — Tracking Position in an Endless Log


If an application is reading through this endless, ordered sequence of events, it needs a way to remember exactly where it left off — otherwise, a crash and restart would mean either reprocessing everything from the start or losing track entirely.


Every event appended to a log gets a **sequential, unique ID**: 0, 1, 2, 3, and so on. A consumer tracks its current position using this ID. If it reads event 5, it commits **offset 6** — meaning “the next event I should read is 6.” If the consumer crashes and restarts, it asks Kafka “where did I leave off?” and resumes exactly from offset 6, with no gaps and no reprocessing.


Consumer offsets aren’t stored in some abstract metadata layer — they’re stored durably in a real, internal Kafka topic called **`__consumer_offsets`**, itself partitioned and replicated exactly like any other topic. Every offset commit is literally a message written to this topic, keyed by consumer group, topic, and partition. Kafka essentially uses its own core log mechanism to solve its own bookkeeping problem.


**Offset** — a sequential, per-partition integer ID marking a consumer’s read position in the log; the mechanism that makes resumable, exactly-where-you-left-off consumption possible.


---


## 3. Partitions & Brokers — Scaling Beyond One Machine


A single, endless log file sitting on one server eventually hits a physical wall — one hard drive can only hold so much data, and one server’s network card can only handle so much traffic. To scale to processing millions of events per second, Kafka splits a logical **Topic** (e.g., `user-logins`) into multiple smaller, independent logs called **Partitions**, and spreads those partitions across multiple servers — **Brokers** — in the cluster.


A broker is not limited to one partition. In practice, a single broker commonly hosts hundreds or even thousands of partitions belonging to many different topics simultaneously. Physically, a partition isn’t one single, ever-growing file on disk either — it’s broken into smaller files called **log segments**, each capped at a configurable size or time window. Only the newest (“active”) segment is open for writes; older segments are closed, immutable files. This segment structure is what later makes retention and log compaction (Section 9) efficient — an entire segment is deleted or compacted as a unit, not event-by-event.


### Replication — Leader-Follower per partition


Partitions have **replicas**. If a broker crashes or a disk fails, the events stored on it can’t simply be lost — so Kafka uses a **Leader-Follower model** _per partition_: for any given partition (say, `user-logins` Partition 0), one broker is elected the **Leader** for that partition; a configurable number of other brokers act as **Followers**, continuously fetching the newest data from the leader to stay in sync as identical copies.


By default, both producers writing new events _and_ consumers reading the latest events talk **only to the Leader** for a given partition — never the Followers. This guarantees strict consistency: if Followers served reads while still catching up, consumers could read stale/out-of-date information. Followers exist purely as a safety net, ready to be promoted if the current Leader’s broker crashes.


That safety net only actually protects you if a given Follower is genuinely caught up, though. Kafka tracks which Followers are close enough to the Leader’s latest data to be considered safe fallback candidates — this set is called the **In-Sync Replica (ISR)** list. A Follower that falls too far behind (a slow disk, a network hiccup) is temporarily removed from the ISR, and can only be promoted to Leader again once it catches back up. This prevents an out-of-date replica from becoming Leader and silently serving stale data or losing recently-acknowledged writes — and it’s the direct foundation under the producer durability settings covered in Section 8.


**Topic** — the core logical unit of data organization in Kafka; a named stream of events.
**Partition** — an ordered, immutable, continuously-appended-to sub-log; a topic is physically split into one or more partitions to enable horizontal scale.
**Broker** — a single Kafka server; hosts many partitions from many topics, acting as Leader for some and Follower for others simultaneously.
**Leader / Follower (partition)** — the broker currently authoritative for a partition, vs. the brokers replicating it and standing ready to take over.
**In-Sync Replica (ISR)** — the set of Followers close enough to the Leader’s data to be safely promoted if needed.


---


## 4. Producers, Keys & Ordering


Imagine a producer sending two events back-to-back to a `user-activity` topic with 4 partitions:

1. “User A updates their profile picture.”
2. “User A deletes their account.”

Kafka’s critical ordering rule: **strict ordering is only guaranteed within a single partition, never across an entire topic.** If event 1 lands on Partition 0 and event 2 lands on Partition 3, a consumer reading both partitions in parallel might process the account deletion _before_ the profile picture update — a serious correctness bug if the application logic assumes chronological order.


The fix is **Keys**. A producer can attach a Key (e.g., a User ID or Order ID) to every message. Kafka **hashes** that key to deterministically decide which partition the message goes to — meaning every event for the same key always routes to the exact same partition, every time. Because ordering _within_ a partition is strictly preserved, this guarantees the full timeline of events for that specific key stays in correct order, while still allowing thousands of other users’ events to be processed fully in parallel across the other partitions. This is the same “localized ordering, global parallelism” trade-off that shows up in partition key design across distributed systems generally — co-locate what needs to stay ordered, spread everything else.


If a producer sends messages with **no key**, Kafka distributes them round-robin (or via a sticky-partitioner optimization in modern versions) purely for load balancing, with no ordering guarantee at all between them — even for messages from the same producer.


Worth flagging now, since your next file’s syllabus explicitly covers “reordering on retry”: a producer’s automatic retry-on-failure behavior can, under certain configurations, cause messages to be written out of their original send order even _within_ a single partition, if a later message’s retry succeeds before an earlier message’s retry does. This is controlled by the `max.in.flight.requests.per.connection` setting combined with idempotent producers — the full mechanics belong to your next file’s Delivery Semantics module, but the risk is a direct extension of the per-partition ordering guarantee established here.


**Record Key** — an optional value attached to a message, hashed by Kafka to deterministically pin all messages sharing that key to the same partition.
**Per-partition ordering** — Kafka’s actual ordering guarantee: strict order within one partition, no guaranteed order across partitions of the same topic.


---


## 5. Consumer Groups


A single application instance usually can’t process millions of events per second alone. To scale out, multiple instances of an application work together to read from a topic, bundled together as a **Consumer Group**.


The golden rule: **a single partition can be read by at most ONE consumer within the same consumer group at any given time** — enforced specifically so two consumers in the same group never accidentally read and process the exact same message twice.


Concrete partition-to-consumer assignment scenarios:

- 3 partitions, 1 consumer → that one consumer reads all 3 partitions.
- 3 partitions, 2 consumers → one gets 2 partitions, the other gets 1.
- 3 partitions, 3 consumers → a perfect 1-to-1 mapping.
- 3 partitions, 4 consumers → the 4th consumer sits completely idle — a partition can never be shared or split between two consumers in the same group, so there’s simply nothing left to assign it.

At first glance, paying for an idle consumer instance looks wasteful. But it’s a deliberate, built-in safety mechanism: if one of the active consumers crashes or loses connectivity, an idle consumer is immediately available to take over its abandoned partition(s) — no new infrastructure needs to spin up; the standby capacity is already running and ready.


**Consumer Group** — a set of consumer instances that coordinate to jointly read a topic, splitting partitions among themselves so each message is processed once per group.


---


## 6. Rebalancing — How Kafka Detects and Recovers from Failure


How does Kafka actually know a consumer died, and how does it automatically hand its partitions to a standby? Inside the cluster, one broker acts as the **Group Coordinator** for a given consumer group — its job is to track exactly which consumers are alive and which partitions each one currently owns.


Every consumer — active or idle — continuously sends a background **Heartbeat** to the Group Coordinator: essentially the application saying “I’m still here, I’m still healthy.” If an active consumer crashes, its heartbeats simply stop. Once the Group Coordinator hasn’t heard a heartbeat for a configured period, it assumes that consumer is dead and triggers an automatic **Rebalance**: it takes back all partitions from the group and redistributes them among the remaining healthy consumers, including any previously idle ones.


Two specific settings govern exactly how sensitive this detection is: **`heartbeat.interval.ms`** controls how often a consumer sends a heartbeat (default around 3 seconds), and **`session.timeout.ms`** controls how long the Coordinator waits without one before declaring a consumer dead (default roughly 45 seconds in modern Kafka) — this is the actual number that determines how much of a GC pause or network blip a consumer can survive before triggering a rebalance. A separate setting, **`max.poll.interval.ms`**, governs a different kind of liveness entirely: how long a consumer can take _processing_ a batch between calls to `poll()` before being considered dead. This is distinct from heartbeats because modern Kafka consumers can heartbeat on a background thread even while the main thread is busy churning through a slow batch — a common point of confusion worth keeping straight.


### The problem: Rebalancing Storms


Now consider a consumer that isn’t actually dead — it just hit a long Garbage Collection pause, or got briefly overloaded processing a heavy batch, and simply missed sending heartbeats for a few seconds. In Kafka’s classic strategy, **Eager Rebalancing**, the _entire consumer group_ does a full “stop-the-world” pause — every single consumer, even the perfectly healthy ones, is forced to give up its partitions, and the Coordinator deals them all out again from scratch.


If that paused consumer then wakes up moments later and sends a heartbeat, the Coordinator sees what looks like a “new” member joining — and triggers _another_ full stop-the-world rebalance to accommodate it. If servers are experiencing minor network blips or frequent GC pauses, they can drop in and out repeatedly, causing the consumer group to spend nearly all its time pausing and reassigning partitions instead of actually processing data. This is a **Consumer Group Rebalancing Storm** — a cascading performance collapse triggered by transient, non-fatal hiccups.


### The fix: Incremental Cooperative Rebalancing


Modern Kafka’s smarter strategy, **Incremental Cooperative Rebalancing**, avoids the stop-the-world behavior entirely. Instead of pausing the whole group, the Coordinator identifies precisely which partition needs to move and tells the specific consumer holding it, “please finish your current task and hand over _just_ this one partition” — every other consumer in the group keeps reading its own partitions without any interruption. This surgical, partition-level reassignment eliminates the storm dynamic almost entirely. In practice, this behavior is implemented by the **CooperativeSticky** partition assignor — one of several assignment strategies Kafka supports for deciding exactly _which_ partitions move to _which_ consumers during a rebalance: **Range** assigns contiguous per-topic partition ranges (can be uneven for multi-topic subscribers), **RoundRobin** spreads partitions evenly but reshuffles everything from scratch, **Sticky** tries to preserve prior assignments to minimize movement, and **CooperativeSticky** pairs that sticky logic with the incremental protocol itself.


There’s a second, complementary fix worth knowing for routine deploys rather than genuine crashes: **Static Membership**, configured via `group.instance.id`, assigns each consumer instance a fixed, persistent identity. When a consumer with a known static ID restarts within `session.timeout.ms` — a quick rolling deploy, not a real crash — the Coordinator recognizes it as the _same_ member returning rather than a departure-and-arrival, and skips triggering a rebalance entirely. This targets one of the most common real-world storm triggers directly: routine restarts, not just GC pauses.


### Rule of thumb for setting these values


These three settings trade off against each other, so picking them is really about deciding what kind of pause you want to tolerate versus how fast you want to detect a genuinely dead consumer — shorter timeouts detect real failures faster but produce more false positives (and therefore more storms); longer timeouts avoid false positives but leave a truly dead consumer’s partitions unprocessed for longer.


For **`session.timeout.ms`**, the rule is to set it comfortably above your _expected_ worst-case GC pause or transient network blip, not your worst possible outage. If GC pauses typically run under 5–10 seconds, something in the 30–45 second range gives real headroom without dragging out genuine-crash detection too long. Too low, and normal GC pauses start looking like crashes, feeding directly into rebalancing storms; too high, and a truly dead consumer’s partitions sit unprocessed for the full duration before anyone takes over.


**`heartbeat.interval.ms`** should generally be set to roughly a third of `session.timeout.ms`. This isn’t arbitrary — it gives the Coordinator about three missed heartbeats before it gives up on a consumer, so a single dropped network packet doesn’t immediately trigger a false rebalance. Kafka’s own defaults (a 3-second heartbeat against a 45-second session timeout — closer to a 1:15 ratio) are actually more conservative than this classic 1:3 guidance, reflecting a deliberate bias toward avoiding false positives.


**`max.poll.interval.ms`** should be sized independently, against your **worst-case batch processing time**, not the average — this is the setting people most often get wrong, because average-case sizing looks fine in testing but leaves no margin for the slow-path case that actually triggers the timeout in production (a downstream call that occasionally takes longer, a larger-than-usual batch). If a batch of `max.poll.records` could, in the worst case, take several minutes to fully process, `max.poll.interval.ms` needs real margin above that worst case, entirely independent of any GC-related reasoning.


The practical sequence: measure actual GC pause distribution and worst-case batch processing time in production rather than guessing; set `session.timeout.ms` above the observed p99 GC pause with a safety margin; set `heartbeat.interval.ms` to roughly a third of that; set `max.poll.interval.ms` separately, based purely on worst-case processing time. If storms are still happening after this tuning, the right next step is **Static Membership**, not pushing the timeouts higher and higher — cranking `session.timeout.ms` up to “solve” a storm is a common anti-pattern, since it doesn’t fix the underlying flapping, it just delays how long a genuine crash takes to be detected and recovered from.


**Group Coordinator** — the broker tracking a consumer group’s membership/health and orchestrating its rebalances.
**Rebalance** — reassigning partition ownership among a group’s members, triggered by membership changes.
**Eager Rebalancing** — a full stop-the-world pause and complete reassignment on any membership change.
**Rebalancing Storm** — repeated, cascading rebalances from consumers flapping in and out of the group, during which little or no actual processing happens.
**Incremental Cooperative Rebalancing** — only the specific partitions that need to move are reassigned; unaffected consumers are undisturbed.
**Static Membership** — a persistent consumer identity that lets brief restarts skip triggering a rebalance.


---


## 7. Lag & Lag as an SLO


A single topic can absolutely be read by multiple independent consumer groups simultaneously — this is central to Kafka’s Publish/Subscribe strength. Kafka tracks the offset **separately for every consumer group**, so an `email-service` group and an `analytics-service` group can both read the exact same `user-logins` topic, at completely different speeds, with entirely independent progress pointers that never interfere with each other. Because the log is immutable and not deleted the instant it’s read, this works cleanly.


This sets up **Lag**. Suppose `analytics-service` is fast and keeps up instantly, but `email-service` is slower — the producer writes 1,000 events/sec, but `email-service` only processes 800/sec. Because Kafka doesn’t delete or skip the extra 200 unprocessed messages, the gap between the newest message written and the last message `email-service` has actually read just keeps growing. This gap is **Consumer Lag**, and the real-world consequence is direct: if it keeps growing, an email that normally arrives in 2 seconds might eventually take 10 minutes or hours to send — a serious problem for something time-sensitive like a password reset.


In production, you actively monitor consumer lag as a first-class metric, not just whether a service is up or down. The business defines a concrete target — _“99% of all emails must be processed within 5 seconds”_ — and if lag crosses the threshold implied by that target, it’s an **SLO violation** that should trigger an alert. Lag isn’t just a diagnostic curiosity; it’s a directly actionable, business-meaningful signal.


Fixing sustained lag takes more than just adding consumers. If you’re receiving 1,000 events/sec but your consumer group can only process 800/sec with 4 partitions and 4 active consumers, simply adding 2 more instances (to make 6) does nothing — per the golden rule of consumer groups, the extra consumers just sit idle, since there are still only 4 partitions to assign. To genuinely increase throughput, you need to increase _both_ partition count and consumer count together — bumping partitions to 10 (with matching consumer capacity) actually unlocks more parallelism, and this is how Kafka scales horizontally.


Partition sizing isn’t free, though — more partitions means more open file handles and more metadata overhead for the cluster to track. The practical approach: calculate your target throughput, measure how fast a single consumer can realistically process events, divide to get a baseline partition count, and add a buffer for future growth, rather than picking an arbitrary large number.


**Consumer Lag** — the gap between the latest offset written to a partition and the latest offset a consumer group has actually processed.
**SLO (Service Level Objective)** — a concrete, measurable performance target; lag is the metric commonly monitored against it in Kafka systems.


---


## 8. Producer Acknowledgment Levels


Your next file’s Delivery Semantics module opens with a scenario about a lost acknowledgment, so it’s worth establishing the actual setting that governs this now, as a core fundamental rather than an advanced topic. The **`acks`** configuration controls how much confirmation a producer waits for before considering a write successful:

- **`acks=0`** — fire-and-forget; the producer doesn’t wait for any confirmation at all. Fastest, but a message can be silently lost with zero indication.
- **`acks=1`** — the producer waits for the partition **Leader** to acknowledge the write to its own local log, but _not_ for any Followers to replicate it. If the Leader crashes immediately after acknowledging but before a Follower replicates the message, that “successfully written” message can still be lost on failover.
- **`acks=all`** (or `acks=-1`) — the producer waits for the write to be confirmed by **all current members of the ISR** from Section 3, not just the Leader. This is the strongest durability guarantee Kafka offers at the producer level, and it’s the setting that actually underpins the “why at-least-once plus idempotent consumers usually wins” discussion your next file will cover.

Working alongside `acks=all` is **`min.insync.replicas`**, which sets the minimum ISR size required for a write to succeed at all. If the ISR shrinks below this number — too many Followers have fallen behind or gone offline — the broker rejects new writes entirely rather than accept one it can’t durably guarantee. This trades availability for durability, the same fundamental trade-off as a quorum refusing writes in a consensus system.


---


## 9. Retention & Log Compaction


Kafka doesn’t keep every message forever by default — how long data stays in the log is governed by retention policy, configurable per topic. **Time-based retention** (`retention.ms`) deletes segments older than a configured duration (e.g., 7 days), regardless of whether every consumer group has actually read them yet — which is exactly why a consumer group with severe, sustained lag can eventually fall behind the retention window entirely and permanently miss messages, directly connecting back to Section 7. **Size-based retention** (`retention.bytes`) instead caps the total size of a partition’s log, deleting the oldest segments once the cap is exceeded.


**Log Compaction** is a fundamentally different retention mode worth knowing even at a basics level: instead of deleting old messages by age or size, compaction retains only the **most recent value for each unique key**, discarding older, superseded values for that same key — conceptually similar to how MVCC cleans up dead row versions in a database, but applied to a log instead of a table. This is commonly used for topics representing “current state” rather than a pure event history — a topic keyed by `user_id` holding each user’s latest profile snapshot, where only the newest version matters, not the full change history. This same mechanism is what underpins how Kafka Streams’ internal state stores persist state efficiently without growing forever, which your syllabus’s stream-processing module will build on directly.


---


## 10. The Pull Model, and ZooKeeper vs. KRaft


Kafka consumers **pull** data from brokers by repeatedly calling `poll()`, rather than brokers pushing data out to them. This is a deliberate design choice: it lets each consumer control its own pace, batch size, and backpressure — a slow consumer simply calls `poll()` less often or requests smaller batches, without the broker needing to track per-consumer throttling logic. It’s also directly why `max.poll.interval.ms` from Section 6 exists as its own liveness signal separate from heartbeats — the poll loop itself is the actual unit of “is this consumer doing real work.”


Older Kafka versions relied on **Apache ZooKeeper** as an external coordination service for cluster metadata, controller election (which broker manages partition-leader assignments cluster-wide), and configuration — ZooKeeper itself runs the ZAB consensus protocol, the same family of protocol as Raft. Modern Kafka has replaced this with **KRaft (Kafka Raft)** — a built-in consensus mechanism, based on the Raft protocol itself, that removes the external ZooKeeper dependency entirely and lets a subset of the Kafka brokers manage cluster metadata directly, via leader election and a replicated log. It’s the same underlying mechanics — Leader/Follower roles, Terms, quorum-based commits — just applied to Kafka’s own cluster metadata instead of user data. Worth keeping the scope distinction clear: the Group Coordinator from Section 6 is a _per-consumer-group_ role, while KRaft’s controller is a _cluster-wide_ metadata authority — related concepts, different scope.


---


## 11. Summary


The commit log is Kafka’s foundation: append-only and immutable, letting many independent readers consume the same data at their own pace and replay history — a fundamentally different model from a database that overwrites state. Offsets let a consumer resume exactly where it left off, stored durably in Kafka’s own internal `__consumer_offsets` topic. Topics are split into partitions for horizontal scale, spread across brokers, with each partition replicated via a Leader-Follower model — reads and writes routed only to the Leader for consistency, and the In-Sync Replica set determining which Followers are genuinely safe to fail over to.


Ordering is guaranteed only within a single partition; a producer Key hashes deterministically to a fixed partition, giving strict per-key ordering while preserving parallelism everywhere else. Consumer Groups split partition ownership so each message is processed once per group — a partition can never be shared between two consumers in the same group, and excess consumers deliberately sit idle as standby capacity.


Rebalancing is triggered by the Group Coordinator detecting missed heartbeats, governed concretely by `heartbeat.interval.ms`, `session.timeout.ms`, and the separately-tracked `max.poll.interval.ms`. Eager Rebalancing causes a disruptive full stop-the-world reassignment on every membership change — including false alarms like a GC pause — which can spiral into a Rebalancing Storm. Incremental Cooperative Rebalancing, via the CooperativeSticky assignor, fixes this by moving only the specific partitions that actually need to move, and Static Membership further reduces unnecessary rebalances during routine restarts. Tuning the underlying timeouts is a matter of matching each one to what it’s actually meant to detect — `session.timeout.ms` sized against worst-case GC pauses, `heartbeat.interval.ms` at roughly a third of that, and `max.poll.interval.ms` sized independently against worst-case batch processing time — rather than pushing any of them up indiscriminately, which just delays real-crash detection instead of fixing false positives.


Lag is the gap between the newest written offset and a consumer group’s actual read progress, and it’s the primary metric monitored as an SLO in production — fixing sustained lag requires increasing both partition count and consumer count together, not just adding consumers. Producer durability is governed by `acks` and `min.insync.replicas`, with `acks=all` waiting on the full ISR as the strongest guarantee — directly setting up the delivery semantics and exactly-once discussion coming next. Retention (time- or size-based) and log compaction govern how long data persists, with plain retention risking permanent data loss for a badly-lagging consumer, and compaction instead retaining only the latest value per key — the same mechanism behind Kafka Streams state stores.


Kafka is pull-based, not push-based, which is why poll-loop liveness is tracked separately from heartbeat liveness. And modern Kafka has replaced ZooKeeper with KRaft for cluster metadata management, using the same Raft-based consensus mechanics — Leader election, Terms, quorum commits — covered in your dedicated Consensus notes, just applied to cluster metadata rather than user data.


Deliberately left for your next file: Delivery Semantics (at-least-once, at-most-once, exactly-once), idempotent producers, transactional writes, the Transactional Outbox pattern, Debezium-style CDC, dual-write failure modes, DLQ design, poison messages, retry topics, replay safety, and stream processing — windowing, state stores, and exactly-once in stream topologies.

