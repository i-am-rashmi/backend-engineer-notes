---
title: "Replication "
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


### Two separate knobs: who leads vs. when a write is safe


Single-leader has two mechanisms that are easy to mix up:

- **Knob 1 — Who is the leader?** → **consensus** (majority vote + terms + up-to-date check), run inside the DB or in an external store like etcd. Guarantees only one leader at a time. Details: [Quorums and Consensus](https://app.notion.com/p/4100ab25620481138ba2df14733eed67).
- **Knob 2 — How many copies must a write reach before "saved"?** → a **write-safety setting** you choose. Decides durability.

| Setting   | Copies before "saved"  | If the leader dies right after "saved"              |
| --------- | ---------------------- | --------------------------------------------------- |
| Async     | 1 (leader only)        | Write can be lost                                   |
| Semi-sync | 2 (leader + 1 replica) | Safe, if the new leader is that replica             |
| Majority  | More than half         | Safe — any new majority includes a node that has it |
| All       | Every replica          | Safe, but one slow replica blocks every write       |


**Worked example — consensus worked, the write was still lost (MongoDB,** **`w:1`****):**


```plain text
1. Leader A saves order #501, replies "saved"
2. A dies before B and C copy it
3. B and C elect B (valid majority, new term)
4. B never had #501 → order gone
5. A returns, finds #501 isn't in the new leader's log → rolls it back
```


The up-to-date check only protects writes that reached a majority. Consensus picks _who_ leads; it can't save data that never left the old leader.


| System               | Knob 1: leader election                                 | Knob 2: write safety                                                                                     |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PostgreSQL + Patroni | External (etcd)                                         | Async by default; `synchronous_mode`; `maximum_lag_on_failover` stops a too-stale replica being promoted |
| MySQL                | External (Orchestrator) or internal (Group Replication) | Async by default; semi-sync plugin                                                                       |
| MongoDB              | Internal, Raft-like                                     | `w:1` or `w:"majority"` (default since 5.0)                                                              |
| Kafka                | KRaft controller picks partition leaders from the ISR   | `acks=all`  • `min.insync.replicas`                                                                      |
| Aurora               | Managed                                                 | Storage quorum: 4 of 6 copies                                                                            |
| Redis + Sentinel     | Sentinel processes vote                                 | Async; `min-replicas-to-write` limits loss                                                               |
| etcd                 | Internal Raft                                           | Always majority — both knobs are the same mechanism                                                      |


**Worked example — Kafka:** RF=3, producer `acks=1`. Leader acks, crashes before followers fetch, a follower becomes leader → message lost; the old leader truncates its log on return. Fix:


```plain text
RF=3, acks=all, min.insync.replicas=2
ISR = {Leader, F1, F2} → waits for all 3 → safe
ISR = {Leader, F1}     → waits for 2     → safe
ISR = {Leader}         → write REJECTED (NotEnoughReplicas) → no false "saved"
```


`acks=all` alone isn't enough: the ISR can shrink to just the leader, silently turning it into `acks=1`. Also keep `unclean.leader.election.enable=false` (default) so an out-of-sync replica can never become leader.


### Reads: routing, not a read quorum


There is no R in single-leader. A read goes to **one** node: the leader (fresh, adds load) or a follower (spreads load, may be stale). Freshness is a routing decision — see sections 4 and 5.


### Adding a new replica

1. Take a consistent snapshot of the leader (e.g. Postgres `pg_basebackup`).
2. Copy it to the new node.
3. Replay the log from the snapshot's position (Postgres LSN, MySQL binlog coordinates/GTID, MongoDB oplog timestamp).
4. Once caught up, follow the live stream.

Same pattern as partition moves and Kafka reassignment (the new replica copies the partition log until it joins the ISR).


### During a network partition


The majority side elects or keeps the leader and keeps writing. A leader on the minority side can't reach a majority, so it steps down; writes stop there (stale reads may continue). Single-leader chooses consistency over availability.


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


### Three defences against split brain (used together)

1. **Majority election** — a new leader needs votes from more than half the nodes, so only one side of a partition can elect one. With 5 nodes split 1 | 2 | 2, nobody reaches 3 → no writes anywhere, by design.
2. **Self-demotion** — a leader that can't reach a majority (or renew its lease) steps down on its own. MongoDB primaries and Patroni do this.
3. **Fencing tokens** — the term/epoch number. Covers the window where the old leader hasn't noticed yet (e.g. mid GC pause).

The "central lock manager" can be external (etcd, ZooKeeper, Consul) or built into the database (MongoDB replica sets, Kafka KRaft). See [Quorums and Consensus](https://app.notion.com/p/4100ab25620481138ba2df14733eed67).


**Worked example — the bank balance:** balance $100. ATM deposits $100 via zombie Leader A ($200); app withdraws $100 via new Leader B ($0). True balance is $100, but neither node has it; whichever overwrites the other silently loses a transaction.


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


**Timeline:** t=0 primary loses network → t≈10s leader lease expires in etcd → t≈11s a replica's Patroni wins the leader key → t≈12s `pg_ctl promote` → t≈13s proxy health check flips, writes go to the new primary. ~10–15s, no human.


Run the proxy as an HA pair with a virtual IP (Keepalived) or as app-side sidecars — a single proxy is a single point of failure and a bottleneck.


### Failover pitfalls

- **Choosing the timeout:** too short → failover on a GC pause (needless disruption); too long → longer outage.
- **Lost writes with async replication:** the promoted replica may miss acknowledged writes. GitHub incident: a promoted MySQL replica reused auto-increment IDs that were also cached in Redis, leaking data between users.
- **Promote the most up-to-date replica:** Patroni `maximum_lag_on_failover`, Kafka `unclean.leader.election.enable=false`, Raft's up-to-date vote check.
- **External consensus is a dependency:** if etcd loses its majority, no failover can happen even with healthy replicas, and Patroni demotes a healthy primary to read-only by default (optional failsafe mode relaxes this).

### What clients do during failover


A write to the old leader is rejected (`NotLeaderException`, stale epoch), so it never commits and the client gets an error, not "saved". Smart drivers then:

1. **Refresh topology** — ask who leads now (the error often carries a hint).
2. **Retry** against the new leader.
3. Attach an **idempotency key** so a retry of a maybe-half-done request isn't applied twice.

---


## 3. Replication Log Implementation & CDC


The Leader has to physically transmit changes to Followers (or to entirely different downstream systems). Two dominant approaches, with very different implications:


### Physical (WAL) replication


The exact same low-level **Write-Ahead Log** bytes used for local crash recovery (see the transactions/WAL notes) are shipped to Followers verbatim. Reliable and simple, but tightly coupled to the storage engine’s internal, proprietary format — a Postgres WAL means nothing to MySQL, Snowflake, or Elasticsearch, and usually requires the replica to run the same database version.


### Logical (row-based) replication


Instead of raw bytes, the database emits a **structured, decoupled description** of each change — e.g. `Table: Orders, Action: UPDATE, Row ID: 5, status: pending → shipped`, typically as JSON-like messages.


**Why this matters:** every external system in the world can parse a structured/JSON message; almost none can parse another database’s proprietary physical log format. This is exactly what powers **Change Data Capture (CDC)** — pipelines (Debezium, Kafka Connect, etc.) that stream a database’s changes out to search indexes (Elasticsearch), data warehouses (Snowflake), caches, or other services, entirely decoupled from the source database’s internal storage format. Logical replication is the “universal translator” that makes CDC possible.


_(Minor gap, worth knowing the names exist even if not covered in depth: statement-based replication — shipping the literal SQL statement — is largely abandoned because non-deterministic functions like_ _`NOW()`_ _or_ _`RAND()`_ _replay differently on each replica; trigger-based replication — application-level triggers pushing changes elsewhere — is the most flexible but highest-overhead option, generally a last resort.)_


**Worked example — why statement-based breaks:** the leader runs `UPDATE coupons SET expired_at = NOW() WHERE user_id = 42 AND expired_at IS NULL`. Each replica re-runs `NOW()` at its own (later, differently-clocked) time, so expiry timestamps silently diverge. Row-based replication ships the evaluated value (`expired_at = '2026-11-05 15:45:00'`) instead.


### How the log format is chosen per database


| Database   | Physical                                | Logical                                      | How it's set                                                                                                         |
| ---------- | --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | Streaming WAL (default for HA standbys) | `CREATE PUBLICATION` / `CREATE SUBSCRIPTION` | `wal_level = replica` vs `logical`                                                                                   |
| MySQL      | —                                       | Binlog                                       | `binlog_format = ROW` (default), `STATEMENT`, or `MIXED` (statement, switching to row for non-deterministic queries) |
| MongoDB    | —                                       | Oplog (document-level)                       | Built in                                                                                                             |
| Kafka      | —                                       | Followers fetch the leader's record batches  | Built in                                                                                                             |


|                              | Physical (WAL)                   | Logical (row)                |
| ---------------------------- | -------------------------------- | ---------------------------- |
| Granularity                  | Whole cluster                    | Per table                    |
| Cross-version                | No — same major version required | Yes                          |
| Feeds external systems (CDC) | No                               | Yes                          |
| Overhead                     | Very low                         | Higher (decode + apply rows) |


### Zero-downtime major version upgrade (via logical replication)

1. Stand up the new version (e.g. Postgres 16) next to the live one (15).
2. Copy the schema (no data).
3. Start logical replication 15 → 16 (initial copy, then continuous changes).
4. Wait until lag is ~0.
5. Cutover: pause writes for a few seconds, confirm the last changes arrived, repoint the connection pool / DNS, resume.

Cutting over before lag reaches 0 loses the un-replicated writes.


**With WAL replication** a v16 server can't apply v15 WAL, so either take downtime with `pg_upgrade --link` and rebuild every replica, or run blue-green: a new v16 cluster bridged by temporary logical replication, then cut over.


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


### How it's structured


```plain text
MUMBAI                                 DELHI
 ┌──────────────────────┐             ┌──────────────────────┐
 │ Leader M  ← consensus│  async sync │ Leader D  ← consensus│
 │ Follower  Follower   │◄───────────►│ Follower  Follower   │
 └──────────────────────┘             └──────────────────────┘
```

- **Within a region:** an ordinary single-leader cluster; consensus picks that region's leader; that region's write-safety setting applies.
- **Across regions:** **no consensus** — leaders are leaders by configuration, and sync is asynchronous. Losing a whole region can lose its recent unshipped writes.
- **During a partition:** both sides keep accepting writes (availability over consistency) — this is the reason multi-leader was chosen. Split brain across regions isn't a bug here; it's the design. The cost is conflicts when the link heals.

Use it for multi-region low-latency writes, offline-capable clients (each device acts as a leader that syncs later — calendars, notes, CouchDB/PouchDB) and collaborative editing. Inside one datacenter it's rarely worth the complexity.


### Detecting conflicts


You must tell "B overwrote A" apart from "A and B happened concurrently". Timestamps can't do this reliably; **version vectors** can (each leader's update count). All-to-all topologies can also deliver an update before the insert it depends on, which version vectors help order.


### Avoiding conflicts — home region


Most practical approach: each record has a **home region**, and all its writes go there. For that record the system is effectively single-leader. Cost: if the home region is down, that record can't be written.


### Choose the strategy per type of data


Ask: _if two concurrent writes collide and one is lost or merged, what does the business lose?_


| Data                | Strategy                                          | Why                                                       |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Wallet balance      | Home region                                       | Rule: never below zero — must prevent, not fix later      |
| Coupon "use once"   | Home region                                       | Two regions could each allow one use                      |
| Last unit of stock  | Home region                                       | Two regions could sell the same item                      |
| Menu item price     | LWW, or the restaurant's home region              | Rare edits; losing one of two simultaneous edits is minor |
| Display name        | LWW                                               | Harmless if the later edit wins                           |
| Cart items          | Merge (union)                                     | User wants both additions                                 |
| Likes / view counts | CRDT counter                                      | Counts from both regions add up                           |
| Order status        | Custom merge: furthest state wins (+ home region) | Status only moves forward                                 |


Two tests: (1) is there a rule that crosses records or regions (balance ≥ 0, use once)? → home region or consensus. (2) If not, how bad is losing/merging a write? harmless → LWW; both matter → merge/CRDT.


Implementation: some databases let you set the resolver per table (multi-master Postgres extensions like pgEdge/BDR); others apply one rule to everything (DynamoDB Global Tables = LWW), so you add **routing in the application** (wallet writes always go to the home region) or split data across stores.


**Worked example — wallet overspend:** ₹500 balance; during a partition a ₹400 order hits Mumbai and another hits Delhi; each sees ₹500 and approves → ₹800 spent.

- LWW keeps one deduction → balance ₹100, but ₹400 of food never charged. ❌
- Merge/CRDT sums debits → −₹300: correct accounting, but the overdraft already happened. ⚠️
- Home region → only Mumbai may debit; Delhi can't approve during the partition → order fails or falls back to another payment method. ✅ (The business gives up availability for that payment to guarantee the invariant.)

Conflict resolution happens _after_ both writes were accepted — it can fix numbers but can't un-deliver the food.


**Worked example — order status with LWW:** delivery app sets `delivered` via Delhi; a slow restaurant tablet sends `accepted` via Mumbai seconds later → LWW keeps `accepted`, rolling a delivered order backwards. Better: rank states (placed 1 → accepted 2 → picked_up 3 → delivered 4) and keep the highest. `cancelled` needs a business rule (e.g. delivered wins, then refund).


### Global rules need consensus again


Unique usernames, auto-increment IDs and foreign keys can't be enforced by one region alone (two regions can both hand out "rashmi" or order #1001). Either send those writes to one global leader, or use a database that runs consensus across regions (Spanner, CockroachDB), paying cross-region latency on those writes.


---


## 7. Leaderless Replication & Quorums


Dynamo-style architecture (Cassandra, Riak, Voldemort): **no Leader at all**. Writes are sent directly to multiple replicas; reads similarly query multiple replicas and reconcile.


### Quorums


With **N** total replicas, a write succeeds once **W** replicas ack it; a read queries **R** replicas and returns the newest version among them.


**Worked example:** N=3 replicas (A, B, C). Requiring all 3 to ack a write means the whole system goes down the moment any one node (e.g., C, mid software-update) is unreachable — too fragile. Requiring only **2 out of 3** for both writes and reads (`W=2, R=2`) keeps the system available through single-node outages while still guaranteeing correctness: because `W + R > N` (`2+2 > 3`), any read group and any write group are mathematically guaranteed to overlap by at least one node — you can never read a value without also reading at least one replica that has the latest write.


### Read Repair 🛠️


When Node C comes back online after missing an hour of writes, a subsequent read (satisfying `R=2`) might be routed to A (fresh, version 100) and C (stale, version 90). The database compares versions as a side effect of serving that read, returns the fresh value to the user, **and** quietly pushes the newer data back to C in the background — the fresher replica repairs the staler one purely as a byproduct of normal read traffic. Over time, active reads gradually heal the whole cluster without any dedicated repair job.


_(Minor gaps worth naming:_ _**sloppy quorum + hinted handoff**_ _— if the “correct” replicas for a key are temporarily unreachable, the write is accepted by other, non-owning nodes instead to preserve availability, with a note to forward it to the rightful owner later; this trades strict quorum correctness for availability._ _**Anti-entropy**_ _— a background process that continuously compares replicas and syncs missing data independent of read traffic, complementing read repair for keys that are rarely read._ _**Version vectors**_ _— a generalization of the single version-number idea across multiple replicas, used to distinguish a genuine causal update from a true concurrent conflict — the leaderless-replication analog of the clock-drift problem LWW has in multi-leader systems.)_


### Who accepts writes, and how the cluster is managed

- The client sends to **any node**, which acts as **coordinator** and forwards to the key's N replicas.
- No leader → **no election, no consensus, no failover pause**. A dead node is just one fewer replica answering.
- Membership and health spread by **gossip**: each node periodically shares its view with a few random peers. This is failure detection, not consensus — nodes can briefly disagree.

### Cassandra consistency levels (chosen per query)


| Level          | Meaning (N = replication factor 3)                   |
| -------------- | ---------------------------------------------------- |
| `ONE`          | W or R = 1                                           |
| `QUORUM`       | W or R = 2                                           |
| `ALL`          | W or R = 3                                           |
| `LOCAL_QUORUM` | Majority within the local datacenter only (multi-DC) |
| `ANY`          | Write accepted even if only a hint was stored        |


`QUORUM` reads + `QUORUM` writes → W + R > N. Example: a restaurant menu (read thousands of times a minute, edited twice a day) suits W=ALL, R=ONE — fast reads, accepting that a menu edit fails if a replica is down.


### During a network partition (decided per key)


N=3, one replica cut off from the other two:

- **Strict quorum (****`QUORUM`****):** the 2-replica side works; the 1-replica side gets `UnavailableException`. Behaves like single-leader's minority side.
- **`ONE`****:** both sides accept writes → data diverges → resolved later. Behaves like multi-leader.
- **Sloppy quorum (original Dynamo, Riak):** if the real replicas are unreachable, stand-in nodes accept the write with a hint and hand it off later. Stays available, but a read of the real replicas may miss it. Cassandra uses hints only for catch-up and doesn't count them toward W (except at `ANY`).

So leaderless lets you choose consistency vs availability per query.


### Conflicts

- **Cassandra:** LWW per column, by timestamp — simple; silently drops the losing write; vulnerable to clock skew.
- **Riak / original Dynamo:** version vectors detect truly concurrent writes and keep both as siblings for the app to merge.

### Where consensus appears anyway


For "create only if it doesn't exist" (unique username, first-time coupon), Cassandra **lightweight transactions** (`INSERT ... IF NOT EXISTS`) run **Paxos** for that one operation — several round trips, much slower; use sparingly.


### Caveat on W + R > N


It makes stale reads unlikely, not impossible: concurrent writes, sloppy quorums and partially failed writes (written to 1 replica, reported as failed, never rolled back) can still surprise a reader.


### DynamoDB is not leaderless


The 2007 Dynamo _paper_ and Cassandra are leaderless. The **DynamoDB service** keeps 3 replicas per partition and elects a leader per partition with Multi-Paxos; writes and strongly consistent reads go through it, eventually consistent reads may hit any replica. **Global Tables** are multi-leader across regions with LWW. So DynamoDB = single-leader within a region, multi-leader across regions.


---


## 8. Summary Comparison


| Model             | Writes accepted at                        | Conflict handling                              | Best for                                     |
| ----------------- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| **Single-leader** | One node                                  | None needed (writes serialized through leader) | Most OLTP systems; simplest mental model     |
| **Multi-leader**  | Multiple nodes (e.g., one per datacenter) | Required — LWW or CRDTs                        | Multi-region writes, offline-capable apps    |
| **Leaderless**    | Any replica, reconciled via quorum        | Required — version vectors, read repair        | Very high availability, Dynamo-style systems |


### Partitions and split brain across the three


|                              | Single-leader                              | Multi-leader                                         | Leaderless                                   |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------- | -------------------------------------------- |
| Consensus used?              | Yes — elects the leader                    | Only inside each region                              | Mostly no (Paxos only for LWT)               |
| Quorum used                  | Majority (election) + write-safety setting | Majority inside a region                             | W + R > N per key                            |
| Split brain is…              | A bug to prevent                           | The intended behaviour across regions                | Not applicable — no leader                   |
| Minority side in a partition | Leader steps down; writes stop             | Keeps writing                                        | Rejects (strict) or accepts (`ONE` / sloppy) |
| Cost paid                    | Failover pauses, unavailability            | Conflicts after healing, broken global rules         | Weaker consistency, repair work              |
| Examples                     | Postgres, MySQL, MongoDB, Kafka, Redis     | Multi-region setups, CouchDB, DynamoDB Global Tables | Cassandra, Riak, original Dynamo             |


Interview default: single-leader with semi-sync replication plus read-your-writes handling. Go multi-region multi-leader only when latency or regional availability demands it, and even then prefer home-region routing over clever merging.


## 8b. Fault tolerance mechanisms — cheat sheet


| Failure                               | Mechanism                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Follower crashes / falls behind       | Rejoins and replays the log from its last position; a new replica = snapshot + replay                                                            |
| Leader crashes                        | Failover: detect (heartbeat timeout) → elect by majority → reconfigure clients (proxy / smart driver)                                            |
| Old leader comes back (zombie)        | Self-demotion + fencing token (term) rejects stale writes                                                                                        |
| Network partition                     | Single-leader: majority side continues. Multi-leader: both continue, resolve conflicts later. Leaderless: per-key quorum, optional sloppy quorum |
| Acknowledged writes lost on failover  | Stronger write-safety: semi-sync, `w:"majority"`, `acks=all`  • `min.insync.replicas`; never promote an out-of-sync replica                      |
| Stale reads from lagging replicas     | Read-your-writes routing, LSN tokens, sticky replicas, proxy lag protection                                                                      |
| Stale replica in leaderless           | Read repair, hinted handoff, anti-entropy (Merkle trees)                                                                                         |
| Consensus store (etcd) loses majority | Spread across 3 AZs, use 5 nodes for critical systems, monitor, snapshot; Patroni failsafe mode                                                  |
| Permanent loss of a majority          | Manual forced reconfiguration, then add nodes one at a time                                                                                      |
| Proxy failure                         | HA pair with virtual IP, or app-side sidecar proxies                                                                                             |
| Client mid-request during failover    | Topology refresh + retry + idempotency key                                                                                                       |
| Whole region lost                     | Multi-leader: other regions keep serving (may lose unshipped writes); single-leader: cross-region replica promoted                               |


---


## 9. Practical / Interview-Level Talking Points

- **Semi-synchronous replication (ack from just one replica) is the real-world default**, not full sync-to-all — full sync makes availability depend on every single replica being reachable, which is rarely acceptable.
- **Read-your-writes and monotonic reads are application-layer problems**, not database config flags — the database has no concept of “the user”; the fix always lives in your routing/proxy layer.
- **Split brain is triggered by a partition, not a crash** — this distinction is the crux of the problem, and fencing tokens (not “just detect it faster”) are the standard, name-worth-knowing mitigation.
- **Logical replication is what makes CDC possible** — this is a genuinely consequential infrastructure decision (can you feed Kafka/Elasticsearch/Snowflake off your primary database without bespoke ETL?), not a minor technical footnote.
- **Multi-leader and leaderless both trade single-leader’s “no conflicts, ever” simplicity for availability/latency** — and you always pay for that with explicit conflict machinery (LWW + clock drift risk, CRDTs, or quorums + version vectors). There’s no configuration that gives multi-region write locality _and_ zero conflict-handling complexity.
- **Consistent Prefix Reads is the anomaly people forget** relative to read-your-writes/monotonic reads — and it’s specifically the one that gets _worse_, not better, once you move beyond single-leader replication, because a single leader’s log is trivially ordered but a sharded or multi-leader system’s isn’t.
- **Read repair is a nice “free” side effect of quorum reads, but isn’t sufficient on its own** — rarely-read keys can stay stale indefinitely without a separate anti-entropy process running in the background.
- **Two knobs in single-leader:** consensus decides _who_ leads; the write-safety setting decides whether an acknowledged write survives failover. A perfect election can still lose a `w:1` / `acks=1` write.
- **`acks=all`** **needs** **`min.insync.replicas=2`**, otherwise a shrunken ISR silently turns it into `acks=1`.
- **Conflict strategy is chosen per data type:** home region for invariants (wallet, coupons, stock), LWW for harmless fields, merge/CRDT where both writes matter.
- **DynamoDB the service is leader-per-partition (Multi-Paxos)**, not leaderless; Global Tables are multi-leader with LWW. The Dynamo paper and Cassandra are leaderless.
- **External consensus (Patroni + etcd) means failover depends on etcd's majority**, not just on healthy database replicas.

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
- **Write concern / acks** — how many copies a write must reach before the client is told "saved" (`w:1`, `w:"majority"`, `acks=all`).
- **ISR (in-sync replicas)** — Kafka replicas fully caught up with the leader; only these can become leader (unless unclean election is enabled).
- **min.insync.replicas** — Kafka setting rejecting writes unless at least this many replicas are in sync.
- **Consensus store / node agent / proxy** — etcd-style referee, Patroni-style per-node manager, HAProxy-style router in an external-failover setup.
- **Coordinator** — in leaderless systems, the node that receives a request and forwards it to the key's replicas.
- **Gossip** — peer-to-peer spreading of membership and health; failure detection, not consensus.
- **Consistency level** — Cassandra's per-query W/R choice (`ONE`, `QUORUM`, `ALL`, `LOCAL_QUORUM`).
- **Lightweight transaction (LWT)** — Cassandra compare-and-set (`IF NOT EXISTS`) using Paxos.
- **Home region** — the single region allowed to write a given record in a multi-leader setup.
- **Rollback / log truncation** — an old leader discarding writes that never reached the new leader.
