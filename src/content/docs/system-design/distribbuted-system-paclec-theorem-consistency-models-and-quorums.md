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


    ![Screenshot_2026-07-28_at_7.52.18_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/a2096aee-3b93-4304-9c32-443029f2259c/Screenshot_2026-07-28_at_7.52.18_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664QN7FTCD%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150457Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJGMEQCIH1QYCnxkHR3XLKAGbBc46nlwnUMEouNhQypjJP099R1AiBk7ziTyuDIvVh17bCe%2BvgIWuk2YUHSpX2%2BAvV42sHQMCr%2FAwgXEAAaDDYzNzQyMzE4MzgwNSIM0vyEh93dDv4T6ITMKtwDRgbhGZONJNyIX7OsUXOd63cDFwiI680f16Px%2BKgEo8v4vzxJ3LHZdXVO0SL5G2TsHT2uuRkfozn1AZqFrBogl4%2F%2F9ZUZNd0KzAlif%2F7nxR3uFZnVR%2Ff%2FqgMUj3BPWS59OVcOgC510MyAqPo9KIlLpi6cn4uyIkBahChGKQEbnDyRIqLMX5wEff%2FRZfSEcamwGAabsjSeExH5uc4pUdTHWbJNwSNBpeMau4W4MQNtOVuy6Eu3FcO7bnSbQD%2BENSBqvQXm3wDcuHa8DQAnypc5%2FExzY%2B8nKAaqLuDEV8Kp4ljy0Mgr5Nb6PTMYzh4ffcMfV9m5pP877ljiRCe3riDLhGli8V8FZEqTf8lUVDhncmOYxcQHJhS6AQdSwFwzbMfSVLPCus7Aim0OKkVUE%2FtlrHTHB5F69ARDin1RNwk0XxZa0%2FbFftTzLV%2FTBlzxTYs6ZnaIdkbFoGHc78WAPFnO83dAjQL4XdJJRDEZOjXHSphD4LIMpTv4Z8EGP6Io0n57BgSz7s31rIPKtWwdaDlCE6%2F84qKV6wgENgj4WC73xWux6jkc9lAUgXV3NPRSOiDmnK0xehRiFe%2BQp37%2BoO7QSPoU5VsOp2nzxK8o8ySFhaA0jY8oYi2fCktctUAw6%2Fj71wY6pgGKuToSRlBbONoIXYBtSz%2BA5W%2BNoZpSH%2FSUGkNHh7nyk59%2BkAVbDN0XHZAv2sQaCMPAOHBr6ZulyVVPE9UYoqXC7bgOUBhyHcU5Zz5YzolVfRCfmJqsDOcqK7BJhV7JEzCv0AGhK43wW3XJDcPB9w712a3unS7sV5%2FF0Mrx3Im9Vi2vPd2u%2FnmmgNMKUG1aefnqP2jw6H65bU013er%2BXjuBVPD%2BGgEC&X-Amz-Signature=6184ac07e06de96e025524770c2cfd4998a7961586e99b97550ae77bb1fd9a4e&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **How to read this**: There's one moment — the dashed line — when the write "takes effect." Every read to the left of that line (on any replica) is allowed to return **A** (the old value). Every single read to the right — no matter which replica answers it, R1, R2, or R3 — **must** return **B**. Not "probably will," not "eventually will" — must, every time, no exceptions.


    This is why it's expensive: to guarantee this, the system usually needs every read to check in with a majority of replicas (or a single authoritative leader) before answering, so it never accidentally answers from a replica that hasn't caught up yet.


    **Cost**: Requires coordination on every operation — typically consensus (Raft/Paxos) or a single leader that all reads/writes funnel through. This adds **latency** and, per CAP, **cannot remain available during a network partition** (a CP choice).


    **Used by**: ZooKeeper, etcd, Google Spanner (via TrueTime), single-leader databases configured for synchronous reads from the leader.


### 2.2 Sequential Consistency


    **The guarantee**: All clients see operations in **the same order** as each other — but that order doesn't have to match real-world (wall-clock) time. It just has to be _some_ order consistent with each individual client's own program order. 
    


    ![Screenshot_2026-07-28_at_8.20.29_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/921d6988-49b9-4746-92d1-f8f29eb64d4f/Screenshot_2026-07-28_at_8.20.29_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4666TZCYT4J%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150457Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJHMEUCIQDQFLNWN3RwLOe7iHbzWGfjRbFliBieGaqvCecVoV89NQIgMhDZSlRLIdXV6J4Gnm859Ov4yf9rkQ43JtXm0206rmAq%2FwMIFxAAGgw2Mzc0MjMxODM4MDUiDAge0QHGiOGKKf608CrcA3bGEhokxP%2FYq8x7%2FM981ULlwf05rt3lEOzdJsC01bSQmn5qjWlA%2BRyJDZ%2BOYFk%2FetqtaLsH5Leza4XHS5ao%2Buc7CfvUf5ZwFoY759pbEVKeFddUNqRDxJgalqv41Xfb7zbXQ%2FCfwrOe%2Ff6MUA%2BKPoaCtzsxVFiciaFLp1WmCjakBe9Y1ZH1rnTo%2FPLcdg7KvQ5jU4GkrvMWVfKbp%2FqKITtAMqpT0f3ngEW3JxzT%2BPPM6UI0ptQ7vsUVsUTyEHLyQv55eTVcNNoJCynFCsgOJbcepZbmaH3bXQtgMXq8PFr5119lsN7tQzsjKPF6i3U9A0gyl14sTODc8J31veC2ZS%2B54K244werKaRbJ96DY6rjW0TbbzrpA5j5JcRp%2BqIbeh8h%2BSZaHJ2jRjAdM2EEkH6B7DiDFgxHsW3Zra%2Br3CnazuBajxMpVJsk9WEOtEz6Q41LaZcL%2FA3FNj5qcGHuhcti4Ahg6baWWFf8%2FCn5szFEZQGOAxMoyZbkMMLD7sRoiWZnA%2Bj4UsfcardmF6V27%2FsE%2FlOcA1su7AA5S%2FVpHIhGoSdfvgkCqX4l5XxUoSBfMa%2BPCIlY8ZsI86L7YN81dAbyTQkXhQws%2F0f48j1VmtPzkWiwWAjFJ%2FwWXJGeMJL5%2B9cGOqUBl0UCJ%2FSdkFm0GWmtaDbw3LaxyEjRfVHmS2skxxlfRSczEAdIgQGPcK6JyA6zRkpngoZjjIoGBcCqwus%2B%2FRKeWdWNrJnen7Rytm4SDRSJl1pbspzbka0%2B%2BN%2Bwq5KJF7wN0C294rxetC7TNfnS4zVXvAhCYUCmdxU9HG8qcRrcUAZzoK2RKfzblOSVm52RVzXicP2LyIvYgx0s4ADZUGmGRYgEOpWT&X-Amz-Signature=02900887570a226e6e51da0958abf578b7ea706494eb95f7b73c686d3850a160&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.19.58_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/c487cd6a-0a88-439c-a598-4e7dcfb1e0ef/Screenshot_2026-07-28_at_8.19.58_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46652MVLFZP%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150458Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJGMEQCIAIMdjOeJNSBiIdtR7z00yr9oEaej%2Bczdi2ZhrkiyaUqAiBr0MzHZSI9CaFKjfZQEUXRqIzKvgUQuE4oP%2Fds6GK6Oir%2FAwgWEAAaDDYzNzQyMzE4MzgwNSIMxqpdCpSXnVPwUTtzKtwDn25RPvlKjKsqhfI%2FRPuMEoCsSWzdCZvuPi2WpGuXPTGhqY5wJ7idWG%2FBsFA0NHw6wupCceQ1eNkWWeCORHNrjMPQO6aKIIdwrrb4aAx597e%2FCKIoH2M3t9rwxNYr47wnIGRgQuoldfjlmt73%2FktP0qOPyoz05pGJY1vGckARutzsqn723gskYut2iTh66w6EAK16BLe9wDcDnIaNA5LBah2eS4iXdR7e5NDIvwg0w4YizPLXq3ZhClMxhKZjVmR0sMrBu5IPBrbB6Pnn1Y8Ovw7xxOmzwTjXGNxw7uPy6rZ%2FJUce0qNet4JVsxKhlz9t%2BoX8ucNr1MFTb65aIbbWWJD9OAT8cJSZHjYCDt6KiHbWRjDW101jpRkFBsCGJccBz9TOnZFBDdHD%2FxrJOpWqW%2F%2F7%2B7MBc%2FUIy85ltz282d%2BvtA3%2Bb3QTSjbXlrIR0gW8AbMMV0oWbm39pX0%2F9xvxRHLZ2gz%2F7lJ9bg6w0b0ae%2F2JKpBoF1efH9pxi3YjeQFSaXROen8kUxhemYOSMGSY1OQp7Lo1VmK4ifGQtKgLOufX5s9eH%2Bml%2FDGJ9Mj6wNhD%2BfzthvCKjqw5o4XEFwib28wyytw80jw5Pnmif3Fy2OVk9tPRuokP%2Ff%2F25SUwyff71wY6pgGt3wAgiIsiRviqpPqOjyhkKXM5ql2ddnyKI6X%2Fx%2BNWkHZXgdFRGmgsfqY%2F53IIYwmy2BRZzPnVJ64KBryCC3FPncoAeMoX%2FIUZOQT33x%2BLeTqTsa60RH8V4r42HeNQDAoaveNJ09lq4q0vqJXRCWX85dr1G7jCFJN03LOYlgkGZpV6YVGMmEqgjdG6RIBGNAbGpJI9REQlc9QQXKqLEVhXv1yRalBl&X-Amz-Signature=773f960236be40358f29571b9af83b86979ee16412ab4fdc72d4c3794b4c77bd&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


    ![Screenshot_2026-07-28_at_8.23.06_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/4daecef7-9ed0-43b4-abcc-000f24308600/Screenshot_2026-07-28_at_8.23.06_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4666GTNL2DH%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150459Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJHMEUCIFpwuNnPQuwlHFIzocdGVC%2BGUqX9U8DzGQ%2BCqYlwknrgAiEAznlFYtbWaRKURs9HL70X09YA1ClGvjx8cfD8d00cTrcq%2FwMIFhAAGgw2Mzc0MjMxODM4MDUiDCR2Bm%2FmdRBC5%2FjXuyrcAx4cqf43DDA83eWOEG9Gh38IYceC0KGI4%2F9HmJDiTY8zflKwzKggqPAy5CvJO5OWpFVNdmOZurUv5Z%2BhXPkZUuehjIyPHOiOWmMbfT9dZ8G5mf8p5rrpL%2F05ZYNV8AaRUzpMA%2BxalfqvuX6Xe0YXSfsFfjdVzDaQYrEaf5L8ip5x9Q2OebP2YlhvF%2FflP5c8HkC3p9FHdWU4zy%2BIdFrrz9ky0rYeeOI2O2orWHPHgM2yuymJHcMJviNWQM8wmefGZONtWTQINrvtRLFgUjIg2SLja1kMnSsqjYvyiFvAXVJvLguQxx%2FnUxLDX73kb1ig4BZqpJ4ODUB2TB2PnjIkD86nRK7ZF89S0BRohpc%2FEoHbS71DkscnbdCyPE4N8u5aUaE7emfHeg7F0uW4MtWfW2%2B%2Fkv0J2qgd5QSlDu8GizqqdgM835xlzRwdsh%2BRvmGQDWYnBly%2FMq4Pv0mGhyaBd%2B4TvBcU1nlnvYjhTHvNk%2FngSARpZvlnG2ct4x%2BeV4Wd6Im%2BlJPKNClF4Qd%2FH1g9%2BqSO0JOnpfOQ9C8I0CaPCUvDdBh%2BuYrUZdKQN9tiPMeIeVPkGpa2rOALAitWmmqDqCB33oGJuTVxGZIez0qRRUIqqbHCjxdUEZxBUdYdMO34%2B9cGOqUBp15rK5BdcQiWAzQicBnTO4p21LUnnNmX8pwT7bbO7IF%2FZVrPgnUWwKAqQDB%2BPm%2BlSGBi6LSGXeOZyXF%2Fx5extuT07vB%2F66f3ZfazflOr%2FuFWqjJvrfXzx6gh2TQvsEuL6is4NUeHMhq7sgcKoslZwz8X0aen9NDnG7kTgBiR0A7WiSR2o1zsxAyyrIwlLaV54uwqma3MMBKh0RcubKztaBGvkKRR&X-Amz-Signature=af09b0eb7b28a723722d00e702b04ef471b737b5561308ce748c27aaa066f40c&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


    **Why it's popular**: It requires the _least_ coordination → lowest latency, highest availability, survives partitions gracefully (an AP choice). This is the default for many NoSQL / leaderless systems (Cassandra, DynamoDB, Riak).


    **The catch**: Application code must be written defensively — expect reads to sometimes return stale data, and design around it (see "read-your-writes," "monotonic reads" below — DDIA calls these useful _client-centric_ guarantees that soften pure eventual consistency without paying for full linearizability).

    - **Read-your-writes consistency**: A client always sees its _own_ writes reflected in subsequent reads (even if it doesn't see others' writes immediately).
    - **Monotonic reads**: If a client has seen a value, it will never later see an _older_ value (no time-travel backwards).

### 2.4a Weak Consistency (a related but distinct term worth knowing)


    You'll sometimes see "weak consistency" used alongside "eventual consistency" — worth distinguishing:

    - **Weak consistency**: after a write, subsequent reads _may or may not_ see it — there's no promise the system will ever converge either. It's a best-effort approach, common in systems like memcached, and shows up in latency-sensitive real-time use cases (VoIP calls, video chat, multiplayer games) where a momentary gap is acceptable and not worth re-syncing later — if you drop out of a call for a few seconds, nobody replays what you missed.
    - **Eventual consistency** (§3.4) is actually a _stronger_ promise than weak consistency: it guarantees convergence _eventually_, just not immediately. Weak consistency makes no convergence guarantee at all.

    ![Screenshot_2026-07-28_at_8.33.17_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/e2b69a9d-7fc1-4f41-8571-10a27b7ed417/Screenshot_2026-07-28_at_8.33.17_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4662CUG54I3%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150459Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJHMEUCIEmuzl5MpL%2B9Sc2jAbW%2BUi1un0UeiJqUEhGaaXD798yeAiEA04zCvqCYj9K%2Fcj%2F%2BB4ZZCVQ61E7sCiPGkMNV96Yosz0q%2FwMIFhAAGgw2Mzc0MjMxODM4MDUiDE7eZooSS1oTALmIRircA9WkSuqJZKjIXzO6yMP%2BuMGY1oHBWG7V%2FtlYqyfmpq78u8j9qyYbZoTKDGyMYWqV7aQyooRaNji%2BUvBKqJDKdx4HhYt6tGzlHzSc%2FghNRKhinYzq8XJc3i99CTSnnl99gx1PeyCw1Nwl0HDHDd1AA4TT5%2FnO2ZyY1UWs9Y8w9oAAY7pxGYkpRVf6aPA9ZLqes6aQmrtJyn1XQmFj1OLNf%2BB8d%2B5TX7rl%2BKJHfbtFzMzhTSBKRUuNIqxWzqMhSTicpZy2Grt79R%2FGG0BN%2BxamEIyZv8bVF%2B%2BSbqeEhxOCmbRxr9HqstC8yNJnPJGiuxw1P7JEi1CL0XhLctdQCqDvJMCcQmcJ36kiWgokPV4WMzT6UucyeZ1r5fVgb0jVuL%2BCzWNFNAQrhE4Q4Fc9M43DwcoKJDZsA5gucOvSHD7PwPU6aA42Ms1nrSUZw6co1wiSvPTpVSaPy9o%2BFx4YRnB9I%2FwE6SnvDxrvdo%2FXcYn3cyq8jILzxqYQ9C4oRXBuUjOZi7YF4WPsJzYP0A8%2B7yUI%2FAVBWF3JkjixoFlzQLz4vewQKPg9vOmCAj6OgoXZksxf9JXvv8mN6pU2ey%2BeQYUni%2FbMky9WwgdPAkd3ZI7Xr4Fluv88fMkdrY%2Fdj59vMPT2%2B9cGOqUBp%2FbQUq40sRjSWv4YYyJ2%2F9ZkOPPBuFR%2FlEj0e%2F0ABbK4d%2FOW8rAlVP4c0kpVDHfBtnN6TW3smhPtX8rYXEJjdGFrk%2Bmz0N%2FIfeqdIfWDWDOt8Cqxv3B1liy%2BwVOjF6XG4%2Bmii2r2SFoez2rlj9%2BpCkj9e%2BPtjY0moGD2T%2B9kLC046uPL88FUn%2F4DmzNWm9umcgOAp1SQWER3hG2Ku%2F3o6IY0AlC6&X-Amz-Signature=19d15130d3da2b2e0946d3f4c9d50a7620d5d293cefbcbd46033529d34a74d52&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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


![ChatGPT_Image_Jul_28_2026_09_44_37_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/5a124edc-0070-4787-9b49-cd7532e5e64e/ChatGPT_Image_Jul_28_2026_09_44_37_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466UGHRFTNF%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150501Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJGMEQCIDbGkYKJ2gY%2BvFSWbSIIhNKtYMHKW3a%2FTvWdwp%2BXQ%2F%2BUAiBoYfmNBYJEb%2Fa15XNRK27cZv%2BwyYSui73D9Iu%2Flnpryyr%2FAwgWEAAaDDYzNzQyMzE4MzgwNSIMg87S%2B%2F2yG4%2F%2F8vSTKtwDoTo7UDxhS3o%2BayBPkm%2FC8h7ipOernrZEFAywCsGICH%2BTtJ5PyNNJwYUocmslql4U8GkqjB8XATVk%2B68bHdeez8nKfO3y0Rfibrzxac68BA7jRSGe4XAFSpH%2B4pA1Rc9SziP5ddoTD%2FYEa1plHABJNfV%2FnjUmWFE03b3PyWEFcjWp01%2BUSuVxRrkYy%2BrUL5JPwfkvHTH%2BdTq8dWonBceUTnFJyk2Cz97E7iqC9rNCnCBUZNSPQHF3oYlMH%2BvZlALV0ouoPFpvr8wHiwMPbMC%2FpIKWB77A6Vceaa2KOHkxVhMIaOeY0KivIcNF2QtsBaJm1MQvwGDj7y5HPEJmquMSjBMZh5NuAgsvEj0w6hcoFSrog0Xpn91Y0lcBYpWzj%2BMn4QxbFrInvMsaycLgPxM%2B%2BDw1RT5YvwzbsW8GlCIDNjEkFfoiz9995HIq5cFac%2FP1PvpbIPN2YKlNN4Grpw8PLUOAK2u5tQJgd1u7zPg%2BjWygqfCTckCqwN1f0JayRy%2F7dugLOd00%2B%2FfAMUfJ70UpO36WxOTuiFss4Ezt3ydqiQfGRAky7Xz%2FW69kkWsXfefODb09TPqMPZoH7wASGG6c0thXZE0%2BgXemRETrO9NS7GiOIkrRC1vI4SLMlfUwkPj71wY6pgEYwhAhBTSAwkC5hJrUz2%2FPVESwBUTUU7Y8O27WLVlC%2B9jtuzf7yKQssVYVMWl1zAFaQ%2BwQjBJbY0%2FJy2rKj1FV%2FI%2BnOctFxrSqDb%2F4cIsUykL2PceICY0518KEp%2BuVX3Eyh2%2F3zoa9Ujw2y32lHqkCyn3Aw%2FNZ5NHdHIjMU2OlEEfCjEkpZ1pFEaAEEJrCXyUmLjgJsApdVVzen24lXHn9G6nPF1%2BM&X-Amz-Signature=c67ac155c45a0353d63c6255c15ac162b87dee4e05caffde346bd0a0859b1d9b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


![ChatGPT_Image_Jul_28_2026_09_44_32_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/345b6e1b-573c-47be-a478-2796bc215f40/ChatGPT_Image_Jul_28_2026_09_44_32_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466ZHVKYX6S%2F20261119%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261119T150501Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEE4aCXVzLXdlc3QtMiJIMEYCIQCBiDPpv%2FYs4kP8A7OxnEbT8YobD9EWAeywIh%2F5rAx4lgIhAMfNak3H2vOK4JyC6GFwmeDZZ8YWFoysYx33dusESs2%2FKv8DCBcQABoMNjM3NDIzMTgzODA1Igy9lbhngyOcoZXoaU4q3AOfLhKH%2Baqguqffpw682FsF5JbQb61L2Qj6RfB3H3LryVSxkvJwSDO6zKWLvoj4rOKoVeo8N2BJTe%2FMcdBKQ03CNQVfOrqwJL%2BOiw%2FPOp01VClRvy8O%2Br6gSOrzT3G62YiU2QNQrShTLXKz8lMxj0XA6YJXG%2BP%2F0SP85X6QpVNHxZ3yjCBn3TBGzdYSiRTr%2FSwh0StDJ%2B86NPCHAqCHsY0oBH5ZrWZFSJPYcby%2Fw143DigjdcXQOOzqMOKKaOyF5LSXBKud9qLCW8nPXhJ7vhk0tajnT8%2FSo5njDRJpGMd45W0ZxH0Q1KvkOwPMgEOgFtyM9naV89cOmpucJuQTIoHplPqtgDYfuJ5%2FqC0Zg8%2FuCVoXD3zqFN6%2F2yLhsPQuQUj1XOGmhI0YxRMGlcS2FuZ2G9%2FTwE7wJw%2FgEQ8Up290K%2FGpLrgm7CVWz00psQIhnMIIZXeLiaR0CCbHFxXRVU5u%2FTN7b%2FyqpDoBUuHM%2B6MHNrt3H30v9cRUSid9OqXXyPHkVFMg2BkppgKOkWQVm5TygBi%2FJ5cujXrqd%2BE79d5753BCfuxHnUBtc6lYRTB%2BdO8PM5M9DJEzWmTDTgw7Ljj9%2F1Wox%2B%2FqAzCNnLYWRa4Ifw5xzu2ejVcFnyiY9zCR%2BPvXBjqkATdydgIrIMxGIZU9Z1l4L2yQSBNvmQjpN7lxqLG%2FGoa2ubEOmOm4DqU8Hpy%2B7X6yaP8ILjJ6XextszrdEbtZ%2FUKxgV6f4NbsnHb0kv8SxOs4xAxQCmK8727UrNeLeSURtQZflfILKpgUP1e4%2F5N0mJOlpTTv1Ucr93gfFFzPu%2Bko1n6%2BW6mj%2FcA8FTzjppj9mVQGEEF4Tck%2Fp%2FOYVsRTYZ0635Wa&X-Amz-Signature=2c0cb16cc424a3556e92a27817e3e4536948ebfe61df24e7068b70aa739e3642&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

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

