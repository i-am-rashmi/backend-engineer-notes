---
title: "Apache Kafka : Stream Processing"
---


# Kafka Stream Processing — Windowing, State Stores & Exactly-Once Topologies


Draws on DDIA Chapter 11 (“Stream Processing” / derived data). Up to this point, consumers have been treated as simple movers of data — read a message, act on it, done. This shifts to a different category of application: one that computes, aggregates, and continuously derives new data _from_ a stream, rather than just reacting to it.


---


## 1. From Batch to Stream: Why Windowing Exists


Traditional batch processing has a natural boundary: a nightly SQL job waits until midnight, grabs the entire day’s data, and computes a result over that fixed, complete dataset. Stream processing has no such boundary — the data never stops arriving. Consider building a “trending hashtags” feature for a social platform: a `posts` topic receives thousands of messages a second, and the goal is to continuously report how many times `#Kafka` has been mentioned. There is no natural “end” to wait for, because the stream is conceptually infinite.


The resolution is to slice that infinite stream into finite, time-bounded chunks — **Windowing** — telling the stream processor something like “count mentions for exactly 5 minutes, emit a result, then reset and start the next 5 minutes.” DDIA describes two primary window shapes:

- **Tumbling Windows** — fixed, back-to-back, non-overlapping intervals (12:00–12:05, then 12:05–12:10). Every event belongs to exactly one window. Simple, and appropriate when you genuinely want one clean, non-repeated answer per interval (e.g., “total signups per hour”).
- **Hopping (Sliding) Windows** — fixed-length windows that advance by a smaller step than their own length, so they overlap (a 5-minute window recalculated every 1 minute: 12:00–12:05, then 12:01–12:06, then 12:02–12:07). A single event can belong to multiple overlapping windows simultaneously.

For a live “trending in the last 5 minutes” UI that should feel responsive and update every minute, a hopping window is the right fit — it gives a full 5-minute view of context while still refreshing the on-screen number every minute, rather than only refreshing once every five minutes the way a tumbling window would.


A third shape worth knowing by name, since real systems use it regularly for a different kind of pattern: **Session Windows** — windows that aren’t fixed in length at all, but are instead defined by a gap of inactivity. A session window stays “open” for as long as events keep arriving within some inactivity threshold (say, no more than 30 minutes between events for a given user), and closes only once that gap of silence is exceeded. This is the natural fit for genuinely session-shaped data — a user’s browsing session, a single customer support conversation — where the “right” window length varies per entity and isn’t meaningfully fixed in advance the way tumbling or hopping windows assume.


### Event time vs. processing time


A window boundary like “12:00 to 12:05” raises an immediate, important question DDIA spends real attention on: 12:00 to 12:05 according to _what_ clock? **Event time** is the timestamp of when the event actually happened in the real world (embedded in the message itself, e.g., when the user actually posted the tweet). **Processing time** is the timestamp of when the stream processor happens to receive and handle that event — which can lag behind event time due to network delay, an upstream retry, or a consumer that’s fallen behind. Windowing purely by processing time is simpler to implement but produces results that don’t actually correspond to “what really happened when” — an event delayed by a slow network hop gets counted in whatever window the processor happens to be in at the moment it finally arrives, not the window it actually belongs to. Correctly windowing by _event_ time is the harder, more accurate approach, and it introduces a problem of its own worth knowing by name: **late-arriving data** and **watermarks** — a watermark is the stream processor’s own estimate of “I believe I’ve now seen all events up to this event-time point,” and it’s what lets a window actually be closed and finalized at all, since without some cutoff rule, a window could theoretically stay open forever waiting for one more late straggler event. Real stream processing frameworks (including Kafka Streams) let you configure an **allowed lateness** / grace period — how long past a window’s nominal close to still accept and incorporate stragglers before finalizing the result and discarding anything later than that.


---


## 2. State Stores — Where the Running Count Actually Lives


To compute a windowed count, the stream processor has to _remember_ something between one message and the next — it can’t recompute the full historical count from scratch on every single incoming tweet. This running memory is called **state**.


