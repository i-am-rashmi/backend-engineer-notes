---
title: "Caching : Redis"
---


# Redis Mastery Plan — From Fundamentals to Architectural Decision-Making


**Goal:** Understand Redis deeply enough to (a) use it correctly day-to-day, (b) answer senior-level interview questions on internals, and (c) defend _when and why_ to bring Redis into a system design — not just operate it as a tool.


---


## Phase 0: The Mental Model — Why Redis Is Fast, and What That Costs You


Everything about Redis falls out of one sentence: **Redis is a single-threaded, in-memory data structure server that talks to clients over a fast event loop.**


**Why “in-memory” matters:** Traditional databases like Postgres or MySQL store data primarily on disk. Every read or write has to travel down to a physical disk location, which has real latency even on SSDs. Redis keeps everything directly in RAM, so there’s no disk-seek latency at all — reads and writes are orders of magnitude faster simply because RAM has no moving parts and no queue to wait in.


**Why “single-threaded” matters — and why it’s not a weakness by accident.** Picture Redis as one single, blazing-fast cashier processing a line of customers, one at a time, instead of five cashiers working the same register. Five cashiers sound faster, but the moment they’re touching the same till, they constantly have to coordinate — “wait, I’m updating this,” “hold on, let me finish” — and that coordination overhead (called cross-core cache-line invalidation) actually costs real time, sometimes 50-100ns per handoff. One dedicated worker with zero coordination overhead turns out to be faster for pure in-memory operations than a team of workers bumping into each other.


**But this creates a real operational trap.** If that one cashier is asked to slowly count 10,000 pennies — the equivalent of a slow O(N) command like `KEYS *` on a huge keyspace — every other customer in line just has to wait. There’s no second cashier to divert them to. This is why commands like `KEYS *`, a large `SMEMBERS`, or a big `ZRANGE` are dangerous in production: they block the _entire_ server for every client while they run. The fix is `SCAN`, which walks the keyspace incrementally without hogging the single thread.


**One subtlety worth locking in early:** the “single worker” handles _both_ reads and writes, not writes-only with parallel readers (unlike some traditional databases that allow multiple readers with one writer). Because everything is already blazing fast in RAM, adding separate reader threads would just reintroduce the coordination overhead Redis was built to avoid — so Redis chose to keep everything on the one thread, for both operations.


**Why RAM isn’t used for** _**everything**_**, everywhere:** it’s fast, but it’s expensive per gigabyte compared to disk, and physically limited on any one machine. This is exactly the tension that later forces the eviction (Phase 2) and cluster-sharding (Phase 4) conversations — you can’t just buy infinite RAM, so you have to decide what stays hot and how to spread data across machines once one machine isn’t enough.


---


## Phase 1: Core Operations & Data Types


### The toolbox analogy


Setting up a Redis server is like buying an empty toolbox — you don’t declare upfront what tools (data structures) you’ll use. You decide _at write time_, command by command. The moment you run `HSET`, Redis automatically creates a Hash under that key. Run `ZADD`, it creates a Sorted Set. Nothing needs pre-configuring.


### Reading the actual syntax


Take the baseline: `GET key` / `SET key value [EX seconds] [NX|XX]`. `EX` attaches a TTL at write time; `NX` (“only if not exists”) and `XX` (“only if exists”) are the building blocks for simple distributed locks and idempotent writes.


Now look at a slightly more advanced command and actually parse it: `HSET user:1 age 26`.
- **`HSET`** is the action — “Hash Set.” It tells Redis: find a box, and put a mini filing cabinet (a Hash) inside it.
- **`user:1`** is the **key** — the name tag on the box. To Redis, this is just a flat string, `u-s-e-r-:-1`. The colon means nothing to Redis itself — Redis has no real folders or directories, it’s one giant flat keyspace. The colon is a _human convention_ engineers adopted to fake a namespace (“the user whose ID is 1”). You could just as validly call it `user_1`, but `entity:id` is the industry standard.
- **`age`** is the **field** — the name of a specific slot inside that Hash.
- **`26`** is the **value** stored in that field.


Multiple field-value pairs chain in the same command: `HSET user:1 age 26 name John` is perfectly valid — Redis reads left to right and sets both fields on the same Hash in one call. (If a value has spaces, quote it: `name "John Doe"`.)


### Why picking the right structure matters (not just JSON blobs everywhere)


