---
title: "Distribbuted System : PACLEC Theorem, Consistency Models and Quorums "
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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4667X46M77F%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222444Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIC2U4gNmjVfNcUMq1dXbkHbpP9aER0AJseIoVLPKSkQmAiBoDMHR8KPwyHoEgYW%2FsRB%2FRyFcaAy7cZ4Ev2nClgNIDSqIBAi%2B%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMoH5m43dS3UPWjLj6KtwDL%2B0SlGi4DwZ82ykveASjrv5bJpqluX6Hdrmjtvt%2FV%2Fx2b4m1Jod19PVC%2F%2FtPQsSwqHiukd3lLybPFBfGfvSO8gQWvB29%2Bqrp6SGctCaWTA7Zj3YD5lFKeACz1PwgInskXpgKjASoO9xcFyFl8ziaxMYYk1bb5eL%2F%2B%2FJu1L0KO4SDexXNCTSmuMWoU9HwHIKh7PjTAmydmfEMLfgTCIjCR4%2FGLRj7Yx47LqAmjmFtug0eK%2BKDFFxlt%2Boi5lTr%2BKJdnisn43BkQh0gGxQmIKRx79h2RPeeiNsFVUC2EFMy8npoUKfTDK1nKTTVMTRG2sFyiY3M%2B3RZaH95qUyI77%2BjnJ1VjHB6eO7trC2t8vjVDPQE83OxZvjoqjsll4Crt%2FF6n6ZlmknriCmpH1tDJh4%2FqeIzyBcFfFmn0cMb7Bj3%2B%2FNRe%2FVYRXdEjznHui3usTlbRVd9ciG9F8COQoR2RI6MAp9nP8oID1VdInk4D%2BWB0oONDvi4UnMbapEprubCbC0oM8BIR5Ty3wmPvP0BKX97zU0%2Fft0Hhs8AWWMGgjKq%2FZ91U3ti5O9Qfz9FD%2B%2FZLDVIdt7xO2zo3VkxbrGapUt%2BvFvfThqpC%2BOn4CZ%2F6FgWxDIHbUkZvhAX5J7NYPkw88Lo1wY6pgFuW0QlfHgWCIU25rJszfLCPSXUM53pieXSOinNDCwW26%2BuToRAsDrbC963Q7ouJRYGp8iKB%2Bh3CTOWjKLMkXDJ8LlPcbFPfSvC1Jnm0CxKQMdvPrre4BmzItWCX2US%2F3aAH7p7ZkJs3YNS2qJGKsU3J6R0nUdLhwZw8k4Rx0nZsAan%2Bpjlqi32s0FnFalbgojmZhrxZ%2FMj0r9lGvH8DWjS23NRdQfF&X-Amz-Signature=73dbffb4fcdd623d12d0d1d1249e67fcbfe44389e9f312dcfd9c5f8d411a5d4d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466VD6YE3QT%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222445Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQC%2BPOLuqwNM%2Bq%2BGldpeY1bAO0waETC%2B1C5Lpl0RPxJ5RgIgJF%2BGYVu%2FGxJdUGbjPAdsL1eweNh0wiPtEpQ7jajr1jkqiAQIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDCh82MVgHOBjkFmjEircA44CfBgb8C7KQeST31n0GkgSPoMv4i02KG3001%2B5%2FuOwjH5IE5I%2BhkEo%2BGJtv4MN%2FqMtcr4ERgKYBA8LgI09CwU2MKmJVBjOZgSJ8wRCSBlEFZlOZ4pdEC4nenoNG1pIeTXppLHOqlGhmky6ETpV%2FPyF%2B94Z7T%2FKRj07aM5nOQbhQr0BZUHFxUipuuQgYTWp7MTU6Q0ZPHmdcV7UbiZU6aDYYDkgguoX50Uw4WNX44XgyZIhnP8TpO8obxMCZLTZPNQhFe0WVGSD18V2trFifxXrtoX7TEeyNtaT3gGpDEIeMQ455tCMSjLcgJOffRZoMwGAiibuy2%2FkkjlJOeqxtIb7vQY7953WBUnIKi8p%2BU4flj1b51iIGIeh61PFiS3XM1nTox8vbCmJdG7BOlYEE21eESPjEY7Hm3CRNKmRwFw7WFzbhjx%2BSfPedlcDndovweyirLekHo1taelyZ9VWTpOiT4BK3cw0%2FzzqKGBX0W2Rb8rlT1hlmtCsGFGQqVxdNczONDAaHGEXpisT33SSqYJLfHTYU43mjFMV9q3Ah1EXMBrBHz8z0p5%2B8Ku3AFmg4rOVebunLljxQo9dXTzDr%2Frx0d6tvopFfE5mnsKfvylw%2BQ6RUM5BsxAyc%2FN5MOPE6NcGOqUBJ%2BPWTwzof%2BBlQ5szxLn%2FKHZfoS9R3Cq%2B2qxMTZgzx6KxlFexXS3nqG5T4lQyHotGmmkuG1ukx0tzvjt43PsBZaA2rQlx%2F2%2F4QlhCvhNkDw17lhifPdbTDU5QJuyI7SSl%2BrZtPkFBU1oqJaZhma8yIvTa3tt%2BGZ0bG3aUpwW4rx%2FE8r5tH0mkSxr0hjwzMzUh3nycGbcyEZe%2BOj1D%2BVtSsRLh861F&X-Amz-Signature=121eacf21dc6c7602601b96471725503813d27b67e56b0a2abc49643d02137fd&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466WAVK5DM3%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222445Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIGRy5YB549hRcekAzZltN6JclPtvQ3u45GIGZm3in1W9AiEAgYtod609zCIF%2BSx1VfzbPDUqJ22FE0HREOFX2%2FHmA9AqiAQIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDIlwyrTfn%2BjIQOJpCSrcAwzotUz5HAm%2FuO5PL4E7FcA9UC51VjE%2BHk1sU%2FK%2FnNPWbLE5u8RAkphwjYhxNpHbit%2Bwb%2BERM0lYFsgL5mcDuKReHNErATXl34ulm06NXGZ1%2Fxcwz%2BiUSnDzJBfW39b%2FEbRllsIvUuLiM7FWG1Je%2BxjaXQmH2Wg5knIFY1Os3Q%2BFNtoduMYdtp8QdHw3MpqRQ7UtOle%2BYOjbzKR02InNFYFQZlrjIbn6Z7mwardB68MBa1aAJ5Frdr99%2BlrZC%2BslwjxZ%2B94Sd2qoeNT%2FrXl%2FvuxDVUyaWRwMmACdHiPenExpFAgooPjqkI%2B2PPcVl9JN0wlRxWczdqkqpVZNMywbTt9nQ8lpz6xFG68SCPijTD89r%2FCkxPDdxFvyBRBNBKseP40r11WLF6JS2DWDZKPW1Q0gg6DOpVwMUd5YbC1M1RsnYTmUEtks%2Fc3UEvTl9gYvzC9LNch%2BR%2B6eTI9TJF2YnsOhJo%2FCOc2ENipfnDGZX02tlaXV2cQgloq5mAYt50yFm7kFKUvZbXz4QGAZW8z0pqImfksMcb87G5R5fs51qxuyk9s%2BJJjfKRCSNopdL9VhR9yelv1IQiElEO9L34AX%2BM3OHvemnKC41ShFH%2Bl8021o7qgq0MB819tADDTWMMrE6NcGOqUBXENpeS0zI9636t5x%2FnA9vAHi91c995MtsxAcG%2FK6TefTb8Opv2V4GpCvUczoDkpq3RfXDGzvNbKIUHF6q%2F8Kcipp9fgzw20mkfgos8NTwH03oj5AkZpcqAo3fUjwJ%2BIeubmDx2g6aURTj4BCexMzc7HNlX%2F95JUCtjLzR9qm4CXr3LR7niv9Oy1%2B83LH3H%2BjqCyUIQrKfultqK%2BHccyYBg27eTPx&X-Amz-Signature=a2c63e3b66b5390544e8406f23f099666b2d6de056d3c65200d2ddb0b7bffcba&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466YYPPTXY2%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222446Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQD8OG3wgeiyYyD7PB6rZPnSONRc6clDD7%2FZdl17rhuFtwIhAIbhfpHfH1uMi6l%2BTKNr5n7zcVieIIUqYk8NT0owhWyOKogECL7%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1Igy5DpDeSGPfOGGDl7Iq3AOmwsX6RTyj8HF62Lgp7rU1ZIE%2FMHlFj5JeyU7OVKnMzJudchh6pXVDeOUD1%2BACjIamSVhJWkgUfy%2FD2QBv4xzpXjGx6Z6wDQQfZ8f2v%2BTNnXVuTWoxzgOngr6Fno7l1Qsu8QxYoioGvDgq1CfA7jrb2XP7HuvsgPExTW%2F40ZVQzllP0w2I9YUTJicAnVv0e%2Fy0yhWrqDIawjJS2PHdiWqgB%2BDAyC3xdHs2MA697km0%2BF9%2BWrmXoJWuK%2FP4s%2FS9c0ANXet3lK6F%2Fk0WZ6gXeX%2F%2FCZVIJRdApHq8SRsAvDb7Z5J0xpyFuzzZa%2Frs0J2l7rw5lEJO64Va42qlUs8Q4yqXacZFOX7wPGVvwFIm2%2BV5fZWqPzfzIoavrZ49khDsM2RE4Xl%2FpOapEx6gUDDT4sjiCxakhL5FaqpcLG1QnGz6%2B4gzV2Y5dcnvUPa7jXt4QGomov6dGE%2FOzuVaFp%2Bn%2F9eY95MFR3THepkXuJ1Pvw4MgYDiHB368hFgA2zg3NNsV2OH9yDnhJjAKPNQJnV7nXHrXzlRTdnCzIEwh%2BX%2B1LGMfxhA9suUSnOAyKRS4bY3Kk2xEOA%2Bl4tGWiptRHTFRtBf8iuqImotsW05oWE6kFcEazAQWhDCco032T%2FlwjCQw%2BjXBjqkAdLrbj1ptG7Plh4iepo%2FesvnsDV5laETqDA%2BCWJuhkebfgM1OmbZuB80gc%2BsjvyvNcTcpfYISWF2A63jNaUBpZB2fQ1lxFy9yCNVyY61ggkBoWa48Fg6fn1oaOk%2Fq87VyiEGOYUeVb72DGOrK%2BBr71FsaGnXJaCxyaf8nqD5whSFdhhS%2B78SQ%2BHw2rNtNKUq0B9KkBx4x1dZIpB6LuNNSxf6KrOh&X-Amz-Signature=ef2cf5b3f34f3d128b97cee2b3ebfa72370db9227613d031c94adba2c3a8cd3b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46667KFO2LX%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222446Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQD%2BHU5SyysIQH5Wg9KK%2BvshaPgFOBYRnhDGb2a5XtGA1AIgMaA9qfQwTHMBAxHnbh%2BmVR4RfU8AroGgv6VpMBz0pE4qiAQIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDDc8JIEShzi9yateUSrcA9h7PXBOsiXecSz1rQPr%2F%2FHIvi9t7676WEWqqURi2RpZaUrJimj6amMMVTM6RNCdhup%2FjdiISyXw%2BGgI09lywXG35zbN9%2BYXkfI2oWT%2FOfnbbsQhm1gR6u%2Flre6lLsWzWj8ypbLTh2Dm9tmyPl0xu%2Fhgr0%2BP3WNtte%2BN2Sj2gJbzOsrp%2B7OwUD%2FkMGNc0owINOlR7Z6CAnGwR6hHodVJrijLt6a%2FY6m74gxpUKG8NThO%2FZ9unxp0%2BMyRmlzg%2FBQq7xtVm%2B2OxeNU71YnTx5%2FLpCl9%2Fy4lmf3stAttnMeaJvdx6JE0JA2j6EVpfhFV5qZZEiWPX%2BJMKcnGA0o5tJuADwGfwpXSdTNVpD8f6zE5pzgfK7x4YVpaav7otKQXhPfxSPS373MxLuSpNnAibNJGSbLKZA1oWp1py%2BmYGR4GIHsitH%2FAU3JOp38L6euIFXUcWU86wVRmL1j3H6CGqSQVHThE%2Fq%2Fzm3kiYnZV5GPBfv%2Fx%2B5dke8Omo6dTPamSK5mbFDOZklL7%2FTTXLei9dY0dkFnfUNkV3HiHEvqr4bQmhjiBHAatN3Am85R66QOaacUJRJQYKEfQdqjKn%2B6aqi%2FWCRDDhtyY0BYuNqezX%2FtEJgVRLMgN4RQQ9yk%2BwJhMOnC6NcGOqUBX90wTAKbbbLEkcKChqMoF%2F34BnMlkUrE9r2cM02sgZrCsJ%2FkglMiNyPwgw0fcBz%2Fa1LGYSsgktnBzFM4ul238WT6QqaALld8zIwx0UZNJPM1KTHlBqDQICNFDa3pZCYljwbI9Kk1PZFYZ0JIv%2FsTuy0QmS6g7Z5rSUvg2B6T8mRRBbH2tO5vPS%2FtK0RpwNuCRWcb2UElkSzXiyt5yEcRaiizCpDR&X-Amz-Signature=01f16ecaca394479059063d306dda76c7870b2da764d6ee8b9a7d8ce5cd769eb&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466SERF6LDX%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222447Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDz7VTpqmRtQSiVY94CfC1wMz%2Ba%2F%2B%2Ftys5L6B5vAfdjRwIgHFQygGN38CWuHj1ZTm%2FPueI5Q05hE68bVSdwCVGjs%2FYqiAQIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDG9phPXkFZ%2FbSVtRJyrcA3piP5DTxg9yMggA4NVdGTSHhj8Ch6Gk77WQ0nU1NfmVL%2BaiPdpY24XcweLuQ%2FA63YrWk6q4%2F0peW5wGhYCu31pjY%2Bs%2FoRU%2B1FZOBdtpe66bWUcwJIzUYyQzs4Xzk2KBnzvXrZYlS34tyz0IT4VaMlcQKzUUGBFkIvVg1G8CfJ%2BxBkagA%2Fr%2BF5IG%2B3e1%2FqYzsOz9C86nj%2BSkjgiAS6q%2F0v080V2Ii46%2BJ4c%2BCTFpzpwMJdaV0phTVSxs%2BpYRaWODxyjabQgZc%2BhjM%2BnE8oXtVdKNUkkC8aryoBqfL2OjPByb9oQrSFX%2FPkW2B%2BtCH2H5AHuVHp0fQuI16L%2B%2FQ5M9HYDW1pHIYXgy2yA1gPs%2FIda1pIUusEBxP6x2dgmMwgQm8bE1O%2BJUz8D028gL0rc3Tc7ly1N7Jowiu4l13S%2FP5lZwyFQqo1O1r488BNz9mnxgMBOIY4lBrsJoAcmdWjbRdQjb%2FUlBI2pH%2FzDmFL42vg5zB7EvkgDevKNUaP8YRqQhBDpP%2FhsQQN%2BJaZmgHEJFnW7AcHE8O02%2BVmb4zf63QltR1UoGKsBWppUCYjBZ%2F2S%2F517q45xLUOhEeejO9lh9WbkF3W4WHsQye43hBb5s1E3kgR%2BK5IlXgwxJWeZVMPTD6NcGOqUBb7U8FLSnS8NLLhi08u2peQU3rP0veVT0J3NxZKhmrn%2Fhw8o1tpKhqmV3CNLdOuO2VJ8d1Dj6BxY7BIntoyHQa9z9LpOdPfKqFhurCHh%2BTByx%2FBRVbnfXRnGhWqXNAG0mYgZJJzdFMuulHF4E9kf76pMOEj1Bs3TuIF%2Fy32UEj2AejsuJxar1hsS2HWT%2Fb%2FYnH5B77ddYWGKmp3AmBj2p5ff6NA5B&X-Amz-Signature=12b156b1efc4d65164b555a8894212baa60b199de2968a0bba9f23c0c06b89b7&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4666D5FV2KS%2F20261115%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261115T222447Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQCsfhnB6AZqn1XbvKOColsvagqHu9EwjesfZC7JLeOcwgIgEDHdt%2F71WAm5ehctCeDXcCryuiU4%2Ftksqc1jwdzoTKMqiAQIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDOU9RpnXoHT7fwNJpCrcAyk9NewzeXJJL4SPgHkG7NCWw0DU70tAW%2BCkJoMWhvL7dFVYhKwe5MstoDmQTX5snHIQZ%2F3vsXo9W4Q0mNzncufFZIDSjmeb%2FI0hTnuX9ilW8TZXc9Frd44uQB7tjQEt1rIqt4%2BzGHWICfRDhC4bBU93VCkAm0a5TkjctChv7BxbA5qWNcxNcg2th5TsB30A1C0BXzQQTVA5cbXY7vjLHpTdKRkvDcD7G%2FEHRXYyu8oA0V31IyPCAQ0UtejE57xM4LyXvuxqsLLmmecExUUG23nEZcR7OxVQY9REHwKoyb1oBrh2pGzXNCWECz3n8RX6e%2BtBpU272L%2B1T%2BEkGtYgqmKn77FskqO4SXf4Mg4T2aF2naHwlZMH4aS5v1FP6bWKHmsOUBlMRAmfqhkoPgc6qJHle8syYptJ2AHahbWSnnmwXg%2FKTX2KNR%2BxQVre3TH08%2FeXvZynmmt7GB7PXUWrQatEPuxUTKmqWmgF%2BHT8%2BU0Q4kQTOTJdDBkQLSvuNCtHJvQi%2B3a%2BgcsrQRo%2BTSg5dTsL5KguTJJHVNHp3vac6lNdHXM4proA%2BgPbCaHwll0JdkXMdA3Y5ptNGgRAKIkb1pDFic66PGt4j4ToqwNBLpDvnY%2BJpy6tr%2BtGhmahMPjC6NcGOqUBm62xzcCimN%2BTPwmolujDRmX6OA23AebYvU%2BWDpM%2BX95i5prAYA5J6oXAQwBtqQE41iwpfJVvraTLhpgo1QKs8QaqMWEvA4qP6fbEPeBj5lTORW4c1JjqWMIy4qrI9P5UhRzllthJDxXiPDuBKbkeFkc1VU%2FNxKZiJuSPaRy87ATCGpAUz%2FgUB0S6iSwrlbqPfk1wUpe64mhfC3Lb6nFMSHEn7nGv&X-Amz-Signature=b5d8e7f54979ce9417476ff277b38ef668c6e2bdeb13d79e8e620e4711395931&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