The simplest mental model: imagine watching a live feed of tweets scroll by and keeping a tally mark on a piece of paper every time `#Kafka` appears. That paper — the running total, the thing being remembered _between_ messages — is the state. It’s the general category covering counters, running averages, or any other intermediate data a stream processor needs to hold onto in order to keep producing correct, up-to-date results without re-reading the entire history on every event.


The obvious risk: if that “piece of paper” is just held in the server’s plain RAM, a crash 3 minutes into a 5-minute window wipes it out completely, and restarting from zero produces silently wrong (undercounted) results for users. Making every single state update a network round-trip to an external database (writing the count to PostgreSQL on every tweet) would solve the durability problem but would be far too slow to keep up with a genuinely high-throughput stream.


### The State Store — fast locally, durable via replication


The resolution is a **State Store**: an embedded, ultra-fast local database (Kafka Streams uses **RocksDB**) living directly on the stream processor’s own disk, paired with an in-memory cache layer for speed. This gives the application the local-memory-like speed it needs to keep up with a fast stream, without the failure-prone fragility of keeping everything purely in volatile RAM.


But a single server’s local disk can still fail entirely (not just crash-and-restart — the machine itself could be lost). To make the state durable against that, every update to the local State Store is also written to a special, dedicated Kafka topic called a **Changelog Topic** — effectively a backup log of every state change, safely replicated the same way any other Kafka topic is. If the server dies and a replacement spins up (or the same server restarts with a fresh local disk), it doesn’t need to recompute anything from the original raw stream — it simply reads the Changelog Topic from the beginning and replays it to rebuild the State Store to its exact last-known value.


### Keeping the Changelog Topic from growing forever


A naive changelog would record every single update forever — millions of entries for one popular hashtag counter over time (`#Kafka: 1`, `#Kafka: 2`, … `#Kafka: 1,000,000`), consuming enormous and ever-growing disk space, even though a recovering processor only actually needs the _latest_ value to rebuild correctly.


A standard time-based retention policy is the wrong tool here, and it’s worth being precise about why: if a specific counter (say, a niche hashtag `#VintageKafka`) reaches a total of 5,000 and then simply isn’t mentioned again for a week, a 3-day time-based cutoff would delete that value entirely — and a server crash-and-recovery on day 5 would rebuild the state store believing the count is 0, silently losing real historical data purely because nothing happened to “refresh” it recently.


The correct tool is **Log Compaction**, covered in the fundamentals notes: instead of deleting by age, Kafka retains only the newest message _for each unique key_ — using the Record Key mechanism established back in the ordering module — and keeps that latest value indefinitely, regardless of how long ago it was written, until a newer update for that same key eventually replaces it. Because the changelog topic is keyed by whatever the state store’s own key is (the hashtag string, in this example), compaction naturally keeps the topic small: no matter how many millions of times `#Kafka`’s counter updates, the compacted changelog only ever needs to retain one row — the current total — per distinct key.


### Recovering faster than a full replay


Rebuilding an entire State Store by replaying its changelog from scratch works, but for a state store holding a very large amount of accumulated data, that replay can itself take real time — a genuine availability gap while the new instance catches up before it can serve results. Kafka Streams addresses this with **Standby Replicas**: a warm, continuously-updated copy of a partition’s state store kept live on a _different_ node the whole time, tailing the same changelog topic in parallel with the active instance. If the active instance fails, the standby is already nearly caught up and can take over far faster than starting a changelog replay completely cold — the same underlying idea as a database Follower being kept in sync so a failover doesn’t mean rebuilding from nothing.


---


## 3. Exactly-Once in Stream Topologies


Put the full lifecycle of one message through this trending-hashtags pipeline together: **read** the tweet from the source topic, **update** the local State Store (and its changelog backup), **write** the new total to an output topic for the frontend, and **commit** the consumer offset so the tweet isn’t read again.


If the process crashes right after the output write but before the offset commit, the exact same duplication problem from the delivery-semantics notes reappears, just with an extra step involved: on restart, the same tweet is read again, the state store is incremented a second time, and the output total is now off by one — a real, silent correctness bug in a live “trending” number shown to users.


