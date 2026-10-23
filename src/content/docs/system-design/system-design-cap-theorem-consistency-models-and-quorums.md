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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4662H7SLWHJ%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025846Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCqC1juvGc%2FGUO7aWxRC5r4H2Mk0Doenw88YTKh6wZlIAIhANngzvTbm0Fkcaio2u0a2eFlvtM37SGctxAtZmNKGVJiKogECIP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNjM3NDIzMTgzODA1IgyozizckFyR90fQGsQq3APxFJca3itLqWkxDm3tZ1PxdliNJfGeW5mLxW2K5wJezR3W3B8qXOqdAvFpn9vUfZRr%2F1KB2tZ9GCrjfV6pVNiFPcAasALRF9bm7esfff1MLmIujlgRbz7Wh%2FYihgDnfqNjqRBn9Xpzn3Qxt9RtHZyvDM6uxeJgHlVD4sF2Ei91oDLuiKCKBo4zxFIIR2Ur7Itov0w5K%2ByXxu9n90ZvhRmK1v80TsE1KGNVUrD0kuyf3kz3g3eQrnyFljuYIi16ke8mk5u3icb5%2FeocUYs4ZpfCVmuTYfHO%2BPJN1UZYMzsLAXp9694PiexsvZOmtoPLMJhFZS6GjlGrdtg6ydz3sFGAmMOk3F7Eze5Eo5CqZXjBNn61NcvTgNC%2FiI%2FxzICwIVUMK5joPgkfS5jWAWjT8x9r1J6bcN6095JB4HOTvY37CHL%2BdyUQobUSxSdzO7hp5GvujEr4H7FJ5a5Yopcc7J5c8Zd59Erj%2FUj4xoRCzCemNwo16JTbNYFis2tpK0qBtp9oiL%2BkRinOsSIK52HxAAj3b%2F3BaMrgav2C0fHo42Kk0OwgyVgb13Q%2BD2glqA99b2ityYayoiJbQvEZ5H%2FwPuDocGiBi%2BYgg7itmmVYf36ruwmEwyDoWhBYTKTY%2FDDohOvWBjqkAdSfLSrxleuNn%2Bn8j842Lwdgjo9Ysq5euk%2F%2F4CfQvaYTYepfdm68FQKTYTWEzbGMAkhKsXMaC89uzB9wLgPFmk0ZAuqOGjZ2B7Be3ld2eJfzXDvXkOKoU1tlgC2Oz0eXB5so1QRPf5SwdxF9XhjFcZtkKwvVtBM6kPBq%2B39NH7nX0eE3Ro8F9%2FEzp6p9yXpr6yTcEHdeGYKw5AOg9dBCv2xD%2BRg8&X-Amz-Signature=5bb4e10015ec1c72806ea7d235187f2c6f390d9f4a56476a2b1be44c82ccc465&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4666OC55A7Z%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025846Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQDS%2FSCX4hlx6ET4v5Z4TTkjlnFVUM7EuPkzENBla4PzAgIga%2Bns2JebcBlX5%2FbrtXan31ika2KlCODzPTMEK8rOk%2BkqiAQIg%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDOwcofk3JB0rz2KeOCrcA1I5ZnN6rSmvkZZwrMPQfm8r18OTXDe8HR6%2FB3Hg7lsnSqEky%2BNh2iRuF6AlJZajB4d5dXw3xajx1oFF6ubGUEufF%2BUu6m%2B0uNFkldkGbLmPa3299EHVbYOo5C%2ByYUVnDyHRDbsPug%2BnPSJQLUdZk9Y9WpfY505tw%2Bf4rPl9jf3YHHca3QDFYbld6Aoy4vHhEz5oO8A47H%2FM%2Bo1z3YI4VFKGLgweD%2FsHCeVxQ23zMJhMYiTvFBcpqVyBYnDCQZbpRnYHLWFwoidRwri1KQ8eWXXStDu5DH1Eh15%2FxvucHTc0y8boMf7dnXcHJ47OmAGClPbWE0DJKYdBNmWSp5SoMq%2BTQiSCpKwltRJIeply5WxaMBEWdGN4FQmEyyJ4yBQ0ZpqgKfrJdbeRIcdoR7ytGTxb8y7ykuzSuPb2njguRxYBeqs8PCXlUnejnuR%2BBxtDDph7GRIlhkJQtb3%2FZkc4Ygg4LtijLnqyyxVZObb%2F42W%2FrH7xuqtDy1qh7WtPg21t8%2Ba%2B9yhNWCKY%2BB0xpY2BZGV8o2QLgct98JyuGiRVKr3DHmR4P8bcgpzNsvxF2imXAMawRbEKwWtmzdr%2BNLcsRdQrLfLn6VAEQ75fGZhFdA7fDWrfwvw0bFQBkqQfMNaE69YGOqUBhKJnGpcewWEuBTKusJvCrAFyJsxzbWHE%2F97W%2F7iskwFF3fs12z5IzD%2FOWJmyGPy4epsu2kHq9v3%2B%2F9ppxD9iwHz3mkqFY0TsKFkSpnd037s5%2BXIGF4rOCSaxfwc23pH5NSrSNAk55qOfHSK11SYJvetlynsyUud0epmslj875tm59eFlWNH0ULjmZYNaybfeLbgi7O279dexoIIGPPS4JbBbxTvR&X-Amz-Signature=e7f50a9f399b67bbe3596f3871f6b5df5b53a391ba24a7407f82593b4450cd67&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4663MKFLRQL%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025847Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIFdTNOFVKA64BII0%2BStnvgvhDKp5AZInkcdVDwIlkTaxAiBLlU5N9AZU9Z4Kv8T7ttMQOJzhQn7RHdvA9Id3KH1jUyqIBAiD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIM8%2FTLqLeSGgbaz0D9KtwD%2FfAkdRb6abqla46PxuXzJpuQSoIX7iAhcYwdKaz0Rmd2FQcwiGjs8cKP08MPM67CB0j31xo2U3zVF74rw1BIRFugJBkQNDQTtT3Xz91ljcQDWB8Z6zVJTna2xEYACp57zU6JVSKT3YqgwE3yLTvdvWa69XJgUE33od3DCIsW6LP12Q0hwoeCtI4n6mC3M%2FXWp8yWW0yN%2Fioa11lk2R%2FTASBFDos3%2FmHiKuqF6eqw%2BIIFYBQkS9Ir6s%2FiTnLb%2FSlrv7hVnkCDbDYjSMFidSn9mb43DsMkKAHxbEJU9basYg2PZTh5BBgnp3QFEWlA51%2BkdRfms%2FT7CRNLnVAkHfrIr71AVZinuz%2BwGGynXthkDEVaIrTkVh6M%2F2T4FdNvJNx%2FJZrfyBcl1zE5becqqhs%2BArWa0ySS2xS7K1%2FF9X%2FjEBqIl8yrKCxur3IUnstp%2FLv71Z1oUCxSI4DPLwGiXZpNs4IhzE%2F2HHFu3E41XaJuwzCvoEGlNkm%2BlI%2BTpo6VSimghcYsn25blgg6DlDW0X71PgS5g2dGa92TkpbgT%2BvQGroqgWqBWkyo7veXJy45ioX9YhC7emKIJ49lybJ9fTk%2FY9wz6V9sRmuge6DhAICoYC%2F7OcW5PNfc5hExrpIw3YXr1gY6pgE3CK3tVbJ%2B3MBSg%2Fwm0iDieCy%2BvSpHiSdtqFg8F760bBz2ZtjWF%2FMxjjRvhuO2JMQPh4%2B4ED5JsklvDCGlCeu1dQ%2BdkGq%2BDl73%2BVVUHQt%2Bpk2%2FqtwfDYon9C0kaA8bE8UFyolK%2BAlbReLlC%2BBC%2FDoLyXgh%2B1GylBWiDrOEXJm0wxGfVmyGKznrXWOUVuuUrPaHQm%2F9vLSDyflB7KaHfRk2iBqhloKS&X-Amz-Signature=618fc60fb33f41f3a74eb32dba596bdd3b69ab75ec7d36a1048343df330f0f35&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466XNNXYA3D%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025848Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQCobMWQpf5yS2fkxHIag9kj6Wh0w%2FdAZ%2F4Nm0WC%2FACOVgIgIJUby%2BZBhkYvFJA%2F8vZHYFebOIuWeOV2up6Z87mrwX4qiAQIg%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDA%2B%2FnUbPc8S1yCNEbSrcA%2BOZTDaYfV4Ru8Q%2FV%2BfTZNxSNFLic7ylld1FSA6RZlvOL02CGLqQGuv945kv8mwDL2aS5ZHpQXnA5uN9miXA8gtFXYZqPp5WhGmswOKGetIRBRSJgs%2FYrV3rcRgSctmiFwOW2Dd4LHkCzUkWpdK2Ime4RkYtjaw9gyqATeu8nHE%2B%2BYNL3BFCS%2BuABfv4HctwnoVs%2BwyhsnlT%2F1h9eTKfaMcI8E1JZsoJTUMfokWMif7fXrbccJas1aqKJd0qOtCnMeR9G9PKW7oFU4Wk1yThzrIRIk3In5A01Nu8s9c8GZ52ILtkaCA5J%2FjEA6y5JqiLnycDFqzIIz0t3RKcXJWBxZKD34C8E3dIRb9HBR0bB5WyDnDzamGmK9VhZRhEyuddlHYNkIBsbAWelf11o7l822aNxwhDhgRaA5bnAZdZEcbbtuj%2FB%2FmIY%2F%2BjIFl1U2tzF%2F7yiRpUtbxcK5bsgXa4kKLJE4wbq9XOEbSzx2Xb37smBgN%2F%2FtDwbwf%2BKEWRMZfyWpbKZkL90wBQycPS7%2BbAXc%2FqWdtUZz17UzQqpk8080ebF%2BP%2BttDXI2yTy8IzYg2gn4QbhGwpdUjnicMNm25FjsrsQsBU5UYLe4NO%2BH6YUmmt%2FdA2CoY1qHufiE2PMJCE69YGOqUBSqgJcx%2BMQOUEwbhBd2yVHji4YGLofmCJJ7nefRIY51r5G8hM%2BBi3EA63Yh60GBzBztaEELEATyE3h28ebnvDOHVCuHxWurAzujGre7LVCo3DSwKO3cKiwPFZKFY69KjjJmMoR4QIdFjYU3KzP9WNWdlyoWzAVHeeUznUNEBT0hzY6WV3wP6CRfmQzWJcqbStfgDl79q820tdNaC9DMLvxLjxuGGZ&X-Amz-Signature=2550dea49fc730d4e024ca97a420eac26727303f2354676df4e9dc21a1e9445f&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466QFVPSMA5%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025848Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCICpDs9B8%2BJ4CDbRHNaaNfd4AaaSZDSlf4pYgfaqktKEHAiBU884RFgdOW1ZJeXCyIsS4PdfxNffXWW3NQj9%2BVSTi1CqIBAiD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMsy%2BRL8pLWUZ0Tgo%2FKtwDisora6J2Vz87TUtHwnqWTuisIYhBtizQ%2F6purNPAYj%2FsCCVfGVi4CvrlnAkn9Gd3V%2Fwyz7D9%2BNI3ykwVV%2FslD3r0iz%2BGtSlc4PGMBTKDQR%2FvXc8RPaxaUdBnw9uOQZJHiTzV5VvHpDqru7gnH%2BuOF3XiVgp2BADN8Ey56JdYOpnL7aE%2BqMHU28rQkdo8iPGaXW2MkPT6v0n5XqBEiprjjb%2FCK0C43piPiA2J9Xe3F6ftF6Wj7ecZ%2Bl8uxMYgZCPiB5GcFRqkZFPGbxpHyba6L1tEveKkg7OrhzohK50V41j1omAlwyUdSosWBO3pzoHj6tnYGo5XKiKmYlBEm4gwxdx%2FTgMUy2R0NrEnVziGhNSBD%2FQRc1x66ALcJxkoucJJx6Rmk9XEHOann6%2FBnG9vtHinlLSLrt%2BT%2BgvJN3T3nxJkXUzFu%2BFTGYBm0v9AxfVA5dPwcGzNpUtEThEwnZ0X53oyWANdLa3%2BfTmWl4p3mJMkhKPGsM8AYZZh8wKTaaR6bhpZ5z5aXTTWiWOFZMGJcZjQiFrf1dUZrEu%2Faj5CjryojK7islQ8K8lz5QOBX7ZqE1P6NtelAc1rDxbC37MWyP8eF2J61UfQwu8RRTFo7zHUCH3uVgY%2F4yAQoNgwyITr1gY6pgGRI9Pibti%2FwioZtVJ7XH9vQQTq5Cswlyao31qzUXq3ObLlSmMj%2FEjvS1rRKn49xpP6Sd0v6F7ctWLTlSyi2oFFJUiosFSLH4JDA%2B64xytTPyjHORiOtipGzYrsETz9itojN%2FCcZLy022iu94SpQyQ8EW6din8MmAbKR7EbtYV81sAbO90%2FC96wTSgQ7PwAYAHr%2F1x30byyM55kW20cYSuDQ48mbgjM&X-Amz-Signature=caba9b2c0e7d6ddaccaf4b68d77b1eecd27f4121dc2e7e496e71768709fe3383&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4667T4GJYOI%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025849Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIBCogWXyo96WoiQlgP2RXBe9r9zk17oTK4M9jvgDRvzVAiBKvA6loWYag%2BZCSY8%2FtlgZ5zR3Gl4SrGjFujQD9MIfMSqIBAiD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIM1mirSXFQ5nr4b7s3KtwDEZajzCRkAy%2B3xOca91c2xr8Qi45m7QgRyUlo9asO3n4fn0tpXcF3Hk0vumcNYJTRuO4cFGJ2YPGXLpQgU3DPE06Ts0rYqVImXfH0wHkl7WaFg3YsSKfRQ6QRNIk3NGumm4FSZfVUr5XAx6bmd%2BlNnBx4WNZG%2F1imJuLIFLI7yZ%2Bd13wlZTdhvl3%2FbYuXo4Yl1GKkTq9h1KEnVVdrDd0Yv7jBegVnYHbHWdOum0Snmw1TLrNm9CXoXavQRYqoNOankzPSkOj4DWpg6zRXiB%2FzyE59JqCA%2F%2Bq9%2FzgAMUy8s2NWxTZnCCJHnr7bFBo6C1XCaUhXtkPRZd1QL0huzISZ7Smax25a2twd6qnwA0AOEX2oLhjNRNYnJaG%2FA8jzAGUKTwK%2FYvi5FzoiEMhfGX0%2FJiimKp3%2Bi5usErWoXsMoNietvk8kSnEqNGRR7oBLWwENDBq5U6uFvF6JZDUEn3dKB68bhkiqcw%2BwGE8M41QqDwEGbiSfQpsxt%2BVyQEGzkaQrKmWyXp2M%2FAQCbGeMivdbBevMCtLe5o4ssQHs7uQYmjs0S86v7uUeFdCPnn0tJeDp2fxsYOOmfpRJY8nv4eq%2FJiaGUepvfEHJR9TzVlhGD8HCKQMJbWenlmHVhFow7oXr1gY6pgFRvjxzd1wC3KwiNEAuPRX58r3eZzkcj6VsAFT8o24XFChL9%2BRcVES85qk2OXb7k6cIsY5vi0xJz%2Bd4NRsCNhlc1k9BZiftB6AMqDCWwyPG7NxlEalBPrbbnk5tQyeIjoEjpM9TgHdor%2B3wvS9LA1M1P1FmZi4vkWObjl2ReZ3pv6F189KFGEEH2wnUaT4G2XckLV%2BA4Lzf5ngh3LXt7vJCV96%2FZ5hG&X-Amz-Signature=78d5b0ab50babe453e386ea9511e25c1ae2e683ce58fdccc52cf5d36e8750022&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466XI6QQPAM%2F20261023%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261023T025849Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjELr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQC%2FEjDAbcIDCJKG4NZLNUxBm83m6hyyT5stRcOsrMQfaQIgS5sAmkUa0qIY17VcYr2XJv8uaeHCzfpXntyr0ehmLTAqiAQIg%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDF2jzSKTrXufKOX%2FVSrcAwzkaNmuYe2EadC5MS3olioYPqrZUthVm0l6qzR17mf2MbwH4%2BEtVLxVnxT0dQOImgLaibbSXtgkXtBCGCtTkFcuUBjCyZlk63tC%2BzqzeBcFn5ZDFA4sMlBiTsEgDYwR5IlHljKzm5Q5P91GGKjrPDPxV3B17HnuFq%2BZLJ3r6ogeVrA5Ws6J9FfOvz%2B6v%2BV88sUcvEPIx9Pc0u3ltvBBe5fw%2FDQ6MxVDsr9HGv%2FBqbBVGlHCMXqd7AoXF%2FyUzxIXZ6NrpzYeC7JLc7oYYZQRjk%2FuitcGScKNfANvbOn%2BEQ2e1c5lel4gsiG3DoB3iT9uZ30GidQMoivPRn9GCDAIHhp5nf2RZPzK68AlLKj6HHzWIeQWZgxR5A1MHGI9mEUxY5SU0BwwBWHCCqZHE65tkXq8Dh1xWww2i1PxYTjVQgsiO%2FO19%2BYNDLLXVNfdNOgHObTKS4MAK45MacAo4v69GO4bo4zXxikpxBNc5CIGqoirl80RvopuaLWq9STQwu84CfJptmcpgnSFR%2FEYPOIieiMbIABTlMSrNq1rx3Vw9UoJFvauYsY%2B720AaLygOjwy8%2FRQPIBaIQGn%2FeAQoOAsTkAd3dERhGhnRICIj%2B8be7WZD7sGeJ6l%2BviswFdyMNeD69YGOqUB8MTX51E5UkakRGUQKQeCtExWa47WzS4Sjc6kUomm81p4IAO0SK1Mwz2NZLIZn7E%2FDv7a7IfYbUqwZTUM4eqzSh4d%2Fih%2BJmnuDFcpRLKmDs0CmxnnTfcutY4dxa%2Fb9ZRGYuJBrg2UzV9krn6o%2B9vVIdKkqjvBgqoky0n7sQ5Ez9eWBsYXODHQYh8lBny7u7dUKX4JiVfYVMJxhhHSe0fz%2FZeo2Rhy&X-Amz-Signature=5bc0e5be186548f074504f5c35a0ff675d5e11e6714da037534625b038c9b28d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

