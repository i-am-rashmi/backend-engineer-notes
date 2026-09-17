---
title: "System Design : Consensus"
---


# Understanding Distributed Consensus & Raft


## 0. The Story: Why This Problem Exists at All


Picture three servers — A, B, and C — all meant to hold the exact same data, like three people trying to keep identical copies of the same shared notebook. If all three are allowed to write into their own notebook whenever they want, with no coordination, the notebooks drift apart and disagree. That’s the entire problem distributed consensus exists to solve: **getting multiple independent machines to agree on a single source of truth, even though networks are unreliable and machines crash.**


The most common way to solve it isn’t to have all three negotiate every single change together — that would be painfully slow. Instead, the group agrees on a simpler rule: **only one of them, the Leader, is allowed to accept new writes.** Everyone else — the Followers — simply copies whatever the Leader tells them. Raft is the specific rulebook (a _protocol_ — a precise, engineered set of rules, the same way board game rules are a rulebook for players) that governs exactly how a group of machines picks that Leader, keeps everyone in sync, and — critically — recovers safely when things go wrong.


Once you see Raft as “just a rulebook programmed into servers,” the rest of this topic is really just walking through what that rulebook says for every situation that can go wrong: the Leader dies, the network splits, a vote ties, a brand-new empty server joins. Each mechanism below exists to answer one specific “what if” question.


---


## 1. Leader Election — The Basic Mechanics


### The narrative


Every node in a Raft cluster is always in exactly one of three states: **Follower**, **Candidate**, or **Leader**. Everyone starts as a Follower, quietly listening for a **heartbeat** — a small, constant “I’m still here” message the Leader sends out. As long as a Follower keeps hearing that heartbeat, it does nothing but sit and wait. The system only springs into action the moment those heartbeats stop.


If a Follower goes too long without hearing a heartbeat, it assumes the Leader is dead. It transitions to **Candidate**, votes for itself, and asks every other node in the cluster to vote for it too. If it collects votes from a **majority** of the cluster, it becomes the new Leader and immediately starts sending its own heartbeats — and the cycle continues.


### Definitions

- **Follower** — the default, passive state; simply replicates whatever the Leader says and waits for heartbeats.
- **Candidate** — a transitional state a Follower enters when it stops hearing heartbeats and starts campaigning for votes.
- **Leader** — the single node currently authorized to accept and coordinate all writes.
- **Heartbeat** — a periodic, lightweight message from the Leader to Followers, proving it’s still alive and in charge.
- **Election** — the voting process a Candidate triggers to try to become the new Leader.

### The obvious problem this raises: the tie


If two Followers both stop hearing the heartbeat at nearly the same moment, they can both become Candidates and both start asking for votes simultaneously. If the remaining votes split evenly between them, **neither reaches a majority**, the election fails, and the cluster has to try again — wasting time while nobody is in charge. Section 5 below covers exactly how Raft prevents this from happening repeatedly.


---


## 2. Where Leaders Are Actually Used — Beyond Just Replication


### The narrative


It’s tempting to think “Leader” is a concept specific to database replication, but it’s really a general answer to a general problem: **anytime a group of machines needs coordination or a single source of truth, a leader shows up.** A few concrete examples worth knowing by name:

- **Task Assignment** — a cluster processing background jobs (sending emails, rendering video) uses a leader as a “foreman,” handing out specific jobs to followers so two workers don’t accidentally duplicate the same task.
- **Cluster Management** — systems like Kubernetes use a leader to monitor overall cluster health and make decisions like “Server X is down, spin up a replacement on Server Y.”
- **Distributed Locking** — when multiple servers share access to one resource, they request a “lock” (like a talking stick) from the leader; only the lock-holder may modify the resource, preventing corruption.

### Definition

- **Distributed Consensus** — the general problem of getting independent machines to agree on a single value or state, of which leader election is one common solution strategy.

---


## 3. The Cost of Consensus — Why It’s “Expensive”


### The narrative


Having a single boss solves the coordination problem, but it isn’t free. Every decision has to physically travel to the Leader and back — and if the Leader is far away, that trip costs real time.


**Worked example:** imagine a Leader in New York and Followers in Tokyo and London. A user sitting in Tokyo tries to save a new profile picture:
1. Their request hits the nearby Tokyo server — but Tokyo is just a Follower, so it can’t decide anything on its own. It forwards the request across the ocean to the Leader in New York.
2. New York says, “I’ll make the update, but I need majority agreement first,” and sends the new data out to Tokyo and London.
3. Tokyo and London save it and send confirmations back across the ocean to New York.
4. Only once New York has heard back from enough nodes does it tell Tokyo, “Officially saved” — and only then does Tokyo tell the user’s phone, “Success.”


