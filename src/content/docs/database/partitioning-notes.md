---
title: "partitioning-notes"
---


# Partitioning (Sharding) — Complete Notes (DDIA Chapter 6)


## 0. Why Partition at All


Replication (Chapter 5) solves “one machine can’t handle the _traffic_.” Partitioning solves a different problem: **one machine can’t hold the** _**data**_**, or can’t process all the** _**writes**_**, even if traffic were manageable**.


**Partitioning (a.k.a. sharding)** = splitting a large dataset into smaller pieces (**partitions**/**shards**), each held on a different node. Each piece of data lives on exactly one partition (ignoring replicas of that partition).


**Why it matters at scale:** a single machine’s disk, RAM, and CPU are finite. Once your dataset or write throughput outgrows one machine, partitioning is the only way to keep scaling horizontally — replication alone just gives you more _copies_ of data that still all has to fit on each node.


**In practice, partitioning and replication are almost always combined:** each partition has its own set of replicas (its own mini leader-follower or leaderless setup, from Chapter 5). A node in the cluster is typically the leader for some partitions and a follower for others.


```plain text
Full dataset
├── Partition 1 → [ Leader P1 ] → [ Follower P1 ] → [ Follower P1 ]
├── Partition 2 → [ Leader P2 ] → [ Follower P2 ] → [ Follower P2 ]
└── Partition 3 → [ Leader P3 ] → [ Follower P3 ] → [ Follower P3 ]
```


---


## 1. The Core Goal: Even Distribution


The entire point of a partitioning scheme is to spread both **data volume** and **read/write load** evenly across nodes. If it doesn’t, you get a **skewed** partition — one node doing far more work than the others, called a **hot spot**. A cluster of 100 nodes where one node holds 90% of the traffic is barely better than a single machine, but now with 99 idle machines you’re still paying for.


Everything in this chapter is really answering one question: **how do you decide which partition a given piece of data belongs to, such that the distribution stays even?**


---


## 2. Partitioning Strategy #1: Key Range Partitioning


Assign each partition a **contiguous range of keys**, like volumes of a paper encyclopedia (A–C, D–F, G–K, …).


**Example:** a table of sensor readings keyed by timestamp. Partition 1 = Jan, Partition 2 = Feb, Partition 3 = Mar, etc.


**Benefit:** range queries are efficient — `WHERE timestamp BETWEEN Jan 5 AND Jan 10` only has to touch Partition 1.


**The catastrophic failure mode: hot spots from sequential/monotonic keys.**
If your key is timestamp-based (or any monotonically increasing value — auto-increment IDs, `created_at`), **all writes for “right now” always land on the same partition** — today’s date, today’s ID range. Every other partition sits idle while one partition absorbs 100% of write traffic.

> **Concrete example:** an IoT platform partitions sensor data by day. Every single sensor, across every customer, writes to today’s partition. That one partition becomes a permanent, unavoidable hot spot — no matter how many total partitions you have, only one is ever “hot” at any moment.

**Practical fix:** prefix the key with something that spreads writes, e.g., `sensor_id + timestamp` instead of `timestamp` alone — so writes fan out across partitions by sensor rather than all funneling into “today.” You trade away efficient date-range scans across _all_ sensors for even write distribution — a real trade-off, not a free win.


---


## 3. Partitioning Strategy #2: Hash Partitioning


Run each key through a **hash function**, and use the hash output to decide the partition (e.g., `hash(key) % number_of_partitions`, or more commonly, hashed into a fixed keyspace divided into ranges, as in consistent hashing).


**Example:** `user_id` hashed → uniformly scattered across all partitions, regardless of whether user IDs are sequential.


**Benefit:** eliminates the “hot range” problem — a good hash function spreads keys pseudo-randomly and evenly, so no single partition absorbs a disproportionate share just because of key ordering.


**The cost:** you **lose efficient range queries**. Once keys are scattered by hash, `WHERE user_id BETWEEN 100 AND 200` has to query _every_ partition (a **scatter-gather** query) instead of touching one contiguous range — because logically adjacent keys are no longer physically adjacent.


**This is the fundamental trade-off of partitioning:**


|                        | Key Range Partitioning                | Hash Partitioning                           |
| ---------------------- | ------------------------------------- | ------------------------------------------- |
| Range queries          | Fast (single partition)               | Slow (scatter-gather across all partitions) |
| Even load distribution | Risky (sequential keys → hot spots)   | Reliable (good hash spreads evenly)         |
| Best for               | Time-series with query-by-range needs | High-throughput random-access workloads     |


**Real-world example:** Cassandra lets you choose per-table; a common real pattern is a **compound partition key** — hash-partition by `user_id` (spreads load evenly across users) but keep data for a _single_ user range-sorted by `timestamp` within that partition (so per-user time-range queries stay fast). This is the practical answer to “can I get both?” — sacrifice global range scans, keep local ones.


---


## 4. Skew Beyond Key Structure: Hot Keys (Celebrities)


Even a perfect hash function can’t fix this one: sometimes **one specific key** gets disproportionate traffic, not because of how keys are structured, but because of the real-world data itself.

> **Concrete example:** Twitter/X partitions tweets by `user_id`. A hash function distributes user IDs perfectly evenly. But a celebrity with 100M followers generates orders of magnitude more read/write traffic on their _one_ partition than an average user’s partition — no hash function can fix this, because the skew is in the _data_, not the _key distribution_.

**Practical fixes (application-level, not automatic):**
- **Key splitting** — append a small random suffix to hot keys specifically (e.g., `celebrity_id_1`, `celebrity_id_2`, …, `celebrity_id_10`) and spread that one logical entity’s writes across multiple physical partitions. Reads then have to merge results from all the split partitions — extra complexity, but only applied to the small number of keys that actually need it.
- **Caching** — put a read-through cache (Redis) in front of known-hot keys so the partition itself doesn’t absorb the full read volume.
- Some newer systems (e.g., recent Cassandra/ScyllaDB versions) detect hot partitions automatically and apply similar splitting under the hood — but the underlying problem and the mitigation shape is the same either way.


**Senior takeaway:** partitioning schemes are designed for _average-case_ distribution assumptions; **real production skew is often about specific outlier keys, not the overall key distribution**, and needs its own targeted handling.


---


## 5. Secondary Indexes: The Hard Part of Partitioning


Partitioning by primary key is straightforward — you know exactly which partition to route a `GET user:123` to. **Secondary indexes** (querying by something _other_ than the primary key, e.g., “find all cars where `color = red`”) break that simplicity, because the matching rows for `color = red` could be scattered across every partition.


### Local (Document-Partitioned) Secondary Indexes


Each partition maintains its **own index**, covering only the data stored on that partition.

> **Example:** a car marketplace, partitioned by `car_id`. Partition 1 keeps an index of `color = red → [car_ids on Partition 1 only]`. Partition 2 keeps its own separate `color = red` index, covering only its own cars.

**To answer** **`WHERE color = red`****:** you must **query every partition** (scatter-gather) and merge the results — because red cars could be on any partition.

- **Writes are cheap** — updating a car’s color only touches the local index on that car’s own partition.
- **Reads are expensive** — every secondary-index query fans out to all partitions, even if only one partition actually has matching data. This is called **scatter-gather** and it’s the standard cost of local secondary indexes (used by MongoDB, Cassandra, Elasticsearch’s default sharding).

### Global (Term-Partitioned) Secondary Indexes


A **separate index structure**, itself partitioned by the indexed _value_ (not the primary key), spanning the whole dataset.

> **Example:** the same car marketplace has a _global_ index partitioned by `color`. Partition A of this index = colors A–M (includes `red`), Partition B = colors N–Z. All red cars, regardless of which primary partition they physically live on, are listed together in Index Partition A.

**To answer** **`WHERE color = red`****:** you go straight to **one** index partition — fast, no scatter-gather.

- **Reads are cheap** — a single targeted lookup.
- **Writes are expensive** — updating one car (which lives on primary Partition 3, say) might require updating the global index on a _completely different_ partition (the one handling its color) — and that update often can’t be done in the same atomic transaction as the primary write, because it’s on a different node. This typically makes global secondary indexes **eventually consistent** — there’s a lag where the index doesn’t yet reflect a just-written value.

**Senior-level summary:** this is the classic **read-heavy vs. write-heavy** trade-off, and it directly determines system choice. If your workload is dominated by writes with occasional secondary lookups (e.g., logging systems), local indexes are usually fine. If it’s dominated by fast, frequent lookups on secondary attributes (e.g., an e-commerce search-by-filter feature), a global index — accepting eventual consistency — is usually worth it. **This is exactly why DynamoDB’s Global Secondary Indexes (GSIs) are explicitly documented as eventually consistent** while the primary key lookup is strongly consistent — this chapter is the theory behind that very concrete, very common gotcha.


---


## 6. Rebalancing Partitions


As data grows or nodes are added/removed, partitions need to be **rebalanced** — moving data between nodes so load stays even. A rebalancing strategy needs to satisfy a few practical requirements: don’t move more data than necessary, keep the database available for reads/writes during the move, and distribute load fairly afterward.


### The naive approach — `hash(key) % N` — and why it fails


If you partition by `hash(key) % number_of_nodes`, then **changing the number of nodes changes almost every key’s assigned partition**, because the modulus changed. Adding one node to a 10-node cluster (`% 10` → `% 11`) reshuffles the overwhelming majority of keys — even though intuitively, adding _one_ node should only require moving about 1/11th of the data. This makes rebalancing catastrophically expensive: massive unnecessary data movement, straining the network and the nodes just to accommodate a modest capacity change.


### The real-world fix — Consistent Hashing / fixed hash ranges


Instead of hashing modulo the _current_ node count, hash into a large **fixed keyspace** (e.g., a ring from 0 to 2^32) and assign contiguous **ranges** of that keyspace to nodes. Adding a node only means splitting off a portion of the ring from its existing neighbors — only the keys in that reassigned slice move; everything else stays put.

> **Concrete example:** Cassandra and DynamoDB both use variants of consistent hashing for exactly this reason — so that scaling the cluster up or down moves a proportional, bounded amount of data instead of reshuffling the whole dataset.

**Fixed number of partitions (an alternative, simpler approach):** create far more partitions than you currently have nodes (e.g., 1,000 partitions on a 10-node cluster, ~100 partitions per node), and when you add nodes, just **move whole partitions** between nodes rather than re-splitting ranges. Simple to reason about and operationally predictable, but you have to guess the right partition count up front — too few and you can’t scale nodes finely; too many and per-partition overhead adds up. This is how Elasticsearch and Riak commonly operate.


---


## 7. Request Routing: How Does a Client Find the Right Partition?


Once data is spread across N nodes, a client (or your application) needs to know **which node to actually talk to** for a given key. Three approaches, worth recognizing by name in real systems:

1. **Client directly tracks partition assignment** — the client library itself knows the partitioning scheme and routes requests directly (e.g., some Cassandra drivers with “token-aware” routing).
2. **A routing tier / coordinator node** — any node can receive a request and internally forward it to the node that actually owns that partition (e.g., how a Cassandra node without the data will proxy the request to the right one).
3. **A separate coordination service** — a dedicated system (e.g., ZooKeeper, etcd) keeps the authoritative partition-to-node mapping, and nodes/clients consult it before routing. This is how Kafka tracks partition leadership, and it’s the same underlying pattern as the ZooKeeper-based leader election from the fencing-token discussion in Chapter 5.

**Whichever approach:** the partition-to-node mapping **must be kept consistent and promptly updated** as rebalancing happens — a stale mapping means requests get routed to a node that no longer (or doesn’t yet) own that data, which most systems handle by having the wrong node either proxy the request onward or return an error telling the client to refresh its mapping.


---


## 8. Practical / Interview-Level Talking Points

- **Partitioning strategy is a query-pattern decision, not just a scaling decision.** Choosing key-range vs. hash partitioning should be driven by “what do my queries actually look like” (range scans vs. point lookups), not just “how do I spread load evenly” — both goals matter and they pull in opposite directions.
- **Monotonically increasing keys (timestamps, auto-increment IDs) are the single most common real-world cause of partition hot spots** — this is a genuinely frequent production bug, not a theoretical concern. If you see one partition consistently hotter than others, check whether your partition key has any time-based or sequential component.
- **Celebrity/hot-key skew is invisible to the partitioning scheme itself** — no hash function fixes it, because the problem is in the data distribution, not the key distribution. This needs explicit application-level handling (key splitting, caching) and is a classic “why is only one shard on fire” incident root cause.
- **Global secondary indexes trade write atomicity for read speed** — know this trade-off cold, because it directly explains real, documented behavior in systems like DynamoDB GSIs (eventually consistent) vs. its primary key reads (strongly consistent). This is one of those DDIA concepts that maps almost one-to-one onto a specific, nameable AWS gotcha you’ll actually hit in production.
- **`hash(key) % N`** **is a beginner mistake, not a real system’s rebalancing strategy** — recognizing why it fails (and being able to explain consistent hashing as the fix) is a good signal question in interviews, because it tests whether you understand _why_ the naive approach breaks, not just that it does.
- **Partitioning and replication solve different problems and are always combined in real systems** — partitioning spreads data/write-throughput across machines; replication protects each partition’s data against machine failure. Neither one is a substitute for the other.

---


## 9. Quick-Reference Glossary

- **Partition (shard)** — a subset of the full dataset, stored on a specific set of nodes.
- **Skew** — uneven distribution of data or load across partitions.
- **Hot spot** — a partition receiving disproportionately high traffic relative to others.
- **Key range partitioning** — partitions own contiguous ranges of keys; good for range queries, risky for sequential-key hot spots.
- **Hash partitioning** — partitions assigned via a hash of the key; even load distribution, but loses efficient range queries.
- **Scatter-gather** — querying every partition and merging results, because the target data could be anywhere (typical of range queries under hash partitioning, or secondary-index queries under local indexing).
- **Compound partition key** — hash the outer part (e.g., user) for even distribution, range-sort the inner part (e.g., timestamp) for efficient local range queries.
- **Hot key (celebrity problem)** — one specific key receiving disproportionate traffic due to real-world data skew, unfixable by better hashing alone.
- **Key splitting** — appending a random suffix to a hot key to spread its load across multiple physical partitions.
- **Local (document-partitioned) secondary index** — each partition indexes only its own data; cheap writes, expensive scatter-gather reads.
- **Global (term-partitioned) secondary index** — a separate index structure partitioned by the indexed value, spanning the whole dataset; cheap targeted reads, expensive/eventually-consistent writes.
- **Rebalancing** — redistributing data across nodes as the cluster grows/shrinks, while minimizing unnecessary data movement and downtime.
- **`hash(key) % N`** — the naive, broken rebalancing approach; changing N reshuffles almost all keys.
- **Consistent hashing** — hashing into a fixed keyspace and assigning ranges to nodes, so adding/removing a node only moves a proportional slice of data.
- **Fixed number of partitions** — pre-creating many more partitions than current nodes, and moving whole partitions (not re-splitting ranges) as nodes change.
- **Request routing** — how a client/application discovers which node owns a given partition (client-side awareness, routing-tier proxying, or a coordination service like ZooKeeper/etcd).
