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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466TR45TPIV%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115842Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJIMEYCIQCmB5MS81bXifAC82Kp0UkcwSgDWN4jm7EECEVnSVWi1wIhAOPqZ5camfDbjvDXu7VfeRTNf5ViVL7nZZJob8aHzpXvKv8DCAMQABoMNjM3NDIzMTgzODA1IgwyH%2B8GfP5TRpajV%2FUq3AOe8BB6EabNRsgmyCHjslanZguP33aPDBOyWpjdS5ic3HKXbeztsTVJTPrHGOrgctZEg2V0A4Xh49i34Gd4jwRw6S2br326Uihvp%2BAkrW49Qt9ueyAsbunhGm4uCSJRckMgTP%2Ff9G6ovXq25m%2B9lyfhg3ruBG6IRXrzZk9%2Fl6FqKLJhqM5AwbSgzsefGDU7eovBDZC1vDzYriM%2BTrgXNMrgB%2Bh%2F5DhNkBj6rc%2FAyUHawr6VDO9zBxvL0qOB3NSzQ04C9b6Q06Kt5%2FMg6mbf8ep4J3uI3haL0meFMZbAvXybKiefu%2BORgr%2F%2FHzlGG2FaG1elhnXGUwViopmqUILnYlrEPkg7vIRi8aebppUJY81w9tvhq4zxaHO32HBCcfC3q00xwkbZcMeFrR7Vj6iV43eCFlUVE3EeWwYR8rYCSZdr4%2FnwOv8foeDDU5Rhpb5M4Kfodcg%2Fs7lCPa5zsg%2BUZOOLPdcWeFm2mOJR9bncXCNdbJdI1hvcSRtZi80oxKLAHkEs6N%2BnImRziIq7CibDyM0jq12l1dp530MsBuMSh07aiA2oVcnH4eeoS8Q54RnmxK0pof75HnvpnjtnV4SlKIalV0xBM77mxXRFw9kCyWpmqCKI79pGhesDef%2FhVTCloofXBjqkAdEqRHbbSCZhs6UzeFB3AfNSlVL8bBevt%2FG1DqTE9Yz%2FVV2lzhEzk1w0v8n9feBlMvc2Y2XCVmjNZghfd8KBAger%2FPJ8FXJSX8QrLYPCHffpRzHuFJcyDPkbpv6lRsjo1C0PQL5xsozgqMHO7A07Fc1C%2BUhWMbkeMf7mm84EgK11m6hH1fPUWrc5VxDL2RfKCEDXHmFplhRjftN%2F2pz3q%2FWUlb%2Bz&X-Amz-Signature=f294f628b5e80adbc3110f78a3f2426e33f213c4def8ce13e6a4d68c351b010c&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46622EXBRP5%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115843Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJHMEUCIEJJFAmcx7v%2FH67SyG08w%2Br6wTMw2Gk6DXjPH6GDnwTgAiEAjxVlzTXFXgI5OccVLE%2BzxIVCvuBLtRAwUpDGihImg7wq%2FwMIAxAAGgw2Mzc0MjMxODM4MDUiDHf9pZOcnGHwSyZjJircA15ls60Du7C6cijNQK8SGGP7KK%2BYB%2BjT5Ikz9FtVgcTrq9MpcMbMHhMXNbI52iyvQk8hHt4ZIUDzUv12EpPJSglYNRzHWRR%2FRNGJZxTdOoRCaT%2BrkYPl133%2Bp%2FUt3y%2B%2FBUyTZl5AUzieQBt1NN%2Bntnnfn44DVILTSoH%2BkQigNjUcvSXnhj64W6xc3p8ADoU2fimbhDODpotDihalVTN0FpULUvCcErV%2BlrkgZJKO72Uh5bvmZE%2BgAlKLsXcxjo6CQkTW4vcx3r5T0aw5UJeCHnJa%2BDl5nZwvda%2Blzzp5f5P7SRCJx75lIlxnv0pt9fkj3vdhQjYCTprltYdOhLeOCt9xY9BG7JBMsZW2yHpfxJb8iDv3sa1zuK0UsEalw7CRk84MUlgLy9iIImfjxPrgylD01V%2FjItYd%2F9iKQX0U8E8osMnSmcnjlj1Y559GFvzsTNBlGc%2B55YMl7OBFMjmMeA87LBzBzjw1tKB4W%2BY8b2s2pcIDq0MffCvXBa4RWw2DZBVV5G45B3JtI%2FRvLC%2Fvrx3nryK1B0dJv0pBaIJlQnOAXW4aQD0dESfCxlKLrsMfQBk%2BCGhYk%2BxtguMQyjC3Qt2fUCZtWeqK49Eccm%2BMiiAGnKtyUL3%2Bm%2B89MbuPMM%2Bjh9cGOqUBn7lSPOwYqXXFtVfUfzSBk3MTI5fLULmjqwWUNrh1HumHruUlUNoKU76V2zisonPctzEtMMO%2BCl2F9LM%2BiY934pI2wcGx%2Fnm5HLXo9julodhI2pmkjeyxUZowpdgZlaMUZAcX07Z%2B%2FgPansF8BWLRF2bvKwswt8qU2GbEavGWbXKdfgXtbCrAFPXuCofqYRuA8ccdZGgo9iU4PbgM77v2Nr%2FtOWda&X-Amz-Signature=fbe012c1dfa5bb6e89b6a72c62b4f1474faac213d89bec60c8852aea1943cd84&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Y3YQ3LPI%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115843Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJHMEUCIQDrUYfW5r3IP4PLN8SquJO7yL2sUyqoI6zHhOAHFj%2FRRwIgE7XyI%2BCaYyI68xYRxZFL7eErTcmRYBsrN5NtMB9b83Mq%2FwMIAxAAGgw2Mzc0MjMxODM4MDUiDIrlG%2Bfs4n5fPtSiPCrcA5UoRXBFpWQUv%2BvhH3DrcFw4yksylULlAKPYoTwbOgXBv5gBo4YsurNknBiTfqDXGN84vO%2BIkfmBhF5xSgJkRNsSd7vrRUUE9WtJBqJSqSqTrtCYTNaTUVYUQC5SzYcYvJDZSKJCgnk61ZZWCUWTJJ1zztRonGzbuLlmzIQY0fz9oB6v04x%2BlP8pTGRRiwiH5rKyMzL%2FUQZRPbQYSQ15g0XXPoDTT1bXtuQtDB5%2FZ9vBBYV52Fr%2BNH88d4h2rXuif17q1YeX8%2BKdm14BSQPijT1wSWd4QkRHbPPRwAgew6%2B35kZDaG%2FqQ1UfdsZ%2Fkv%2BZ1Jcue54TcAxXsjitUFZYhf%2B275r4RG3%2BrRZBM0uXa5%2BOYXGLE3ADfs1RZx45hXvplvD0DcEKtqSLU08X2ZQex85fjqraabqkwNjmKIZ6NTcdpawpkx11uwe1Wlip60hc4SnUMzFUhMYhuBXcLHwgF5Q%2BZOgeOVMV9p1QdEgRmfYhYuWRO%2FYFkLTVhe2EdcFJ%2Bc5inmBICtTHN6WnrV%2F2%2Br%2FY4IN7AgWvLy8E2IECBTOeuSHPuPIacpTF90xlhWwoq%2Bi2lTzDKLub21tavS0QK5YQ1ys1URrjBLl%2BSQrFArkoh69CGIjyKtvIEFJ2MN6jh9cGOqUBhBHSoRddsZndmi452mW4pQxwJzaJYufxfPTTCtf6lG%2FHNSfK4FbX1RYdVpgr9tJZmhl4Z4YBQakWV0jWlFlZLuc4KrDQB1sbHsrJjL68tcyismvPmnWvR7pYvRWOP%2FtHQFSagpnMn%2FZS7TCC%2Bi3fEfhEIf222GR1d3C6FDFOS9xQ3axMTdRHs047p8b5D5fnIIOCF29qw31X0lyv%2F8AlS6NIP2Ra&X-Amz-Signature=544c9b2aa6c748389406e87426b146e9fc48121867a1448657240ec4335d4081&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466QQ4MSFPG%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115844Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJHMEUCICMkDJr6SoltRw8wsKwEBiVklQsvTpcia8nYhqZ6NpNTAiEA9vlhyzSud1MA7XLOgzG%2FWa%2B5YNC89jiBguFxOSGQUp4q%2FwMIBBAAGgw2Mzc0MjMxODM4MDUiDPUL7E0DAE7BDOEV7ircA2rgbC2Y35t6BAK%2FIYL301ZUjc7oZs9Bsjy0wv8LWchdptk36ZigLdzlMS0dJNCjwWqccaOnB%2BQb48I05FDwb1oR1yJ%2FaqILnEzjMYyPCrSXFPLCRS9xSKEKzNRBQbicIJtJKO5Oxk%2BlHyCGL0zm507%2FwdBcDMfffCK9JWcXN4OqkMiCByZdARpQpHuwavrgeHwskvwLVA4UQJVYaHx8lkDR67jVYAWuryFKFLcIdEtkE7je6ZvlDZjFntCQ0nkRF0wpbz5tnPhb3lL3Yyj11J4P3BchsDQ3JspMZnooECCDcqQNqls67tvC9fLjceu6kXFs5GFA%2FfuLphmVwVRHrP2FZN6%2BPdIAqABNGLeN7l%2FcIG6LoSp%2BpML5MmkK4YUc%2FsEGjyD1PUuGJQBq4Mm1PLEUn2Hf0gEILLlsYv8Xg%2Fv6cWuxItRkG%2FZdgIUHAPniuQnUBjcLsLHsqSLvnXKpWPBCI2HIPi4W%2FL0WA5wjVNxAsU8CGCV%2BAMA8ztM9EQpdEeExUPwPnvb6W9tS%2BousR0YvYRJV3uXbCKlP03xyY%2FdYNz59P7fzRR1rYn%2BbNfzgmYJto%2FA2E3JKuFmJseYvHhdzML%2Fik14xydAaHtfPNm3%2BfrMmWZWcHhdlWVx7MOilh9cGOqUBXAK6ScLyUvfgCd54Cy%2F3PJ%2F06zeAFQ%2Foozlz7uc2%2Fds0kLhHmIQcHMdxdMAMUoACtC4LpnOpfUNGJnaXAAfk8beO1qcszHVFtqkffjlVVCflmjfvaTcYQJt4L1vGwGMMHJABWDOf4%2BceLMYrBGDs3SjMc4AVnmtdjTpn1xsBZsVW%2FzxmYH3OAdxQ97gZTQpz030%2BRO1TUs3lUyzzR3j4gPzEy9Az&X-Amz-Signature=24bafc4139f10479310b6db482a9c6794a2510d92692cf682db563ca7c87798c&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4663I33IVEM%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115844Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJHMEUCIQD%2B38919Ut6eAR8qvfjM%2BTuIv%2Fd9Af4zsPYT%2B439b3ejQIgZYO2D0v6UFEEtnD5P07z6rGUumqrOjI2GX3o%2BvSnmfAq%2FwMIAxAAGgw2Mzc0MjMxODM4MDUiDKFPALxHxVxnmz50mCrcA86mI%2B8FZNmCOMcwnuF5hUWWtLoUNKM8Z%2BA4eeuaqYr2Qa5oTud3Fxs9TbQyw8F9B%2BoPwGCBF1ANPZA3Svd%2Fpc0fVlMSODRbiGpqx8lvX2gWglqh2YAs4ygyuRTsaIsCTHQ0lithd1K%2B295NnAcBu%2FLGAmS1j8Zm2987muHSQOCxmEpKruUZEXD6zMqf0WTLfHHxv8Z0Hn5U6i%2BF10tnpT4wZOgIwHon7PY3UvwM%2B8QqYj1YCB9M1NnCec7ljJPj88y%2F86irwu%2FkHL6Zd64yrqfth7fk3mysH4O5aohJlV3Q1czcs2LAfjNl3qLwKdcqvKTlk24yTt%2BcGbK4h%2FVC2VgaTBtxSeCV%2B5NrtXWb0M8VNzyKMjU%2FySJXdez0qSfnHE0IxQEquAaSWcw9XaqYHpYEFAqzt2qyuiMMKhVqdMTHCq6NfAzRsQ1gApTL0abDvBoXiyGFB%2BpiCDMTfmQPRH%2FV%2B9%2F3cedy8JaIJJElIopkpLCPcXDBQkw6Uu4OtnCJ2bF985nE1DNvA2mKJi2PXEQM5%2F4uw5ifuYYJakw%2F1pySFNfJ8PWcWu9MYs2WGEDTxdCjo87QOLOoUTIr3NFWULr1VFRzQvGWjzfZW8lB4puU0BzHPvy5djyPu6rWMJylh9cGOqUBl5Z5IIyWBvwroR7za%2F%2BykYM%2BfA%2BJr5SVp6i%2FigRjs4mypcNOJwYIFybeFxPPl%2F2reO8RSKRIIuWJBkV7kPJMOGRroqIYmLboydCWuPdU%2FAvb2L40zMBPNVibUD1yK3agym330XF3tTCU33D%2F%2F8uC3Q%2BDMlKYKQMLStdollJ3w%2BhpV9141tAZa7BtPU039xHQhRa86Ocjp8AltvmD6HpL1Ym45PO0&X-Amz-Signature=b903b6cf304e90e703f12e17729b123a6c0c36436ec57d3a238e91b08dfc60dc&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466RBWISQV4%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115844Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJHMEUCIQD6kz6gejaXx4Kk8%2Fz1EbwnYR6SFoXwWHxxeRrQA3Fl2wIgBuODnVlHKq5W0Lj%2BDva06ETUbak0nT7CcnHqSldpoL0q%2FwMIBBAAGgw2Mzc0MjMxODM4MDUiDJ0x6F97XnV6yuReNircAxqPbLlzHGhlamouD%2BXuwJKf4WuYaJ%2BDojDBvVDXNn%2FJgEen970WhxHDs8SnFNL56EjMHfWRxf4q%2F1XBNA9ANLpUt0yYAoZWy4C2Cq1y%2FZb3HNZbkIpWIh3EuRAjDVovpTNsh7pQjZRvtBfrmyp7sLnlFMBjF2yXrkXvolw0WO8LYdmIXpwGai9PI0AGsavaTmXF4my9lRUZgWeGZfm0zcDTMA792PJ0iWGkJMkd5%2BUshse%2FvbHyfrrgQgPMF2bbC60hvt3YcAaBnJCMJ3g%2B3njtTmYNsmECyodpWtWPgVyezjNsJxwkOEeKgDejWQb1klH8jtB8lygWC79H3vF9HUKxXlAf0tutiSOaVF4nP5VplJ3BCKSACUaDpgnqolWtutksuIPF6BJeUrMaQiLQZ8dhN6S7Q89r1FWh8VTxHfyz%2F1Kt0QSTo3r2PAiZEUCqqdqSj0MOiEMe2akWQV0uh1sweg82FazjSoeExaeFSr9QfB5aZ9IwrSxkkXkcM68jD0YCQMJK6oB8lAadxVT8Xc3EnmTHRSG2y4t0hv%2FWIpZG6A2wYk2lIr1DhhM7m9mM%2Fk8gjximQsA%2FeC33cRBg6QBVJXJscmUMlBBr7WwLsKQpNgZGjGaNoiiA5QTQML2jh9cGOqUB%2Bs56iUqmUlvS4IRlGgT63WzNYxpzPEhAwHeA%2F6XnJRRwerBl5GMz6wSPWKVSlnZL%2FWfQMnkpkTylynAXD49u3yN%2FSechTHejPyIhJj8sz8uBnnSQ3XqogywOp%2FbFv823ENkZTPl6jze9rIX3QzSyXpKW2ubWCD1Eu1SRfDk1ZahFnW%2FLd4GH5yPwMcNyczIBVFs1mh%2F2UTe7DETpPTMG1Ytq%2F0Yb&X-Amz-Signature=7717ff92ba9de7e30dfbda00d9cc48e02b99246c9d5580445db4e0d66a99fa5a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466UQZYLVDB%2F20261028%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261028T115845Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEDsaCXVzLXdlc3QtMiJGMEQCIBk9MpoFaNOXNzLEqYde%2BlfnHeJvoLMKiq9gVfOJ7y%2BTAiBkEdbH58X4Ifkk2qMTFL9pFMgdjaZ5E15go8P8V%2FT4rir%2FAwgEEAAaDDYzNzQyMzE4MzgwNSIMcSXtX0g1UeLoeRStKtwD8MDzw0fVisOXf518Ptzn5nq7jN4xAGCKkHXMEu%2FrKPt5IEiAaerdWWLlCBam3JexLLsY%2FA0cYMBWWZ5b5OY51%2FY99aqBN7GWYsszP5NWsR%2BalyDaV2bpB9DekqhGgxrZ18nDleERER1pP2HI4CWmM%2FWdyci4ReXm0Di4bJSUy6F7uNggIugICVvMrbrvnHh9XSelSLjrtnjOY%2FZsJ86jE6bleInmOFs3JISTNByW2f0hmpUJGoObTn41xmskM%2FEa3VvhebqqZkkc6dr5tqYWbymfH9ZGKfAItSVmo91YCIghBRnXLMKUEwTch7MktYLXCWD1N5bt2b8v33h9kI4%2BYot0U5k2eIOfpDqCCErua8Rnr2LaSPS86kF8JQNTQl03sxsAGs%2Bg2jIyqJtZCeIIOh4JNMYE6H97YYds8dT1FkHuGZ9iYubWCGrmG96q2VtLyRVBQh7VmXn7zXJVWzLvbKHVyQRHCvI8nUI5JjeI%2B%2BgyDTI%2F0Ks4aHhVFUMZb5wnJYQycn9HdKVkXtZ4S5%2BA95%2F4ziL67rE2DU%2BwBIIQ02XbC3QXH%2BFvB2Izsxu7jMDCX5oDCffYHWtuIuugqCKL2zMopxa34gktPLW84BFLJlbUsRBqXDj8UtGi%2FRww%2F6OH1wY6pgHGje9Cf%2FA2jBgchPs1Zwi4g1OMhi%2BHtRdzHmYbh%2Fw85Cz4oF9HdO6Jy0Zhqc99wiuauEruFXLyQRT7FnkL5GAlHqgr7%2B3sMUIm2DisdABFwYwxc%2FXZf6NM%2Bif5oVbvQEQwVEpbdhPZaGsfd6AvIYAwVLzOWhBdGSN5kmjE7J7XM%2B6Qgl8vElukRTNmnx%2BpTlUldpeCm0LmwiNu3%2BVTT8f%2BtGfhWCe8&X-Amz-Signature=7658a62197ad9d764590b85faf5e077f8aa39f477257dfa9579af3a9a3c54d25&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

