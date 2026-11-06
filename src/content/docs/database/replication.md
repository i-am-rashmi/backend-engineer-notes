---
title: "Replication "
---


# Replication — Complete Notes (DDIA Chapter 5)


> 🧭 **How to read this page:** Part A sets up the basics shared by every design. Parts B, C and D each cover one architecture and answer the same three questions — _who accepts writes, when is a write safe, what happens in a network partition_. Part E compares them and collects the cheat sheets. Quorum and consensus mechanics live on [Quorums and Consensus](https://app.notion.com/p/4100ab25620481138ba2df14733eed67).


---


# Summary — The Big Picture


### 1. What replication is and why


Keeping copies of the same data on multiple nodes, for **availability** (survive failures), **read scaling** (spread reads) and **latency** (data near users). The hard part is propagating writes.


### 2. How changes propagate


The leader (or peer) ships a log of changes: **statement-based** (SQL text — breaks on `NOW()`/`RAND()`), **WAL / physical** (raw storage bytes — same DB version only), or **logical / row-based** ("row X changed to Y" — version-independent, enables CDC).


### 3. Replication lag causes two separate problems


| Problem         | What goes wrong                                                          | Fix                                                                                                                      |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Durability**  | An acknowledged write is lost when the leader dies before replicating it | Write mode: async / semi-sync / majority / sync, or write quorum W (`w:"majority"`, `acks=all`  • `min.insync.replicas`) |
| **Stale reads** | A read hits a replica that hasn't caught up                              | Read-your-writes routing to the leader, sticky routing to one replica, LSN tokens                                        |


### 4. The three architectures

- **Single-primary:** the leader handles all writes and propagates them to followers. Fault tolerance comes from the write-safety setting (sync/semi-sync/majority). When the leader is lost or cut off, a new leader is elected by **consensus** (majority quorum + terms + up-to-date check), and **fencing** stops the old leader from writing.
- **Multi-primary:** several leaders (usually one per region) accept writes and sync with each other asynchronously; syncing creates **write conflicts**. Conflicts are **detected** with version vectors, **resolved** with LWW, merge/CRDTs or app logic, or **avoided** with home-region routing.
- **Leaderless:** any node can take reads and writes. With **W + R > N**, every read overlaps at least one replica that confirmed the latest write. Stale replicas catch up via **read repair, hinted handoff and anti-entropy**. Conflicts are resolved by **LWW** (Cassandra) or **version vectors + siblings** (Riak).

### 5. When to use which


Ask in order:

1. **Rules that must never break?** (unique usernames, balance ≥ 0, last item in stock, multi-row transactions, foreign keys) → **single-primary** — one leader orders every write, so it can enforce rules.
2. **Joins, flexible queries, ACID transactions?** → **single-primary** (Postgres, MySQL). Leaderless stores are key-value / wide-column, designed around exact queries.
3. **Too many writes for one machine?** Not by itself a reason for leaderless — first **shard the single-primary setup** (a leader per shard, like Kafka partitions, MongoDB shards, DynamoDB partitions).
4. **Writes must succeed through node failures with no failover pause, and eventual consistency / LWW is acceptable?** → **leaderless**.

> 💡 **Rule of thumb:** default to single-primary. Choose leaderless for high-volume, simple key-based writes where always being writable matters more than strict correctness and an occasional lost or overwritten write is harmless.


| Data (food-delivery example)                | Choice                             | Why                                                                     |
| ------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Orders, payments, wallet, inventory         | Single-primary (sharded if needed) | Invariants, transactions, money                                         |
| User accounts, restaurant catalogue         | Single-primary                     | Unique constraints, relational queries                                  |
| Delivery partner GPS pings                  | Leaderless                         | Huge write rate, only the latest matters, LWW is perfect                |
| Order event history, activity logs, metrics | Leaderless                         | Append-heavy time series, must always accept writes                     |
| Chat message history                        | Leaderless                         | High volume, key-based reads (Discord ran on Cassandra, later ScyllaDB) |
| Shopping cart                               | Leaderless (with merge)            | Amazon's original Dynamo was built for this                             |


**Multi-primary** fits when users in different regions or on different devices need **local writes that keep working while cut off** — multi-region apps, offline-capable apps, collaborative editing. It's usually a regional layer on top: each region is single-primary inside, with home-region routing for data that has rules.


---


# Part A — Foundations


## 1. Why replicate at all


Replication = keeping the same data on multiple machines connected by a network. Three reasons:

- **High availability** — survive a server or datacenter crash.
- **Latency** — put a copy geographically closer to users.
- **Read scalability** — spread read load across multiple machines.

**The hard part isn't making the copy — it's that copying takes time.** Because of network delay there is always a window where replicas disagree. Almost every replication problem comes from that window (**replication lag**). If data never changed, replication would be trivial; all the difficulty is in propagating writes, and the main design choice is **how many nodes may accept writes**.


## 2. The three architectures at a glance


| Model             | Writes accepted at                  | Conflict handling                              | Best for                                                         | Examples                                             |
| ----------------- | ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Single-leader** | One node                            | None needed — the leader orders all writes     | Most OLTP systems; simplest model                                | PostgreSQL, MySQL, MongoDB, Kafka, Redis             |
| **Multi-leader**  | Several nodes (e.g. one per region) | Required — home region, LWW, merge, CRDTs      | Multi-region writes, offline-capable apps, collaborative editing | Multi-region setups, CouchDB, DynamoDB Global Tables |
| **Leaderless**    | Any replica, via quorum             | Required — LWW or version vectors; read repair | Very high availability key-value stores                          | Cassandra, Riak, original Dynamo                     |


### Replication vs sharding


Two independent ideas that large systems combine — **shard the data, then replicate each shard**:


|          | Sharding (partitioning)        | Replication                    |
| -------- | ------------------------------ | ------------------------------ |
| Question | _Which nodes_ hold this key?   | _How many copies_ of it exist? |
| Purpose  | Capacity: spread data and load | Availability: survive failures |


9Example: 12-node Cassandra cluster, replication factor 3 → `user_42` lives on nodes 4, 5, 6; `user_99` on 9, 10, 11. Each key has 3 copies, not 12. Cassandra's ranges overlap on a hash ring (node 6 holds copies of ranges owned by 4, 5 and 6), so a lost node's load spreads across neighbours.


| System                  | Sharding unit         | Replication within each shard                  |
| ----------------------- | --------------------- | ---------------------------------------------- |
| Cassandra               | Hash ranges on a ring | RF copies, leaderless                          |
| Kafka                   | Topic partitions      | Leader + followers (ISR) per partition         |
| MongoDB sharded cluster | Shards (by shard key) | Each shard is a replica set                    |
| DynamoDB                | Partitions            | 3 replicas, leader per partition (Multi-Paxos) |


"Single-leader" in Kafka or DynamoDB means **one leader per shard**, with leaders spread across machines — that's how they scale writes.


## 3. How changes are shipped — the replication log


The leader has to transmit changes to followers (or to other downstream systems). Four approaches:


| Method                      | Idea                                              | Problem / trait                                                                                 |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Statement-based**         | Ship the SQL text                                 | Non-deterministic functions (`NOW()`, `RAND()`) and auto-increments diverge. Largely abandoned. |
| **Physical (WAL) shipping** | Ship the storage engine's low-level log bytes     | Tied to the storage format → replicas must run the same major version                           |
| **Logical (row-based)**     | Ship "row X changed to Y"                         | Version-independent and readable by other systems → basis of CDC                                |
| **Trigger-based**           | Application-level triggers push changes elsewhere | Most flexible, highest overhead; last resort                                                    |


**Worked example — why statement-based breaks:** the leader runs `UPDATE coupons SET expired_at = NOW() WHERE user_id = 42 AND expired_at IS NULL`. Each replica re-runs `NOW()` at its own (later, differently clocked) time, so expiry timestamps silently diverge. Row-based ships the evaluated value (`expired_at = '2026-11-05 15:45:00'`).


### Physical (WAL) replication


The same **write-ahead log** bytes used for local crash recovery (e.g. "at disk block 4028, offset 120, overwrite 8 bytes") are shipped verbatim and replayed on the follower's disk. Reliable, deterministic and cheap, but meaningless to any other system (MySQL, Snowflake, Elasticsearch) and usually locked to the same database version.


### Logical (row-based) replication and CDC


The database emits a structured description of each change, e.g. `Table: Orders, Action: UPDATE, Row ID: 5, status: pending → shipped`. Any system can parse that, which is what powers **Change Data Capture (CDC)** — Debezium, Kafka Connect, MySQL binlog readers and Postgres logical decoding stream changes to search indexes, warehouses, caches and other services, decoupled from the source's storage format.


|                              | Physical (WAL)          | Logical (row)                |
| ---------------------------- | ----------------------- | ---------------------------- |
| Granularity                  | Whole cluster           | Per table                    |
| Cross-version                | No — same major version | Yes                          |
| Feeds external systems (CDC) | No                      | Yes                          |
| Overhead                     | Very low                | Higher (decode + apply rows) |


### How each database chooses


| Database   | Physical                                | Logical                                      | How it's set                                                                                                         |
| ---------- | --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | Streaming WAL (default for HA standbys) | `CREATE PUBLICATION` / `CREATE SUBSCRIPTION` | `wal_level = replica` vs `logical`                                                                                   |
| MySQL      | —                                       | Binlog                                       | `binlog_format = ROW` (default), `STATEMENT`, or `MIXED` (statement, switching to row for non-deterministic queries) |
| MongoDB    | —                                       | Oplog (document-level)                       | Built in                                                                                                             |
| Kafka      | —                                       | Followers fetch the leader's record batches  | Built in                                                                                                             |


### Zero-downtime major version upgrades


**With logical replication:**

1. Stand up the new version (e.g. Postgres 16) next to the live one (15).
2. Copy the schema (no data).
3. Start logical replication 15 → 16 (initial copy, then continuous changes).
4. Wait until lag is ≈0.
5. Cutover: pause writes for a few seconds, confirm the last changes arrived, repoint the connection pool / DNS, resume.

Cutting over before lag reaches 0 loses the un-replicated writes.


**With WAL replication** a v16 server can't apply v15 WAL, so either take downtime with `pg_upgrade --link` and rebuild every replica, or run blue-green: a new v16 cluster bridged by temporary logical replication, then cut over.


---


# Part B — Single-Leader Replication


## 4. How it works


All writes go to one **leader**. The leader writes locally, then streams changes as an ordered log to **followers**, which apply them in the same order and serve reads. Reads from the leader are always fresh; reads from followers may be stale.


### The two knobs


> 💡 **Knob 1 — Who is the leader?** → **consensus** (majority vote + terms + up-to-date check), run inside the DB or in an external store like etcd. Guarantees one leader at a time.  
> **Knob 2 — How many copies must a write reach before "saved"?** → a **write-safety setting** you choose. Decides durability.  
> A perfect election can still lose a write if Knob 2 is weak.


## 5. Write durability (Knob 2)


| Setting         | Copies before "saved"  | If the leader dies right after "saved"                |
| --------------- | ---------------------- | ----------------------------------------------------- |
| **Async**       | 1 (leader only)        | Write can be lost                                     |
| **Semi-sync**   | 2 (leader + 1 replica) | Safe, if the new leader is that replica               |
| **Majority**    | More than half         | Safe — any new majority includes a node that has it   |
| **Sync to all** | Every replica          | Safe, but one slow or dead replica blocks every write |


Full sync-to-every-replica is rare in production. **Semi-sync is the usual real-world choice**: you always have at least two up-to-date copies without every write waiting on the slowest replica.


**Worked example — async loss:** the leader acknowledges a password change and crashes a millisecond later, before shipping it. The follower is promoted; the change is gone even though the user was told it succeeded.


**Worked example — consensus worked, the write was still lost (MongoDB** **`w:1`****):**


```plain text
1. Leader A saves order #501, replies "saved"
2. A dies before B and C copy it
3. B and C elect B (valid majority, new term)
4. B never had #501 → order gone
5. A returns, finds #501 isn't in the new leader's log → rolls it back
```


The up-to-date check only protects writes that reached a majority.


**Worked example — Kafka:** RF=3, producer `acks=1`. Leader acks, crashes before followers fetch, a follower becomes leader → message lost; the old leader truncates its log on return. Fix:


```plain text
RF=3, acks=all, min.insync.replicas=2
ISR = {Leader, F1, F2} → waits for all 3 → safe
ISR = {Leader, F1}     → waits for 2     → safe
ISR = {Leader}         → write REJECTED (NotEnoughReplicas) → no false "saved"
```


`acks=all` alone isn't enough: the ISR can shrink to just the leader, silently turning it into `acks=1`. Keep `unclean.leader.election.enable=false` (default) so an out-of-sync replica never becomes leader.


### How real systems set both knobs


| System               | Knob 1: leader election                                 | Knob 2: write safety                                                                                     |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PostgreSQL + Patroni | External (etcd)                                         | Async by default; `synchronous_mode`; `maximum_lag_on_failover` stops a too-stale replica being promoted |
| MySQL                | External (Orchestrator) or internal (Group Replication) | Async by default; semi-sync plugin                                                                       |
| MongoDB              | Internal, Raft-like                                     | `w:1` or `w:"majority"` (default since 5.0)                                                              |
| Kafka                | KRaft controller picks partition leaders from the ISR   | `acks=all`  • `min.insync.replicas`                                                                      |
| Aurora               | Managed                                                 | Storage quorum: 4 of 6 copies                                                                            |
| Redis + Sentinel     | Sentinel processes vote                                 | Async; `min-replicas-to-write` limits loss                                                               |
| etcd                 | Internal Raft                                           | Always majority — both knobs are the same mechanism                                                      |


## 6. Adding a new replica

1. Take a consistent snapshot of the leader (e.g. Postgres `pg_basebackup`).
2. Copy it to the new node.
3. Replay the log from the snapshot's position (Postgres LSN, MySQL binlog coordinates/GTID, MongoDB oplog timestamp).
4. Once caught up, follow the live stream.

Same pattern as partition moves and Kafka reassignment (the new replica copies the partition log until it joins the ISR).


## 7. Failover


When the leader dies, a follower is promoted in three steps:

1. **Detect** the leader is dead — usually a heartbeat timeout (risk of false positives).
2. **Elect** a new leader — ideally the most up-to-date replica, via consensus or a coordinator.
3. **Reconfigure** clients and replicas to point at the new leader.

### Who runs failover in production (Postgres example)


```plain text
[ Apps ]
           │
   [ Proxy: HAProxy / PgBouncer ]   ← routes writes to current primary
      │                 │
[ PG Node 1 ]      [ PG Node 2 ]
[ Patroni   ]      [ Patroni   ]    ← agent: renews lease, promotes/demotes
      └───────┬────────┘
     [ etcd × 3 (Raft) ]            ← holds the leader key with a TTL
```


**Timeline:** t=0 primary loses network → t≈10s leader lease expires in etcd → t≈11s a replica's Patroni wins the leader key → t≈12s `pg_ctl promote` → t≈13s proxy health check flips, writes go to the new primary. About 10–15s, no human.


Run the proxy as an HA pair with a virtual IP (Keepalived) or as app-side sidecars — a single proxy is a single point of failure and a bottleneck.


### Failover pitfalls

- **Choosing the timeout:** too short → failover on a GC pause (needless disruption); too long → longer outage.
- **Lost writes with async replication:** the promoted replica may miss acknowledged writes. GitHub incident: a promoted MySQL replica reused auto-increment IDs that were also cached in Redis, leaking data between users.
- **Promote the most up-to-date replica:** Patroni `maximum_lag_on_failover`, Kafka `unclean.leader.election.enable=false`, Raft's up-to-date vote check.
- **External consensus is a dependency:** if etcd loses its majority, no failover can happen even with healthy replicas, and Patroni demotes a healthy primary to read-only by default (optional failsafe mode relaxes this).
- **Split brain** — see section 8.

### What clients do during failover


A write to the old leader is rejected (`NotLeaderException`, stale epoch), so it never commits and the client gets an error, not "saved". Smart drivers then:

1. **Refresh topology** — ask who leads now (the error often carries a hint).
2. **Retry** against the new leader.
3. Attach an **idempotency key** so a retry of a maybe-half-done request isn't applied twice.

## 8. Split brain


The dangerous case isn't a true crash — it's a **network partition** or long pause. The old leader is still alive and accepting writes on its side, while the rest of the cluster promotes a new leader. Now **two leaders accept writes at once**.


**Worked example — password:** isolated leader A sets a password to `cat`; new leader B sets it to `dog`. When the network heals there are two versions and no safe way to pick.


**Worked example — bank balance:** balance $100. An ATM deposits $100 via zombie leader A ($200); the app withdraws $100 via new leader B ($0). The true balance is $100 but neither node has it; whichever overwrites the other silently loses a transaction.


### Three defences (used together)

1. **Majority election** — a new leader needs votes from more than half the nodes, so only one side of a partition can elect one. With 5 nodes split 1 / 2 / 2, nobody reaches 3 → no writes anywhere, by design.
2. **Self-demotion** — a leader that can't reach a majority (or renew its lease) steps down on its own. MongoDB primaries and Patroni do this.
3. **Fencing tokens** — cover the window before the old leader notices (e.g. mid GC pause):
    1. The lock manager / consensus system gives each new leader a **monotonically increasing token** (term/epoch): leader 1 → #1, leader 2 → #2.
    2. Every write to storage carries the token.
    3. Storage remembers the **highest token seen** and rejects lower ones, so zombie leader 1's write with #1 is refused — without the zombie needing to know it was deposed.

The lock manager can be external (etcd, ZooKeeper, Consul) or built into the database (MongoDB replica sets, Kafka KRaft).


## 9. Replication lag and read anomalies


These happen even with zero crashes — purely from propagation delay.


### Read-your-writes (read-after-write)

> A user posts a comment (write → leader). The page refresh reads from a follower that hasn't caught up — the comment seems to vanish, and the user may resubmit → duplicate post. At Swiggy/Intuit scale: an order placed and immediately fetched from a lagging replica returns "not found".

**Fixes:**

- Route a user's own reads to the leader for a short window after they write (e.g. 1 minute). Track "did this user just write" in Redis (`last_written_timestamp` by user ID) or in the session token/JWT.
- Track the write's log position (LSN) and read only from a replica that has caught up to it.

This lives in the **application layer or proxy** — the database has no idea which user is asking.


### Monotonic reads

> Refresh 1 hits a fast follower and shows a just-scored goal; refresh 2 hits a follower 5s behind and the goal disappears — time appears to go backwards.

**Fixes:**

1. **LSN token** — the client carries "you've read up to LSN #500"; a follower that hasn't reached #500 waits before answering (roughly how Spanner / Cosmos DB approach it).
2. **Sticky routing** — hash the user ID to one follower, so that user's timeline always moves forward.

### Consistent prefix reads


Occurs in systems that are **both replicated and sharded**: causally related writes on different partitions replicate at different speeds.

> Chat: user A asks "How is the weather?" on partition 1 (5s lag); user B replies "It is raining!" on partition 2 (10ms lag). A third user sees the answer before the question.

**Fix:** write causally related data to the same partition, or attach causal metadata (`replies_to: Message_A_ID`) and hide B until A is visible.


## 10. Read routing in practice


There is no read quorum in single-leader: a read goes to **one** node, so freshness is a routing decision. Three ways to split reads and writes:

1. **Application code** — each service keeps two connection pools (leader, followers) and decides per query. Simple, but logic is duplicated across services and languages.
2. **Smart drivers** — e.g. AWS Aurora JDBC driver, MySQL Connector/J route `SELECT` vs writes automatically.
3. **Database proxy** — e.g. ProxySQL, Pgpool-II. Services connect to the proxy as if it were one database.

```plain text
[ Microservice 1 ] ──┐
[ Microservice 2 ] ──┼──> [ DB Proxy ] ──┬──> [ Leader DB (Writes) ]
[ Microservice 3 ] ──┘                    ├──> [ Replica DB 1 (Reads) ]
                                           └──> [ Replica DB 2 (Reads) ]
```


**Proxy concepts (ProxySQL-style):**

- **Hostgroups** — servers grouped by role (10 = writers, 20 = readers).
- **Query rules** — `SELECT ... FOR UPDATE` → writer (takes row locks); plain `SELECT` → reader; `INSERT/UPDATE/DELETE` → writer.
- **Lag protection** — stop routing reads to a replica that falls too far behind (e.g. >2s).

**Trade-off:** for a 10-service, 3-language org, a proxy centralises the logic once (at the cost of an extra hop and more infrastructure); application-level routing must be reimplemented in Java, Node.js and Go and drifts over time.


## 11. Single-leader during a network partition


The majority side elects or keeps the leader and keeps writing. A leader on the minority side can't reach a majority, so it steps down; writes stop there (stale reads may continue). **Single-leader chooses consistency over availability.** Cost: failover pauses, replication lag, and all writes funnelled through one node.


---


# Part C — Multi-Leader Replication


## 12. How it works and when to use it


Single-leader funnels every write through one node — painful across regions (every London write crosses the Atlantic to a New York leader). Multi-leader lets **several nodes accept writes**, typically one per region, syncing asynchronously.


```plain text
MUMBAI                                 DELHI
 ┌──────────────────────┐             ┌──────────────────────┐
 │ Leader M  ← consensus│  async sync │ Leader D  ← consensus│
 │ Follower  Follower   │◄───────────►│ Follower  Follower   │
 └──────────────────────┘             └──────────────────────┘
```

- **Within a region:** an ordinary single-leader cluster — consensus picks that region's leader, and that region's write-safety setting applies.
- **Across regions:** **no consensus**. Leaders are leaders by configuration; sync is asynchronous. Losing a whole region can lose its unshipped writes.
- **During a partition:** both sides keep accepting writes (**availability over consistency**). Split brain across regions isn't a bug — it's the design. The cost is conflicts when the link heals.

**Use it for:** multi-region low-latency writes; offline-capable clients (each device is a leader that syncs later — calendars, notes, CouchDB/PouchDB); collaborative editing (Google Docs, Figma). Inside one datacenter it's rarely worth the complexity.


**Topology:** leaders can propagate in a circle, a star, or all-to-all. All-to-all is most robust but can deliver an update before the insert it depends on; ring and star preserve order better but one failed node breaks propagation. More leaders and hops make ordering problems (like consistent prefix reads) harder.


## 13. Conflicts


Two leaders can accept conflicting writes to the same record. **Example:** New York sets a wiki title to "Apples" while London sets it to "Oranges" at nearly the same moment.


### Detecting


You must tell "B overwrote A" apart from "A and B happened concurrently". Timestamps can't do this reliably; **version vectors** (each leader's update count) can.


