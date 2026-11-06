---
title: "Quorums and Consensus"
---


Companion to the Replication page. Replication copies data; quorums and consensus are how a group of copies **agrees** on things (who leads, what's committed, whether a read is fresh) when machines crash and networks split.


**One-line mental model:** a quorum is the overlap trick. Consensus uses majority overlap + term numbers to make one decision final. Whether the vote runs inside the database or in a borrowed cluster like etcd is a deployment choice, not a different idea.


---


## 1. Quorum — the overlap trick


A quorum is a group size chosen so that **any two groups must share at least one node**. That shared node is a _witness_: it carries knowledge from one operation to the next, so nothing can happen behind the cluster's back.


**Worked example (5 nodes: A B C D E):**

- Quorum of 2 → {A,B} decides "leader is A", {D,E} decides "leader is D". No shared node → two contradictory "official" decisions. ❌
- Quorum of 3 → any second group of 3 must include A, B or C. If {C,D,E} asks C to approve "leader is D", C says "I already approved A" → second decision can't reach 3. ✅

```plain text
Group 1:   A  B  [C]
Group 2:         [C]  D  E
                  ↑ witness — in both groups
```


**Formulas:**

- Majority quorum = ⌊N/2⌋ + 1
- Failures you can survive = N − quorum

| Nodes | Quorum | Can lose | Note                 |
| ----- | ------ | -------- | -------------------- |
| 3     | 2      | 1        |                      |
| 4     | 3      | 1        | Same as 3, more cost |
| 5     | 3      | 2        |                      |
| 6     | 4      | 2        | Same as 5, more cost |
| 7     | 4      | 3        |                      |


**Why odd numbers:** an even count adds a machine without surviving more failures, and allows a perfect tie. 4 nodes split 2 | 2 → neither side has 3 → whole cluster stops. 3 nodes split 2 | 1 → the 2-side keeps working. That's why etcd, ZooKeeper, MongoDB replica sets and Kafka controllers run as **3 (survive 1) or 5 (survive 2)**, rarely more — every extra voter slows every decision.


**Multiple partitions:** a network can break into more than two pieces. 5 nodes split 1 | 2 | 2 → nobody has 3 → no leader, no writes anywhere. Deliberate: safety over availability. Two strict majorities can never exist at once, however the network fractures.


---


## 2. The two kinds of quorum


|                     | Majority quorum                                            | Read/write quorum                            |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Question it answers | "Can we **decide** one answer that's never contradicted?"  | "Can a read **find** the latest write?"      |
| What must overlap   | Any two operations                                         | A read and a write                           |
| Rule                | Every operation goes to a majority                         | W + R > N                                    |
| Used by             | Consensus: etcd, ZooKeeper, MongoDB elections, Kafka KRaft | Leaderless: Cassandra, Riak, original Dynamo |


### Read/write quorum (W, R, N)

- **N** = number of replicas of _this key_ (not the whole cluster).
- **W** = how many confirmations a write **waits for**. The write is still sent to all N; W is just when you tell the user "saved".
- **R** = how many replicas a read **asks**; it keeps the newest version among the answers.
- If **W + R > N**, the read set must overlap the confirmed-write set → the read can't miss the latest write.

```plain text
N=3, W=2, R=2
Write v2 confirmed by:   A  [B]
Later read asks:            [B]  C
                             ↑ B has v2, C has v1 → newest wins → v2 ✅

N=3, W=1, R=1  (1+1 ≤ 3)
Write v2 confirmed by:   A
Later read asks:                 C   → C still has v1 → stale read ❌
```


The non-confirming replicas aren't left behind forever — they catch up via read repair, hinted handoff and anti-entropy. W and R matter for the window right after a write.


### Why W and R are separate (instead of always majority)


Consensus must stop two _decisions_ contradicting each other, so every operation goes to a majority. A leaderless DB only needs reads to find writes — conflicting writes get resolved later by versions/timestamps. So it can split the overlap budget between reads and writes to fit the workload. Contacting more replicas = slower and more likely to fail when a node is down; put that cost where it hurts least.


| N=3 setting | Writes                      | Reads     | Good for                                          |
| ----------- | --------------------------- | --------- | ------------------------------------------------- |
| W=3, R=1    | Slow; fail if any node down | Very fast | Read-heavy, rarely changed (e.g. restaurant menu) |
| W=2, R=2    | Balanced                    | Balanced  | General default (Cassandra QUORUM)                |
| W=1, R=3    | Fast, always accepted       | Slow      | Write-heavy streams, rarely read                  |


**Trade-off of small W:** two writes may not overlap _each other_ → concurrent writes both accepted → conflict to resolve later. Fine for a leaderless DB, fatal for leader election — which is exactly why consensus never does it.


**Caveat:** W + R > N makes stale reads unlikely but isn't a perfect guarantee — concurrent writes, sloppy quorums and partially failed writes can still produce surprising reads. For a hard guarantee you need consensus.


---


## 3. Consensus — deciding one final answer


**Consensus** = a group of machines agreeing on one answer that is **final** (never reversed), even when machines crash or the network splits.


What clusters use it for:

1. **Who is leader** (leader election).
2. **The order of writes in the log** — an entry is committed only once a majority have stored it at the same position.
3. **Changing the membership** — adding/removing nodes is itself a consensus decision.

### The three rules


| Rule                                                                                                                              | What it prevents                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Majority vote** — a leader needs votes from more than half                                                                      | Two leaders elected at the same time                                             |
| **Term number** — elections are numbered 1, 2, 3…; each node votes at most once per term; messages from an older term are ignored | An old leader coming back and acting as leader. The term _is_ the fencing token. |
| **Up-to-date check** — a node won't vote for a candidate whose log is older than its own                                          | A new leader that's missing committed writes                                     |


**Consensus = majority quorum + terms + up-to-date check.** The majority quorum is the building block; consensus is the full protocol built from it. A W+R quorum is _not_ consensus.


### Worked example — Raft election on 3 nodes


```plain text
Term 4: A is leader, sending "I'm alive" heartbeats every ~100ms

A freezes (long GC pause). B hears nothing past its election timeout.

B: "Election, term 5. Vote for me?"
   B votes for itself                → 1 vote
   C hasn't voted in term 5, and B's
   log is at least as new as C's     → votes B → 2 votes
   2 of 3 = majority → B is leader for term 5 ✅

A wakes up: "I'm leader, term 4!"
   B, C: "We're on term 5."
   A sees a higher term → steps down to follower ✅
```


### Worked example — split brain blocked


ATM deposits $100 via Node A while the app withdraws $100 via Node B, both believing they're leader. Start $100 → A says $200, B says $0, truth is $100. On heal, either overwrite loses a transaction. Majority + terms make this impossible: only one side can hold a majority, and the stale side's term gets rejected.


### What happens to the rejected write?


The zombie leader's write is refused (e.g. `NotLeaderException` / `StaleEpoch`), so it never commits and the client gets an error, not "saved". Smart drivers then:

1. **Refresh topology** — ask the cluster who leads now (often the error carries a hint).
2. **Retry** against the new leader.
3. Use an **idempotency key** so a retry of something that may have half-happened isn't applied twice.

---


## 4. Algorithms vs software


An **algorithm** is a recipe written in a paper; you can't install it. **Software** is a program that follows the recipe; you deploy it.


| Name         | Type      | Notes                                                                      |
| ------------ | --------- | -------------------------------------------------------------------------- |
| Paxos (1989) | Algorithm | The original; correct but hard to understand and implement                 |
| Raft (2014)  | Algorithm | Same problem, designed to be understandable. The election above _is_ Raft. |
| ZAB          | Algorithm | ZooKeeper's own protocol, Raft-like                                        |
| ZooKeeper    | Software  | Runs ZAB on 3–5 servers. Old Kafka, HBase used it.                         |
| etcd         | Software  | Runs Raft on 3–5 servers. Kubernetes, Patroni use it.                      |
| Consul       | Software  | Runs Raft. Service discovery + KV store.                                   |


All three algorithms rest on the same idea: majority votes + term numbers.


---


## 5. Where consensus runs


Same algorithm everywhere; the difference is **which processes run it**.


| Style                        | Who votes                                   | Examples                                                                 | Why                                                                               |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Internal**                 | The database nodes themselves               | MongoDB replica sets, Kafka KRaft, CockroachDB, TiDB, Redis Cluster      | Designed as distributed systems from day one                                      |
| **External**                 | A separate consensus cluster the DB borrows | PostgreSQL + Patroni + etcd, MySQL + Orchestrator, old Kafka + ZooKeeper | Single-node databases with replication bolted on; can't hold elections themselves |
| **Separate voter processes** | Lightweight monitors, not data nodes        | Redis Sentinel (typically 3 sentinels vote on failover)                  | Adds failover to a DB without consensus built in                                  |
| **Managed**                  | Cloud provider, hidden                      | RDS Multi-AZ, Aurora, DynamoDB, Spanner                                  | You never operate it                                                              |


Key insight: **etcd is itself just a small key-value database with internal Raft.** "External consensus" means a system that can't do it borrows one that can.


### External setup in practice (Postgres + Patroni + etcd)


```plain text
[ Apps ]
           │
   [ Proxy: HAProxy / PgBouncer ]   ← routes writes to current primary
      │                 │
[ PG Node 1 ]      [ PG Node 2 ]
[ Patroni   ]      [ Patroni   ]    ← agent: renews lease, promotes/demotes
      └───────┬────────┘
     [ etcd × 3 (Raft) ]            ← holds /service/leader key with TTL
```

- **Consensus store (etcd):** 3–5 small nodes across zones, run by platform/SRE team. Holds the leader key with a TTL (e.g. 10s).
- **Node agent (Patroni):** next to each Postgres; the primary's agent renews the lease every few seconds; replicas watch it.
- **Proxy:** polls agent health endpoints (e.g. `GET /primary` → 200) and sends writes only to the leader. Run as an HA pair with a virtual IP (Keepalived) or as app-side sidecars — a single proxy is a SPOF and bottleneck.

**Failover timeline:** t=0 primary loses network → t≈10s lease expires → t≈11s replica's Patroni wins the leader key in etcd (most up-to-date candidate) → t≈12s `pg_ctl promote` → t≈13s proxy health check flips, writes go to new primary. ~10–15s, no human.


The agent is **database-specific** (Patroni speaks Postgres: LSNs, replication slots; Orchestrator speaks MySQL: binlog/GTIDs). The consensus store is **database-independent**. L4 proxies (HAProxy) are generic; L7 proxies (PgBouncer, ProxySQL) speak the DB protocol.


### The cost of external: two things must stay healthy


|                                         | MongoDB (internal)                    | Postgres + etcd (external)                    |
| --------------------------------------- | ------------------------------------- | --------------------------------------------- |
| Who votes                               | The DB nodes                          | The etcd cluster                              |
| What must keep a majority               | One group                             | Two: etcd _and_ a healthy Postgres to promote |
| Healthy DB nodes, referee lost majority | Impossible — DB nodes are the referee | **Stuck**                                     |


**Worked example:** 3 Postgres + 3 etcd. Two etcd nodes die → 1 etcd left, needs 2 → etcd frozen (a lone Raft leader can't commit anything). Postgres primary then dies → Patroni on a healthy replica must write "leader = B" to etcd → write fails → **no failover**, despite two healthy replicas.


Worse: by default, a healthy primary that can't renew its etcd lease is **demoted to read-only** by Patroni — it can't prove it's the only leader, so it stops writes rather than risk split brain. Patroni's optional **failsafe mode** keeps the primary writable if it can still reach all other Patroni members directly.


So: your failover is only as available as your etcd. Spread etcd across 3 availability zones, consider 5 nodes for critical DBs, monitor quorum, snapshot regularly.


---


## 6. Failure behaviour & recovery


True for every consensus system (etcd, ZooKeeper, MongoDB, Kafka KRaft):


| Situation                      | Result                                                   |
| ------------------------------ | -------------------------------------------------------- |
| Lost a minority of nodes       | Keeps working                                            |
| Lost the majority, temporarily | Writes freeze; **heals automatically** when nodes return |
| Lost the majority, permanently | Frozen until a **human forces a smaller cluster**        |


**Example:** 3 MongoDB nodes, primary dies → the 2 survivors are a majority → elect a new primary in ~10–12s. 3 MongoDB nodes, 2 die → the survivor **steps down to secondary**: no writes, but it can still serve reads if the app allows secondary reads.


### Case 1 — nodes come back with disks intact (common)


Process restarts (systemd / Kubernetes / on-call) → node rejoins with its data → majority restored → election → leader resumes writes → lagging nodes catch up from the log (Raft log / oplog). No special steps.


### Case 2 — nodes permanently gone


You **can't** just add fresh nodes: adding a member is a configuration change, which is a consensus decision needing a majority — the thing you lost. (Club analogy: 3 members on the list, rule needs 2 votes, two left forever but are still on the list; the last member can't outvote the list to admit anyone.)


Forced recovery, done by a human:

- **etcd:** restart the survivor with `--force-new-cluster` → it becomes a 1-member cluster keeping its data → add members one at a time (1 → 2 → 3). If no node survived, restore from a snapshot.
- **MongoDB:** `rs.reconfig(cfgWithOnlySurvivor, {force: true})` → 1-member set, elects itself → `rs.add()` new nodes one at a time; each does an initial sync.

**Why it can't shrink itself:** from inside, "dead forever" looks identical to "cut off by the network". If a lone node could auto-remove silent peers, a partition 1 | 2 would give two clusters both accepting writes → split brain. Only a human who knows the truth can force it — and running a force command on the wrong node (or two nodes) causes exactly that split brain.


**New nodes always join the same way:** copy a consistent snapshot, then replay the log from that position (Postgres `pg_basebackup` + WAL from the LSN, MongoDB initial sync + oplog, Kafka follower copies the partition log until it joins the ISR).


---


## 7. How each replication architecture uses quorums & consensus


|                              | Single-primary                                     | Multi-primary                         | Leaderless                                               |
| ---------------------------- | -------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| Consensus?                   | Yes — elects the leader                            | Only inside each region               | Mostly no (only for Cassandra LWT, via Paxos)            |
| Quorum used                  | Majority (election); optional write-safety setting | Majority inside a region              | W + R > N per key                                        |
| Split brain is…              | A bug to prevent                                   | The intended behaviour across regions | Not applicable — no leader                               |
| Minority side in a partition | Leader steps down; writes stop                     | Keeps writing                         | Rejects (strict quorum) or accepts (W=1 / sloppy quorum) |
| Cost paid                    | Failover pauses, unavailability                    | Conflicts after healing               | Weaker consistency, repair work                          |


See the Replication page for per-architecture detail (write-safety knobs, conflict strategies, Cassandra consistency levels).


---


## 8. Interview talking points

- **Quorum is a tool, consensus is a protocol.** Majority overlap alone doesn't handle time; consensus adds terms and the up-to-date check.
- **Odd cluster sizes:** failures tolerated = N − (⌊N/2⌋+1). 4 tolerates the same as 3; 6 the same as 5.
- **Raft/Paxos/ZAB are algorithms; etcd/ZooKeeper/Consul are software.** Internal vs external is about where the Raft code lives.
- **External consensus adds a dependency:** losing etcd's majority blocks failover even with healthy DB replicas.
- **Consensus chooses consistency over availability:** a minority partition stops writes rather than risk two leaders (CP side of CAP).
- **Membership changes need a majority**, so permanent majority loss needs manual forced recovery.
- **Fencing token = term number.** Storage/replicas reject writes stamped with an older term.
- **W + R > N ≠ consensus.** It helps reads find data; it doesn't serialize concurrent writes.

---


## 9. Glossary

- **Quorum** — minimum group size such that any two groups overlap.
- **Majority quorum** — ⌊N/2⌋ + 1; used for decisions.
- **Read/write quorum (N, W, R)** — tunable confirmations/replicas for leaderless reads and writes; W + R > N guarantees overlap.
- **Consensus** — agreeing on one final value despite failures.
- **Term / epoch / generation** — monotonically increasing election number; one vote per node per term; doubles as fencing token.
- **Leader lease** — time-limited leadership (TTL) that must be renewed; lapses if the leader can't reach the consensus store.
- **Raft / Paxos / ZAB** — consensus algorithms.
- **etcd / ZooKeeper / Consul** — consensus software (external coordinators).
- **Patroni / Orchestrator** — database-specific node agents for failover.
- **Split brain** — two nodes both acting as leader, usually after a partition.
- **Self-demotion / step-down** — a leader that can't reach a majority gives up leadership on its own.
- **Forced reconfiguration** — manual override (`--force-new-cluster`, `rs.reconfig({force:true})`) to recover from permanent majority loss.
- **Gossip** — peer-to-peer membership/failure detection; not consensus.
- **Idempotency key** — request ID that makes retries after failover safe.