Here’s the concrete cost of getting this wrong. Imagine a 50-field user profile stored as one giant JSON string. To update just the `age` field, the naive flow is:
1. `GET` the entire string over the network
2. Parse the JSON (CPU cost)
3. Change one field
4. Re-serialize the whole thing back into a string
5. `SET` the whole string back


All of that, to change two digits. Compare that to `HSET user:1 age 26` on a proper Hash — Redis jumps straight to that one field in memory and updates it, O(1), no round-trip of the whole object, no blocking the single thread with unnecessary work.


### The data types, and their canonical uses


| Type                       | What it looks like                   | Canonical use                                                               | Example command                 |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------- |
| String                     | A sticky note                        | Counters (`INCR` is atomic), simple cache entries, lock tokens              | `SET weather:nyc "Sunny"`       |
| Hash                       | A mini filing cabinet                | Session objects, user profiles — update one field without touching the rest | `HSET user:1 age 26`            |
| List                       | An ordered line                      | Queues, recent-activity feeds                                               | `LPUSH messages "hello"`        |
| Set                        | A VIP guest list, no duplicates      | Tags, unique visitors, mutual friends, O(1) membership check                | `SADD visitors "ip_address"`    |
| Sorted Set (ZSet)          | A leaderboard, items ranked by score | Leaderboards, priority queues, rate limiters, time-ordered indexes          | `ZADD highscores 999 "Player1"` |
| Stream                     | An append-only log                   | Event sourcing, durable queues                                              | —                               |
| HyperLogLog / Bitmap / Geo | Approximate structures               | Unique counts, flags, geospatial                                            | —                               |


**List direction is a common trip-up.** `LPUSH` pushes to the **Left** (the front). So `LPUSH messages "hello"` then `LPUSH messages "bye"` gives you `["bye", "hello"]` — not `["hello", "bye"]` — because each new push shoves the previous item further right. `LPUSH` + `LPOP`/`RPOP` off the other end is exactly how you’d build a recent-activity feed, since the newest item is always the one landing at the front. If instead you want a traditional first-come-first-served queue, you `RPUSH` onto the back and `LPOP` off the front.


**A concrete “wrong tool” example — leaderboards.** If you tried to build a million-player leaderboard using a plain List instead of a ZSet, answering “what’s Player 854’s current rank?” would mean scanning through the list yourself to figure out position — an O(N) operation on a huge structure, exactly the kind of thing that blocks the single thread. A Sorted Set keeps every member ranked by score natively, so rank and range queries are fast by construction — this is _why_ ZSets are the standard tool for leaderboards, rate limiters, and any “who’s in what position” problem.


---


## Phase 2: Eviction & Memory


### The bouncer analogy


Imagine your Redis instance is configured with a strict 10GB memory limit (`maxmemory`). The server’s been running for months and is now completely full. A user tries to save a new profile — there’s no physical room. The “warehouse manager” (Redis) has exactly two options, like a bouncer at a full club facing a new arrival:

1. **Turn the new guest away** — this is `noeviction`, Redis’s _default_. It rejects the new write with an error. Use this when Redis is acting as a primary datastore where losing data is unacceptable.
2. **Kick someone out to make room** — an eviction policy actually removes an existing key to free space.

Eviction only ever happens once `maxmemory` is hit — you must explicitly set it, or keys simply stay in memory forever regardless of policy (and a 64-bit instance with `maxmemory 0` has no ceiling at all).


### The eight policies, and the LRU vs. LFU distinction that trips people up


| Policy                    | Behavior                               | Use when                                                          |
| ------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `noeviction` (default)    | Reject writes with an error when full  | Redis is a datastore that must not lose data                      |
| `allkeys-lru`             | Evict least-recently-used, any key     | **The standard interview answer** — safe default for a pure cache |
| `allkeys-lfu`             | Evict least-frequently-used (4.0+)     | Protect a small hot subset from a burst of one-off accesses       |
| `allkeys-random`          | Evict at random                        | Rare — all keys roughly equally hot                               |
| `volatile-lru/lfu/random` | Same, but only among keys _with a TTL_ | Mixing durable + cacheable data in one instance                   |
| `volatile-ttl`            | Evict nearest-expiry first             | Rate limiters / short-lived keys                                  |


