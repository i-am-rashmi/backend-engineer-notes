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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZPVTOIF7%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024810Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCICqtItkPOYJ4Eencgy4LrScb%2BsxTXxQWmHQKTeLypNQ5AiEA8ueokFtbJljjPhbe1rO5V8Sq5kxH0iUtcF4ocDrB890qiAQIsP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDFioT%2BjLNXRYgj6ceyrcA7NnzkFHcBWLrdO21wImi%2FLEx%2FfyBLr%2FLLB%2F0mKJcD8grM40KZC58ylG8a7szu9YLgkGvKiC%2F0bHVvxI272jx5uUMIllESOtG%2FM1lAkukk4XNW9yyxaUWiqXTOHXxww%2Bt%2FwL5Rwjb3xAzWmQwEd%2FCMdiMW%2B4VuV6Hoc0Vs7MK4cFhHbUZ2GjD9YFXP08VH%2BgwGz8TsXg%2FaC0b6kHnIjx3N28g3gxKO%2BwUfBv9nYaEustmbjp9wV7VWUej2FfGtnYUNOCfgTXJIA5aMCDDxOvVaLK2T2T5xQNZS7bWe95M7PPug8hNKyP2vyAaaWkDasPJwj2bUo4qIaFLnIMMYIEGwM%2B6zGhnaVVGjZgAHKVEyIS0r1iGQj3yVU6jYr701d6tFrDu4wkGgcRRPUPBddwyh3WgbXnns0%2BmUhzUA2JEjLWeDe2TNVp%2F552hQ%2Fk7urPUhMeQcorf8CViMtjPERZVPe1p%2FbaChgEi8Wpjdx53ofS5cizhqdbMXJOIvbmzz0f6eiqoLJ2NARGW3tEnrpk8oijDEcsvhbzr2ELG46dXiJ8741wBLJi13SwhnX1NvIe%2FxULGVh9aW7OxcMLcR3Zezf3SZ6vQXlpyxZMQf4IW%2FALPAdLhuGYUQh6n1YNMI3t9NYGOqUBEPkdBU6eC1hbRK9eV43xoBzYnXc86zPQjzVBXLZjEx7IzTS8XJokECsdiq2PpOShOlyIUna3Bs4gClX7FPfP4Jm90uQnLR63Pq%2Bmc5ju%2FsrjFXTEm0bLaeGV3oVkIgIsuldPvP%2FxzIDUoVzR47lQv6oXj5w0ijerEbebBTeE%2BCI9wUwBoXGDOM%2BWWdoEJG%2FG2swPH%2FCvdxKasHZDraqF0FafyTNL&X-Amz-Signature=2d8270ffb655909de3614959238344557e370f3733dc7f0d4693cb1fe117f12d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4662JDM2HZH%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024810Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIBu5RCvhT3cJ7XugvXHZHQOmloi2FHqBExJZg8HikYdKAiAdQi%2FKoEjQrMh5XVePscLNL6YSUHhZrJSyQY9hiwyheyqIBAiw%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMSCooudhvvUH8bl2xKtwDeidN7QpL3OyXcTOGpQVUllEYMxh3%2B1JrZhFKvxM%2FBU%2BPaxuYEbPtihCY98wZC%2BTl3W%2F4G2h2pASu1quertIJCPacXyqChcH2z5tlTWk0dovNIEozx8n8P2BRu8PNhKL9mLoWwzgnV1qbjUpCiwcSK%2FAknaJi7fGWSM%2B9%2BBgaUNwwmJfaIkHBHJV%2FxlDin9D4%2B0hV78vQIKqWVvFLmtVuLBU%2B0b0R2eaEvn2BWM5Zzw0gGfknJollek9lKgHEq5Z82at0xX577bV0X5GkbxFLD8fbxNTRogytpkrrwSCiFPvB7IgOFxcGR4n%2BI33TpOHlIltLFK2HcT7mSDvMgVp4LiqqAH2%2Fw4zB0jE5L1%2F%2FX%2Bf2rWPZzZYIT9eFxhKdXN9DBtMTaoigi6h%2BjjpsKvJAD5a4YceDTMVcTewj%2BIonext%2Bgi8nzi%2Fb%2BPkbrLWWkkeqUgIVFYwF8cEP3%2BAGL4Tu6%2FKwPYQnDYPxwIyNmoNSJ8jdx8IbTlBh7YRpRGT4ssFuV1WF1ZO8YIZcyZy7CfEhidh%2Bn%2BJ37JN40GZ%2B6pLkPqEa22iffXQHgJkM6LC21qO5LrhbLphuz3IeLWK1qr74l7YP3DRJsLwnc2DUfFeenJnn4RwT8vaiw0eQakUw%2Bez01gY6pgGzAMW%2FAFsMv2k8B3FBvza2MBnbO6E%2BTK9%2BMPQ3oHxp1LaC%2BGdFVci8Esne1uPp81CsvnuwPhSviCT1oS2rwz0WpvPjKZDW8M5lMBtQ5p1l9IAj44hLL6VeasaSCirFXe3CNsogZD%2BtY5eq3oxEqSsUQrEGjf%2FvGZ1Jc7vx14FJjxWi0WSlwhrBdxy7NjQXHx4B3k04qs2op8VASSMKpibCzFYZwfiy&X-Amz-Signature=4305dda372406923626aab06669c47152a8c7a68fe491a9c1d87fdc0576c6335&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZHBGBG2A%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024811Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDsoZgZ7xLJAmHBt70VSEfWSuyNXGi1FClANfBTeTWxQAIgF6GllTqNwjS5arKlEgtaIpBRnaKkXuRqKprQG5V0hrYqiAQIr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDP%2B7iZo9iP7xa0EduCrcA4Ej0e8Iyv5qecOXhsuoRYt6aADXTzRQL9aooIAMl77sABON71ys5smHInfKGaI8kiRBcRo2QmJcIEMnOvz9DlHdHzhwaxkKILYL%2BMP9UPzhkfndM8kOMNkHo%2FtEw1Ejkgjg4BZ4lsjZKzHjJ8nevMyKGlgca1pIhD%2BCwNgFv1PAfxsQp3bK9Tu6XWuUyVjd%2FrKCb1%2FoE6vkdDowWX0M5%2FvmzeaOfv%2F6KM9F45s6B5MKOrVsN2E6ixcsF4vhKOm50kgptXOMIcqTbehbxi%2BJIFvqhe2ZwDKky7cqlOEwM0Ma2RNWLEMgAiOVJFtmPSMPXp9QxdWMoZdz27qvFV%2FWaVGVfiGWNR2fXvE9%2F5UgU6nyu9b6aLzcc18osYFe7A7sk8pYkA0UALM9vqz5DIvcRu8yc9fueqxZvZi6vEnVQRotqiJezixTXFUMUuFsE0xtCUtRg707YvMpBXLQKi3o6CrJF2v4g7Gb7ndt8ch4uBp3sbBHuZkgoQoVJfviGAC38i7PJvcyQZCMGb9Y%2FjAdtJGwFNgrhG5Dh70q7Qai%2B9O1HI2Ymgv1mLEefjDaV81%2FyYw6IJbPTko7K5A3NZ5TuxYMd6c7q6RTZs%2BfgKyPnjp%2BNFHYIl8En1G%2Fp7IbMJXt9NYGOqUBy94QJJK%2BM0LCfXmDA2m967i%2BjVlN3JBUzW4CtEPWHsE7czIXeYdelIPqFv84Da2PFocdHC08Buge%2BmDtpi4WoD5TBN2S%2B4vbmuKY9onOtuLTlCbg2FD%2Bpfpo2Lvbpgg3gDjBdMQrLOE2iAdam%2FMGSUrQGYphkCUwRRWrNHUbssFGU8Wu9N1YGgW2cB2eyhZxgTHBSi%2F%2BccEp%2Fj5qpx7pcFXDEioG&X-Amz-Signature=e725686400ae039a05d079e98c7390176fc17149f8fc7364c30597d3c58702b6&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4662MDDLCII%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024812Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQDW5ibAMcLZNYbNNXWBTHFp5L2zyRdteAywnF7IMLB56AIhALFjYKZ0dHw5qpEBcojPkGkWxXssJATEazd4IyNKrO5%2FKogECLD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1Igwl6P1osvUMNrsJXJkq3AOdeCpCJwXq7laBF%2BhSWR7BcwWeJwizc98uy0Q0yN2PpJ2mQ1LPqtbaDdxSzhh8sHB0M5re3kayj8klO9cf3c6GNQFX4k6R8WTySLcpFGx9kHyssjrZYxnaoyhTNMzs7Fu6n8gDCkUyimsvfcDzy4t2cp1860FtVBbFeahCBu%2FE5LW0wVtoP7Kw%2FNK%2F98WbAlOam4%2BbUc7RHeUhN9Rmm9bdGWmmW0JLiUX4LyFD%2BNnG%2FCHOAftrtKTRtE1Lbbq%2BT%2BMip1oGnQjSBEDiu2BCa%2Brljg3ECUPmFXvViA7u%2BTMPObunOUf%2FPIVDRZ%2BaDpc1end85a9NVRzRTYh9%2FB4FeRr9ZOBVz%2Bn7snQHpwnAfS79aLGYKe%2BN770KDZt%2Ba5nI6tjUJaFZ4SbnS5TGFrG4cZz%2BoXV%2F8Ur8D58e2j7TdgTbhRZSt3D3tAHQwUzJMSH1Z5OC5DlVcCKB71kBoRLLKp2TPaYVwi6u0a8JoWaYheKWDqzWv5D1ILCXh1d0NtbtyptsoeaIRhT2NwV0d9DbJe2qAL96DzpppfQQ1PnVqcbSmy96oUcQCuIZq3ELXcHoYg2RKlF8%2BPrxipKKNtG%2FB0MbT73Zd25eCZdxcqfraTiUctuXEez7n1PcGs9rfTD67PTWBjqkAdyCfFbbQmbr79ivau05RdDVda8Ag6ALPk4hjYsuw2eEnNeFSbY5EDFMPwctoDQ4xfYYG5%2BAK4Jb80uvggl5dX5WDzY7lJUc3U8vXPC6mzyOopi1JfL9UH0eGXxaAFHtZW2qv5E9I00Q5Y6LAKZkhHf6gy9R77WHCxWgcPT53j7v8%2BT%2F4Y5JGGDfQzRa7fIxiQ7MD7XF9Htfgr4HrZGc05PWPfBR&X-Amz-Signature=8097a212465a9d35d7e96d68c21b5a7e83bbf15c34759f5e0e0f1b938f991707&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46677OLSCBZ%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024812Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQCGDZUSjFwOUmZSeXEaVOZwa4CjPY8kzxyvPRj%2FUqhHuAIgFeX6eM6VHHxuFXGtvaPtyM7aRooFhEnKhO02na%2BvcDQqiAQIsP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDHuw8g9n0sD%2BYRRiaircA5qLJBYlThez3pZ%2F48Ut%2B8bSSBKAfdq932hTZyt85Qo6uEtoESRZQGEOSGvdyw73sRZHZ69TT31Fh88O8UEkqK8dEsIjFTOZ%2FT%2BfxhpUxvO7brb16Y%2F4cFXMkekbZpy9%2BVB2re0jpNNLAIlOJZlMepnvsHS%2B0E2IfikOZKmUj60xtdGn%2Bs8II2s9UpiPeU%2BmIfmy9A8%2BB3TXzq4R2I1ll0zYB7DrKsXpXg%2F8w6p5N58Zfaa%2FTtyevIDA99bvgrDiZvMEal9f%2FZeGBV3K6hohKlD1UzqosYZUnzWVmlRG3pzV1Gqp%2BMg%2FPvDBvJ0qdpnY9Un7db%2BNyMuEpUaQKc5WFva0htHoaUH6TG6Egr5G4nH848dK0tIrFH5mpcgphOV%2BZqkTIW5BgOgTfPJ2moinYj1%2B4%2BzV3OcC%2BdRc2%2F9UCdoNdXexHIPReZzITdteozFk7irRQb6eeaNNYbI5pes%2BBa4NL%2FYmX9zqXrcvI9bwZg%2FeqrgeNbEVO1o5HQkjn6mCFbZnsOzbVMZSBiy11X7PNO%2FaK6JB1xeGyH%2Bu5pOkEjpUHBd1sFwUPkKIwdi%2FJdG7RSW4eFeCiJG50R052658zrxrRr5t2qBb3z3uuYg3vickD46nr9mMljVyNyNmMO3s9NYGOqUBau9%2F84ucrIHj27Igx6ATD9NGCu%2Fmub%2BXnJADZdG3QhtgDZOrAWEZV7l13bOkGzO7IZPrHFvE7nmJfyQWkjyWTm%2Bw4Ld2UU%2B%2Fnq10VtAaCm9LAcrkkL388YpLpcJNcFflbaizmri8eT1OP69ynZbxQZ988Uecq0JVL2UfezHVr3nLftlE6vDVDsiLFKfbVnB5W5%2BHWNR%2BxQ3q3VsN2xGlErLcgiCa&X-Amz-Signature=bc3435a3832e6bc10b46b64431a1df1d6909f25fcef4c56a7d8d141bdf57583d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466WURMMCI2%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024813Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICdtWXU89A0E%2B%2Bocyuyj06qekuFx6YblQTMdqK4nMk%2BhAiAtrIV%2BuU002xaBO%2BZ5hnlFfHmWD6LNxeOHf6AD%2FVdgUyqIBAiw%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMtUr0QojK9JyXmlijKtwDlyEbAANmipZoyQuae2vLu2dteyZTVjIbrcXbaBfz2F37jg1nCYh85Q8Mb%2FsIScWZmxDc1M7eVsKHzyMUMG%2BchwN1YWbljrz2nCtdeOaf1X7zIAFAPnzy0sIZDGlCC%2BZCnB5Iz%2FaVn47955Zz%2FEOagcCW8Dhan9irijarw%2Fi0X8miOlA3uTObRPuDcNQ9ky94bmX%2BlWjpDYAbGTQ4w7sv15NL1CDNStM1SLij%2Byk0L6sobkLp7i0OGW7U2HH7XtkWuW1D%2BMC47WQcgTmUOLpf05ct%2B2e5TBAeGMuOAzg%2FjmjfSMvejx6Vgofd5eqG5oc40cfCOraa74hmJUQ2xNySLO81VDAZR8EzKWA56mYcC%2BA3kKcUioc1x8CtprBJFCb9EjSlXpBmtBZaNvI9KlF%2BfUOK8uco21mjIHJUKFEZHMAehb7EWK6qKk%2F3vSo6eS%2FwdmQ9kSvvF9xuUZdqDdGw5o2sfgSgIMa2C4T%2BSMgtFFh9RPD7Li1oSLPr1oc02F07nWUURBewL9Q%2F33Rzb5eSBx0scPGwkGrFJgg%2B1zVh%2BXi8bDl8CUJyqrdoMcFyw%2BDV0youL%2BUN7I4XuY7UYHgdFxq3s1p%2BEXJEecp%2BdDLXs6HOYpeTbHcDqOERwn0w1e701gY6pgGYAr2ui3vFhwTZQIJApfEOw1q1z4hLO246P5Vu6k4sNTkinhvU6oAH5aG4IbQufm1Axd6k647t%2FumkgQG9N3E%2BA4F4rEDNGJPtcjZc%2B7jbRBCa0NL0cTvIq9dhELfs28p7cyc1hkNWwdxkYrgR%2FAeN%2BLwVB3Zm4VJFVKDYDFcw8xtU%2F4BSBYXWhi411h1iEayc%2FHqLK4lCew%2FQmyw2FGCr1mJ0hp6N&X-Amz-Signature=df966f89fb1ab55f89236d16e069a200a1335a2e51b05186bdbe1b88e3e00649&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466TIITO3JZ%2F20261025%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261025T024813Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEOf%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICzWWcjrpKVLw%2F%2FUfTL5iguXq2XIwN5Y1jJSSZH55SY3AiBBJBuHgavF1cN9dVOehIgvtF9AtSHf17ONLc%2FHc2mdpiqIBAiw%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMcTsEhVeiBz%2FkGZR5KtwD353U%2B%2FJeHNeveIRq%2FmPlE41hRGGXLFwJ7PnzuhsA1XAe0wCiNYofQgsobZ0alIE%2BNZhe3spInGCMOtMdWl9JcpUYBMkwdOthkAEG4zY15WSVfcOnLoXyOBnH0D%2FsfCgB3JRRESacSUnMwqohFanjw1QNp5tiVJObfv1i%2FV0Og%2B7QoBxBlL085qg3ZWjmlPgOWyTk6a3v5%2BttMheXk4N411lCbm1vvwthqoWJM%2FDvq5VN1TsE240atDCZtVbv6Qs868XFUjOCgrP1M1aUpV5cEiiP41h7UUCfCYfvtUw1n3oXrgOPprqCKvN6eYDqcAHe4FA4eZs2sm2XeOQrDgsF9QPKU2dL10NGadGo3V2T4ne9pfKMAJ0nOnly8r0T1AN75xyzOsuRncC0ZbDR6dhOu9TzHKNW19hM0K4xqaGpK8phjvsKrUSp89%2FOTKhSLmVjw7vNdu%2Fng3JAcEDwPh2s%2BjFJkIiCJnAp6A0W2O9A90%2BfcSztN6hmF7PxLeNsCY5CUHYzeIqzHl%2BrV7kfRW6tdHcoVvEc17Ylzjr30%2BwBR%2FO1K8ejWquPm09eVX1BfM2x72bW%2BHLwVUz20LnMw9rtR9hcS3nfjdCEcfq5d%2BcioHPUjDZ5B2mzauir%2BBgw9%2Bz01gY6pgFP04225hu1MQdCHwBvsyDxwNHBxw925EksN8RYIUOaxbO12Vldj99UEckCnFXp%2Fx%2FDSAa89bU1PEumh6bn%2F5yNNnzp2HH7cY6SXZpQg2nr4IMShemibchHGHnhUhO64dhScVqSFvQoGpzFN8%2B%2B5cCUgKPYWL2Cb1o0RUTL1vGXc8wmE6DOf506s%2FxrdPE9ObGWG997uh2BK2DVik8TMy1zNQub1f8Y&X-Amz-Signature=46c59e42165d92d342c49aee4c0e6f9451c5d0f8d2f825869e1df6371b0ac2ad&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

