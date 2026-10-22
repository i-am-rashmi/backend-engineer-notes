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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466Q3JSJXIZ%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110012Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCXOBOEibpKwJQ0RbS3GTJd0iSb0MsSId1i62jV3gPDggIhAInSv8mX2VfiA9Ad%2FiAXM47SK%2BuJUz36Te%2BNYr7lx8PDKv8DCHMQABoMNjM3NDIzMTgzODA1IgwM8BarS%2FwaGt6ujygq3AO%2BO44lmucmjg2YWBuKb%2FUmOb4Bufe8OCwgyjXslUwxPXXcl12y2f8%2BJfahj2F%2B2KDgEaMYEg2nDk%2B27AzW6GyozsNfoQTBk3CtES4YSFBOHFnp89CzftNo8fgdNbASJkMx32y1CSjj9imOMCI57Zm8szPxto8N5y%2FRJnDIsTQpT8tHa6UTZTXRLK3Nr9z9mGFWvo5ZB4fYN%2BjaddolF2h6Bee0NCZnGsdE9H%2BdxyyXiBl9pNN%2BzHhp1ueG54BDAT%2BLn7BrpO%2B0VRQAmI4tGtlrkk7tcBZCel8VicwF76anOt10VyBNYDzPCXBRi%2FoU64B%2B6eUDUyoMsFi2QvsWFYNLYxvSGjTpNtktxvTBVz41StBwIEq6QzeZVNry6wm0vBLF3L5%2BD%2Fr%2FCtVeiOWIpRU86NuaJaG6lbW7h8dUXuZVuazPVXa636OjQ1w4Ch%2BkOfn0ZSf1rYuwy7Qa23zuXJ%2F5%2FyZgSlLtYAKn6G4si1%2BsjLyC9eNR1pZOdWHU4RBgx%2Beq8zOZDwY2BMICNJOcydYtXRLyrCFAEkYwH54rKZywXDZO900C4gVLpAEN9GAJy3V4pkeznfhY%2Fsvtpsa0gvR9x6pC%2BTxZHCwzy%2B6OQMtGgUtKgnBAHCdcIx32XzDzx%2BfWBjqkAY5oKAMY69qcLRm4oLw29woKEVDddLfcHz%2BB1nzXbmMoK70V3mMq%2FW96XzWznNs6cZ70HlEtRAwwGE9XTelC9%2BGM%2Fr6yE8kWRb8NJlUESqARv7Uo6pWe85ypu0R1Q%2FcBrSmhH7pATGq4CpmXznpXWqSBIcwWtEW5MnTzwzV80wRo7dgivwsMEVhhi2L0CUM3LgOpT4HAB4vohgzd0VHstauEx8br&X-Amz-Signature=ae655e81c451db4848168d44148d9cf4d64b81e15cf9283bf62db79b863c439a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466RN62EE42%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110013Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQDlU5jQVWPb%2BV6UfPptKYUt9XM5Xzt1HVKpucZqtHlibQIhAKEZPIr9b0KyvPp3q4EjHRxr%2FnazKTTXWt%2FJGu9eUFv7Kv8DCHMQABoMNjM3NDIzMTgzODA1Igxp2KqE%2BFdUkOPCuR8q3ANA0TIU3Db3Y3adrt7MP5MQ3xdXeNvLavrGQCd4HaU1Yu5ZtQndGxduZqTzfNHTji1hz6P4YUyJ1g%2BAXq6s0qAa8hLhp70R0%2B1nxyhMZHre3RYiYdbsQ1nqVJZWBDRTeHO9IJkF1gqt5iUJEQ9O22lTYFuQslF2TzuX%2Fhil70d1HqXSoUYHzMfRBchvG21GczQZ2m1xoQaVPZGLws7tXJcj2UMqC9QvJ2BepW%2F%2BJIobmmmko8MPm3fdvVSq1eyaoH42ZjNnQlaCagQkMkg9YAHDPgeC12gqHK9AcCBBshGY3QyWgpesGyvFL5ondiqkNFZdhjTI0j4aZkCtdP8uri8DXy2iGgqLEgy%2BVb4x5dPe%2B9LE6C%2B51zvUUc%2BsdB4RccF5EoaI%2BEfQwCGintMA%2BSZLxooZAMlbYg6uUdlWQoqe%2Bl9WaiIepkO%2FPyjOTBKpJ4yMbqMco%2B4U4zx6cXQn6CN2%2BvRUHMH8wtOP1o2vdxTCIu7lcRyRKlJZaJiEIGr3m3iW6hW1GZ9ivClK1NC11a8e5oRuyic13uRyDZgu9CNHretfh%2BtPB9m38o6UcUb014iEL5d8dCqIoyiIe%2FeI54xDlDwnoXx2OKVE8Txz6GZdfqZSjqD5Z5nXr91iAjD6x%2BfWBjqkAUP8%2BE79Z4Z7i4eC5PDBuYOIt%2FRyg9AvFl3LPuF8CBFW2RfnEhAllylf2ncvpeA3m%2FJHT4BNXfHWchntMMMQQH%2BQ5LpERqIDX3IxDH3WCzkO9vcs8wHTEsubtGKZXEivonC6eHZ67sn4wLpBNXbMxOMcsUZEz5AGxIr1j8yrE4QMf04lf%2BSY37Y8NFpMaCgX2F6Gz8ydepakjnNN%2FeGvtAZ%2BtYfB&X-Amz-Signature=a448322296bb0f32a6758e01b34f21849a8626ab5712c1b82ae833eb6eae6708&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466XLPWPRNI%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110013Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDyN1Zz1diSNTqsIuqhRdEOlvGf6FVlzTWvkgS6b8pvYwIgTMEoM3lzDqN3NJx7OtGO%2BMGmf%2Br2ehoF92fANsjw00sq%2FwMIcxAAGgw2Mzc0MjMxODM4MDUiDDa41Xg5M3fvRirKkSrcAxNHoJ5uuu2gYqUnF03q3keN5NaC1rmeZeaP%2FHhdq4gcT46a6p9ugZ3XhsftKE9mIcY4ynJ%2Fap%2B4%2B6z3thwhIyERrkg1FX9QU2juYhc8EdH0PZhVaUyXIbbrRccO5CuPFA9ZVvW5oUZF6i9sJnRWZrvtGOwnTJ2BpdEbxYTrZ%2BBNiUo0d%2FJA01pq7%2FnX%2FpkJ9WuGE459PEIlN5IakboqD6HrD2MsEZfGJ%2FdYe6HRKZAXbJG15yJS7Zo9B6PYyyc9bQFaxG3P9AfSwiM65SbzRI%2BEOuoUtMXnK4%2B1OjnYKk55sgu9wGDFJD2Z9j8c7tRcE9PuZBIcwmtWFbP3RrqSocOTuY1BCJqqhY6lXWns7LucL88zcYSZC5Cb2rqh3yL3sT3G7MLYZbz%2BaW7E%2FwF5e2gNk5dyAfjj4yKyRDCPbqjMHxJezRq3qipVvfkEGMXJSDpfx0TqFH7eKep6axnKdm%2Fi8VvlyVcU8hsJIsvrzCqBhPqerZ3LKtzz0A2HCHM%2BxQBEkwyTXQZcTVp8y5bksC%2BZsTmnDY%2F3dqrASSLCzevpWo%2FsKWTz716XSw8VydTX9FRlR1pXTR1FiNU%2Bn05fE0tB6fCA1%2FfK1ElK0VSDn2ZNVfnBUPUdAafDIjf9MJnI59YGOqUBpFSjiaOOD%2B082TtasD3sCpL%2BCgb0xuwv%2FB95G2gyvv9Kz4WqfAGqC%2Bpwtlj%2FgHhhqpbl7t%2BvnPmUaxNcUt3vfNmo%2FTDM%2FGCwu8A5Pbcal09fnZ7XHSrnYkms%2ByPTSZjuEDZUay3IpZGD8vQeg0%2B7o98FHv%2B3wNmqHub10lrnJxQN0g1fJC%2FIbChsgso4apqNmDrPeOjhcjrPwr7JvyLJR5phwj3C&X-Amz-Signature=2a15abad02216a3887de564e99aaeba32a3b79b00b5373b5d84c92309487f1f3&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466UCNWB2EF%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110014Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIFD%2Fm9FHN2M5RWhLeeDGD2PrGT%2BMVUFM66Y2xyJHq%2BSGAiAYfJryXdd37AMFbOqetEB%2B6HGRCwhEZzKzYAtdbxFtbir%2FAwh0EAAaDDYzNzQyMzE4MzgwNSIMGou75Ng5JZUh%2B%2FlAKtwDNTRBVtEPQCgTYi3cXOfDqZOvWLBXFTsUkNSrvFj3Q%2F78jUnSINVDeT67GLsynN3DigFaL15ul7%2FQRE4WzWfd6yx6dTez45MYnkTsug42nvZO%2BcHmsQDbl4JqTOPcSXz7YdXrD%2BtLTqmkS87Wjorb%2B0XRB4sImHt4maceMkWW9afiG1uYw0oOSSFXMN4H9dUsjCS83hDtI9fk3CN446rKCYzGJ2IIfy2beVdovW%2BsMEcC7H1jKbNmxVAz6r%2BtYixdBwVuR3c%2BcxZhJcKMAwyq9hq%2FDODO0kXm9bZt%2ByTCXdHZGv2kqE%2F4qmoUeBNbUQX9kx%2BmX1y7j%2Bay3aVrffAzpmJ1KFIgyYByoqgpNUWUpJgkivm%2FpC%2FmImOWSKOQTvw1VY%2F7A6URC1Tjkfleoev5ChuGQnuB2rHBzze6EW%2FH8an3yWXDuJ%2Fr3H0lGMbB%2F8UjUQkBxcQiDk6p4jvM%2BOTNYRUX6%2BWeAHpT2MrgNZkbUs86SQtFoIK0fEaNDyk2K6L3cnP4tPCbE0KRmJAFfBYeC6Jt6Tlt9SOZ%2FsbKpHJyrssEnR3OcuW7gXBgOz%2FTgIm2Kk8%2BNIvan8DiliZSSPXZUDG5xypz8W%2B%2FtpCgJPn1%2FPQO2YE3hQM0X1p4BuQw38jn1gY6pgFmfZ6qprDK5KCHtX2IP7yHq347itAli8D%2FvwxK7X6%2BZmVgBY6PMvhXiOHQV9Vki%2BNyKRDDua661B3ddmOzH15ZR%2BQKhYpjzyqecSHewLu8BzCrg3xzuJEWTaWj2N%2FgIStY3yapdO6kTzPASP0lK%2F1RsS2QoLWbACksSsNw8ZczOwwZPqZ403fap1hM8mk24ajVp5GRF%2BBlQwzLXSe3NdeI8M96re7L&X-Amz-Signature=8cd193a4d329873e8d0931b6015d636fdb743992810cf9cda46d520a07838414&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4663Z6Q4M7Y%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110014Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIFTETP%2FOyu4h89V2rD3MtR1XtPoQxo6xiTC%2BpkE9Lw0nAiEAhHNBS7JQS1%2BiXIN116PxH99xl67ALp95pbgRkNzSmccq%2FwMIcxAAGgw2Mzc0MjMxODM4MDUiDMSvwQdMQboIHQRsXSrcA8Zad04AiAPTFD9RqbICuRkvmMm3G4qmZQmeFY2IM8RvyR%2BKzrjdikkWspOcilUtyRvDbUNcVJJzDmFd1LFi6qIp9ExY7Bzn6rJnXI1qYNlE%2B6cyIIWtVEedCiLZvxJzZDl1OMgu0bJqhXGQzCBJr2f3Hn2ITLzNnuRpJmlvBbnJm25%2FHT%2BCJHgyuyGCjbU6xEXveIsvlLthpFAOooXbxV6KfrFjffGo7ldLHGPxldpa8ZWS4OFyOQBPYra77JIo9hLY%2Fw8JyjOT5zR%2FQ9n7dJEmhOM%2FiL3rejx%2FlnBl8%2BLD7FGg%2FamwUCrVc8%2BEql0aVMvwtz5FDdJV1g2oThEF4qka9%2FC7H5InWt8omsdqOeeMP502ddO59bRBU3%2FSlYCXOcXN3oSYI24yQsny9AzdkGLxqetvaVKtPBOpjchvIRuaKoC104RXWLWEtra7IBB1fyqQyPBdxDMH2cyOWEV4lzZDuLh%2F%2BZyYCygZrsHMoNJthIKXn0YNBYEPHas5QsksQc1N%2FtbIdUoRzYMBO%2BKYdIhhtwAmqQHJ6%2FAYo6eyZV%2FcIO37Vqf4KVyG2YBohwGJ5ppyjtPrxtxIdsHOy%2FulaIECliLMruaVmWv9n4lV2zRj5cyCi1%2BhghLKbSUrMJPK59YGOqUB2W0CwlT8iBZlfy1rR3VxIdrVkDf0FU%2FeG6OmbMeZNhSXdtMlhb5mQdg6%2BjujTbukU4wSA8gXhZygYnLCyzBf0udZ0EB9CnzL4ZbJWhZzroG3RFQ5FKU%2FD%2FntjImlNCdR9b84u6Y%2FyTxg1vfnKZjXLW9ZKiPRH1qfe%2Fp%2BPYutvyAPd6ERuc8wyIaJHgluak2wB2r5evxAS8LzPXG%2BJsf58gwc2caU&X-Amz-Signature=3bda384707acf3f4a9277d8246f991efb791c96a290586064f5d0da9fd83b4e9&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4665SSU7YIH%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110015Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICdaSLGQKjf%2BRt%2FtkvWyslffYAXhvy5UjIllKc4BvRr5AiBuHCsbs59qi04hRSkKCSnmujMk4RrW0a5qJ%2BSDN0XrSSr%2FAwhzEAAaDDYzNzQyMzE4MzgwNSIMiSVUIwL%2FkmD3bRBQKtwD98L2ViWJluDLN2RHLDtI6qnQquT0fg8SdrYH96pTJsoDxpFBLHv%2BQjhYuYUG026JylibB3MmkmwOobyy%2Bvhid7DDJHpPMsNAtDwwFSN4lgpjXJKGWKZBsZ%2Bj9gTOgPMWyPV0ulAXltLAr6ITNVa%2Fw8kqgIQpRZ%2B7VOsuBHu5j0eMWZwqOkfBJIq1bm15i07xvAIHMXpop9p8YTsjfq09q5IRI6fc7efmBs6mJLJbpymToreKRcvxn3E9dyOS%2FBEY7MhXNpRGcVqWCoJDJ9l6IMFR1e67EYrl72YhhuRJUwgNGDxDpiGAwVZ%2FFzaRg5lTBm3olKCWEke5ASjjmJQYiqtlk94pvvr6NFkNAAE9ceFhg6YUPiYdcfF4lXEkGR93uQLrIxFkjkXWwtREmdanUgn0PC7VD8qqEEmdmLqC2lXaq0WEAYMuDErss8qVuH5phCtTJpwrvIthDFNAbtvUyiexwmKY0PlQdUUWpFwFYD5L9q0i0%2F5w9xJW35SWxV0ldkKoBVgbeoykhzXxZVjijy6hrIKEXnY26f2%2FSPCRyv5DMf6UgXn69fEJcxU%2Bj6FV7XkWwtG84XIsYEtbUOea4Hmre7YMXK%2Fmrm3ZmWZmgyD84bpNI1bhWtSCgbUw%2Fcjn1gY6pgE6%2BFtB8XvYTamjIfEH3I%2BS7tqOIznPrDMIlXU2cNUHcEuEFWBJBlf8EASU408%2FviKhEtVoWEOA9c4LU7Aa2aauZ6Mg%2BB9%2BMCeJjacztThMTyIv6sQe7z1T4jyYwREgMP%2FMDsp9YQtSsj%2F0JAymEUnj4ZXOHkb14ayqaum9SBv7kWtnHE0xOtX4EmhA7KfnyTcCytTP4SqSw3V%2BdHaeXqAsFAPtRwWQ&X-Amz-Signature=deb208687504ce5a94afab5e369b80293d380887fd385ec161652811f5878379&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4666ZQEX4JS%2F20261022%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261022T110015Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEKv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCp0BVMkiLbCNOlVV4jEOeAJ9g2Th3pvF38GN2lgokDdQIhAKIGdMT33QrdJpwh%2FzjlFDn7dIcCO6VgujH9Obp8aapUKv8DCHMQABoMNjM3NDIzMTgzODA1Igy%2F7xUkU8zq4acd%2Blgq3AOMFSvpdQzyvglpwLqBJfcE115bpz0ps%2Fjhk6CN7NfOTXEAuxAajgdm2b5v8t2ZGkUtoEK51K%2FjYuTBhkOFVj%2B4m7XX3hTY3YgDlca%2BTFSxw9cfa5V36peCCOXh96OFi4xNL4GfbcmAG%2BLzQWoweQyJKz45PFsVqbrS1eEk0mtjbM4lK4hFrezVQUJjHyzyMeJbZA%2FMowuvvvaQFcvkt2lxtJOdxP%2F93H4h2v9ZzuocNixBGmmBKrWSfK30yEGML%2ByNkYvXhyHvUvS5ZDFUHj5iXOCHIR0uqSRuq%2Bgkna5YrYQDJm6lti6HiG2b7pKCGrAupD1fRwJwNZ%2BZ3F7DBvu6BIpU266a%2FVlTorNV6FH8nF%2ByKs7JrA0fOhr1TYGx1C99kb2a8Ip02kdXaCKiN0k769pwqhzOUOSZipbaHc0K67KsOguKDuntlv5RO%2BgsDpmoJRu4y0DP9uMCbaRbsDRf6qVGBEJYB%2FWUvbuwtO41TJLfDnSI3hHNOCqNtnrw56MOTQC9IHTaRsNtBCnWJ8laTvCwm2vL7xNIX4URCVh0QXcsmezugfRk9UFQRg0uBLdw71EFV5W%2BFTtCzLfLNlbrRWhFvhN34BfT%2FYfspmYNVyGu8CYEf%2Fl6VGJUHjDAyufWBjqkAUU1zrzhmfzMZTu5x6tEU2lgsbXfKkVb8hWG%2FPP5i1gjjGSWy5jnrlvu61Ly%2FJcBvVJvKdmV6O5ss2lbOwmfRHG%2BPATTzU2XOeF0WzvJutY%2FD7%2BudAmlpOHt5PjGL%2FSOIj0w0v9jcp3%2FHm6pHSf4P093sPAi2U2TSUPb%2Fn97f1FWIdJCMjH%2F356lSgDv48oT1Q7t5Ia6mrx%2FsPljBkTSXM7cNf7u&X-Amz-Signature=f1c7fba5fb8d0b13d430c4bf94936097f048e6b534a7f45c10eb716478e01937&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