**A concrete illustration of why LRU alone isn’t always right:** imagine User A’s profile is accessed 1,000 times a day, but nobody has happened to look at it in the last 10 minutes. User B’s profile is almost never accessed — maybe once a month — but someone looked at it 5 seconds ago. Under strict `allkeys-lru`, the bouncer only checks _recency_, ignoring overall popularity — so User A, despite being far more valuable, gets evicted, while the barely-used User B stays. `allkeys-lfu` fixes exactly this blind spot by tracking access _frequency_ instead of recency, protecting genuinely hot keys from being evicted just because of a short quiet period.


**The senior-level gotcha: LRU/LFU are approximated, not exact.** Maintaining a perfectly sorted global list of every key’s last-access time would itself cost real memory and CPU — directly working against the single-thread speed goal from Phase 0. So Redis samples `maxmemory-samples` random keys (default 5), and evicts the “oldest” (or least-frequent) _of that sample_ — not the true global oldest. It’s a deliberately hacky-but-fast trade: close enough to correct, at a fraction of the cost of perfect accuracy. Raising `maxmemory-samples` to 10 improves accuracy at a small CPU cost. Monitor `evicted_keys` to confirm the policy is behaving as expected in production.


**Decision shortcut:** pure cache, anything evictable → `allkeys-lru` (or `allkeys-lfu` for skewed/viral access patterns). Mixing durable + cache data → `volatile-*`. Must never lose data → `noeviction`, and scale up/out instead of relying on eviction.


### Memory fragmentation — the silent killer that isn’t about being “full”


Redis uses the **jemalloc** allocator, which hands out memory in fixed size-class “bins” — think standard-sized pallets in a warehouse. As you constantly add, delete, and replace differently-sized data (high churn), you leave scattered empty “holes” that can’t always be reused for a differently-sized object later. The result: the OS sees Redis using far more physical RAM (`used_memory_rss`) than the actual logical data size (`used_memory`) — space is being wasted on fragmentation, not real data.


**Key metric:** `mem_fragmentation_ratio = used_memory_rss / used_memory` (from `INFO memory`).
- 1.0–1.1: optimal
- 1.1–1.5: normal
- >1.5: significant — act
- >2.0: high
- <1.0: Redis is swapping to disk — a **severe latency emergency**, fix immediately


Also track _absolute_ `mem_fragmentation_bytes` — a 1.6 ratio on 10GB wastes far more real memory than a 2.4 ratio on 2MB, so the ratio alone can mislead.


**How you fix it without a restart, despite being single-threaded — the apparent paradox.** You can’t pause the whole server to reorganize gigabytes of memory on one thread. Instead, `activedefrag` (`CONFIG SET activedefrag yes`) works incrementally: picture a warehouse worker who reorganizes just one half-empty pallet during the split-second pause between customers, rather than shutting the whole warehouse down. Redis scans memory in tiny batches _during_ the normal event loop, relocating small pieces of fragmented data into contiguous regions — throttled by CPU thresholds, so if real traffic gets busy, the defrag work automatically slows down rather than competing for the thread. A full restart (reloading fresh from a compacting RDB snapshot) is the “nuclear” option, rarely necessary. Design-level fixes: keep values small, group related fields into Hashes instead of many separate keys, avoid huge individual keys, and reduce churn.


**Interview rehearsal:** “Your `mem_fragmentation_ratio` is 1.8 — what’s happening and what do you do?” → explain the jemalloc-bins-plus-churn mechanism, then walk through enabling `activedefrag` before ever mentioning a restart.


---


## Phase 3: High-Performance Execution — Pipelining vs. MULTI/EXEC vs. Lua


### The problem they all solve differently


Every command you send to Redis travels over the network — even though Redis processes it in microseconds once it arrives, the round-trip itself costs time. If you need to load 1,000 new profiles and send 1,000 individual `HSET` commands one at a time, your application eats 1,000 separate network round-trips before it’s done.


These three tools get conflated constantly, but they solve genuinely different problems:


| Tool                   | Solves                                    | Guarantees                                                                                          | Doesn’t guarantee                                                                 |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Pipelining**         | Network round-trip overhead               | Client batches N commands, sends them all, reads all replies together                               | **Atomicity** — other clients’ commands can interleave between yours              |
| **MULTI/EXEC**         | Atomicity/isolation                       | Commands queue server-side and run as one uninterrupted unit; `WATCH` adds optimistic check-and-set | No rollback on a command error (unlike SQL); can’t branch on intermediate results |
| **Lua (EVAL/EVALSHA)** | Atomic execution _with_ conditional logic | Whole script runs atomically in one round trip, can branch on intermediate reads                    | Blocks the single thread while running — keep scripts short                       |


