---
title: "System Design : CAP Theorem, Consistency Models and Quorums "
---


## Pre-requisite Definitions for context


    To kick things off, let's start with **Scalability vs. Performance**.


    Imagine you run a small local bakery 🥐.

    - **Performance** is how fast your baker can bake a single batch of cookies for one customer.
    - **Scalability** is your ability to handle 1,000 customers ordering cookies at the exact same time without the bakery collapsing!

    In software terms:

    - A **performance problem** means the system is slow even when only **one** user is using it.
    - A **scalability problem** means the system is fast for one user, but becomes extremely slow or crashes under heavy load.

    ### Latency vs. Throughput


    Now let's look at how we measure work in a system.

    - **Latency** ⏱️: The time it takes to perform a single action or produce a single result. (Think: How long a single customer waits in line for their coffee ☕).
    - **Throughput** 🚀: The number of actions or results produced per unit of time. (Think: How many total cups of coffee the shop serves per hour ☕).

    In system design, your goal is generally to achieve **maximum throughput** while maintaining an **acceptable latency**.


    An Analogy: The Assembly Line


    Imagine a car factory:

    - **Latency**: It takes **8 hours** to build 1 car from start to finish.
    - **Throughput**: By running an assembly line with multiple stages, the factory produces **60 cars per hour**.

    Notice that the time to make _one_ car (latency) didn't necessarily get faster, but the _overall capacity_ of the factory (throughput) went way up!


    > ### 💡 ❓ Quick Check  
    >   
    > Let's test this concept:  
    >   
    > Suppose you have a database system. You modify it so that:  
    >   
    > 1. Every individual database query now takes **100 milliseconds** instead of **50 milliseconds**.  
    >   
    > 2. However, the system can now process **10,000 queries per second** instead of **2,000 queries per second**.  
    >   
    > - **Latency got worse** because a single query takes longer (100 ms instead of 50 ms).  
    >   
    > - **Throughput got better** because total volume increased (10,000 queries per second instead of 2,000 queries per second).  
    >   
    > Balancing these two trade-offs is a core responsibility when designing system architectures.


Every distributed system that replicates data (multiple copies on multiple machines) has to answer one question:

> **When a write happens on one node, and a read happens on another node a moment later —** **what is the reader guaranteed to see?**

The answer to that question is a **consistency model**. Different databases pick different answers, and the choice trades off against latency, availability, and complexity. This module builds up the vocabulary to reason about that trade-off precisely instead of vaguely.


Prerequisite mental model: assume data is **replicated** across N nodes (for durability/availability) and possibly **partitioned/sharded** (for scale). Consistency is about the replication side.


---


## 1. The CAP Theorem


### 1.1 The three letters

- **C — Consistency** (specifically _linearizability_, see §3.1): every read receives the most recent write, and all nodes appear as a single up-to-date copy.
- **A — Availability**: every request to a non-failing node receives a response (eventually, in bounded time) — it can't just hang or error out.
- **P — Partition tolerance**: the system keeps operating despite the network dropping/delaying messages between nodes.