The fix reuses the mechanism already established for the Outbox Pattern and for producer-side transactions: **Kafka Transactions**. The stream processor wraps all of the meaningfully-linked writes for one input message into a single atomic transaction — specifically, the write to the changelog topic (persisting the updated state), the write to the output topic (the new total for the frontend), and the commit of the original source-topic offset. Kafka guarantees these either all succeed together or, if the process crashes partway through, none of them are considered to have happened — via the same Commit/Abort control-marker mechanism covered in the delivery-semantics notes, since the underlying topics are still append-only logs that can’t have data physically erased from them. Any downstream consumer of the output topic that wants this guarantee to actually hold end-to-end must be configured with `isolation.level=read_committed`, so it correctly skips over any data tied to a transaction that was ultimately aborted.


In Kafka Streams specifically, this entire mechanism — transactional writes across the changelog, output topics, and source offset, all bundled together — is exposed behind a single configuration flag, `processing.guarantee=exactly_once_v2`, rather than requiring the application to manually orchestrate the transaction boundaries itself.


### A related, practical alternative to always writing an output topic


Worth knowing as a genuinely common real-world variant: rather than writing every updated state value out to a separate output topic purely so a UI or another service can read the current count, Kafka Streams supports **Interactive Queries** — letting an external application query a running stream processor’s local State Store directly (via an exposed API), reading the current value straight out of the embedded RocksDB store rather than requiring a dedicated output topic and a consumer on the other end just to fetch “what is the count right now.” This is a useful trade worth knowing exists: an output topic is the right choice when other systems need to react to _changes_ over time (an event-driven downstream), while Interactive Queries fit better when something just needs to ask “what’s the current value” on demand, without needing a topic and consumer purely to answer that question.


### The stream/table duality


One more piece of foundational vocabulary worth having, since it underlies how a state store like this is conceptually understood in Kafka Streams: a continuously updating aggregate (like the running hashtag count) can be thought of equally as a **stream** of individual update events, or as a **table** representing the current value at any given moment — the same underlying data, viewed two different ways depending on whether you care about the sequence of changes or just the latest snapshot. This is often called the **stream-table duality**, and it’s the conceptual foundation behind Kafka Streams’ `KStream` (event-sequence view) and `KTable` (current-value view) abstractions — the changelog topic in this whole discussion is, in effect, the durable log backing exactly that table view.


---


## 4. Summary


Stream processing differs from simple message-moving consumers in that it has to compute and remember things _across_ an unbounded, never-ending flow of data. **Windowing** makes this tractable by chopping the infinite stream into bounded chunks — Tumbling (fixed, non-overlapping), Hopping/Sliding (fixed but overlapping, for smoother, more frequently updating results), and Session windows (inactivity-gap-defined, for naturally session-shaped data) — with the added complexity that windows should ideally be defined by **event time** rather than processing time, which in turn requires watermarks and an allowed-lateness policy to decide when a window can actually be considered final.


Computing anything across a window requires **state** — a running memory between messages — held in a local, fast **State Store** (RocksDB in Kafka Streams) for speed, and durably backed by a **Changelog Topic** so a crash doesn’t silently lose accumulated results. That changelog is kept from growing unboundedly not through time-based retention (which can incorrectly discard genuinely still-relevant, just-infrequently-updated values) but through **Log Compaction**, retaining only the latest value per key indefinitely. **Standby Replicas** further reduce recovery time by keeping a warm, continuously-updated copy of the state on a second node rather than relying purely on a cold changelog replay after a failure.


Finally, correctness across the multiple linked actions one message triggers — updating state, writing output, committing the source offset — is guaranteed the same way it was for the Outbox Pattern and producer transactions: by wrapping them all in a single **Kafka Transaction**, using Commit/Abort markers since the underlying logs can’t be physically edited, and requiring downstream consumers to use `isolation.level=read_committed` to respect that outcome. Kafka Streams exposes this whole mechanism as a single `exactly_once_v2` setting. Interactive Queries offer a lighter-weight alternative to a dedicated output topic when something just needs the current value on demand, and the stream-table duality (`KStream` vs. `KTable`) is the underlying conceptual frame for why a continuously-updating aggregate can be understood equally as a sequence of changes or as a current snapshot.