### The gotcha that catches people who reason from Phase 0’s mental model


It’s tempting to assume: “Redis is single-threaded, so once my 1,000-command pipeline starts, nothing else can interleave until it’s done.” **This is wrong, and it’s a favorite interview trap.** Pipelining is purely a _client-side_ batching trick — your app stuffs 1,000 commands into one network envelope and mails it over. When the single thread opens that envelope, it processes the commands one at a time — but if another client’s request arrives mid-envelope, the thread can pause between your commands and serve that other request before returning to yours.


So: **pipelining buys throughput, not atomicity.** If you need both — bulk speed _and_ a guarantee that nothing else interleaves — you send a `MULTI`/`EXEC` block _inside_ a pipeline, combining the two tools rather than assuming one gives you the other.


Redis’s own benchmarks show throughput scaling almost linearly with pipeline depth, up to ~10x baseline — a `-P 16` benchmark reached ~1.5M SET/sec and ~1.8M GET/sec versus a much lower non-pipelined baseline. Practical batch sizes are workload-dependent, commonly ~100–1,000 commands (too large starts hurting latency/memory).


**Where Lua earns its place:** it’s the only one of the three that can make a decision mid-operation — e.g. “check if this key exists, and if it does, do X, else do Y” — atomically, in one round trip. Pipelining and MULTI/EXEC can’t branch on intermediate reads; Lua can. This makes it the right tool for things like a reliable single-flight lock with safe release, or rate-limiting logic that needs a check-then-act step.


**Rule of thumb:** pipeline for throughput; script (or MULTI/EXEC) for consistency/atomicity. In Cluster mode, everything in one atomic batch must live in the same hash slot (see Phase 4’s hash tags).


---


## Phase 4: Cluster Mode — Sharding & HA


### The physical limit that forces this conversation


Eventually your dataset outgrows any single machine’s RAM — you might need 1,000GB but the biggest RAM stick available holds 100GB. Multiple Redis servers working together solve this, but there are two fundamentally different ways to combine them.


### Replication vs. Sharding — say this distinction out loud

- **Replication**: the _same_ data is copied across multiple servers. Every node holds everything — this scales reads and gives fault tolerance / geographic proximity to clients, but it never scales writes or your total memory ceiling.
- **Sharding (Cluster mode)**: the dataset is _split_ — 10 shards each hold ~1/10 of the data and absorb ~1/10 of the writes.

Use Cluster when “one machine isn’t big enough” and/or “not reliable enough.” If _only_ reliability matters and the dataset fits fine on one machine, Redis Sentinel (HA without sharding) is the simpler tool — don’t reach for Cluster’s operational complexity if you don’t need the sharding.


### How a key finds its server — hash slots


If data is scattered across 10 servers, how does your app instantly know which one holds `user:1` without asking every server? Redis Cluster splits the keyspace into a **fixed 16,384 hash slots**. `HASH_SLOT = CRC16(key) mod 16384`, and each master owns a contiguous range of slots. Send `SET user:1 "John"`, the formula spits out a slot number (say, 4000), and the cluster’s slot map says “Server #3 owns slots 3000–5000” — the command routes straight there.