### Clarifying the meaning of partition


    ### Partition sense #1: Data partitioning (a.k.a. sharding)


    This is **splitting your data across multiple machines** so no single machine has to hold everything.


    Example: You have 100 million users. Instead of one giant database holding all of them, you split it — users A-M go on Server 1, users N-Z go on Server 2. Each server holds a **partition** (a slice) of the data.


    This is a _deliberate design choice_ you make for scale. It has nothing to do with failures — it's just "how do I split up my data."


    ### Partition sense #2: Network partition (this is the one in CAP)


    This is **a failure** — a break in communication between nodes that are otherwise supposed to be talking to each other.


    Example: You have 3 database replicas (all holding the _same_ copy of data, for redundancy — not sharded). A network cable gets cut, or a router fails, or there's congestion. Now Node 1 can't reach Node 2 and Node 3, even though all three are still running fine individually. From Node 1's point of view, it's alone. From Node 2 and 3's point of view, Node 1 has vanished.


    **This is what CAP means by "P."** It's not a design choice — it's something that _happens to you_, unpredictably, because networks are unreliable (packet loss, switch failures, misconfigured firewalls, a cloud provider's cross-AZ link having a bad day, even just a slow/overloaded network that acts like a partition because messages arrive too late to be useful).


    ### Your actual question: are distributed systems _always_ partitioned?


    No — partitions (sense #2) are **intermittent events**, not a constant state. Most of the time, your nodes can all talk to each other fine. A partition is what happens **during** a network failure — it's temporary (though "temporary" can mean anything from milliseconds to hours).


    The reason CAP treats P as non-negotiable isn't "you're always partitioned" — it's:

    > **Over a long enough time horizon, running on real networks, partitions** _**will**_ **happen eventually — so your system needs a defined behavior for when they do.**

    You don't get to opt out of ever having a partition happen (unless you control every cable and switch perfectly forever, which nobody does). So CAP's real message is: _decide right now, in your design, what you want to happen on the rare day a partition does occur_ — do you freeze up and refuse traffic (CP), or keep serving and risk staleness (AP)?


    ### Putting them together


    Confusingly, a real system often has **both** kinds of partitioning at once:

    - Your data is **sharded** (sense #1) across, say, 10 groups of servers.
    - Each shard is also **replicated** (multiple copies of that shard's data, for durability).
    - A **network partition** (sense #2) can then happen _within_ one shard's replica group, even while the other 9 shards are perfectly healthy.

    So "partition tolerance" in CAP is really asking: _if the replicas holding one piece of your data temporarily can't talk to each other, what does your system do?_ — it's a question about handling replica communication failures, evaluated separately from however you've chosen to shard the data in the first place.


### 1.2 The actual claim


CAP is often stated as "pick 2 of 3," which is a **misleading simplification**. The precise claim is:

> **When a network partition occurs, you must choose between Consistency and Availability. You cannot have both.**

Partitions _will_ happen (cables get cut, switches fail, packets get delayed past timeout) — so P is not really optional in any real distributed system. That means the real choice is:

- **CP system**: during a partition, nodes that can't confirm they have the latest data **refuse to respond** (sacrifice availability) to avoid serving stale/wrong data.
- **AP system**: during a partition, every node **keeps responding**, even if that means different nodes give different answers temporarily (sacrifice consistency).

When there's **no partition**, you can have both C and A — CAP only bites during failure.


### 1.3 Why CAP is considered too blunt a tool today


DDIA (and most modern practitioners) criticise CAP for:

- Only describing _one_ failure mode (network partition) out of many (node crashes, slow disks, GC pauses, clock skew).
- Treating "Consistency" as one binary thing, when in reality there's a whole spectrum (Section 3).
- Not accounting for **latency** — a system can be "available" per CAP's definition but still unusably slow.

### 1.4 PACELC — the more useful extension

> **If Partitioned: choose Availability or Consistency. Else (normal operation): choose Latency or Consistency.**

This matters because even _without_ a partition, requiring strong consistency (e.g., synchronously confirming with a remote replica) adds latency. PACELC captures that every-day trade-off, not just the rare-partition one.


| System                        | During partition | Normal operation |
| ----------------------------- | ---------------- | ---------------- |
| DynamoDB, Cassandra (default) | A (Available)    | L (low Latency)  |
| MongoDB (default), HBase      | C (Consistent)   | C (Consistent)   |
| PostgreSQL (single primary)   | C (Consistent)   | C (Consistent)   |


---


## 2. The Consistency Model


### The core situation


Imagine you have the **same piece of information stored in multiple places** at once. Not one database — several copies, sitting on different machines, possibly in different cities.


Why would you do that? For safety (if one machine dies, you still have the data) and for speed (people near each copy can read it fast, without talking to a server on the other side of the world).


But now you have a problem: **when you update the information, it takes time for that update to travel to all the other copies.** During that window, some copies have the new value and some still have the old value.



Where inconsistency actually comes from


Two structural reasons replicas can disagree:

1. **Replication lag** — a write hits the leader/primary first, then is copied to followers asynchronously. A read on a follower before the copy arrives sees stale data.
2. **Concurrent writes** — two clients write to different replicas (in leaderless systems) at nearly the same time; the system must decide which one "wins" or how to merge them.

Every consistency model below is really a **promise about how much of this messiness is hidden from the application**.


### So what's a "consistency model," really?


A consistency model is just **a promise — a set of rules — about what a reader is allowed to see, given that this messiness exists.**


That's it. It's not a technology, not a protocol, not code. It's a **contract** the system makes with you, the programmer, saying: "here's what you can count on, and here's what you can't."


Ordered from **strongest guarantee / most expensive** → **weakest guarantee / cheapest**.


### Why does this matter to you as an engineer?


Because **it tells you what your code is allowed to assume.**

- If your database gives you linearizability, you can write code assuming "whatever I just saved, I (and everyone else) will see it immediately, no matter which server answers." Simple to reason about.
- If your database only gives you eventual consistency, your code **cannot** assume that — you have to write defensively: "the value I read might be stale, so let me handle that gracefully" (e.g., don't let two people both think they got the last concert ticket).

### One-sentence version

> **A consistency model is the answer to: "After I write something, what am I — and everyone else — guaranteed to see when we read it back?"** Different databases answer that question differently, and picking a database means accepting _its_ answer to that question.

### 2.1 Linearizability (a.k.a. "strong consistency," "atomic consistency")


    **The guarantee**: The system behaves as if there were only **one copy of the data**, and every operation takes effect atomically at some single point in time between when it was invoked and when it returned. Once any client sees a new value, _every_ subsequent read by _any_ client sees that value or a newer one — never an older one. 


    **Setup**: 3 replicas of the same data (R1, R2, R3), all starting at value **A**. A client writes **B**.


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466UCWZZWQC%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024833Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQDN6%2Bxr6GQsWe57mIY%2BH3zkYqpRcOT6PcTXLRi8p7xGXgIhANqtNaNCDQVpgpT5x6lnYfC5TmQJ0hxVGp%2BNK1GBloqPKogECML%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1IgwHHGPyQ2ONr%2FOfUpEq3AOJfzI4QFfzsmCAeR0ROdKOPIqktGPhSeUeQfLC6NfyUlB%2BOfMGZiUAjfGK3TUJCgnmNqXnst1Ap1OuAjJpxTjCik5K3qUfV%2FqTQC%2FXLpbTEv%2BYtIN4bNxDCJBllDOwz68Q9EiA4NMfM0QlkM7RhbGHZWNr%2FDbSToH3bgRbngMdrDzQiMhoNj0%2FQICVoHTOlyCabSr7Sc19paG8Mrge%2Fh6m5o%2BkmVIYXUjFypGsQ0d%2FV2kdFhH0VsT1CbI%2BuCj8bdhocaCnSkJV5GdOxy2%2FGNpw%2FNam6RH436DthHvHC66KmAhapGQwbw3pBUSqS4c1wwvumZJbC%2Bd5yXptJJiFSBxxK9gIqLRRghSgDFcuOXdAFWWb68NDikCqR8Q%2FEsVh569NVIO3D%2BZu%2F5IQqo1dUR%2B89qpg%2B74fAZ%2BDWIPd2M9ufbCs2aWnlohGCpUud9q8EhypSMSZ1mzVvdb4%2BK22Ts%2FDOiP4iJNFaHkjk36mkKaB3htXIzjGq%2F74hNzFT7Jux6gug185qLzF93CGDVPCVgGHditD2S92IUqIPUmBQV99Cit%2BccliJW1nw7kG%2FBI7L6MUh%2Flr5ii2lEImqtmWiUzbhkPEcIXvskTb4yCeTXZ7EIaUqtFbJzceYOljPTCv28DWBjqkAaKGjs9lrv6LqxoQ782aX2HokqOnxaTP351dXnNrH4unDNZ%2F3lN64GVbrymFhGZ%2BIwjtck0w2Y1foVAS5pz5a1v7qOUlQRGOk1MwYLzqr4dQMOrOadVaPh%2FH2CtpI%2FoAFsPYY8KUGme3R4ZauWQoH7c1x4Oj9LOyeQumSWVOeohrKtMDl41PMtQi2tGXTdaml%2Fydu%2FAHm1bh%2FFFEzJe8ZLQUhaNq&X-Amz-Signature=f1916f0e844ad5eb1fd11d3bd99f45d3a6709395c11f4f0650c295a885b96662&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46637APBYGR%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024834Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICz197zY3oHSuhZJVYIeI32YW2%2BZTz5lal97Ubl6IswAAiAXzukEzgDUTTG4x5%2F7Tg%2BUdKLcrMdEIBhQ5x%2B60tDtNCqIBAjC%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMF%2FB%2F6tvyaPIVso9PKtwDAyv4m1pFbOwrJg%2BwueJnuU96QO%2ByRB4%2F%2FXMBx%2BYZLahhJlmXrB4F2wPhiRWNwW6C8TCPdurnHEcFoKhUbkihHBGpEmzfaeCpIPlemBxG4fO5yMxaYCObVX0%2F8CpkudaWmRfDKZzhyqROKqyt%2BWxCJbfA55okN4AWgTQlUqLq34NE8fDdtdAxvvf65gAiu2EVbK8n8BPwkEnnUjypblCuoBJQVUejRGObJPMuY440HSu%2FyyZcwdRNYGiQLG4c2ydqhj%2FsMMyWXAEZvHZGd3aKuz1qNJuOBuWikS2PASI4Bcj0nV4Xa%2BtNhcABuIfU6v0DxATRyPG%2Bwph7%2BGymBuyRAX1p26RDWY%2BNmJ0BB8U%2FU32FipXSfNCNgacl8jrNG5Zd%2BDyPwVuiTUORbv5W3nUr2zi15bi0RYZPAH05xtDm%2BLld9jN5WI0C8u94lrU7Wb0s4NUj3GSU2S4DHxPhZGKwvB859uAxsFYpPTcnlClEbWmaybe8d5FzVDXYQtaRk0%2FRyoR2EYy1jPchrGuyTs91EbXKEDLjCWi%2B3JoogaT93AJPMy9X4I6wH3rE8rhblVIEtFPF1E1yUf62a0pufRBmi2x47nxCLTG%2B3CuycOtTekjyiy3YLJ1IvIWH9c4w7tvA1gY6pgGJhxvEGQh2LiVpB5wa5OTk5kr80Mz%2BL4pqo8qNdygSJt1bl%2BfnGHPh5LJF9%2BB29BXu7pNlH66DFkQ4IRGy6%2BhKSHklg2%2FG1UIUnvjaukIWWV3azDX9dti3PKjeLSPO5ncmGs1T%2FKXdsX47dPkh8iDUObLtP%2BTdFpFXdaoLT4Hhpl%2BFJR%2F5T8BVLNDfb09QbvSiS5uNB5nSICfyER%2BiTk65d%2BqZhTGi&X-Amz-Signature=0588d96d67df9a5cea37eac5e46dc236e70948436e1f4f4c6bea996da1a608fc&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    Real world example : Group chat :


    > ☝🏻 You and your friend Priya are both texting into the same group chat. Here's the thing about group chats: **everyone in the chat sees the messages in the same order, top to bottom.** Not different order for different people — same order for everyone.  
    > That's basically the whole idea. That's it.  
    >   
    > ### Now here's the twist  
    >   
    > Sequential consistency says: the order the messages appear in the chat **doesn't have to match the exact real-world millisecond each message was actually typed**.  
    >   
    > Weird, right? Let's make it concrete:  
    >   
    > - In real life: you type "hey" at 3:00:00.001pm. Priya types "yo" at 3:00:00.002pm (one millisecond _after_ you, genuinely).  
    >   
    > - The group chat is allowed to show: **Priya's "yo" first, then your "hey"** — even though in real life you typed first.  
    >   
    > Why is that allowed? Because **nobody can tell the difference anyway** — a millisecond doesn't matter to a human, and as long as _everybody_ sees the same final order (Priya's message on top, yours below), nobody's confused, nobody's plans break. The chat just picked _a_ valid order, not necessarily the exact-real-time one.  
    >   
    > ### The one rule that never breaks  
    >   
    > Now — one thing the chat can **never** do: mess up the order of **your own** messages relative to each other.  
    >   
    > Say you personally type "hey" and then, two seconds later, "you free tonight?" In that order, from your own phone.  
    >   
    > The chat is **never** allowed to show "you free tonight?" before "hey" — not to you, not to anyone. Your own two messages have to stay in the order you sent them.  
    >   
    > But it's totally fine if Priya's messages get shuffled in between yours in some order that doesn't perfectly match the real clock — as long as everyone sees the same shuffle.  
    >   
    > ### So, two rules, that's genuinely all it is:  
    >   
    > 1. **Everyone sees the same one story** of what order things happened in. (No two people disagree.)  
    >   
    > 2. **Your own actions can never come out scrambled relative to each other** — you always see your own stuff in the order you actually did it.  
    >   
    > What it does **not** require: that the "story" everyone agrees on has to be the literal, true, to-the-millisecond real-world order. It just has to be _one consistent_ order, and your own actions have to be internally in order.


    **How it differs from linearizability**: Linearizability additionally requires that the shared order **respects real-time** — if operation A completed (in real time) before operation B started, A must appear before B. Sequential consistency drops that real-time constraint; it only needs _one_ agreed-upon order, not necessarily the "true" chronological one.


    **Why it's useful**: It's weaker (cheaper) than linearizability but still strong enough that programmers can reason about a single global sequence of events — useful in some in-memory/multiprocessor systems. It's less commonly the headline feature in distributed databases (most either go full linearizable or drop to causal/eventual), but it's an important rung on the ladder conceptually.


### 2.3 Causal Consistency


    **The guarantee**: Operations that are **causally related** (one happened-because-of or happened-after the other, e.g., a reply to a comment) are seen by everyone in the same order. Operations that are **causally independent** (unrelated) can be seen in different orders by different clients — that's allowed.


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466T3JHT6CV%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024835Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIGhcX5jfWuhW2PHoloZs7ZRcidGp9jGz85IJ5cI0E%2F7yAiEAgGhr1H1JfT%2Fdfpy8lSQLmEL0yuhdqmWdqvtiroxEGWUqiAQIwv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDAvBqG%2FQ2RumWkNLTSrcA7ORtzQ7EmejeuzStR3p%2BoWk2%2BOgy045RJhMssZ7pRQEeAtWQwMvVUcza3OJvG7bwvZtZ%2BWvppIBtFgoNjSbdhz%2FYAVGn1fa%2FdyAVzUDs9FKRyBSbpvsQx7RPS2gpmnkAvzrtZBu48AeHr0MxpfLa5hI%2FSReDchk4zddXQHSNR9bqlZDdEQjcqlO%2B1jFsC79qHB%2F8YmBsrT2rMSI0bQN%2B6bF8Iqtwn2lwJlTxbo257M9fEqwZcG6veG%2FXCbscuqTR%2FDL0MRJH%2Bvq%2BQVz%2F2EABh9kmEjYiHWQV%2F8mY5I9p0NAFhjCkFngSjSIQYN1HjcO97Jzzywd1bTcVr%2FAo4lSJ42xrmzLG720%2BYeiMqFweVT8LQNkJ9Xa8XkmJbEl%2Fi37OrE%2F0%2BzrRnFR%2FrlgBrBr1IsmHNvVaRVLd7uYlNVUaz%2BbTz5IgvCIhEgomPYRUZJwXSxYyY0PD8ef4wHeMxi9X9R%2FvdRn3pc6AL34gaU%2Fdt5IElkTQPXCJeMCVHoZb3G%2BHIK5LStldGmIqtwblFmYgSgSipmfJjZuWl8EI7sAQkIqzvvi2czf9qDp3nd6mfMM%2FXyIM8ULfqEzY2j5%2F8laUehbu%2BjIziTPi2NMnDPs%2FUA6a%2F9g5ovSpt%2Ftg0%2FoMI7awNYGOqUBo8P24h4z%2B3QiV%2B7lmp9Rrhm7ILBUtgvp0DTbBw%2B92UUNiwYAPlTTjo5ixHVcDpEUues0Dg1F8VvD0Mia6FmxQ76ZHr2bXf4CFx5y%2B4%2FW08xL1e6wdTa%2FMPKOIbFVaZZ8WmazDHgsYGIHrIUucUh%2BxoDDxaBH%2Bdo7qIQol357sbJPsQ96%2Fq4h1lk2mXFgzCj3dZ63PR%2FRZAJJ5RswDVQGra7KKjLw&X-Amz-Signature=17429f3200b6b3a8129850e5da7758bf06a812ee9359ad4e3dfb1f2707a4534b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    > ### ☝🏻 The group chat, but now with replies  
    >   
    > Imagine the group chat, but now people can **reply to specific messages** — like a thread. Someone asks "what's for lunch?" and someone else replies "pizza!" right under it.  
    >   
    > Here's the obvious thing about replies: **you can't see the reply "pizza!" before you've seen the question it's replying to.** That would be nonsense — a reply floating around with no question above it, or worse, appearing before the question. Nobody would understand it.  
    >   
    > That "reply must come after its question" rule — that's **cause and effect**. The question _caused_ the reply to exist. Causal consistency's entire rule is just:  
    >   
    > > **Things that are cause-and-effect related must appear in that order for everyone. Things that are NOT related to each other — no rule at all. Total free-for-all.**  
    >   
    > ### Now here's the difference from sequential consistency  
    >   
    > Remember sequential consistency's rule: **everyone must see the exact same one big order for absolutely everything** — even totally unrelated messages.  
    >   
    > Causal consistency is way more relaxed. It says: **I only care about ordering things that are actually connected. Unrelated stuff? I genuinely don't care what order different people see it in.**  
    >   
    > ### Concrete example, side by side  
    >   
    > Say in the group chat:  
    >   
    > - You ask: "what's for lunch?"  
    >   
    > - Priya replies: "pizza!"  
    >   
    > - At the same random moment, some other person, totally unconnected, posts: "just adopted a cat 🐱"  
    >   
    > **Under sequential consistency**: everyone in the chat must see these three messages in the _exact same single order_ — say, question → cat → pizza. Every single person's chat has to show that exact same sequence, no variation allowed, even though the cat post has nothing to do with lunch.  
    >   
    > **Under causal consistency**: the only rule is question-before-pizza (because pizza is a reply to the question — that's a real cause-effect link). The cat post is unrelated to both, so:  
    >   
    > - Your phone might show: question → cat → pizza  
    >   
    > - Priya's phone might show: question → pizza → cat  
    >   
    > **And that's fine.** Nobody's confused, because the cat post was never connected to the lunch conversation in the first place. It just doesn't matter where it lands relative to that conversation.


    The one-line difference

    - **Sequential consistency**: "Everyone must agree on one single order for _everything_, related or not."
    - **Causal consistency**: "Everyone must agree on the order _only_ for things that are actually connected. Unrelated stuff can land wherever, differently for different people — nobody cares."

    Causal consistency is basically sequential consistency's more laid-back cousin: it does the minimum ordering work actually needed to keep things making sense, and doesn't bother enforcing agreement on stuff that was never going to confuse anyone anyway.


    Real systems that implement causal consistency

    - **WhatsApp / Signal / any chat app's message ordering** — replies must appear after the message they're replying to, but two unrelated conversations (or two unrelated messages in a group) don't need a strict global order. This is almost exactly the group-chat example we just walked through.
    - **Facebook/Instagram comment threads** — a comment must show up after the post it's commenting on, and a reply-to-a-comment must show up after that comment. But comments on completely different posts have zero ordering requirement between them.
    - **Google Docs / collaborative editing** — if you type a sentence, then someone else edits _that_ sentence, their edit has to be applied after your typing, not before (otherwise they'd be editing something that doesn't exist yet from their view). But their edit on a totally different paragraph has no ordering dependency on yours.
    - **COPS** (Clusters of Order-Preserving Servers) — an actual research system built specifically to demonstrate causal consistency at scale for web applications, showing you can get much better latency/availability than a fully linearizable system while still avoiding the "reply before the question" nonsense.
    - **MongoDB's causal consistency sessions** — MongoDB explicitly offers a "causally consistent session" mode: within one client session, your reads are guaranteed to reflect your own prior writes and reads in causal order, even in a replicated, eventually-consistent-by-default cluster.
    - **Git** — sort of a fun one to think about: commit history preserves causal order (a commit's parent must exist before it), but two unrelated branches don't need any agreed global order between their commits until they merge.

    ### Why teams actually pick it (the real trade-off)


    Engineers reach for causal consistency specifically when:

    1. **Full linearizability is too slow/expensive** — coordinating every single operation globally kills latency, especially across data centers continents apart.
    2. **But pure eventual consistency would confuse users** — if replies could show up before questions, or edits could apply out of order, the _user experience_ breaks, even if the data eventually "converges."

    So causal consistency is the answer to: **"I don't need perfect global ordering, but I do need things to make logical sense to a human reading them."** Comments, chat, collaborative docs, social feeds — anywhere a person is going to be confused by seeing effect-before-cause, but wouldn't notice or care about strict ordering between unrelated items — that's the sweet spot for causal consistency.


    > ☝🏻 Why Casual Consistency is picked over Sequential consistency ?   
    >   
    > because on paper sequential sounds "safer" (stricter ordering), so why not just always use the stronger one? A few concrete reasons:  
    >   
    > ### 1. Enforcing a _total_ order costs coordination — even for stuff nobody cares about  
    >   
    > Sequential consistency requires **every single operation, related or not**, to slot into one agreed global sequence that everyone sees identically. That means the system has to coordinate on ordering _your unrelated cat photo post_ against _someone else's totally separate grocery list edit_ — even though literally nobody will ever notice or care what order those two land in.  
    >   
    > That coordination isn't free. Every operation now has to check in with some central point of agreement (or run a consensus protocol) to get its place in the one true sequence — even when there was no real dependency forcing that coordination. You're paying a synchronization tax for ordering guarantees that provide zero user-facing benefit.  
    >   
    > Causal consistency only pays that tax **where it's actually needed** — for things that are genuinely related. Unrelated operations skip the coordination entirely, which is dramatically cheaper at scale.  
    >   
    > ### 2. Availability during partitions  
    >   
    > This connects straight back to CAP/PACELC. Recall: **causal consistency is the strongest model that can still stay available during a network partition.** Sequential consistency generally can't make that claim — because to guarantee one global order for _everything_, nodes typically need to coordinate in ways that break down when the network splits. Causal consistency only needs to track and preserve dependency chains (usually via version vectors), which is something replicas can keep doing even while partially cut off from each other.  
    >   
    > So: pick sequential → you often lose availability guarantees during a partition. Pick causal → you can usually keep serving traffic even when parts of the network are unreachable.  
    >   
    > ### 3. It solves a problem users don't actually have  
    >   
    > Users get confused by "effect before cause" (a reply showing up before its question). Users do **not** get confused by "unrelated thing A happened to render before unrelated thing B on my screen vs. yours." There's no real user-facing benefit to strict total ordering of unrelated events — so systems that pay for it are spending latency and availability on a guarantee nobody will ever notice.  
    >   
    > ### The blunt summary  
    >   
    > > Sequential consistency gives you a stronger guarantee than almost any real application actually needs, at a cost (latency, coordination, reduced availability) that almost no application wants to pay. Causal consistency gives you exactly the guarantee humans actually care about — things that are connected stay in order — for a fraction of the cost.  
    >   
    > This is why, in practice, sequential consistency mostly shows up in more academic/theoretical discussions or specialized in-memory/multiprocessor systems, while real-world distributed databases and applications cluster around either the two extremes (linearizable when correctness is non-negotiable, e.g. bank balances) or causal/eventual (when "makes sense to a human" is enough, e.g. social media, chat, collaborative docs).


2.4 Eventual Consistency


    **The guarantee**: If no new writes are made, **eventually** all replicas will converge to the same value. That's it — no promise about _when_, and no promise about what you'll see _in the meantime_ (you could read stale data, or even see writes out of order).


    **Mental model**: Gossip. Information spreads through the system like a rumor — everyone eventually hears the same final version, but at any given moment, different people might have heard different partial/older versions.


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZRK6JIYH%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024836Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCsm%2BYRm11micUh7WS1h2ckjfKCaCcR0DdO8vGrr6unpAIhANSKa8k%2FW9jmMa0NalQcHv%2FbPrCEo4MBviagqm7eHGETKogECML%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1IgwtaAd%2BX%2F06XWRo4koq3AOG8q9c6k2WbkAAZ64crTxIuQIb2iUbQ4Z7qvX6IDKCekyvY7saKwgoNrYUXOFrLJIAmFgkwTavsFb4YI9uDlIQGUWp%2BRQhcoj9%2BVzHlOkg9KP0t6a4XO5G7cgLUE8s9zgY70XRhWAExi98%2BaqNYEci9MV2gxRgNHtyuGHdu0CWCySIktGIXC2wkfhmqqLCbTs04V5XjG%2FNQONLrGVdxxkt0clgCaBxvJSyWvBGHKZPPKRp%2Bd9CuSBw0aEZSh%2FYU0AXAniPaXhg%2Fes4ctO2snOZ53OnrWCcmv6G83pcP56OpJzlJz56wRtaM2SscPs6ZwEjivdv1qiBE5cZXcxszfq3c3RpFdskbuBNO4%2BqY%2F1nz%2Fdntz06o1DJIPovx1Es8sBjfg25D1Q7l%2Fb33It%2Bcdwe4hQfvwrggUREDoTbFz1Gmm%2FZHZwsgaAMk9G3c2H3lefqe%2FcvwnDnpNoA5916ZbfBNUVkPFT8kOl7WPaO6oUZL7aTugGJen83SHiNHuG8RBUSCXVXk0iLL15IQyghGx7uUoWxCkQDIGCn6uD7elqNrQxcsey7tQmrvcveKteNhrFPgv%2Fz9Kv7lyHSHGH0RxRLoHTqZFmmokMrXQWQYcwfwl1Nb1U2VYj3LVm9RDCm28DWBjqkAV2C9TAdphKLSpnOtsLeAeZMkwQBb09vZmAyqD%2B9R5BHcEO6hAV2ZN%2FLUO%2B8WrqA%2BPR0yazRvCgnzoKfh1iovYTosMUDNlGgVS7JRJM7e59oHNh0C1srnFd3dETP7stHC1JwL6gWkMYCJHDfBio%2FOpQaqwRc78Zl4lmFdeQ3H%2FTbiYShr%2FGmM8HohFdnXN4aqpfjyzFDH5JorrgPFBFzBpCZfVfL&X-Amz-Signature=ba6b83fc78acffd810a13baf911f5fb038c420838a0e05557fd5248b3b8c060d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466743OZA5E%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024836Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIAKe3gm6SZC2T5gXeTXtF%2BS1Jy6UNyW%2BOc%2Fluou3fIMSAiEA7qt%2FUlokcCBclHVlAXZO8gUW3nan%2BWaVMT7M%2FcPQJiQqiAQIwv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDLu3TLiPsKuaX7pibCrcAzvB9IuMKbeBofoUys8CnMY7itp6n93qVuMbRx14NSmta2jIxuZuxo1JCOabMRj6jxJc6AQNjbf5AY%2FrKWrhQHLuWc1%2FLNlU%2Bhobttn%2BU6nX%2FhtD6GPJ0jzaeF7G4BD0Re%2B3ndKSKlZhMZJx1q%2BAXVHmgztEubqN06qHK0dlcIbgC6%2BBZsnlCvbVWEBdOnXVanQJb3b4dD2h2LH4ugIIwBCZJBVvtoZwzKJ3of9xDa8kzZnlR6PibpA%2BZUs1GJ%2BIVvfp7yoow6ZKWT4K9VV5dSRc4TSq%2FkKfGH07JHUKTfdd4JdFuRhHSCUuK1fhNuLH50UuE4q3aI%2FjMXslHyCAwpXnV1DK7%2FPnSDSgevKprncKztYC6IdE2SkeD0SRD5huBHi6iSN4Cer3c5hA2NQtLt6x3ETspEOvOe%2BnUzIjGdtFN0tA%2BsKPSi6tz6Dd7Oe1nzJJlZFMZ0S9y%2BbzhxdNFPRmhH14Za148SRN0d2DkwSPEwDe94%2Bjt%2BjikLRY6KFm4ZZU%2FXsMWiDwmcmw3DCD3nhDfHfu3hJi6ns4VeZCQXzZODeX%2BnzDqQ%2FvelTZ7168nrtpEZ0HML1rCOgj1xasHBnrBsB%2ByyjRDfMvbN8ypLSEfeZoYZ9zspoQHnr%2FMKHbwNYGOqUBFkLCtjndH6KOWsHwYTguso1bMwK30HQtKvODRDip%2Fa8RwW1hYfjbRs5aAVy1Gvr55w0IrBYS9ypRiIym5YTw8dRbk%2F3gQj8TIQ8oodyGPDRNVNF91u4ag7HafbSGPQbW%2BAOWqYSUgyoDZd8vN%2Bv1A%2FYdruNwmCSQbdr7g7zam84ehPP7f4D4xLMWmurOpPryeXO26QTCw20npeQ1JNA2DBgrVO7o&X-Amz-Signature=8be83bb8dc59b3d988b54dfaae76ac0a957c07083bd01c018be1f9c547d689f8&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


### 2.5 The spectrum at a glance


    | Model        | Global real-time order? | Same order for all clients? | Preserves causality? | Availability under partition | Typical cost                               |
    | ------------ | ----------------------- | --------------------------- | -------------------- | ---------------------------- | ------------------------------------------ |
    | Linearizable | ✅                       | ✅                           | ✅                    | ❌ (CP)                       | Highest latency, consensus/leader required |
    | Sequential   | ❌                       | ✅                           | ✅                    | Usually ❌                    | High                                       |
    | Causal       | ❌                       | ❌ (only for related ops)    | ✅                    | ✅ (AP-capable)               | Medium                                     |
    | Eventual     | ❌                       | ❌                           | ❌                    | ✅ (AP)                       | Lowest latency                             |


---


## **3. Quorum Reads and Writes**


This is the concrete mechanism many leaderless (Dynamo-style) systems use to _tune_ where they sit on the consistency spectrum, rather than picking one extreme.


So basically in leaderless systems, all system fixes their data by either:

1. Read repair
2. Anti- entropy

Refer the page on replication : 


Quorum Writes and reads are a way somebody can write to a leaderless schema and somebody else will be able to instantly read those writes. instead of having ot rely on read repair or anti entropy to propagate those updates. 


### 4.1 The setup

- **N** = total number of replicas holding a copy of the data.
- **W** = number of replicas that must acknowledge a **write** before it's considered successful.
- **R** = number of replicas a **read** must query (and reconcile answers from) before returning a result.

### 4.2 The quorum condition


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46654JKXL77%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024837Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIDhVA1mq7%2FxjFV8FoqPahqreOZzvMU3hBc50IQ963V%2BlAiB7NzkE%2Bnqu%2FgjNgu7DeUGTVePKk%2B%2F2o0Wpr3BJKyzHGyqIBAjC%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIM8QVuKCLtJLmui8fjKtwDOz1ep0NyXMyf2r8Lfp7e5zAP3oMNOlB9a0zEm4AnYVUhLdB3ILstm5CMWsiGuXn9D49DWr7OxX%2FjyWwlzoMZXnr9BJRni%2FH%2Bhu9pSiubuwm30TJ5J5GGniy8M5ccXxsfXk39rfueghEy4MzRNQHorgn8sm%2FHizJZiuGLFVic9%2FlwU34J%2BOFFt%2ByMnA50b1C3Ddmd4PyKen%2FQ2o4PcscRkhfZH87SBljgzawf%2FUzTcT9%2FyZ9txFoCcydgDo1u4NIRfoUOjCuy9idZhO5Y6qdWHMSdH6OTCPGgg40tvvUESnWaJoE3faeLEsYJFWMnXJoMo%2FG9dHvSy%2F%2FXivP%2FtiUKidnz27F%2F7B7VVSKen19tWwlas6KsGxzb%2Bsa3otpWbuoOttJX9pw8%2Fu6G8Hhh%2FH1o0HBBQrar9IsznIIfYxtH0KdGjXw2I8qfV2dIR8VOUNDSKxwAjh5j8yD2Ju1FqVEBNEl8QvEyofRi6zZkH1cbBVDpWNcahnD%2BAACXxHgc7Ki1Ebx20CVK8ZtIYfquDnYmbJd86NxFpBVUvPVxv1ZVQ8wQLCOd%2B0gMEwwyHu0nCHLVSVQ%2BOXFBGX7p1vRDyoMNrVWokjbPvjHbfbtpFJvW4JWg8u03vsH4Rzyk60IwgNrA1gY6pgHZ6DP53LX2PMgM159eu%2FuxpA%2BY7Q4I8tuB3TN3GPWSsa5RfbfRxGeyS5u0W%2FuXKQdJ%2F3glZjw9F%2BkVOF2JCUhHwl%2BLkPDh0T4x40TCEmass05d7pip%2Fjkm2d9%2F%2FXCsQitC04u%2F45UvQjb%2FJytFEThvjuk1gBP1h5RJn8rmhjGUKKaXK5vx67cs8EKlWtIukIMHSAVbLbItnYbYLUc3ESiA8CeU0G01&X-Amz-Signature=dedcfa7a2cdf277d5f72538db2b110c7009fb9747c0b3b504be5d0574b695bb4&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4663WUBKG5Q%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024837Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIAnnV3o2wY1pexp1qi6XtEGSIExKFuJnD7WEC3Lq50FcAiEAje3ojB2oBJcZHXEzzIx5AlpBGdKCbHIoN98xpDK%2FLLoqiAQIwv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDOcVqAIGHguV2zG2LSrcA6uORQwEAmtB5qq9%2BiQD21rA2Fc3mzgVf77EIzhUYHKqblzJiOJsquBnz85dvTlGxgXbIKCfobp9%2FSA8PrVSmKSu2TzLw5RYD0B6k7a6BgnOq%2BhuMnJh%2BDHAHLMkdOIkNiKzjj%2BluDRFRGMQbewE2bTRVSF84P%2BEGUY%2FNyKJkbD6KlOnyqnfnlme10Pmvz3P0xEzAFzx0WnNzY7Tq%2F3pQZ3zvM%2F%2BPXffNLKMX%2FGOLtN1vyHN0Xc0o6fEmMGw05P2jQhwdgw%2BPoSwmS10oTk2627kJmKdg5AIA%2FkClleTDclY0HtMjR3wfOz%2Fhb0qWZhj5%2FF3PZ%2FRCA3v2UsZ5nBF0woDCy%2BD2utAPRTIGkV1pHCho7xgOcUz9PXdSXHydCNt40dU1Igr8z0xqLMSkrhvt7eI38HpvC77TZ%2FP29YRPfxpKI8HYOybxkrw6HoAFWv2OAs8HiWncNiNKxgaWgPPw4tF2MU4mmYriPwNVGVP6xQpUgQ1YZhgMDeHCw%2BtFc9yVU7uL2ZY42eo7HYhdgxSJWK0VoVtM3L2ElsNUp%2FIlr1fAnAe8KNoP8R%2FZ9ekUdijX09X%2BwP%2BzCy7gw%2FP2H1jzerZbOsFEmgEfOamUN1su0sidR00%2B4%2FKOZi47pkrMITawNYGOqUBBJ8Goy3W%2FnuVgOki8ZBhrf%2B1R5u%2FXfLBxPHv71gnQRwar%2Fpg1mvbZo11aojBmPn1MB1JPF5gdDm1wxIpzuJs5ga%2BC0pjBq73VBXoYrK3TnK4%2FmrCzqtZeRijoO2fP%2BCTCCIO5eBqA9ZN4evBpoV9ViIiH5RN9QYqIBs%2FygefF0u7gs414JyU7tvcha6Dy4WjdUh6nB%2FcdeVCdg2QXp9mUe97Vv7A&X-Amz-Signature=1b6657e2f0a8bf703cd522e4f4643041307ebadc5de16b260574a472e2bcbd9a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

> **If W + R > N, every read is guaranteed to overlap with at least one replica that has the most recent write.**

Why: any set of W nodes (that got the write) and any set of R nodes (queried on read) — if their sizes sum to more than N — must share at least one common node (pigeonhole principle). That common node has the latest write, so the read will "see" it (possibly among some stale responses, which the client reconciles by version/timestamp).


### 4.3 Common configurations (N=3 example)


| W | R | W+R vs N | Behavior                                                                                        |
| - | - | -------- | ----------------------------------------------------------------------------------------------- |
| 3 | 1 | 4 > 3 ✅  | Writes slow (must reach all 3), reads fast, strong-ish guarantee                                |
| 1 | 3 | 4 > 3 ✅  | Writes fast, reads slow, strong-ish guarantee                                                   |
| 2 | 2 | 4 > 3 ✅  | Balanced — the classic "quorum" (majority) setup                                                |
| 1 | 1 | 2 ≤ 3 ❌  | Fast both ways, but **no overlap guarantee** — pure eventual consistency, can read stale data

 |


### First, remind yourself what the quorum math _actually_ promises


W+R > N guarantees: **at least one node in your read-set also received the write.** That's it. It's a mathematical overlap guarantee — nothing more.


What it does _not_ automatically guarantee: that you can tell _which_ of the answers you got back is the right one, or that the "right one" is unambiguous in the first place. That's where the 4 holes come in.


### Hole 1: Concurrent writes — there's no "latest" to find


Imagine two people update the same shopping cart **at the exact same time**, hitting different replicas (no leader coordinating them). Replica 1 gets "add banana." Replica 2 gets "add milk." Neither write knew about the other.


Now you do a quorum read. You're guaranteed to hit at least one node with each of these writes — but there's no way to say one is "more recent" than the other. They weren't sequential. They were simultaneous. The quorum overlap guarantee tells you "you'll see the data," it does **not** tell you "the data will make obvious sense" — you might now have to merge "banana" and "milk" together, or pick one and lose the other.


### Hole 2: Sloppy quorums — the overlap guarantee quietly breaks


This one's sneaky. Sloppy quorum is a trick some systems use for **availability**: if the "correct" home nodes for a piece of data are temporarily unreachable, the system writes to _whatever nodes are reachable_ instead, and plans to shuffle the data back later.


Problem: the whole W+R > N math assumed writes and reads both hit the same designated set of N nodes. If a write got redirected to a _substitute_ node during an outage, and your read still queries the original designated nodes — **you might miss it entirely**, even though W+R > N was technically satisfied on paper. The guarantee was built on an assumption (writes go to the "real" home nodes) that sloppy quorums intentionally violate for the sake of staying available.


### Hole 3: Clock issues — the tiebreaker itself can be wrong


When two versions of the data disagree, many systems (Cassandra, DynamoDB-style, etc.) fall back to **"last write wins" using timestamps** to decide which version survives. But those timestamps come from each individual machine's own clock.


If Machine A's clock is running 3 seconds fast, its write might get stamped as "later" even though it actually happened _before_ Machine B's write in real time. So the system confidently picks the "wrong" winner and silently throws away the other write — not because of a math failure, but because the tiebreaker (the clock) itself lied.


### Hole 4: Read repair hasn't happened yet — you can still get burned mid-transition


Read repair is the background process where the system notices "oh, this replica is behind" and quietly patches it up. But that patching takes a moment. If you read _during_ that gap — right after the quorum contacted the up-to-date replica, but before the stale replica has been corrected — you can get inconsistent behavior on your _next_ read too, because the system's internal bookkeeping hasn't fully settled yet.


### The one-line takeaway for all 4

> **W+R > N is a guarantee about** _**contacting**_ **the right data — it says nothing about the tricky business of** _**disambiguating**_ **it once you have it (concurrent writes), nothing about systems that bend the rules for availability (sloppy quorums), nothing about the tools used to break ties (clocks), and nothing about** _**when**_ **the cleanup actually finishes (read repair timing).**

This is exactly why DDIA is careful to say quorums give you a **tunable probability of freshness**, not a hard linearizability guarantee — real linearizability requires extra machinery on top of quorums (consensus protocols, vector clocks, careful conflict resolution) to close these specific gaps.

