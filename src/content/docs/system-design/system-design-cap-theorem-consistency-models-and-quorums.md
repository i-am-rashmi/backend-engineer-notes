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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664U4N4LHK%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121600Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCaiSXtj3tENkw0YyntSQzQCFDIm%2BQpdC8ShZIwqbDxiwIhANyDDGs09FvP4NPWxYubmWNWWmBky%2FtmVlnisLCsdJucKv8DCHsQABoMNjM3NDIzMTgzODA1Igz7Xr7OvXMqt5MP3YMq3APHaLL1p8Ez1oCUQgWUR5rcbu%2Fx%2BK%2FYDrajXXB13ef4z28th%2FYNU2IXeYwBn%2FM9xByAuIL8L5DZwAdQ9MFOJaoL8Onwc4CK1xOWCH3cRVKzFXIOvoNtGYUzvlsTZLYR6L4Jax2hiLR26nqhOTWndQKWIgpt127MtKjP5Cd%2BYiGqaZ%2Bn4dr55vEfbKdrNCX%2FGRtHTTc7%2FIPbI0fTfeLGQrC9%2FIm1OTK0FxCweFnz%2FmpxQxoRMZ7ocoZujmJUyMXcUXkHwTgrvP48iX3iX9h5Xzt5v%2F5teCvnidrZQMNMFRbfhZc8xgXBbqJSd%2B%2BVrPzScu9VzyX62Zt%2BjMifO%2B8gPFmLSS5fn77Lwv7WXirAExO5D5iXPQFsU1j51jD41GiDuu9BgfODwXGpPicK5A81CsXS4DFhD9iZ%2BXefd1v1wJ8HPCoDVQ7docTfokbGBhvoAO%2FxpvkjoD5HzZvzIM23b5jCycU%2FWlTXMEzcf4uU3AfeYEyq98kgY4lpQuvAljVtDOXwdxs%2Bse4j5gptNPrpzkNQKlrH%2BtS8R2D2OLorJiu8QzQKxhLbwQ3I6GVbtvh3qqe4TiVqS%2F74ZYEh5wn7IId6yQlMowv3fvFZps7H7CkddNT9zEzsugWvO2JVNjDj6fjVBjqkAZ1u2v8R8zIkVhSEO%2BRiJhIHvRtjBj5KjLPzs1jYbsqI4d%2BN2h3ULvjbaF32C1OMivskvm73DSUDp%2BgVLcxLW%2FvNYJtsHwbi8R%2B9cBFG8PLxUGojL0XRswRgMcpdscIvcKpJGttlzTEfTPH0SVCDszZ733MVc92xl9iqXu4nItHwC9ZDvVTEL00qiR%2BRxyEc4B8PGQQgquexpp96pwdJusjMK14v&X-Amz-Signature=2ee43c25feeb7c8238ca9abfe1212d7e64554e847c7fbf108871d47db6034b55&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466RGU5ZVCG%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121601Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCSHXeA5DFf2ksvMDDxHgogCUGGOqtwNm3jPp7jn7LJTgIhAO8T7TuXUFMLiaSxI2LtAX2mg%2FIivV7k6rz8XEW7PQ1EKv8DCHsQABoMNjM3NDIzMTgzODA1IgyOs2KTrrSfEiV71tMq3ANDIXVjgT1ufH%2FCaL8SZ%2BBHMwXFSLDQwdvvcKZ%2FW7wPgsm%2BGqrRjROpMSx0mVgMp53L2Il4UFoECJzOa1Fd1TrGbu1fx3MiLLd3MwA8UxKhTNktqfHHY9OKmRCp7lEZVlPG5QJfiIuuwRXp%2BcaRKzNNpNXTP8ESbv6wyAC831EmVxEGJU5sALxRwQh%2BYjzR0ENTTqZjHERhE6GYOmvliXQKS8RU1TTfbHfMDpRA9xkDraGgRZgK1BkM1wG%2BhqYoT3ZGpBf4nVJ6tBYmHzumz%2ByoNxjgajoOQ%2FzN9R62ZlDJWze3x1EJoeOAxQJLYpHQfyVlRe7YNWpDT8vFp9Cej1VoLyHTJpIAhMW6KvTAZm77bI%2BGmYyF9D14XxT7yesbiLraTOAf85QKI25nTM6EsPx1jbFqS00PSy6hX4Ah8hq1iYt2l6m1%2BpEAAJVB6AMDrPXkEJ52X4IuGY3u1Zf9A8bmxRmBeoUI9hxQduu8DL%2Fzvyd%2FhrRqIECUnodrV6lvhZ%2FgqO16gdNibZTXy4w5DMNEDFc2I5PoCVPRs1NoC%2B8tt9oOrFGV71nf1oNgAljr8erHYwIPuBwNZV4Z3ktUHBWTh0qI154wcUuQZcW2yJMgEFGOFGHXD24BZRex5DCJ6fjVBjqkAY6U8lQTBn46D%2F2nqXhl0%2B07vgXTsqs7iLMshDltFSRyUL%2FUuP5U3FMRNPgCscRT%2BkbZ3E4nN2PscnWcNHC3PiOLW%2Bc9I%2B7KNz9qIdktON6A9OvYDYfOreFjqmK7irnAO7CSgBKciQKhcoHC%2FPn9MCTwEoItvsinMNS1hxtSXNLzjfkRKCsN6suVsAVL9lDhlW%2F01n5FHZMyl5UThAerg5bIM5%2BN&X-Amz-Signature=fbd8c97b6a5d9bc288066e7b0492c0e6f6d0aad1f206b03d6808f0da6a8a8534&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466SSGSTSCA%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121601Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDlami7r7E5YTNwRPLBWk60CRNEqfvqElgZyZOOymz0AQIgJ37TGv2VryinldB0YqYdSmvCvXJMr%2Fk7Odt0Nn%2F99TYq%2FwMIexAAGgw2Mzc0MjMxODM4MDUiDGvRcXNZjCMJFiRNzCrcA%2F%2BUCAAI13fctcd7Drllzb9MpBfGBiDiGpH7GvzN9Pl0ihohG75qADkfkbrlJgbKISV9yREoy15FUIhQ%2Fnh0TsgARoIiuxAmVigUmSQDmJg98rMeOGJE1B6dvhSwjLKYRuRMH%2F48OI1Mo6%2Bs373n7NhX0lbXKqtu30CJHWdQ8iT4LtG87jrO%2FF2NQ1vYxPowpS05niHe5boDuVKRF6rwO1wyLcAiC%2FAAa4g6P9K3TkRoFX2lvbqouRMb3qPqXJiU3PnCDIsDSizhdXw1LiBtINARxMRwvLv0GPvwTwcDUOOPUzD5hEkGpuT7NmcD2l%2Bs6Cc8MNNB5x0I7wMCGrkajx9BWVu11f9%2B9l44iabQRVq8LvFyQFplCzrNkfU8kXyzH0wWPFfFHDoMjb%2FRYGDtyX2Yc8HSEWkkbIouq8Wz2BlnAU%2FXsZtnmygrv5kItAWOS916GpjgAFDEzBEFq2G6KJaGu8C2y3CY5ORQnKIec%2B%2BqIYLtKIGfIrlPWObNogDvoskq9sRyXYXReASDTe7WuMEltrnqx9SrWnHU3xUCeZcM1U4btuURcA70IV%2B7Nsckc1XoRYu5c3H5sXY1TqLQ1hJqduQyCn%2FD8qPlFBTkKXUtoPbaUkb3X7adTC1uMNHp%2BNUGOqUBcr4n7TfTqtu8idCWkhFZVZWGejptZlcUbOKZH89zHJpeVeRQneewNAc3LOI%2BFl4LN%2BKqwsSDEHhP%2BVeFMFP7cf1MtSVmsChhN19jIZ%2BJ010nkYk3rBCQZc8O0%2Bc49%2BYaKs8XmVN45p7AD%2Bs9NjucSAR0OwhlJkw62%2Bkb5GNA9cbpQi7Xocngle69fGl%2B1I9qfsviNibqNW32CVDryQ9vb0HAQIpF&X-Amz-Signature=3a2487947c34b2e9115658df118be8366169502f3e16756de1478b657b1d8909&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466R26PV6A3%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121602Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIDjDnz7cCKO6lax0f0byXWJ0h%2B6K8El9w6prTQqzXXYtAiEAoc9AdhNCtdsrZ0TWvD0aBwLwhbPpKAb%2B%2BU0g97b2O6Iq%2FwMIexAAGgw2Mzc0MjMxODM4MDUiDFkQ6T1Z8ZfexOjLtyrcAwK2Cm6syyLC7LaPKNtOo955HBZoBJoqh%2Fj7ElVWs5QFIxH6E64W4PE3VFMjLPjpNx8Lx0yj%2Fxl9t5MWEPbUHqMvEuPXbAOShf9TJpaPTa5B980NmtiR8xWxhunbVHBD7SNNBUZhOjCmlOcLbLwyPmSmTiVMpmRVhHgtQum%2FpG2gVqvD2C6N0AFSupp5EtL13hC9k6CpBJVhqhtB1EyfBpwd3bmcByApCx0HZHYDxZYlltmnP51CMivVRCxQNPSx92HKRP3a703AUEODq3aXD8sFx5ZCw8UBlGP66Iuu6vb2%2FJCJ8MxQDrXQY14lSCoIvnvI9j1i8dNNzjvQomchwerapcIIHJZQceElAYy45lR8oytP7F1jEDfZ82edNAAv6crkqoKIQi%2BDchj4LgmhU8w6u3YNARiFCi8G2SMBxNYgTduHVnUKBgLZKKpON1GvoBjhMF9ixkKx7BsrxzqOQo7N7BmObjGt48Yh9OaM1hzY%2FY7WmN4VQYfPh8mvYp9KvGiBzLTz7pR3lQXDcjynTL7eLubse6%2Fm1G77%2FDGzUTgwk3KFV8kxy0%2FKggZSA1%2BAWPq2frM7l%2BfX7qdRbc3qDlrFBEl6Wwhm56P1QcRtH%2B3AALmrAqdAI7KY184wMPno%2BNUGOqUBDdTMyknwNteN2wpDYg8%2BNuFSwdsVTI40cw%2B6XkDVEdOUyUGzWduAkVp%2FkoM7IfxymeJ9gFdnObGvRJFu51vDNle9Bsl%2B1isSOmwlphRy9F29sPcCszOQUf9ZQ2KCjs6ArLtCXZ%2FvT6cLgJUuuARZcZrNubarsBbyhyNz2bZz6%2FGgNJ8x1kmLK062JCtj1CJjm2KaJCGDgMPPROLehLW9erJlxrmU&X-Amz-Signature=e5ccbbd0316fc3b96dcca15e25c527291996e4b4b5edc35cce64c5690be9337a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466VDILW4WA%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121603Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQD4Zgm%2FWqCIuiU1eR1brMKE99YXvLbcVHYQAsQu5rdTJAIhAPNQwvD4N2bNzDJYXEJsxWmeFwdGBZ2melpFbemCeagsKv8DCHsQABoMNjM3NDIzMTgzODA1IgwiLu3XrCVlSh1f3c8q3ANWEqNu1qZKLRYAqRMRqp2DxdWpu7O0TtPNin3AWsdfwl9L65qxRv63e3EXP6MFhMLErW3V%2BMG5i2eOeBuehL%2FcKniKsJiqjNvmEkhkKtSGmmxr3rqdgM4sEVSm8iRXKs3%2F2sJIuDySBv4R1OjuxR9LN4x%2FiqdA8%2BKnDDzJmWQc3wKTIknbso%2BshQtSDRaCZ8UMadueO1l1lRW3gy5ov2GutbiUIlNs%2F4ZZnjRvEGdfJuK1vgJdwx0ES2lU%2BgroqmC6wtd2r3vzJdlAgOCJle5MUNkbQpPOitFAb8R%2FSGPIFd88aOwEy0UaKbS8JN6heQ4x8a7k28L9LNvzV9SphgwFM0NGg4N2c0kyzfwobca4m7dDYSdrIj9uSFz2HzaO4MXObiowI11%2Bx7MMDhQA1MT%2F0ENU2JKLUcKuKAxtqLWPMhZUz%2Fc11yypR7HLhhfP1dM2729PvhNmOISbzp6KYFEnaRVgsfww6MNCiyFBMH8znaZJnk3OVcNOQE3y1L9yDmK17gIljW9n12yb1R9qjDK3wtO9ob31zp%2BOMiR4J7psGw8qTsRP5jY4guDnQW5Qji62qsrm%2F6yb%2F3xTdHbA5fpCyFbFTVpbHmhb0REVvZ18Tf6mKvqKIe72tooc7zDj6fjVBjqkAZo6G0pZDHs5%2Bj4a%2FFFzSpEFw9zYyW8PUI%2FDNYPaJ1fiySfJ5E7uyEFEq9%2FhvR5Ae1vtBRv80ElXaN5S%2BBV8s1pHzIqPVDYgnjCAaPLkEvBIlancryjg8%2B4yS6iKim3c6kMyVPDOlN0xX%2B3QO19Egev7uz0yxj4wUoj6PEOZM%2BTIXL09z3CCoUk6e3aIVsUSC5cmGzzastb%2FloX%2BXKZl%2ByMpfaoj&X-Amz-Signature=5cbdcc9337795c3de89e195c47c7b50be446c1049ca0aecf809ea61f1059eba6&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Z7TN45UM%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121604Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIFEI13pPeoLxtF1C1sIHuZK4FZxNoazVYr0e5YJ%2FDTpnAiEAvFpyTGbrIp0KFdMuGdxJgSqrRdB9GcCmP77m7RwaQWoq%2FwMIfBAAGgw2Mzc0MjMxODM4MDUiDGXLKotnFMQ%2Fny2WTyrcAxole9p2aX76R4DH4YHyBnOXVEDV1BqrIV9mQE1CppAIAVnWv62MLRvqfqIcHdLNXJdsKa5jXL28Xy2KV%2BcFsWQ1AqCXhO8FFfYTS%2BC7ldJ%2FJ%2BnU20U%2BoZUsFPkVhzyNWVn5ORlty3jT92k9DbONZRCqEXiA6qvmcz9Rmxlc2tGVDSNYo6do4oPF9xEvLn0BIXknxn%2F8VY3fXT%2FRlN%2Fuqb90VCX3KPx9043i4Q6w6cPksFRgvIckdxJaq5l5dZaVYwwZ7xmuFXCIUKXt2WxpkxrLB3f7wR6fFVtav7nX3rG98V1yWhGVirK8ipwbPAFmTo4J7yLGL4T4p4Zb1YT5LiAZUz12SnXtuQE%2FadQZ%2FzsBZCRTVWIcquANzQ0ANJG4T7EhT0p9By3JP4%2FOZoS6fbCb%2FFyka%2BjCH8yYrR4FB6DdHe%2FHDz3DlVC6%2BuUQXxu%2FLJL8MkJIw%2BafCoA5RiXcNQITwEA6wUoAT02Vgi4fV6B4%2FxpVdLCS4sStWBymUJM6Reqgl4Ptpt2SWgsWvojpGxw6qYsedVXbi5PuBdIfg4R2F9LpHFsPfcc5qxs0lrAIR4ceIYEdm26Duo7ZgzoS4i5NjdSomDtElQ%2BDZBX6mfMKRJPdAlbsYnN1hPZ%2FMOPq%2BNUGOqUBWUT75vIDzLJj59lvmPl3ivKPVPUkDMJ4kTyc5704u%2FbEQ1xNv9dJ%2FxwF6tqHnsv5zmQEGSwpJVkJ2lqXTz9VoVCabe5mUOE7dcppezH9ohziF07KiF%2BRyVtLZAkseR5B7Hv8txYYbIYBh3NhnWSZdwP0L9Q3VFZryDhwhycjA5hB2AWwTpllDhKm57LOhlE1plGcWU4SkAivmXvfrMgQ4Ce6nl%2BP&X-Amz-Signature=96174a822014e51431ca718b61095473ed258ae9d1d862a9d68662a139f15338&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466SOOTNTZY%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T121604Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCn%2BgSIiG%2F3HJGGQ3NmzSLfMC5GrOzDsHyh7h%2BmfRgYHAIhAJswDsfR%2FsbxWomAUocOH5%2BNcBGTdgvhRtRfGEGZLBrpKv8DCHwQABoMNjM3NDIzMTgzODA1Igyj%2BTpeakjiVD1ThKkq3AOvPYzS9OHyILL4sOQr5H6Z%2BMoafKF8KaohO3D%2FVFme%2FOU9l1Q%2FN4fqpjmkqAx3ktMWPpL67SLFMYPs8Jl6QKnen4Qdley5O5NnW%2FARSAWj4Ze94MT6cBxKk5C%2BQLnTwzYBPVVp08yuZph%2BMpR%2FU200j0KhuIsT1PP4RiP2digsO%2FluMafxZFwRhsKLZo80hxXv1iD0LhxGJaV%2FdnKZTDtacEgYPn1gAl06YJfprxpS6fk4b2cMdBd%2F6jKEy5DXQ3cwcQO3n8KAuDyAtMhSlFum3975KL9C4%2FlHRS8467XUSPy3yZGYo%2FLmYOxPEbjzPUPi3EdwE%2FJZy4H6dXGdLUnR1e94Apg8amaPS63mAxr12v%2BTiVROuPFSjyWDXb5U%2FxXHVi4LXMSWvakJ76mA35pizRD7OoeoBBtU5wRQGxj0adJ0lZDYP9sT6broEtp6Qta1FKfx3%2FjT%2FosvSJqRNLrw8BdaOiZDY7hVV%2BHUniH7leQWkf3MrshLe6BKJ51vZFAkwH4G9qwAiGo7nuAZ95arzf%2B%2FPHlyZ5AvbRwrqcoHG2MRsLyj4pZyyzHW7Z5b14tjeGnFnhtL35pRLKB3N%2BgaATC13wew73580SRAmtZcHi9N1p7d9qDmw6BS8zCy6fjVBjqkAe1SBFpjvb2JRgS%2BTuSkKQ0jsWPZftfFZil4GlQH5yRm4I05LIOT7fK%2F1vcKP95Cxr2J%2BSAnpf%2BkvYYsFOehum3HOzxSUQFq55KGBrcfdxSUOdrtMWBV9O%2F%2F0NcMZKUJ54DcN1zysKugsm6I%2FUj4wFZchO%2F9zPeYG0aA72wFFWtOE8YdAMEoxGBTdCn0tS9DmAPHSeuJ%2B6NbI8AxTCKFGQYBdPbi&X-Amz-Signature=4e6b439e3256aa6238a4e2621a290c0d472d2860733fbc72ab59f9b52da4a7a7&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