Every single write pays this full round-trip “travel tax,” because Raft guarantees **strict consistency** — everyone must agree before the system moves on. This is the literal, physical reason consensus is described as computationally and temporally expensive: it isn’t an abstract inefficiency, it’s the actual speed-of-light cost of coordinating across a real network, repeated on every write.


### Definition

- **Latency** — the delay caused by the physical time it takes data to travel across a network; the core cost consensus pays repeatedly.

---


## 4. Split Brain & The Quorum — Consensus’s Core Safety Guarantee


### The narrative


Now for the nightmare scenario Raft is specifically engineered to prevent. Take a 5-node cluster — A, B, C, D, E — spread across two datacenters, with A as the current Leader. A construction worker accidentally severs the network cable connecting the two datacenters. Side 1 (A, B) and Side 2 (C, D, E) can no longer talk to each other — **but neither side has actually crashed.**


Node A keeps sending heartbeats, but they only reach B. Meanwhile, C, D, and E stop hearing anything from A at all — from their point of view, the Leader is gone. Since three nodes is still a **majority** of the original five, one of them (say, C) starts an election, easily wins the 3 votes it needs, and becomes a _new_ Leader for Side 2.


Meanwhile, over on Side 1, Node A has no idea the cable was cut — it never crashed, it just can’t see the other side, so it still believes it’s the Leader and keeps sending heartbeats to B. **The cluster now technically has two leaders running simultaneously.** This is **Split Brain** — the exact disaster consensus protocols exist to prevent, because if both “leaders” started accepting writes independently, the two sides of the cluster would silently diverge and corrupt the shared data.


**How Raft actually prevents the damage:** if a user’s app connects to Node A and asks to save something, A can’t just act unilaterally — the golden rule of Raft is that a Leader needs agreement from a **majority** of the _entire original cluster_ before it can officially commit anything. Node A can only reach Node B — 2 out of 5 — which isn’t enough. **The write is refused.** Side 1 is deliberately forced to go silent and do nothing, rather than risk writing data that conflicts with whatever Side 2 is doing. The system chooses to pause on the broken side rather than risk corrupting the data — safety over availability.


### Definitions

- **Split Brain** — a scenario where a network partition causes two nodes to simultaneously believe they are the legitimate leader, risking divergent, conflicting writes.
- **Quorum** — the minimum number of nodes required to make a binding decision; in Raft, always a strict majority, calculated as `(Total Nodes / 2) + 1`. For a 5-node cluster, the quorum is 3.
- **Network Partition** — a network failure that splits a cluster into two or more groups that can’t communicate with each other, without any node actually crashing.

**This is directly the CAP theorem’s C-vs-A trade-off in action:** during a genuine network partition, Raft’s design explicitly picks **Consistency over Availability** — the minority side refuses to serve writes at all rather than risk an inconsistent result. A system designed to favor Availability instead would let Side 1 keep accepting writes and reconcile the conflict later — which is exactly the trade-off multi-leader/leaderless replication systems make instead (see your Replication notes).


### Reconciliation — how the two “leaders” resolve their fight


When the cut cable is repaired, A and C suddenly see each other, and both claim leadership. Raft resolves this using **Terms** — a simple counter incremented every time a new election happens, functioning like a numbered “election year.”


A was elected in Term 1. When Side 2 lost contact with A, it ran a fresh election for Term 2, and C won it. When the two sides reconnect, A announces “I’m the leader of Term 1,” and C announces “I’m the leader of Term 2.” **The rule is simple: the highest term always wins.** The moment A sees a higher term exists, it immediately steps down and reverts to being a Follower — and because the quorum rule prevented A from saving any conflicting data while isolated, A simply copies over whatever data C now has, and the cluster is perfectly back in sync.


### Definition

- **Term** — a monotonically increasing counter identifying each election “cycle”; used to resolve exactly which leader’s authority is current when two claimants meet.

---


## 5. The Randomized Timer Trick — Preventing Repeated Ties


### The narrative


Recall the tie problem from Section 1: if two Followers notice the missing heartbeat at the exact same instant, they can both become Candidates simultaneously and split the vote. Raft’s fix is deceptively simple: instead of every Follower waiting a fixed amount of time before starting an election, **each Follower picks its own random timeout** (typically somewhere between 150–300 milliseconds).