**Why 16,384 specifically, and why this is a strong senior signal to know:** cluster nodes constantly gossip heartbeats to each other, and each heartbeat includes a bitmap of the slots that node owns. A 16,384-bit bitmap costs only ~2KB per heartbeat; 65,536 slots would cost ~8KB — a real bandwidth waste multiplied across every heartbeat, every node, many times a second. Combined with a practical recommended max of ~1,000 nodes, 16,384 is the deliberate sweet spot (per Redis creator Salvatore Sanfilippo, GitHub issue #2576).


### The CROSSSLOT problem, and how hash tags fix it


Sharding creates a new headache for atomic multi-key operations: Redis refuses to run a transaction spanning two keys that live on _different_ servers — it throws `CROSSSLOT` and blocks it. Imagine a checkout feature needing to atomically update both `user:42:profile` and `user:42:cart`. The fix: wrap the part of the key you want hashed in curly braces — `{user:42}:profile` and `{user:42}:cart`. Redis’s hashing formula only looks at the `{user:42}` portion, ignoring the rest, so both keys are _forced_ onto the same hash slot and therefore the same server — making them eligible for the same `MULTI`/`EXEC` or Lua script.


### Failover mechanics


Each master has one or more replicas; nodes gossip over the cluster bus (client port + 10000, e.g. 16379). Failure detection: `PFAIL` → `FAIL` once a majority of masters agree → replicas hold an epoch-based election → one is promoted → topology propagates via gossip. Recovery time ≈ `cluster-node-timeout` + ~1-2s. A working cluster needs ≥3 masters (majority must vote); production standard is 6 nodes (3 masters + 3 replicas), so every master has a failover target.


### Client routing


No proxy — any node answers for the slots it owns, and redirects otherwise. `MOVED` = permanent redirect (client caches the new slot→node map). `ASK` = temporary redirect during an in-progress slot migration (client sends `ASKING` then the command, without updating its map). Smart clients cache the slot map and refresh on `MOVED`.


`cluster-require-full-coverage: yes` (default) makes the whole cluster refuse writes if _any_ slot is uncovered — set `no` for caches where partial availability beats a full outage.


---


## Phase 5: Persistence Trade-offs — What Survives a Crash


Redis lives in RAM, which means a crash or power loss wipes it clean unless you’ve configured a way to save copies to disk.


| Mechanism                     | How it works                                                                                 | Durability                                                                                                                       | Cost                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **RDB** (snapshots)           | Point-in-time binary dumps at intervals, written by a forked child (parent does no disk I/O) | Weak — lose everything since the last snapshot on a crash                                                                        | Compact, fast backups, fast restarts                                                    |
| **AOF** (append-only file)    | Logs every write command, replayed on restart                                                | Strong, tunable via `appendfsync`: `always` (safest/slowest), `everysec` (sweet spot, ~1s max loss), `no` (OS-controlled, risky) | Larger files, slower restart on huge datasets, more CPU (runs on primary _and_ replica) |
| **Hybrid (RDB+AOF, Redis 7)** | On rewrite: write RDB snapshot, then append new commands as AOF                              | Fast restart (parse compact RDB) + low data loss (recent AOF tail); recovers from AOF when both are enabled                      | Recommended default for serious production stateful use                                 |
| **No persistence**            | N/A                                                                                          | Data is ephemeral by definition                                                                                                  | Valid and common for a pure cache tier                                                  |


**A concrete worked decision:** Redis holding temporary website session tokens, purely as a cache. Losing a few minutes of sessions on a crash means a handful of users have to log back in — mildly annoying, not damaging. **RDB** is the right call here: it avoids AOF’s constant CPU-hungry logging, and a rare crash only loses a small, acceptable window of data. (You could even run with _no persistence at all_ for a pure cache — RDB just gives a nicer middle ground so a restart doesn’t leave the server completely cold.)


**The blunt guidance:** RDB when Redis is just a cache; AOF (or hybrid) when Redis holds critical state; hybrid if unsure. Managed services (AWS ElastiCache, Azure Cache) expose these as config toggles. On ElastiCache specifically, AOF’s throughput penalty grows once CPU/server load exceeds ~90%.


---


## Phase 6: The Architectural Decision — “Should Redis Be In This Design, and How?”


This is where the tool knowledge becomes system-design judgment.


### A worked capstone example


Say you’re designing the backend for a flash sale — a limited-run product drop expecting a massive traffic spike at a fixed moment. You need Redis to handle three distinct jobs:

1. **Inventory** — a strictly limited count (say, 1,000 units) that can never be oversold.
2. **A live “recent purchases” feed** — the last 50 buyers, scrolling.
3. **Rate limiting** — blocking bots from hammering the page.

It’s tempting to reach for a Hash for the inventory count since it “feels like an object.” But the actual canonical choice is a plain **String**, using Redis’s atomic `INCR`/`DECR`. If 500 people click “Buy” at the exact same millisecond, the single thread processes them one at a time, safely decrementing 1,000 → 500 without ever double-counting — that atomicity is exactly what a hard inventory constraint needs, and a Hash doesn’t buy you anything extra here.


For the live feed, a **Sorted Set feels intuitive** because purchases are naturally time-ordered — but a plain **List** is the simpler, purpose-built tool: `LPUSH` each new purchase to the front, and cap the list at 50 items. No need for score-based ordering when insertion order _is_ the order you want.


For rate limiting, a **Sorted Set (ZSet)** is the right call — using the timestamp as the score lets you track exactly how many requests a given IP made in the last N seconds, and prune/query by time range natively.


**And the eviction policy decision matters just as much as the data types.** Because this Redis instance is holding _critical state_ — the inventory count and the rate limiter, not just disposable cached data — you cannot let the “warehouse manager” silently evict any of it to make room. The correct policy here is **`noeviction`**: if memory fills up during the spike, Redis should reject new writes with an error rather than silently deleting the inventory count or the rate-limit tracking. This is the direct opposite of a pure read-through product catalog cache, which would want `allkeys-lru`.


### The general decision procedure to run for any system

1. **What’s the access pattern?** Pure read-heavy caching → straightforward. Need atomic counters, rate limiting, leaderboards, pub/sub, or a lightweight queue → Redis’s data structures are doing real work, not just caching convenience.
2. **What’s the durability requirement?** If Redis would become the _only_ copy of important data, that’s a persistence decision (Phase 5) — and a signal to ask whether it should really live in a primary datastore instead.
3. **Does it actually need Cluster, or is single-node + Sentinel enough?** Don’t reach for hash slots and `CROSSSLOT` complexity unless the dataset or throughput genuinely won’t fit one node.
4. **What’s the failure mode if Redis goes down?** A pure cache-aside setup degrades gracefully to the DB. Redis as a rate limiter, distributed lock, or session store means its downtime becomes _your_ downtime — this should directly shape both the eviction policy (`noeviction` vs `allkeys-lru`) and the persistence choice.
5. **Is there a simpler tool that does the same job?** HA-without-sharding is Sentinel, not Cluster. Data that must never be lost might belong in Postgres with a read replica, not in Redis with `appendfsync always`.

### Common interview questions to rehearse

- “Which eviction policy for a pure cache, and how does Redis actually implement LRU?” → `allkeys-lru`; note it’s _approximated/sampled_, not exact.
- “Your `mem_fragmentation_ratio` is 1.8 — what’s happening and what do you do?” → jemalloc bins + churn, then `activedefrag` before a restart.
- “Pipelining vs. transactions vs. Lua — when each?” → throughput vs. atomicity vs. atomicity-with-branching. (And: pipelining does _not_ guarantee no interleaving from other clients.)
- “How does Redis Cluster route a key, and how do you do a multi-key op across shards?” → hash slots, `MOVED`/`ASK`, hash tags for co-location.
- “RDB vs. AOF for a cache vs. for a source-of-truth store?” → RDB for pure cache, AOF/hybrid when Redis holds critical state.

**Final task:** Pick a real or hypothetical system (Swananda’s ordering flow is a good candidate) and write a one-page design note: where exactly Redis sits in the architecture, which data types back which features, what eviction policy and persistence mode you’d choose and why, whether it needs Cluster or just Sentinel, and what happens to the system if that Redis instance goes down.


---


## Phase 6b: Redis vs. Everything Else — Knowing When _Not_ to Reach for Redis


Phase 6 covered how to decide _what Redis should do_ once you’ve chosen it. This section covers the step before that: whether Redis is even the right caching technology in the first place, versus the other tools that occupy the same general space.


### The core distinction that explains all the others


Most traditional caches — Memcached being the classic example — are simple key-value stores: you’re storing sticky notes (plain strings or byte arrays). Redis is a **data structure server**: you get a full toolbox (Lists, Hashes, Sets, ZSets, Lua scripting) that lets you manipulate data _in place_, inside the cache, without ever pulling it back into your application to modify it and send it back. That one difference — “dumb string store” vs. “structured, in-place-editable store” — is what drives almost every decision below.


| Technology             | Core identity              | Primary advantage                                            | Best used for                                                             |
| ---------------------- | -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Redis**              | Data structure store       | Rich data types, Lua scripting, persistence                  | Complex state, leaderboards, rate limiting, pub/sub                       |
| **Memcached**          | Pure key-value cache       | Multi-threaded simplicity, highly memory-efficient           | HTML fragment caching, simple token storage, massive read-heavy workloads |
| **Caffeine / Ehcache** | In-process (local) cache   | Zero network latency, runs inside the app’s own memory (JVM) | Static config data, lookup tables, reducing DB load per-instance          |
| **Hazelcast / Ignite** | In-memory data grid (IMDG) | Distributed computing, tight framework integration           | Processing massive datasets across nodes, distributed locking             |
| **Dragonfly / KeyDB**  | Modern Redis drop-in       | Multi-threaded execution, massive vertical scaling           | Replacing Redis when a single node is CPU-thread-bottlenecked             |


### 1. Redis vs. Memcached — the classic debate


Memcached was the dominant caching tool before Redis, and it’s still relevant: it’s a pure, multi-threaded key-value store.


**Choose Memcached when** you’re caching massive, simple strings — rendered HTML pages, raw query results — across many CPU cores on one big machine, and you genuinely don’t care if the data vanishes on a restart (no persistence story needed).


**Choose Redis when** you need to update _part_ of the data rather than the whole thing — incrementing a counter, changing one field in a user profile. With Memcached, updating one field means fetching the entire string, modifying it client-side, and writing the whole thing back — exactly the “giant JSON blob” problem from Phase 1 that Hashes solve. Redis does that update in place, instantly. Redis is also the pick if you need the data to survive a crash (RDB/AOF), since Memcached has no persistence mechanism at all.


### 2. Redis vs. in-process caches (Caffeine / Ehcache)


In a Spring Boot / Java stack, it’s common to cache directly inside the application using `@Cacheable` backed by Caffeine — this is the “L1” local cache from earlier discussions of multi-tier caching.


**Choose Caffeine/Ehcache when** the data is highly static and read constantly — country codes, tax rates, regulatory lookup tables (e.g. FSSAI rules for a food business) — because it lives directly in the application’s own heap memory, meaning **zero network latency**. It is, quite literally, the fastest cache possible, because there’s no network hop at all.


**Choose Redis when** you’re running multiple instances of your application (as any real microservices setup does) and need _shared_ state. A local cache means instance A can hold different data than instance B — a coherence problem you’ve already seen (Phase 4/multi-tier caching). Redis guarantees every instance sees the same single source of truth — critical for something like a shared inventory count during a flash sale, where two instances disagreeing about stock is a real bug, not a cosmetic one.


### 3. Redis vs. in-memory data grids (Hazelcast / Apache Ignite)


These are heavier, more deeply integrated systems typically seen in larger enterprise architectures.


**Choose Hazelcast when** you need to run actual computation on the data where it lives, rather than pulling it to your application first. Instead of transferring 10,000 records over the network just to sum them client-side, Hazelcast lets you send your own code _into_ the cluster, execute it right where the data already sits, and get back just the final result.


**Choose Redis when** you want something language-agnostic, lightweight, and simple to operate. Redis doesn’t execute your application’s code (aside from small Lua scripts) — it just serves data structures fast. It’s meaningfully easier to set up and run than a full data grid, and that operational simplicity is often worth more than the computational power you’re giving up.


### 4. Redis vs. the “modern clones” (Dragonfly, KeyDB)


Recall from Phase 0: Redis is single-threaded, so it’s fundamentally capped at the throughput of one CPU core. Tools like Dragonfly are API-compatible with Redis (same commands, same clients) but are built multi-threaded.


**Choose Dragonfly when** your existing Redis server is genuinely maxing out its single core, and you’d rather scale vertically onto a large multi-core machine than take on the operational complexity of Redis Cluster (hash slots, resharding, `CROSSSLOT` handling from Phase 4).


**Choose Redis when** you want the battle-tested, most widely supported option — every major cloud provider (AWS ElastiCache, GCP Memorystore) offers Redis natively as a managed service, with a huge ecosystem and community behind it. That maturity and support surface area is a real advantage Dragonfly hasn’t fully matched yet.


### The summary architect’s rule


Start with an **in-process cache** (Caffeine/Ehcache) for data that rarely changes and only needs to be fast within one instance. **Default to Redis** for everything else — its versatility and rich data structures make it the right general-purpose choice in most system designs. Only move to **Memcached** or **Hazelcast** once you hit a genuinely specific bottleneck — pure string-caching memory efficiency at massive scale, or distributed compute requirements — that Redis itself doesn’t solve well.


---


## Suggested Pacing


Given an interleaved-revision study style, this fits as one dedicated topic block (~10–14 hrs total), or split: Phases 0–1 together, Phases 2–3 together, Phases 4–6 together (Cluster + persistence + the architecture capstone benefit from being done back-to-back while the mental model is still fresh).

