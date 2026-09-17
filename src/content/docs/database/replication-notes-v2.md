---
title: "replication-notes-v2"
---


# Replication — Complete Notes (DDIA Chapter 5)


## 0. Why Replicate at All


Replication = keeping the same data on multiple machines over a network. Three motivations:
- **High Availability** — survive a server crash.
- **Latency** — put a copy geographically closer to users.
- **Scalability** — spread read load across multiple machines.


**The fundamental challenge isn’t making the copy — it’s that copying takes time.** Because of network delay, there is always a window where replicas disagree with the leader/each other. Nearly every interesting replication problem is a consequence of that window (**replication lag**).


---


## 1. Leader-Follower (Single-Leader) Replication


All writes go to one **Leader**. The Leader streams those changes to **Followers** (replicas), which serve reads.


### Sync vs. Async

- **Synchronous** — Leader waits for the Follower to confirm the write before telling the client “success.” Zero data loss on failover, but every write pays network round-trip latency.
- **Asynchronous** — Leader commits locally, tells the client “success” immediately, then ships the change to Followers in the background. Fast, but **risks data loss on failover**.

**Worked example:** async replication, leader crashes a millisecond after acknowledging a password change but before shipping it to the follower. When the follower is promoted, that password change is **gone** — even though the user was told it succeeded. Core trade-off: async = speed now, possible silent data loss later; sync = safety, paid for on every write.


_(Note: full sync-to-every-replica is rare in production — most real systems use semi-synchronous replication, waiting for just one replica to ack rather than all of them, to avoid making every write’s latency depend on the slowest replica.)_


---


## 2. Failover, Split Brain & Fencing Tokens


When the Leader dies, a Follower is promoted. Three steps:
1. Detect the Leader is dead (usually a timeout — risk of false positives).
2. Elect a new Leader (typically the least-lagged replica).
3. Reconfigure clients/replicas to point at the new Leader.


### Split Brain 🧠🚧


The dangerous case isn’t a true crash — it’s a **network partition**. The old Leader is still alive and still accepting writes on its side of the broken link, while the rest of the cluster, unable to reach it, promotes a new Leader. Now **two Leaders are both accepting writes simultaneously**.


**Worked example:** Leader A (isolated) changes a password to `cat`; Leader B (newly promoted) changes the same field to `dog`. When the network heals, there are two conflicting versions of the truth and no inherently safe way to know which to keep.