Every time a heartbeat arrives, a Follower resets its personal random timer. But once heartbeats stop, the clocks start ticking down — and because the timeouts were randomly chosen, it’s very likely one node’s timer runs out slightly before any other’s.


**Worked example:** Node A randomly picked 160ms, Node B picked 220ms. When the Leader dies, both start counting down. At 160ms, A’s timer expires first — it immediately starts an election, wins the votes (since nobody else has campaigned yet), and becomes Leader. The very first thing a new Leader does is broadcast a heartbeat. By the time B’s own timer would have hit 220ms, it has already received A’s “I’m in charge” heartbeat at around 165ms — so B simply resets its clock and never bothers starting an election of its own. Tie avoided, almost every time, purely by making the timeouts unpredictable relative to each other.


### Definition

- **Randomized Election Timeout** — each node independently picks a random wait time before campaigning, making simultaneous elections (and therefore split votes) statistically unlikely.

---


## 6. Expanding the Cluster Safely


### The narrative


Imagine a healthy 3-node cluster (A, B, C) that’s been running for a year, holding millions of rows of real data. To scale up, you plug in two brand-new, completely empty servers — D and E. If they were made **full voting members** the instant they joined, disaster is one bad coin-flip away: if the current Leader crashed at just the wrong moment and one of these empty nodes somehow won the resulting election, Raft’s fundamental rule — “the Leader’s data is the absolute truth” — would kick in backwards. The new “Leader” would look at the other nodes’ data, see it doesn’t match its own (empty) notebook, and instruct everyone to **delete everything** to match it. Millions of rows of real data, wiped, because an empty node accidentally became boss.


Raft prevents this with two separate safety mechanisms working together:

1. **The Election Restriction** — every Candidate has to include metadata about how up-to-date its own data is when it requests votes. A Follower checks that metadata before voting, and **refuses to vote for any Candidate whose data is less current than its own.** An empty server can never win an election, because every other node can see it’s behind and simply won’t vote for it — this makes the “empty leader” disaster structurally impossible, not just unlikely.
2. **The Learner State** — rather than making D and E full voting members immediately, they’re added in a special **Learner** state: unable to vote, unable to become a Candidate, with the sole job of silently downloading and catching up on the Leader’s data in the background. Only once a Learner is fully caught up is it promoted to a normal, voting Follower.

### Definitions

- **Election Restriction** — a Raft safety rule that a Candidate’s data must be at least as up-to-date as a Follower’s own data before that Follower will vote for it.
- **Learner** — a non-voting node state used for safely catching a brand-new or rejoining server up on cluster data before it participates in elections.

---


## 7. Where Raft Actually Lives in a Real Server Stack


### The narrative


As an application developer, you almost never write Raft’s rulebook yourself — it lives separately from your ordinary business logic (e.g., your Java code handling user logins). There are two common ways it’s actually deployed:

1. **The Infrastructure Layer (most common)** — you use a specialized database or coordination tool with Raft built deep into its core (etcd, Consul, CockroachDB are concrete real examples). Your application server simply says “save this data”; the database cluster runs Raft behind the scenes to agree on it internally, then reports back “done.” You never touch the consensus logic directly.
2. **The Library Layer** — if you’re building a custom distributed tool and genuinely need Raft inside your own application, you import a pre-built library (e.g., **Apache Ratis** for Java) rather than implementing the protocol from scratch. You write normal application code, hand data off to the library, and it opens a dedicated network port to handle all the heartbeats, voting, and leader election internally.

**Configuration**, practically speaking, usually starts with a config file or environment variables — when Server A boots, its config lists the IP addresses of B and C, which is how the underlying Raft implementation knows exactly who to send heartbeats to and request votes from.


### The stateful vs. stateless divide — where Raft is and isn’t needed


This is the deciding factor for whether a given piece of infrastructure needs Raft at all:

- **Database services (stateful)** — hold the actual permanent data. A cluster of database nodes absolutely needs a leader (via Raft or an equivalent) to avoid overwriting each other and to keep data in sync.
- **Application servers (stateless)** — typical Java/Python/Node backend servers, acting as middlemen: receive a request, run business logic, hand data off to the database to be persisted. **They don’t hold the permanent record themselves.**

**Analogy:** application servers are like bank tellers; the database is the vault in the back. You don’t need to elect a “leader” teller, because every teller ultimately walks to the same shared vault — any of them can serve any customer interchangeably. This is exactly why, if one of ten identical application servers crashes, a **Load Balancer** just instantly reroutes traffic to one of the nine survivors and a replacement spins up in the background — no pause, no election, no voting, because none of them held any unique state that needed to be reconciled.


