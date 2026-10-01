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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466QSCOG5PA%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033849Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICaO0geeA85uoOMgfyBHNKYPh7uW2siEx6MGNKMRJipgAiBRh0phi3Ub2XAP2k4vtH3POid65FZX136zrFztol6EHyr%2FAwhzEAAaDDYzNzQyMzE4MzgwNSIMdontboeIP0Zi6EHlKtwDMX6V%2BKmBqYbx3F9XYPUX3QVGO4533F6vNqXvyC%2Fg95wllvNhpyp1%2BpmT0fAvko%2B5Pj8XCQEfl0tOGgzEM2h0MGHIPfGcr%2BXApOoA6CLyUSEGdibJMTxTXFCt%2F4VDa0ZKFa0u6gOVV8dW6ejdzzcpSbwvgYBE4UNZUSBBfVOVi5lX5PXp0uYewyIQgpTloiXxF6tnsMsxIfvkb9NfflMUf4Cy%2BMeDNFezpsrn6tNIL%2BQ%2B7zAb3rc27LEzcFuYf3HNPOW5tL%2FQi1dmaCUWnrT%2FZskLOfCmj6%2BKUcub2R6qTPs%2FUc1Ub59b2Ko3jk8hWMQ%2F5Btw%2BGv%2BA7ug%2BX5VxhmFCFKMcHVIUvIgXoEx%2FXMb0Dcxdug0E3kXSx3aBDDPeTL7gHDpsR02dZBe%2Fd4JYWHQuAfxHshTbmXhnp6eErtIMvHcmEewcJ0pAcPmnqsTT23FZot1GWe6erVsAX87lkb2NRtxxqWBbiSPF3NkLNITc8BGg7%2BmFx5wLH%2F5epaqFo5fXbBBjvr9cB67Ajshs%2FkSneWGpWPerpoc9rtMD0EivyI5AClHh9Uvh59tApWPuEMNJrpzmT1oiYo84pAFfzn0KoJriDOGTFjg7UhHj5V%2BGGE5U9SvUpafArTIeu8wu4P31QY6pgG5fnjLHf5zNQPeP1pyKSaVmSNs88KOpdjtJSOHNRpFGHxHl8mf50JyTgWb4ZsAQBhs0glJ80kXV%2BpqrJY9e17PvyMSShEOWaL7RsgsQHPlZb1lIWNbhkQJOrKXKOMUnb4XG8wG40AXJiZo1WbfbQ5fxjuzU5j5FmZ0J25UVRU45kTUeIzt9ygO9Pa04qbPtEydJumlU6IG8J8zQP%2Bor0oQyJot7lKN&X-Amz-Signature=813e0383a0408b7b7e5cf0a59fc659a5365528132d1430a4fa81b6a578baf214&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Y2NXOW4L%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033849Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIDlkY6ri3PMWgDrPLnlx0V7oBVJSHHaQ3lbmaARpmvxGAiBoBAmWF%2BZaI6LySrhLi8FzTjhzxiNJi%2FnMAkK1dI%2BnVir%2FAwhzEAAaDDYzNzQyMzE4MzgwNSIMAVIw450akQcHZMYuKtwDNvMdhyUffqZJj7KMkntcN%2F%2FHGvK4FzfOVYrrjrWnNOfvbpg4PXMfp4WTjAnkC1hCKLG2vyv94wWgE%2Fm%2Fr7UTeYXBF8pdivfMJCGaP%2FTmryoInOP5fSoa6uam1qe5DE28XbXkH%2ByNBAWXvPqblTW5COzoJNXnswYyvNPb%2FZ%2FA7Iusbq6He7xJaRzo%2FHRsogSfWJqP%2BHsf8een9K3%2FZM4tMKN95HBwAL1NIRTfWXQ%2BuvK9iR8agjZnTTjqmMC3kubKSEDdRLGRNElebJ3UuegIRJbo2fu8vjIdXGqCNsAme9C9mUN7UHWSBIbLAIM%2Brkv81F0QS48e2HBo2Sc8BfPx8NhcuGdBwAzSwATywdw53BbwVR%2Fm6hYS0nUxSHnnSFyMnA25%2FpE8uB7n0%2B4oN3aQowR4yOStgphM93oZWwutlG2xWEV9oh1kWUF38mDpN%2FJTIVxQ1uQgg5dFXXURJeu7lSWUy0g0kFhM6qJMf0wCcaRm%2BdVX8qGgM9b3EUZ7B5fVkg2AIcvyu6v8aQVs0GQctVeqVAeAkMf83SAm6KZluVKRV34sKFrgyGx%2FY%2FUR5Q8X6gTBCF95N%2F02kmODlY1lsUjYau0%2B0vVyCVLme%2Bj8n7Y9A78J20c8nSkW8jcwj4X31QY6pgFCSKtvLZ7vUMu3LBMjsUWkSzVWcuqOswcOZ5S8L3Cp1EhsyyL%2F8vq5XZqGQ4RL%2FFTTrA0fB%2F%2FnwTsI5JADlx1X7EnN2KfOeyni6py5OuLvFyTUsFVSpK6adW3oqRsmqBkBv2GrYk1ZEWhu9CWJ0kSQ7ZaBqUQsinnaXzv9muvAg1k%2Ff8epphEDHVlu6aTrNhgKCaLbHPjIKkEcz%2BwNz2eQc112tVGX&X-Amz-Signature=f44cfb685e682383352fc32835f4189c7c76ecbb753681493814f2ef69ce57d6&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664YBBV66M%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033850Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQD7lu3dX2jKTZupVkbB3GHhqV0Ksajpxvi6MGDNmtWSHwIhAKXiu6NN8yclS2c5Ke6qji4n5GfAlGIUXFvCM7BBSM5YKv8DCHMQABoMNjM3NDIzMTgzODA1IgzripmGQlSw0gUIo64q3AO6kXIiBQClxAfa%2FTxsb3RoAwtrBebwUm3nD81J3IikAPoQrQp0QyrY8ueaJDLOG02LHcPP9D6hyUy%2FPSeCZ%2F9%2B5Azwv2Ca0vwybT2CV2DKe8l%2FFIcD6gFuDYQaCxVAN5Lr2KxyXPILNMwAkrWZM%2F8TAe9yuWwrym%2BZ5EtFsJ8hSQIkUpe2Y8nPDoztATEZ1upI7iBDxWfPylhU9kngsPbxqf4rJBt5eyrAcMR%2BGOikHuTXqCWa77hgHXeXOqc4ftHplOTJcwx%2FP5sVBRYlVEyP01K07Ep6jsyEcqjU1mlk6XCqpf9fPxdOjBvDAOMvSA046UHFaYbAIKjG9b2HgfpUfbR7Cq8yDwT6a9fMchmhKaFNv60anWnUqm7uvV4fq6zNlc58m%2FgKpCQzo2UVjwIP5xyIzEOhQ9FxZSukvRN2ynnDQIcWfofT39QzVeLTtuvu8lwKiKEtGQTAhe5Eg40WWJtP6sIIp55xVtklzVBmUaInIkwS11IFjm3nggXdFMkb7EQMGPUraULe%2FRr%2BS9NpNIxr37py3%2Fwpq%2B%2Bv4wChnz4Z%2BU4YcjsClgyPoewaY8XEFz9PU2s8et84BYRir7KT%2BmlWLMhVXYEvHLafZVOebMVt9PQFOoSpqf4trjD6hPfVBjqkAYveGEywaJUOCfPdVtH1vyrY5%2BB3ZrnjfGauUZv0mP%2BWJHkztw20b7Vffu2Ny%2BiFMqmYOYg4UKwyWO0ow9INeVAs3V33cJDcBDtNoVnkJ4VY%2BIvhmiBHx9Y8nlxTtzRB0ECqbK70NZAzIct1ppgO3q%2F1z4xGD%2BDWbDGrmLv%2BUjRTDwbyL8wRK%2FOjf4qmgaRmw9KJI0alEQ69OCpMNH5t5PeSQSmq&X-Amz-Signature=b9d0b2e27515ad6cfee138ecdb6df39a4f10cfad4a868d4ce2c79e350aea6853&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466WWVZHNHF%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033851Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIBFNDfHAr5TCiVCfT3MCp0HwgcfdYfOwFEFtJEvXZsYJAiEA5frbYAcrqAC2p%2FenrRzVG42fF6ramZq2SkBINgg%2FFw4q%2FwMIcxAAGgw2Mzc0MjMxODM4MDUiDL5zJgjtQa%2FXb9llKCrcA%2BxnkFsncp6CJh4FjZ9f6dUDBskfXog6Sa8DvXQDhNJGaBdUfh39tkU%2B%2Ftt0Tf5ze1Sy6l5qY2AM2Jt8xYcOmDDoUOdrRHbISIbYd5pImSQyIrA9zyMMzoNbpGjJZJyoNuuCPaGHCLeYgY9i7WUwZ%2B204odPUge%2FZuT34EjE75A7czRKwXnw383JUSgdmUwHxGAFjmiHefYQLqp6TMeZ%2BkZK8FwgoBpSdTSC8XKD8dsykVh4btyudRMsGREpTXaCIVoGAbVMeskEhKyLOPKUv4l6JBVa1YYHkRsPgwqGYillbhH0BNcMoVaD59YMOlYApgfLpat813dv5cynSQAKfs74HvJOjIcJDt0zItsDI1QvCbdaOs7xd16cDQaLP3WHv0zPA77oELLUe2QbGfeWPQ1lPDMePWaxREdg%2BhbYTKMySZeR2DoPb49MLsyXmke0%2FRpDpRHNA4ZIii5IbFbfXJPoQ%2BTqY9L2y42El2f9Irl9wQpiCmiLHz8fTv0DFcrH5EHWBooTZhAPWyIl4lqBNaXinXjozFebHbB2okZddw1qqJO9FAMNxJPZynwThkjs6ppvVz9SiPRG0ckuqiXLI5lvJ5MRGBgwEZUTARQoU7dOD%2BAapIFpUaZ2aWZTMJyF99UGOqUBfuv%2B6nkDoHmuIHPaqTSOHj%2F1Pz1z0BuLUQ6KSMVKQEAfPVZjEXw429BJf0oEmF7qsKwT%2FQ4MG%2FJLiOIT3QiaOvh7Fyc%2BGUw77gRI6F9bw%2FTuVJuGLdrZZm0O10H3tWXebTwLg%2BVbDR%2BzXJ9rPohF3k%2FfulMjtV5vN701yo8aonsHOb2Lw4pk07P3hmo2TiT2KC48KB9W6mhRUQg3xfVx94OxCSu3&X-Amz-Signature=13c4204c5852a782e8f5227bf2442b1d3f3062538e5142374b86b7f1f03372ea&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4662LDR3MEQ%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033852Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQCTyNPU6x9SUMzYYrDAyDimYK75yixMw5mCZ1biXBfWgAIgDkGUsHo24SofLrip0J%2BbJiqtOr%2B%2BRbw%2BReBDTlMfqvUq%2FwMIcxAAGgw2Mzc0MjMxODM4MDUiDGAyhoe3LJchQkqgyCrcA4MuMbIxnq0Fxee8tSzQKTo541%2FqZd%2Bi20KArcf6qZ0TP9n8lfqalY3vpaUVY3%2BPGag1BFMSW%2FDiilBZrrY%2Bg%2F6zasFRGynNtRtw%2FXwmzLMwsr1zO9eTyEjPJwb8HLJU9wj5oQt7vCtJ%2FuxyOeOwx9PCvheuWKTD%2FtT4B0B0TGsnO%2Bav4f4mFCL2m9Fnm6l27LFeHqxlIkoWjrvM3QxJKvL0%2Fq1mnIvIaUva8HxItjhQoAhiCNzat%2Fx1YfUvWw3w1kdNHy1MNOj3TOvbVgoCYlQSezrSi0Ia%2BaUULxS%2FTIi3Hx%2F9iazdJs3wtpfG%2F4Qc6oe%2B1OQBaQDH5jXas520FlNwztpq8JrlKqJudWmLpnkghs2pwmrbkRgH7RjnoGAF2LQrtdpA2ZvMtJ0dfs%2FELmE3lgSksuoMsp%2BNTiFEkeXIWVJ4IaRomlykaNFCLNWDCnH%2FnaFNAHvq40v85yJUCk7oNLggDhCoffbUPlfMrViEBxHl8MJwdJZyHELVhK2zESuq1xAJ6lCp78tNnHfOOw8nKCDVajbaX%2FR%2B9yTEkpHA%2FZqKSMebdNVGKyt9uVequVySTVcO2hq%2Fq0JXh4IJV9KFWLyfiD81nD2K9kbgOt2eOqTf6woeWaKpB9orMJWE99UGOqUBVO4duCap8t06FYhdaTJq60yQNaLBaAB2U7qt68opbJ5SHj1ODELjZz9pjrXd7v1vyXgKbnemnRjjiZSyerFAB9YA%2BoU5UEjIIGjKCd2kSN6FfJOPJVxS3zA1fMMTecKTPuTWKijBdDYps7LaiChuvMBQzki08HT3kvzpYgnd9G%2F6PyCyxf0kyZxB77FvNwvI7gvU1lHbgknOgGxGeXWevEgctfNm&X-Amz-Signature=4f2e459f7907bb9f3ed880f2f969b5b9c02215a0e4f26e280d5a0922a8a25359&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664SUAGIGQ%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033853Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIAK68oNh9Lamknws%2BuPGpulsbbSOpKn5F71OzEkr7dSIAiALKPdJgbWetWdrbaXiRPYtIbkD2AvQFRy1rtQeTIDfKCr%2FAwhzEAAaDDYzNzQyMzE4MzgwNSIMZD95UCXuknpkUwwSKtwDX9y1YbuvMPUq8Hpa4%2B8lrxzOUXwPIpmwXNn5vIqWlK455WsZ9wxdJPhA5WEfz18TWwlPJQpKQYoUX9jkAuNMUmNpJAuqBT7oSx%2FzxuflpFqE2HVru0FhCFpf7n4maABFxRy5WQ4Fp96gPg1TiOtJlFENdCnyWpRalCJs1HLNbDkqpEEHl3XAwmZqqvWV8E%2B533L3y8bHFbiywP%2BuEX3DIVyoYp6kRvAi0M2yA3VmRvbOS0UDv%2B4bWjJeAV8L5bJIxxNS8%2FV5F07nYAnBGmO46PoK0Klk6ouFzzvQfhHMguxOlllD24IbhifPmwRhaoAFJexwjf1owIhcxJNIWN3R5j28rJB9S9%2BNEvJdI8GoT3IPdExhuY0ZFTEEWaaBORWx%2BGrNxxjaD6HMQpkieEeat3CSyULjsjyEf%2FaBmHTUyCOh5QwvjBMB1OLoblJXrOB019gevuFi%2FEiHELLxL%2FXbgXJcSb%2FNAsQfou6HZVTc8W6HPCcFnVqizPs8sIL218aSGlm%2F1WbZzvAOz4EJ%2FuPdvgeNoZyzGNa01MVzHhcEvDjGfVxbWYc%2F2v0LsyZOU0fgTt%2F4VTKI47OB3mGoToMt8CakACTghP0hTN%2FmyFUc98PfUK3sOQHj7W95Kzkw%2BIT31QY6pgH0q%2B0TXw%2FY6C09OtdOdIaGrvhd3z1OrB7ETXznhlT%2FixfPav5U1M3UAQjRSvzVqFxLaTA13DehYxcGrJcXaUmjvnCXHdQCMhJiPM%2B7aQw1znP49D7CPB729rq6piDwu1PTm4D5bz%2B%2FL66enR2eJteByO6TXrMgUeIvJkX%2B3LUOjm0eoHBM4OP8Uf31CFY5F5MXnGYMAbqO1PpWiqZw5jPoXrL1L8Pv&X-Amz-Signature=e150b483d05a76c266922bd50da6bc6019a250648fa0916b144a08ff1381347b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466U6W63KQP%2F20261001%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261001T033853Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDwJLbEjhG00PtlzZd1hYM17pFDitW5Ha2DtcPXadPLVgIgUOmh6MvRChwWFqV40bS%2B94vgyOKxt07sA1K3LZ8gGqMq%2FwMIcxAAGgw2Mzc0MjMxODM4MDUiDNDlV0yosz0CAzixryrcA2S%2BXbWITsTTo8SkQ1S1cq81B0ZJthPdXOLQVs0xTIjrkuqcFsgtF7qDxgm%2F5eY1oRMpHyNQ36sGwRyZGpQ%2BwiY49%2FclMCx1JlJcLCsGqC6f6gCKnm7bgngpgZzJYSsKM%2BEynKmXdTFNF%2FvPUUHAp7RtDesZ0t0bX6wXyaCMAerdAQrxzk213g0%2BmM6OiG0uHtHH7cnVY69MGuNbNJA%2B%2B4Ip4e08E2%2FG5qDokaOpvpjN7OD4pkZS75OJplzeyu0krg%2FP1MN2WeoV70EIXCZwmNQlZXTSlQ2GaLPhigmbtyXalS7sveBWdJyjn4KMzxv1%2FoU30NetNwHOiHk6yVq7E4UvGp2dNJS0Evto0GArBrP6heN917Ic4JFhmQc27ubt%2FGsf7fjtLYxgKP4Z%2FEmdZtVPySNBhxUB93mrSz1xSuxqRybN9ZAYXXzaF%2BFdpCEeZvocjzE8zyJLlXPNHxTqDuFGLc8dHIiQYXzw7gBJHMyja1V1%2FhIOu%2Fs7zZDdOHZRYWL5lf%2FfQ2WJxMo9AJWSEujxYrufCQxHvJQWyhoBHvzv9PLhtQK9SrbK%2B9%2BuyGWmgu7Yd2yvAOupPlj24GzVsrQrnKxNSaTE6pI9SwJr%2F%2B1V3bz0QEvBZEg0oi3iMMKC99UGOqUBTGCC%2BOtDrdOlQLN2X57XTmuDrjYLNW%2Fzp8QXWiBPwp5vwmeIY4Qb8ovDo2FZUsWXLW%2BOqrMIIZYfcoPgakFa0WadDi5bLcvTcBqrZ8ifwbHfCI9UcbZ8lxGgRsal5t0Tw5TRXhDeFL2lbXk2TuDZ69U6ANiIB2%2Fe%2F8V2CC2Mii1FLVNpXTE91axJ31GQBJ4GhXt2ACh9OpqR8um9MpWVqLgN9V7H&X-Amz-Signature=20219bfa1a68c4493660bb0867eb3258fab8e2d860fb0997a6da7e7a9be0df45&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