### Avoiding — home region (most practical)


Each record has a **home region** and all its writes go there, so for that record the system is effectively single-leader. Cost: if the home region is down, that record can't be written.


### Resolving


| Approach                       | How                                                                   | Trade-off                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Last write wins (LWW)**      | Keep the write with the later timestamp                               | Silently drops the other write. Clock drift (e.g. London 50ms ahead) can pick the wrong one. Used by DynamoDB Global Tables and Cassandra. |
| **Merge**                      | Combine values, e.g. union of cart items                              | Only fits some data                                                                                                                        |
| **CRDTs**                      | Data types that always merge deterministically (counters, sets, text) | Hard to fit arbitrary business logic. Used by Riak and collaborative editors.                                                              |
| **Operational transformation** | Older approach behind Google Docs                                     | Specialised for text editing                                                                                                               |
| **Resolve in the application** | Keep all versions ("siblings"), resolve on read                       | More application code. CouchDB and original Dynamo.                                                                                        |


## 14. Choosing a strategy per type of data


Ask: _if two concurrent writes collide and one is lost or merged, what does the business lose?_


| Data                | Strategy                                          | Why                                                       |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Wallet balance      | Home region                                       | Rule: never below zero — must prevent, not fix later      |
| Coupon "use once"   | Home region                                       | Two regions could each allow one use                      |
| Last unit of stock  | Home region                                       | Two regions could sell the same item                      |
| Menu item price     | LWW, or the restaurant's home region              | Rare edits; losing one of two simultaneous edits is minor |
| Display name        | LWW                                               | Harmless if the later edit wins                           |
| Cart items          | Merge (union)                                     | The user wants both additions                             |
| Likes / view counts | CRDT counter                                      | Counts from both regions add up                           |
| Order status        | Custom merge: furthest state wins (+ home region) | Status only moves forward                                 |