### Definitions

- **Stateful service** — holds the actual, persistent source-of-truth data (databases, key-value stores, message queues); needs consensus/leader election to coordinate safely.
- **Stateless service** — holds no durable state of its own, just processes requests and defers persistence to a downstream stateful store; doesn’t need consensus, since any instance is interchangeable with any other.
- **Load Balancer** — routes traffic across interchangeable stateless instances; the mechanism that makes stateless-server failure a non-event, unlike stateful-leader failure.

---


## 8. When to Avoid Strict Consensus: Eventual Consistency


### The narrative


Because consensus is genuinely expensive (Section 3), engineers deliberately avoid it whenever the use case can tolerate a looser guarantee. The deciding question is simple: **does this specific piece of data need to be perfectly, immediately correct, or can it tolerate being briefly, harmlessly wrong?**

- A **$500 bank transfer** absolutely needs strict consensus — money must never be double-counted or lost.
- A **view counter on a viral video** does not — being off by a few hundred views for a few seconds harms nobody, and demanding strict consensus for it would be paying an enormous latency cost for a guarantee nobody actually needs.

For the second category, systems commonly move to a **Leaderless** or **Multi-Leader** design and accept **Eventual Consistency** instead:

- **Local writes** — every regional server (Tokyo, London, New York) is allowed to accept updates locally, immediately, with no quorum vote and no waiting. A view in Tokyo just increments Tokyo’s own local counter and instantly returns.
- **Background gossip** — servers asynchronously exchange updates with each other in the background (“Tokyo: add 5,000 views”; “London: add 2,000 views”), independent of any user-facing request.
- **Eventual syncing** — for some window of time, different servers will genuinely disagree on the exact count. Eventually, once the background gossip finishes propagating, they converge on the same final number.

**Analogy:** a busy coffee shop with three separate tip jars on the counter. Nobody needs a manager’s approval before dropping a dollar into any jar — you just combine all three jars at the end of the day to get the true total.


**The visible consequence:** during that window of disagreement, checking the same video’s view count from your phone (hitting the Tokyo server) versus your laptop three seconds later (hitting a slightly lagging server) can genuinely show two different numbers — a real, harmless glitch, not a bug, and a direct, concrete instance of the Read-Your-Writes/Monotonic-Reads style anomalies from your Replication notes.


### Definitions

- **Eventual Consistency** — a consistency model where replicas are allowed to temporarily disagree, with a guarantee they will converge to the same value once updates finish propagating, in exchange for much lower latency and no coordination cost per write.
- **Leaderless / Multi-Leader replication** — architectures that accept writes at multiple points simultaneously rather than funneling everything through one elected leader, trading strict consistency for availability and speed (see your Replication notes for the full mechanics — quorums, conflict resolution, CRDTs).

---


## 9. Gaps — What Wasn’t Covered in the Session


### 9.1 Log Replication — the other half of Raft (a genuine gap; the session only covered elections)


Raft is actually described in the original paper as solving **two** problems together: **Leader Election** (covered thoroughly above) and **Log Replication** (barely touched). The Leader doesn’t just “tell Followers to save data” in the abstract — concretely, every accepted write is appended as an entry to the Leader’s local **replicated log** (an ordered, append-only sequence of commands — conceptually the same idea as the WAL from your transactions notes, but replicated by consensus rather than just for local crash recovery). The Leader sends that log entry to Followers via the same heartbeat/`AppendEntries` messages used for liveness checks. An entry is only considered **committed** — safe to actually apply and report back to the client as successful — once it’s been replicated to a **quorum** of nodes, not just written locally. This is the actual mechanism underneath the New-York/Tokyo/London worked example in Section 3 — “wait for majority agreement” specifically means “wait until a quorum of nodes has this log entry durably appended,” not some vaguer notion of agreement.


### 9.2 Raft vs. Paxos vs. ZAB — naming the alternatives (gap)


Raft wasn’t the first consensus algorithm — it was explicitly designed as a more _understandable_ alternative to **Paxos**, which solves the same fundamental problem but is notoriously difficult to reason about and implement correctly (this difficulty is well-documented and widely cited as Paxos’s biggest practical weakness). **ZAB (ZooKeeper Atomic Broadcast)** is a third, similar protocol, purpose-built for ZooKeeper specifically. All three achieve the same core guarantee (a single agreed-upon, totally ordered sequence of operations across a cluster, tolerating a minority of node failures) via slightly different mechanics — worth being able to name all three, since “Raft” is often used almost generically in casual conversation when Paxos or ZAB might be the actual protocol underneath a specific real system (e.g., ZooKeeper uses ZAB, not Raft).