**Fix — Fencing Tokens 🤺:**
1. A central lock manager (e.g., ZooKeeper) hands each newly elected Leader a **monotonically increasing token** (Leader 1 → Token #1, Leader 2 after failover → Token #2).
2. Every write the Leader makes to storage carries its token.
3. The storage layer remembers the **highest token it has ever seen**. If the old “zombie” Leader 1 reconnects and tries to write with Token #1 — lower than the #2 already seen — the storage layer **rejects the write outright**.


This blocks the zombie Leader from corrupting data, without needing the zombie Leader to know it’s been deposed.


---


## 3. Replication Log Implementation & CDC


The Leader has to physically transmit changes to Followers (or to entirely different downstream systems). Two dominant approaches, with very different implications:


### Physical (WAL) replication


The exact same low-level **Write-Ahead Log** bytes used for local crash recovery (see the transactions/WAL notes) are shipped to Followers verbatim. Reliable and simple, but tightly coupled to the storage engine’s internal, proprietary format — a Postgres WAL means nothing to MySQL, Snowflake, or Elasticsearch, and usually requires the replica to run the same database version.


### Logical (row-based) replication


Instead of raw bytes, the database emits a **structured, decoupled description** of each change — e.g. `Table: Orders, Action: UPDATE, Row ID: 5, status: pending → shipped`, typically as JSON-like messages.


**Why this matters:** every external system in the world can parse a structured/JSON message; almost none can parse another database’s proprietary physical log format. This is exactly what powers **Change Data Capture (CDC)** — pipelines (Debezium, Kafka Connect, etc.) that stream a database’s changes out to search indexes (Elasticsearch), data warehouses (Snowflake), caches, or other services, entirely decoupled from the source database’s internal storage format. Logical replication is the “universal translator” that makes CDC possible.


_(Minor gap, worth knowing the names exist even if not covered in depth: statement-based replication — shipping the literal SQL statement — is largely abandoned because non-deterministic functions like_ _`NOW()`_ _or_ _`RAND()`_ _replay differently on each replica; trigger-based replication — application-level triggers pushing changes elsewhere — is the most flexible but highest-overhead option, generally a last resort.)_


---


## 4. The Read Anomaly Trio (Replication Lag Effects)


These occur even with zero crashes — purely from the time it takes data to propagate.


### Read-Your-Writes (Read-After-Write) Consistency

> User posts a comment (write → Leader). Page refresh reads from a nearby Follower that hasn’t caught up yet — the comment appears to have vanished. User may resubmit → duplicate post.

**Fix:** route a user’s own reads to the Leader for a short window after they write (e.g., “if this user wrote in the last 1 minute, read from Leader; otherwise, Follower”). Balances correctness for the writer against keeping the bulk of read traffic off the Leader.


**Implementation detail:** this decision lives in the **application layer** (or a proxy), never the database engine — a standard DB has no concept of “which user is asking.” Track “did this user just write” via:
- A fast cache (Redis) keyed by user ID storing `last_written_timestamp`.
- The user’s session token/JWT carrying the timestamp directly.


### Monotonic Reads

> User randomly load-balanced across Followers with different lag. Refresh 1 lands on a fast Follower (sees a just-scored goal); refresh 2 lands on a slow Follower (5s behind) — the goal _disappears_, an illusion of time moving backward.

**Two fixes:**
1. **Logical clock / LSN token** — client is handed “you’ve read up to LSN #500”; on the next read, if the assigned Follower hasn’t reached #500 yet, it **waits** before responding (this is roughly how Google Cloud Spanner / Cosmos DB approach it).
2. **Sticky routing (session affinity)** — hash the user ID so the same user always lands on the same Follower. Simpler; guarantees that one user’s own timeline moves forward monotonically, even if that replica itself is generally lagging.


### Consistent Prefix Reads 📖


Happens in databases that are **both replicated and partitioned/sharded**. If causally related writes land on different partitions replicating at different speeds, a reader can see effects **out of causal order**.

> Chat app: User A (“How is the weather?”) on Partition 1 (5s lag); User B (“It is raining!”) on Partition 2 (10ms lag) — a reply to A. A third user refreshing sees B’s answer appear _before_ A’s question exists on their screen — nonsensical without the causal context.

**Fix:** attach explicit causal metadata to the dependent write — e.g. `replies_to: Message_A_ID`. When retrieving data, the system checks: “I have B’s message, but do I have the message it depends on (A)? If not, hide B until A is visible.” This enforces causal ordering directly rather than relying on lucky timing.


---


## 5. Implementing Read Routing in Practice


Three architectural options for Leader/Follower read-write splitting:

1. **Application layer / code** — microservice maintains two connection pools (Leader, Followers); code/ORM decides per query. Simple per-service, but routing logic must be duplicated (or shared via a library) across every service and language.
2. **Smart drivers / client-side libraries** — e.g. AWS Aurora JDBC driver, MySQL Connector/J — natively split `SELECT` vs `INSERT/UPDATE/DELETE` and route automatically.
3. **Database proxy (dedicated middleware)** — e.g. ProxySQL, Pgpool-II. Microservices connect to the proxy as if it’s a single database; the proxy inspects SQL and routes it.

```plain text
[ Microservice 1 ] ──┐
[ Microservice 2 ] ──┼──> [ DB Proxy ] ──┬──> [ Leader DB (Writes) ]
[ Microservice 3 ] ──┘                    ├──> [ Replica DB 1 (Reads) ]
                                           └──> [ Replica DB 2 (Reads) ]
```


**Proxy configuration concepts (ProxySQL-style):**
- **Hostgroups** — group physical servers by role (10 = Writers/Leader, 20 = Readers/Replicas).
- **Query rules** — regex/pattern routing (`SELECT ... FOR UPDATE` → Writer, since it takes row locks; plain `SELECT` → Reader; `INSERT/UPDATE/DELETE` → Writer).
- **Lag protection** — the proxy monitors replica lag and automatically stops routing reads to a replica that falls too far behind (e.g. >2s) until it catches up.


**Trade-off for a multi-language, multi-service org:** application-layer routing means re-implementing the same logic in Java, Node.js, and Go separately — real drift risk over time. A **database proxy centralizes the logic once**, language-agnostically, at the cost of an extra network hop and one more piece of infrastructure to operate. For a 10-microservice, 3-language shop, a proxy is generally the easier long-term maintenance story.


---


## 6. Multi-Leader Replication


Single-leader’s limitation: **all writes funnel through one node** — painful for multi-datacenter apps (every write from London crosses the Atlantic to a New York Leader).


**Multi-Leader replication:** more than one node accepts writes (e.g., one Leader per datacenter), each asynchronously syncing with the others in the background.

- **Benefit:** writes are accepted locally in each region — much better write latency; each datacenter can keep accepting writes even if its link to the others drops.
- **The unavoidable cost: write conflicts.** Two Leaders can accept conflicting writes to the same record at nearly the same moment — something single-leader replication never has to handle, since all writes are serialized through one node.

**Worked example:** New York Leader accepts a Wiki title change to “Apples”; London Leader, at nearly the same millisecond, accepts a change to “Oranges.” When the datacenters sync, there’s a genuine conflict to resolve.


**Conflict resolution:**
- **Last Write Wins (LWW)** — compare timestamps, discard the older write. Simple, but has a real hidden danger: **clock synchronization**. Server clocks across datacenters are never perfectly in sync (drift of milliseconds is normal even with NTP); if London’s clock is 50ms ahead, its write “wins” even if the New York user actually clicked save later in real time. LWW is fundamentally a decision to accept permanent, silent data loss on one side to resolve the conflict.
- **CRDTs (Conflict-free Replicated Data Types)** — data structures designed so concurrent updates merge mathematically without conflict, avoiding LWW’s data loss. Used by collaborative tools like Google Docs/Figma and some multi-region databases.
- **Custom application-level merge logic** — e.g., union both users’ additions to a shared cart instead of picking a single winner.


_(Minor gap: propagation topology between multiple leaders — circular, star, or all-to-all — determines how many hops a write takes to reach every replica and how likely out-of-order delivery is; worth knowing the names exist, but the core takeaway is that more leaders/hops means Consistent Prefix Read-style ordering problems get harder, not just conflict resolution.)_


---


## 7. Leaderless Replication & Quorums


Dynamo-style architecture (Cassandra, Riak, Voldemort): **no Leader at all**. Writes are sent directly to multiple replicas; reads similarly query multiple replicas and reconcile.


### Quorums


With **N** total replicas, a write succeeds once **W** replicas ack it; a read queries **R** replicas and returns the newest version among them.


**Worked example:** N=3 replicas (A, B, C). Requiring all 3 to ack a write means the whole system goes down the moment any one node (e.g., C, mid software-update) is unreachable — too fragile. Requiring only **2 out of 3** for both writes and reads (`W=2, R=2`) keeps the system available through single-node outages while still guaranteeing correctness: because `W + R > N` (`2+2 > 3`), any read group and any write group are mathematically guaranteed to overlap by at least one node — you can never read a value without also reading at least one replica that has the latest write.


### Read Repair 🛠️


When Node C comes back online after missing an hour of writes, a subsequent read (satisfying `R=2`) might be routed to A (fresh, version 100) and C (stale, version 90). The database compares versions as a side effect of serving that read, returns the fresh value to the user, **and** quietly pushes the newer data back to C in the background — the fresher replica repairs the staler one purely as a byproduct of normal read traffic. Over time, active reads gradually heal the whole cluster without any dedicated repair job.


_(Minor gaps worth naming:_ _**sloppy quorum + hinted handoff**_ _— if the “correct” replicas for a key are temporarily unreachable, the write is accepted by other, non-owning nodes instead to preserve availability, with a note to forward it to the rightful owner later; this trades strict quorum correctness for availability._ _**Anti-entropy**_ _— a background process that continuously compares replicas and syncs missing data independent of read traffic, complementing read repair for keys that are rarely read._ _**Version vectors**_ _— a generalization of the single version-number idea across multiple replicas, used to distinguish a genuine causal update from a true concurrent conflict — the leaderless-replication analog of the clock-drift problem LWW has in multi-leader systems.)_


---


## 8. Summary Comparison


| Model             | Writes accepted at                        | Conflict handling                              | Best for                                     |
| ----------------- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| **Single-leader** | One node                                  | None needed (writes serialized through leader) | Most OLTP systems; simplest mental model     |
| **Multi-leader**  | Multiple nodes (e.g., one per datacenter) | Required — LWW or CRDTs                        | Multi-region writes, offline-capable apps    |
| **Leaderless**    | Any replica, reconciled via quorum        | Required — version vectors, read repair        | Very high availability, Dynamo-style systems |


---


## 9. Practical / Interview-Level Talking Points

- **Semi-synchronous replication (ack from just one replica) is the real-world default**, not full sync-to-all — full sync makes availability depend on every single replica being reachable, which is rarely acceptable.
- **Read-your-writes and monotonic reads are application-layer problems**, not database config flags — the database has no concept of “the user”; the fix always lives in your routing/proxy layer.
- **Split brain is triggered by a partition, not a crash** — this distinction is the crux of the problem, and fencing tokens (not “just detect it faster”) are the standard, name-worth-knowing mitigation.
- **Logical replication is what makes CDC possible** — this is a genuinely consequential infrastructure decision (can you feed Kafka/Elasticsearch/Snowflake off your primary database without bespoke ETL?), not a minor technical footnote.
- **Multi-leader and leaderless both trade single-leader’s “no conflicts, ever” simplicity for availability/latency** — and you always pay for that with explicit conflict machinery (LWW + clock drift risk, CRDTs, or quorums + version vectors). There’s no configuration that gives multi-region write locality _and_ zero conflict-handling complexity.
- **Consistent Prefix Reads is the anomaly people forget** relative to read-your-writes/monotonic reads — and it’s specifically the one that gets _worse_, not better, once you move beyond single-leader replication, because a single leader’s log is trivially ordered but a sharded or multi-leader system’s isn’t.
- **Read repair is a nice “free” side effect of quorum reads, but isn’t sufficient on its own** — rarely-read keys can stay stale indefinitely without a separate anti-entropy process running in the background.

---


## 10. Quick-Reference Glossary

- **Leader / Follower (replica)** — the node writes go to vs. nodes that copy from it.
- **Replication lag** — delay before a Follower reflects the Leader’s latest state; root cause of the read-anomaly trio.
- **Synchronous / asynchronous replication** — whether the Leader waits for Follower ack before confirming a write.
- **Semi-synchronous replication** — waits for at least one (not all) replicas — common production middle ground.
- **Failover** — promoting a Follower to Leader after the old Leader is detected as dead.
- **Split brain** — two nodes both believing they’re the Leader, usually from a network partition, not a true crash.
- **Fencing token** — a monotonically increasing token used to reject writes from a stale former-leader after failover.
- **Physical (WAL) replication** — shipping the exact low-level storage-engine log bytes; tightly coupled to engine internals.
- **Logical (row-based) replication** — shipping a structured, decoupled description of each change; enables CDC.
- **Change Data Capture (CDC)** — streaming row-level DB changes out to external systems (search indexes, warehouses, caches).
- **Read-Your-Writes consistency** — guarantee a user always sees their own just-made write.
- **Monotonic Reads** — guarantee a user’s successive reads never go “backward in time.”
- **Consistent Prefix Reads** — guarantee causally ordered writes are read in the same causal order.
- **Sticky routing / session affinity** — always routing a given user to the same replica for cheap monotonic reads.
- **Multi-leader replication** — more than one node accepts writes (e.g., per-datacenter), asynchronously syncing with each other.
- **Last Write Wins (LWW)** — timestamp-based conflict resolution; simple, but silently discards a write and is vulnerable to clock drift across nodes.
- **CRDT (Conflict-free Replicated Data Type)** — a data structure designed so concurrent updates always merge automatically without conflict.
- **Leaderless replication** — no leader; clients write to/read from multiple replicas directly, reconciling via quorums.
- **Quorum (N/W/R)** — N total replicas, W required write acks, R replicas queried on read; `W + R > N` guarantees read-your-writes without a leader.
- **Read repair** — fixing a stale replica by writing back the fresher value discovered as a side effect of a quorum read.
- **Sloppy quorum / hinted handoff** — temporarily accepting writes on non-owning nodes during an outage, with a hint to forward them later.
- **Anti-entropy** — background process continuously syncing replicas independent of read traffic.
- **Version vector** — per-replica causality tracking distinguishing a true causal update from a genuine concurrent conflict.