**Two tests:** (1) is there a rule that crosses records or regions (balance ≥ 0, use once)? → home region or consensus. (2) If not, how bad is losing or merging a write? Harmless → LWW; both matter → merge/CRDT.


**Implementation:** some databases set the resolver per table (multi-master Postgres extensions like pgEdge/BDR); others apply one rule to everything (DynamoDB Global Tables = LWW), so you add **routing in the application** (wallet writes always go to the home region) or split data across stores.


**Worked example — wallet overspend:** ₹500 balance. During a partition a ₹400 order hits Mumbai and another hits Delhi; each sees ₹500 and approves → ₹800 spent.

- LWW keeps one deduction → balance ₹100, but ₹400 of food is never charged. ❌
- Merge/CRDT sums the debits → −₹300: correct accounting, but the overdraft already happened. ⚠️
- Home region → only Mumbai may debit; Delhi can't approve during the partition, so the order fails or falls back to another payment method. ✅ The business gives up availability for that payment to guarantee the invariant.

Conflict resolution runs _after_ both writes were accepted — it can fix numbers but can't un-deliver the food.


**Worked example — order status with LWW:** the delivery app sets `delivered` via Delhi; a slow restaurant tablet sends `accepted` via Mumbai seconds later → LWW keeps `accepted`, rolling a delivered order backwards. Better: rank states (placed 1 → accepted 2 → picked_up 3 → delivered 4) and keep the highest. `cancelled` needs a business rule (e.g. delivered wins, then refund).