### 9.3 Fault tolerance math — why odd cluster sizes (gap)


Worth stating explicitly: a Raft cluster of size N can tolerate up to `⌊(N-1)/2⌋` node failures while still being able to elect a leader and make progress. This is exactly why cluster sizes are conventionally **odd** (3, 5, 7) — a 4-node cluster tolerates the same _number_ of failures as a 3-node cluster (1) while requiring an extra machine for no added fault tolerance, since the quorum threshold (`(N/2)+1`) rounds up identically either way. This is a concrete, checkable fact worth having ready in an interview, rather than just “odd numbers avoid ties” as a vague intuition.


### 9.4 Linearizability — the formal name for what Raft provides (gap)


Your Replication and Transactions notes already cover isolation levels and CAP; worth connecting the dot explicitly here: the consistency guarantee a correctly functioning Raft cluster provides for reads/writes to its replicated log is called **Linearizability** — the strongest single-object consistency model, meaning every operation appears to take effect atomically at some single point between when it was invoked and when it completed, and all clients see operations in the same real-time order. It’s a stronger guarantee than Serializability (which concerns multi-object transaction ordering, not real-time recency) — the two terms are easy to conflate but answer different questions, and knowing the distinction is a common senior-level probe.


---


## 10. Summary — Everything That Matters, In One Place

- **The core problem:** getting multiple independent, unreliable machines to agree on a single source of truth. The dominant practical solution is electing a single **Leader** to serialize all writes, with **Followers** replicating whatever it decides.
- **Raft is a specific rulebook** for doing this: nodes are always Follower, Candidate, or Leader; a Follower that stops hearing the Leader’s **heartbeat** becomes a Candidate, campaigns for votes, and needs a **quorum** — a strict majority, `(N/2)+1` — to become the new Leader.
- **Consensus is expensive** because every write has to travel to the Leader and back, and the Leader has to hear back from a quorum before confirming success — a real, physical network-latency cost paid on every single write, not an abstract inefficiency.
- **Split Brain** — a network partition (not a crash) can leave two sides of a cluster each believing they have a legitimate leader. Raft prevents actual damage by refusing writes on whichever side lacks a quorum, explicitly choosing **safety (Consistency) over Availability** during the partition — a direct, concrete instance of the CAP theorem’s central trade-off. **Terms** (an incrementing election counter) resolve which leader’s authority wins once the partition heals — highest term always wins, and the loser reverts to Follower and re-syncs.
- **Randomized election timeouts** prevent repeated tied elections by making it statistically unlikely two nodes campaign at exactly the same moment.
- **Cluster expansion safety** relies on two mechanisms working together: the **Election Restriction** (a node with stale data can never win a vote) and the **Learner state** (new nodes silently catch up before becoming voting members) — together making it structurally impossible for an empty or stale node to accidentally become Leader and order the cluster to delete good data.
- **Where Raft actually lives:** almost never hand-written by application developers — it’s baked into infrastructure (etcd, Consul, CockroachDB) or imported as a library (Apache Ratis). It’s needed for **stateful** services (databases, key-value stores) that hold real persistent data, and essentially never for **stateless** application servers, which are trivially interchangeable and rely on a Load Balancer, not an election, to recover from a crash.
- **When to skip consensus entirely:** for data where being briefly, harmlessly wrong is an acceptable trade for speed (view counts, likes), systems use **Leaderless/Multi-Leader** designs with **Eventual Consistency** instead — every node accepts writes locally and instantly, and nodes reconcile asynchronously (“gossip”) in the background, converging on the same value after a short delay.
- **The gaps worth closing beyond this session:** Raft’s other core mechanism, **log replication** (an `AppendEntries`based replicated log, committed once it reaches a quorum — this is what “majority agreement” concretely means); naming **Paxos** and **ZAB** as the other major consensus protocols solving the same problem (ZooKeeper specifically uses ZAB, not Raft); the fault-tolerance math behind why cluster sizes are conventionally odd (`⌊(N-1)/2⌋` tolerated failures); and **Linearizability** as the formal name for the consistency guarantee Raft provides, distinct from (and often confused with) Serializability.
