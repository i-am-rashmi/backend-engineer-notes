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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466S3YFWTY7%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211321Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIH9PruzVq%2BpyKhP6CnlWFtM1%2BUNAoqA9lgDHXXRFX81fAiAJsN7l%2BWxdDL7GcmtXsMSGov%2BCHGDIprXTl6UjfUKpEiqIBAi%2B%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMCCNAVBJ3kVfMEE0sKtwDFqDxCWDe0DS1Pl6WeYYyYhavES8iqPWLxuIDqaH7vN9njtFlKKI%2BeSEzLhesYrG1hlhbRFgBepJSp8Mrr%2FHwLX%2Fq3ihlit2iIbhmx%2Bh4lC6aoLZ3C3jVV7ELZCJobfexln%2B5JNOsI1A3rJx17dilMYMk5%2FdZ%2Bc8tBQJucEbwsm3IFhebh2HW%2FzZZw1uJnT4mNy%2F%2FjG%2BCmFtckvEYq5H4WlBHm4%2FWyVskqXakoozbgXZkgPnsXn7cCGf%2FGmz%2BGz56f6naVSGZDGFoTgBspHk%2B7xciFc2zepTTv4WNkaVEEITVBCfIeLBkAixeZ%2Fhup1vvFpaNmsDAMeRca7rykqMyEKiCzx3cCpGOlpcHDY72ndwy5tzt8tCJ6Y06bOCecaMk3HUtU%2BCHnvzGJjwJLJQYbgifsRoIAl4%2BkGfbs2JxqiRJ%2FnKOxoMFYXdqJWuHU11%2Fiby4xjgVoBa2fDhOKDThQFFCwggOSNAW%2Fjsj2df9aff8UoZpENPwqQeaYkJjqP%2BLBzcuv4yxhw%2Bd4j%2FBilhAfjc4jfFrhmZadfluQmgItpFHW5pVo4MEMPYEntp2S54AxjIjrC16lfaZ3bnSqPF1yvXUupA9ZZnXZHnUIzdvZ25PQexZlbkm0DgYv4sw69e%2F1gY6pgFehZS9946%2B%2FuCMR5LOSXO7DTSyJylDhZFWrGBUpVW2Y9vd7ZukkUxtXPIkrbiG%2ByC3Qimt8L2poNNyLdlhMzGSy5ur2S%2BrbZW3IAJiZT4CRbp5IpAgnrR5CRogX5UbIjYtzVVkSfUYOjHZLF91M2f7%2Bt6K7KBRQDxytIHcjAsoirJQDgu62oyWAZ8Di%2FihoO5ZblomRkh2%2FOAqu1zKQcUkmxcTzlmi&X-Amz-Signature=2f87b8a9101cd304ecf95f17d31d0d1916a92e0da6812d1d057f32e01637201e&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46645HACEQK%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211321Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIA1MY5Suue8fnZf1ruh3Gu7VBnrKApYZ3JPhglGygJBvAiBXwWSfaFSe9PT9vvoWDwkNksLJ8RPmq2F5piABLx4vsiqIBAi9%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMuzpFYEQoffFKA4pjKtwDYyIV7%2F3SmBzdP0LKjxkmLgBOBh2Z4KtLUGf9y2MmTYqUJpADxcnZiUYCNgYwJeHXzSh3JEQjJQC5TMwoW7SqRWqCbYfvbHAuU0YN3Nk3TziPhG4n%2FN%2BzvWYZwDRKP4t6OPpEjVDrtSQIWXjOzpFSp%2B9fTZJFUrtuNtUbiqsmQjq%2BXW86HdirCY6Mj6dNwZd2Uz%2Bod9pqzQQHb%2FUDt1UjlXk44%2FJ3VglDn7C0nL8eL1jVEU0AqW8mvvGYd%2Fg8%2F2R0FNtBrVP6loV97JjlSOPb39v%2BwreA%2BwhpEdJGsz8t54fZ7JBHjKiZ2xEjxVe8ryyGIwHdGiajQCiNm3DCG9tEnDXQQNWrNnqYRwE2AJ38HrE3iCVkmY54uOhPU9sHVC2rileeMomrohp0eo3D2tAD3mTE2VO10JmhXCt9slSUI8xum8xk1TDLYUCocwkf3bGyfOgxNA8fB9NHjDsH2St2ToLG9Amjnx6rgQxMejNvEodCKmEjkMPazmE1coLuw%2BGRBsQRAsw944XN3HVf2XndgtFS9k0YjesgxWtZL6nBGlLpnsY5K5kmKeyudLs%2FFt%2FSjryryUW6TARaEkWjiLTL34VV9kULOOzQ55IKtr%2FswmEBc%2BDh68a2raTQdBgwxdW%2F1gY6pgE9e7j9UVT6R4W96mpNxB6nCV2bBkkK7%2BvRJuBLMixxbRQHY5qpx4BSaVezpVvVc49%2B7Dt3LgYn4WRJi757bOj3lkSm3%2FDNTI4U5F3H%2FfUBAl%2FrPIZ0fMZcq2qOwSl%2F97w3BzUauF9AoqvmlmApcBAdnT%2BshMZgTE18AY6efOCJ2XW0S7RTXXQndofgAgcbkCw1%2FjJa%2FZKxDcju69UpTb0gAnmu8kvB&X-Amz-Signature=b1b1e5e23cee7e8ecb52606c74e6fcbcf91d35bf45d3931b2472cd1f94a28653&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4663ACHQVCS%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211321Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIAswPqP4IcVxV5Cr4Wq0QZImKOFRsJ0vHGlCjD%2BZAdeBAiA0vvOQyorSaBPFPrn5b8YT2OYeMf7tkAtUFYQbv%2BkeriqIBAi9%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIM%2BasNl4PH%2FhLVjoXQKtwDWmKNx%2B7mEUw%2B18QbOTUKyplQSgTx40svaNEmddUyFd4qFZHEimHDzVCZAI7Px8A62GN%2BQfPqVV1w3ShFlnXJQ7l%2BMSAnsi3%2BKwI2di2NFZeGg8d%2FLJRnZN35qG5dl9SLJ2j%2B71zqJdAi%2Fc0pOCz75kU0tYCRHemio9nu70VFH6FA21ONK%2F5eVNVHcRF6pgPBU9rSMzGmIYC2dURh3w6RjtOHv5TmZf46%2Bl%2BanpC9Wa%2BqFBqCCvmeQTRp8RbwHe9Wo9Gf4s%2BARaAOrpL13t9hzGa6eVtAFVpMdgu36huWVl%2Fey%2FI6PBO94B0zQQmgd0l0cWu%2BODspx4P5qeQYqggtbom8lp18ntVuBZ0b0Hdtup91b%2B5kWuaeuAKBIixlatBtDY%2F7hxmo5xVqTya2teQ3KEc4e1VrcZoCsi4JgKD6X8xtCeCvdhMcTTBz2ZjAmuptPyhh3dcKBRDU7HK4G1uDVTOLwaqmsPml%2FlfYEH9nPOB2qePUn7DmYlJ5PDQKjYSkuqT4zb%2FwWzE2bRlUwHRKCm77DEsz5P746hdgYedfuoRqDq1FLEBL1Xp5BbviPfHimaakQRW8G5G%2FVfM4WozQbAu3bde8lo%2FMC1GVem4H50wwsXd92hBmMulZXvYw39e%2F1gY6pgF0l8oLqtw4uJapxT8Lv7iBw1B9rqELj5jMoqwTaL40llg%2Bu84uYCygOy9BgRQtifZbR3vFhEAmOxDYhEa2WF%2BSOXyvLm6V7pARjsWlQ9QQj6AtIwiY5%2FOKL6EE8muOtBRRr8D3EpRb6pafYq8ZK6qq%2FAtgGxkKkJwOAawNAZAyM7H1CZlO7XP%2BW%2F%2FYy1aB2t6gSTEl9PTQiIHsLzDTUufUyefVwKGj&X-Amz-Signature=726d29624ca3a3f56d48cb6200c7f542c9a13993f3168884b2395a8d5d3c44d3&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466T3UGUXLL%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211321Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQDINnhoMqHNQuNE3skG%2F04W9903nQ8Mz%2BCGs2pi%2BYqi%2FgIhAOIhHJ3eUQ0nlTXkeZ9Ql2Ibg6A%2Bb2bLLWhdtYLZ9PvEKogECL3%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1Igy996L1qxMNeEpZd1Yq3AMHnO3fqLnS%2F1AVLQki1JkerqYNBD%2FAICui9xNiJk75BGv8AJbUqMztP074H6OkwApazrR5XPMn96IEQRgKNpi7trS7eMHGuaHa68aj8YrF1p813o4uN%2BsvhpLx6etIy7QzjkiVe%2Fo6tMC6S1PC1XUCUOgbM%2B5PhiarhI%2BpF4NtRsjxyT%2FUaHpb%2Fb%2B6hZGn6fxbOB4nIzZ1ZBF3J4qo9z5NoBfbzTlLL383FH6PkVYqqL77vJrlfJrIipS9kY1ym6USZEjOSaw%2B0zO6zGB6Pj5cLXUMrjOYMRgsck8ZnBQWAiBF%2F9BATAvFcTL17jbx97RadizWTelHkcQ%2BQNB8obsiMTqcTa1bRRI7uj8lIYTClo43zrrkRl3zYllcwHKTDChl8jo29WCdQ1Et8Mf7zNCHaNlrbY1j9uPJBgp9IfvDa%2FE3jJMugIRdRLuK5ThGvzxfNMqjLO7oXiy4sH45ESDCn5VVoLcOR%2B%2FbcpxA8bLOzRmMwjKH6jLk%2FQCPZNt0JJb5tnZJV4KnuiwJq6OIJz%2Fgu2etaoXZDwdO3nczwOewRAUgHpbmwwqhFtaQo154kb6iAC8jjjet%2BHjNmGBoQlkBqGqs7S42Wk5W8sPzhTCCDG3Tq81tvvNVI5m3iDCN2L%2FWBjqkAWf969ZRKtj%2FcIzShfPeY2%2BD%2F%2FGoVrRXmDGscua%2Fu3rQxySLZgAo8FKv8mcNeFW17fcDCAn1NG3AxbZDUj%2FPgOw1wCIK4wyZIbe3FQnn0JjY1RmOdTqi2pJe2D5e1CjyQm43%2FwVo%2FocTVbvLdIgAsJjNO596eg5mUJoheZZOE8dOtRct1w9s%2BRdag7zwQaob0hRZVPdxIa9J6n08lwi%2FFMDVkOpF&X-Amz-Signature=c552960e687d3758fecd7083692ec33e19d58494dc0b2ea2534b6ed2572d036a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Y2NT5SAW%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211322Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCHYc9zqVkeWQi16q64%2BjmVAJUS3gtEVFSuyh6QZt%2BJDgIhAM0oSTT9CPVZCv5x5PCAYP%2F46m9kyghYaOc2GYWB7hRGKogECL7%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1Igz7V8V8c16uhY74hR8q3AOeCT4HAcaaLqlb5FcbXMJMmmE15PMiDDDWugqnAt2hTQ%2F%2FcvF2K97fV7HNG8DgNXOiJDVhIx03Mvc65EkYucIDUnbNPjvfCKHf0LhqDv5zYxyaN5Z9yx5Tv488FEC9hwts431N%2Fkyv3DKqbD2JCvqKlVovCjKkePvrGPKi3hD607YcPhOe63dD0S9mXbeFh%2FUx9FUmqY65ckgunDXiTtw9XWUhV%2BVdO8GtELAeuGVRhM60TbxGS2EixDw%2FUrAjzrc0EleqIJlMtDBroX2a0pvsnekBGGl1qPSOW0pXtUaTf%2FJwZWB7whHRJgycD27Sc3Xyol3nvi3lDhATuZdEcNadgXXoRDj9GK5LwgMByIPR8fQMwfhm58UmtPRmqdEHLCp39wVsn9w6VxVgxW%2FduttkDCSsIg1RyPbJVweAfe7jK%2F3JPTm4rtdWiiz3pUAKlJ3hBC3z4muzkeXCzENqD0aqnHkO3lKjukNigUjmjbDhpFExsD%2BH26ssHNLfFzJzj6FucEfajMvGNs%2FAK4nm3U2pq%2FZWhZZG%2FaCpuyzPkxkkz1%2FoM9P4PrzhswPAGpt0MbqjJ7k8wF1mzgqtEDIsW7mKhWwlHhXpAYxmYUMZy5Y5%2FSxdrKU9R8Ln7Ts%2FRjDX1r%2FWBjqkAb9S94oYJc69t8D%2FEKl4gwzcnf98By1V0A2SeoWUp1SRqT2JXqobeGbnv4oMlyxu9VUMiBRHXyQsUxpvf9G5nD4cNoGSzI771W1EuoMYnMKZs4Ayqi6tbuGtj93ma1%2FwixXUzhTmBx5pN6KwZ1Nl4cwn7%2F3PhYjLQfPzCeQXircuufh0eHmI7GIFSvupvoQyLhxwBaSVHhupvD8mERemxKmYF8cI&X-Amz-Signature=34145e876f4c93d9fb19ac2c00499f87098c33cfbde2e4496afa147eb35c5612&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466QPTCVIQP%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211322Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIE52UXYeVODXwO%2FKZ9t88ZjyAcmUm1lrCFBpCEEkiGrOAiAj2n2to1ZVEtC3DCkKQX2yaXRCPZy7xqXlj523ZtFzhiqIBAi9%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMkKO435Bzs7CWxVmEKtwDLabrEID1vcckiS31Xzn8FLEoyW3P2qqe609SKfusHrKaZaytsnCRn0i79sztMo1IfpxDN9V0t7fOqWKvtdHv57%2BdRz88Q%2F%2BEE0WcBEzPZSiwiHKUcFH0OpEhEPQ3DFlHadTOhfoWNcsRe13%2BqIpQhCfXHwexmTfk27ivtBeUOmIdrKrgu8heZbr5YbTRm%2BOGK7C6lh6jIWMOnt6ldcMGknKRgP8kGbvMMcDnWK%2B6SlMswd1HpgT2VR4oV5r%2FNLOXTAe%2FjHJzeP%2FFqEZ%2FE6KhSy8B2bHsfq9jtMFT5xlpZV%2BU4Ls3B%2BCNEsYPZ3ob70E4RQGqZ7AnX9%2BSOYJQxVihpRrhs3TN8DEIIMc3tOcY29Zsi%2BlK3OMbbtp9Q%2BTPq4N8yjkr1ledlyLNHuctCqCgWP5gPmIvOFxu5m2kkqblDiY6sBzb9d3F4hrSAIUz%2BSDw9z%2Fp4GpC87TTkyNlhmZNFnP6mYzZoIktk0X8rGdvxvd0hl%2BgUAZg5O3qBt4yTuc0qo6yr0WT2ASN3dZDgXaYPBvj2mu6UHGFfzSJ11P%2BIK%2FTmkB%2Fl2CP%2FrlOvQJW1oEV%2BFHNI1A5kjEF%2FhchmAcCNAVr3zYsE3aEWi4BnXs82djl6bHQWXxYRwX6wPEw3de%2F1gY6pgGbw%2BOdG309goYeyVdyzsVokN1gwmhocuzrXeKExet86xPVSbSJnnCA36ALxeM0TsNc2xfvtZYB6keS%2B%2BawrqfbZIOF1P2b41EgJQ%2BWyjKa%2FZ0OKIznMFyVY7E0F%2FQuwSo7d46OnIK57G19Ft0LLMI48sd6Xsv8cGe31ARGybd%2FRT%2FcSRWzXkpzqlLem8xipt1ifJsbCJ%2FDcn8dC85e6GNJ4Suqrxna&X-Amz-Signature=2828ce917c85e515dc6b1789a8ef00406cd85a073d99ebeb279aff7f92b600f5&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Q6EPDUDZ%2F20261014%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261014T211322Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCXtilhkncD3dPpJzBmVDL2eQi8hPbzYBK05BQPJ88ydgIhALFr7tx7VPMIHhEwDMxh4OAmBAGwx0Xwd9ZnfsRrXNFTKogECL3%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1Igy%2FJwPPhhsEkIV8CVgq3AM6LnXZEG9J0ybpgVclA2UTNrlafN%2FlAFRqGSB4b2Fc7hPYIscCAixcBGkP1dfEmyC2YY4KX66VEIct%2Fd%2F9ytyuw1X%2B5N8QMvCn%2BOOm1xCrNoQly1D2pXdAEG1wH9vWiPvP5h7n3fU3lBrTIBqXJpY%2FJSlcG5JlScgFCdLwgFk4xkiRWVw6VLZSSADUSswZIHIc8gbUx6s5LmhRGxn5L8GvP80RG4JcHivnR%2Ftj8KxbQLYJ%2BmDzsUdLgtJ5Qk%2FAuYzCVKf1aGzjHrdRGW%2B1utlo05VMs8iPkoomR0EkN4CGo%2BbyNpjWP7UxMGNv8felHwCBY14UcRVow8AFxllWRQMr7nxPxE0hEcoo%2FpXN0p1l91qA2aAIh6HP4zBpbsSlzaKhQJtE8Jr%2BRz8VAGKSoM8WGnMvrT2L13olMbxkNwcQhFtTN3rL7CobK3l0DUIsWYXmXikNtm1G24z%2BGbzbcixnYOK1FL1Wh8qOWQdb2jIIKQTTs04cR8V57VKN4WmZ%2Bv%2BKxPF7p5mbkePr9vGomYELGYbOAC2gEG2A1oqWUA%2FcFsSgxc1RpYm3IDGk%2BGehMV94BnqVp7M%2FRbYoIa7mkjh73htOAVVOa7pt8pHvoUxuzHgdfqhAV7%2BlddAWxjDc17%2FWBjqkASZ%2By66rTADz45ku07sMxVPYSW3V2DKm0fUEAiEB85m7KcilsDyDEnQA7sGEoWHvEvhSnLf7E9WLSKNM4loaip0RWyUV8rMAoUUwFKsqTPpSK6IvKZQuhDpr3XRx5Ndi1I432%2Fbc%2FfwbwRlVzsPOhevz3rfXhYkC7swiFJxB2XIzCZoTbiEDC9sZsiGyx0aenwQOBp9%2F7iwns5P%2BxmcRGbzZXdqN&X-Amz-Signature=be3ff90c70a614a56fffdae8c328df312678eb1707c21c6806fba90274765bd3&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