## 15. Global rules need consensus again


Unique usernames, auto-increment IDs and foreign keys can't be enforced by one region alone — two regions can both hand out "rashmi" or order #1001. Either send those writes to one global leader, or use a database that runs consensus across regions (Spanner, CockroachDB), paying cross-region latency on those writes.


---


# Part D — Leaderless Replication


## 16. How it works


Dynamo-style (Cassandra, Riak, Voldemort, original Dynamo): **no leader at all**.

- The client sends a request to **any node**, which acts as **coordinator** and forwards it to the key's N replicas (N = replication factor — replicas of _this key_, not the whole cluster).
- No leader → **no election, no consensus, no failover pause**. A dead node is just one fewer replica answering.
- Membership and health spread by **gossip**: each node periodically shares its view with a few random peers. This is failure detection, not consensus — nodes can briefly disagree.

## 17. Quorums (N, W, R)


A write succeeds once **W** replicas confirm it (it's still sent to all N); a read asks **R** replicas and returns the newest version. If **W + R > N**, any read set overlaps any confirmed-write set, so a read can't miss the latest write.


**Worked example:** N=3 (A, B, C). Requiring all 3 for a write means the system stops the moment C is down for an update — too fragile. W=2, R=2 survives one node down and still overlaps (2 + 2 > 3).


### Cassandra consistency levels (chosen per query)


| Level          | Meaning (replication factor 3)                       |
| -------------- | ---------------------------------------------------- |
| `ONE`          | W or R = 1                                           |
| `QUORUM`       | W or R = 2                                           |
| `ALL`          | W or R = 3                                           |
| `LOCAL_QUORUM` | Majority within the local datacenter only (multi-DC) |
| `ANY`          | Write accepted even if only a hint was stored        |


`QUORUM` reads + `QUORUM` writes → W + R > N. A restaurant menu (read thousands of times a minute, edited twice a day) suits W=ALL, R=ONE — fast reads, accepting that an edit fails if a replica is down.


**Caveat:** W + R > N makes stale reads unlikely, not impossible. Concurrent writes, sloppy quorums and partially failed writes (written to 1 replica, reported as failed, never rolled back) can still surprise a reader.


## 18. Keeping replicas in sync

- **Read repair** — when node C returns after missing an hour of writes, a read hitting A (version 100) and C (version 90) returns version 100 _and_ writes it back to C in the background. Reads gradually heal the cluster.
- **Hinted handoff** — a write meant for a down replica is kept as a hint and delivered when it returns.
- **Anti-entropy** — a background process compares replicas using Merkle trees and syncs differences. Needed because rarely read keys never get read-repaired.

## 19. Leaderless during a network partition


Decided **per key**, by whether each side can reach W (or R) of that key's replicas. N=3, one replica cut off:

- **Strict quorum (****`QUORUM`****):** the 2-replica side works; the 1-replica side gets `UnavailableException`. Like single-leader's minority side.
- **`ONE`****:** both sides accept writes → data diverges → resolved later. Like multi-leader.
- **Sloppy quorum (original Dynamo, Riak):** if the real replicas are unreachable, stand-in nodes accept the write with a hint and hand it off later. Stays available, but a read of the real replicas may miss it. Cassandra uses hints only for catch-up and doesn't count them toward W (except at `ANY`).

So leaderless lets you **choose consistency vs availability per query**.


## 20. Conflicts in leaderless systems

- **Cassandra:** LWW per column, by timestamp — simple; silently drops the losing write; vulnerable to clock skew.
- **Riak / original Dynamo:** version vectors detect truly concurrent writes and keep both as siblings for the app to merge.

**Where consensus appears anyway:** for "create only if it doesn't exist" (unique username, first-time coupon), Cassandra **lightweight transactions** (`INSERT ... IF NOT EXISTS`) run **Paxos** for that one operation — several round trips, much slower; use sparingly.


## 21. DynamoDB is not leaderless


The 2007 Dynamo _paper_ and Cassandra are leaderless. The **DynamoDB service** keeps 3 replicas per partition and elects a leader per partition with Multi-Paxos; writes and strongly consistent reads go through it, eventually consistent reads may hit any replica. **Global Tables** are multi-leader across regions with LWW. So DynamoDB = single-leader within a region, multi-leader across regions.


---


# Part E — Putting It Together


## 22. Comparison across the three


|                              | Single-leader                              | Multi-leader                                         | Leaderless                                     |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------- |
| Accepts writes               | One node                                   | Several nodes                                        | Any replica (quorum)                           |
| Write conflicts              | None — leader orders all writes            | Must be resolved                                     | Must be resolved (LWW or versions)             |
| Consensus used?              | Yes — elects the leader                    | Only inside each region                              | Mostly no (Paxos only for LWT)                 |
| Quorum used                  | Majority (election) + write-safety setting | Majority inside a region                             | W + R > N per key                              |
| Split brain is…              | A bug to prevent                           | The intended behaviour across regions                | Not applicable — no leader                     |
| Minority side in a partition | Leader steps down; writes stop             | Keeps writing                                        | Rejects (strict) or accepts (`ONE` / sloppy)   |
| Write availability           | Down until failover completes              | High — each region stays writable                    | High                                           |
| Main risk / cost             | Failover: lost writes, split brain, pauses | Conflicts, broken global rules                       | Weaker consistency, quorum tuning, repair work |
| Examples                     | Postgres, MySQL, MongoDB, Kafka, Redis     | Multi-region setups, CouchDB, DynamoDB Global Tables | Cassandra, Riak, original Dynamo               |


**Interview default:** single-leader with semi-sync replication plus read-your-writes handling. Single-leader moves the hard problem to failover and lag; multi-leader and leaderless move it to conflict resolution. Go multi-region multi-leader only when latency or regional availability demands it, and even then prefer home-region routing over clever merging.


## 23. Fault tolerance cheat sheet


| Failure                               | Mechanism                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Follower crashes / falls behind       | Rejoins and replays the log from its last position; a new replica = snapshot + replay                                                            |
| Leader crashes                        | Failover: detect (heartbeat timeout) → elect by majority → reconfigure clients (proxy / smart driver)                                            |
| Old leader comes back (zombie)        | Self-demotion + fencing token (term) rejects stale writes                                                                                        |
| Network partition                     | Single-leader: majority side continues. Multi-leader: both continue, resolve conflicts later. Leaderless: per-key quorum, optional sloppy quorum |
| Acknowledged writes lost on failover  | Stronger write safety: semi-sync, `w:"majority"`, `acks=all`  • `min.insync.replicas`; never promote an out-of-sync replica                      |
| Stale reads from lagging replicas     | Read-your-writes routing, LSN tokens, sticky replicas, proxy lag protection                                                                      |
| Stale replica in leaderless           | Read repair, hinted handoff, anti-entropy (Merkle trees)                                                                                         |
| Consensus store (etcd) loses majority | Spread across 3 AZs, use 5 nodes for critical systems, monitor, snapshot; Patroni failsafe mode                                                  |
| Permanent loss of a majority          | Manual forced reconfiguration, then add nodes one at a time                                                                                      |
| Proxy failure                         | HA pair with virtual IP, or app-side sidecar proxies                                                                                             |
| Client mid-request during failover    | Topology refresh + retry + idempotency key                                                                                                       |
| Whole region lost                     | Multi-leader: other regions keep serving (may lose unshipped writes); single-leader: cross-region replica promoted                               |


## 24. Interview talking points


**Single-leader**

- **Semi-sync (ack from one replica) is the real-world default**, not full sync-to-all — full sync makes availability depend on every replica.
- **Two knobs:** consensus decides _who_ leads; the write-safety setting decides whether an acknowledged write survives failover. A perfect election can still lose a `w:1` / `acks=1` write.
- **`acks=all`** **needs** **`min.insync.replicas=2`**, otherwise a shrunken ISR silently turns it into `acks=1`.
- **Split brain comes from a partition, not a crash** — fencing tokens (not "detect it faster") are the standard mitigation.
- **External consensus (Patroni + etcd) means failover depends on etcd's majority**, not just on healthy database replicas.

**Replication logs**

- **Logical replication is what makes CDC possible** — a real infrastructure decision (can you feed Kafka / Elasticsearch / Snowflake from your primary without bespoke ETL?), and it enables zero-downtime major upgrades.

**Read consistency**

- **Read-your-writes and monotonic reads are application-layer problems** — the database has no concept of "the user"; the fix lives in routing or the proxy.
- **Consistent prefix reads is the anomaly people forget** — and it gets _worse_ beyond single-leader, because a single leader's log is ordered but a sharded or multi-leader system's isn't.

**Multi-leader and leaderless**

- **Both trade single-leader's "no conflicts, ever" for availability and latency** — and pay with explicit conflict machinery (LWW + clock drift, CRDTs, quorums + version vectors). No setting gives multi-region write locality _and_ zero conflict handling.
- **Conflict strategy is chosen per data type:** home region for invariants (wallet, coupons, stock), LWW for harmless fields, merge/CRDT where both writes matter.
- **Read repair isn't sufficient alone** — rarely read keys stay stale without anti-entropy.
- **DynamoDB the service is leader-per-partition (Multi-Paxos)**, not leaderless; Global Tables are multi-leader with LWW. The Dynamo paper and Cassandra are leaderless.

## 25. Glossary


**Core**

- **Leader / follower (replica)** — the node writes go to vs nodes that copy from it.
- **Replication lag** — delay before a follower reflects the leader's latest state; root cause of the read anomalies.
- **Synchronous / asynchronous replication** — whether the leader waits for follower acknowledgement before confirming a write.
- **Semi-synchronous replication** — waits for at least one (not all) replicas; the common production middle ground.
- **Sharding (partitioning)** — splitting data across nodes; combined with replication of each shard.

**Durability and failover**

- **Write concern / acks** — how many copies a write must reach before the client is told "saved" (`w:1`, `w:"majority"`, `acks=all`).
- **ISR (in-sync replicas)** — Kafka replicas fully caught up with the leader; only these can become leader (unless unclean election is enabled).
- **min.insync.replicas** — Kafka setting rejecting writes unless at least this many replicas are in sync.
- **Failover** — promoting a follower to leader after the old leader is detected as dead.
- **Split brain** — two nodes both believing they're leader, usually from a network partition.
- **Fencing token** — monotonically increasing token (term/epoch) used to reject writes from a stale former leader.
- **Consensus store / node agent / proxy** — etcd-style referee, Patroni-style per-node manager, HAProxy-style router in an external-failover setup.
- **Rollback / log truncation** — an old leader discarding writes that never reached the new leader.

**Replication logs**

- **Physical (WAL) replication** — shipping the exact storage-engine log bytes; tightly coupled to engine internals.
- **Logical (row-based) replication** — shipping a structured description of each change; enables CDC.
- **Change Data Capture (CDC)** — streaming row-level changes to external systems (search indexes, warehouses, caches).

**Read consistency**

- **Read-your-writes** — a user always sees their own just-made write.
- **Monotonic reads** — a user's successive reads never go backwards in time.
- **Consistent prefix reads** — causally ordered writes are read in the same order.
- **Sticky routing / session affinity** — always routing a user to the same replica.

**Multi-leader**

- **Multi-leader replication** — more than one node accepts writes (e.g. per datacenter), syncing asynchronously.
- **Home region** — the single region allowed to write a given record.
- **Last write wins (LWW)** — timestamp-based resolution; silently discards a write and is vulnerable to clock drift.
- **CRDT** — data structure whose concurrent updates always merge automatically.
- **Version vector** — per-replica causality tracking that distinguishes a causal update from a concurrent conflict.

**Leaderless**

- **Leaderless replication** — no leader; clients write to and read from multiple replicas, reconciling via quorums.
- **Coordinator** — the node that receives a request and forwards it to the key's replicas.
- **Gossip** — peer-to-peer spreading of membership and health; failure detection, not consensus.
- **Quorum (N / W / R)** — N replicas of a key, W write acknowledgements, R replicas read; `W + R > N` guarantees overlap.
- **Consistency level** — Cassandra's per-query W/R choice (`ONE`, `QUORUM`, `ALL`, `LOCAL_QUORUM`).
- **Read repair** — fixing a stale replica with the fresher value found during a read.
- **Sloppy quorum / hinted handoff** — accepting writes on non-owning nodes during an outage, forwarding them later.
- **Anti-entropy** — background process (Merkle trees) syncing replicas independent of reads.
- **Lightweight transaction (LWT)** — Cassandra compare-and-set (`IF NOT EXISTS`) using Paxos.
