---
title: "Caching : Fundamentals"
---


### What a cache is and why it exists


A cache is a high-speed storage layer that holds a copy of a subset of data so that future requests for that data are served faster than re-fetching or recomputing it from the source of truth. 


The entire justification rests on two facts: 

1. memory is orders of magnitude faster than disk or network, and
2. real-world access patterns are skewed — a small fraction of data is accessed disproportionately often (the "hot set"). Caching exploits this skew by keeping the hot set close to the consumer.
> The canonical latency intuition every backend engineer should be able to recite (Jeff Dean's "Latency Numbers Every Programmer Should Know"):
> > L1 cache reference: 0.5 ns
> > L2 cache reference: 7 ns
> > Main memory reference: 100 ns (~200x L1)
> > Round trip within same datacenter: 500,000 ns (0.5 ms)
> > Read 1 MB sequentially from SSD: ~1,000,000 ns (1 ms)
> > Disk seek: 10,000,000 ns (10 ms)
> > Packet CA→Netherlands→CA: 150,000,000 ns (150 ms)
>

The practical takeaway: an in-memory cache hit (~sub-millisecond to 1 ms including network within a datacenter) versus a disk-backed database query (tens of milliseconds) is roughly a 50x improvement. Hello Interview frames it directly: "Reading a user profile from Postgres may take 50 milliseconds, but reading from an in-memory cache like Redis takes just 1 millisecond. That's a 50x improvement in latency."



### Cache hit, miss, and hit ratio

- **Cache hit**: requested data is found in the cache; served fast.
- **Cache miss**: data not in cache; must fetch from the source (slower), and typically populate the cache.
- **Hit ratio** = hits / (hits + misses). This is the single most important cache health metric. A dropping hit ratio signals a too-small cache, wrong eviction policy, poor key design, or a churny workload.
- **Cold vs warm cache**: a freshly deployed / just-restarted cache is "cold" — all traffic misses until it "warms up." Cold-start behavior matters enormously at scale (see failure modes: a cold cache after failover is a thundering-herd generator).

### Latency vs throughput

- **Latency**: time for a single operation. Caches reduce per-request latency by avoiding slow backends.
- **Throughput**: operations per unit time. Caches raise system throughput by offloading the database — the DB serves far fewer queries, so the whole system scales further on the same hardware.
- These interact: a cache stampede converts a latency problem (one slow miss) into a throughput crisis (thousands of simultaneous misses saturate the DB). Senior engineers reason about both dimensions and about tail latency (p99), not just averages.

### The memory hierarchy (why caching works at all)


Modern systems are layered by speed/cost/capacity: 

- CPU registers
- L1/L2/L3 CPU caches
- main memory (DRAM)
- SSD
- HDD
- network/remote storage.

 Each layer down is larger, cheaper per byte, and slower.


Caching is the general pattern of keeping recently/frequently used data at a faster layer. Redis's own performance derives from this: it keeps the working set hot in RAM and, being single-threaded for command processing, avoids cross-core cache-line invalidation and false sharing that would cost 50–100 ns per cache-line transfer in a multithreaded design.


What this means in Redis , there is a single worker doing write and reads . If we had multiple workers, managing the workers would slow down read and write times , because coordination and blocking of threads takes time. Instead having just one worker solves this problem


### Where caches sit in a system (cache placement)


Interviewers expect you to know that caching happens at many layers, and to pick deliberately:

1. **Client-side / browser cache**: HTTP caching (Cache-Control, ETag), local storage. Closest to the user, zero server cost, but you control it least. This stores data directly on the user's device (like in their web browser's local storage). It costs your servers nothing, but your backend application has very little control over clearing or updating it.
2. **CDN (edge cache)**: geographically distributed servers cache static (and increasingly dynamic) content near users. Cuts latency dramatically (e.g. 300 ms → 20 ms for far-away users). Use for images, video, static assets, cacheable API responses.
3. **Application-level cache**: This is an in-memory cache running directly inside your application server's process. It is incredibly fast because there is no network hop, but if you have 10 application servers running, they each have their own separate, unshared cache, which can cause data inconsistencies.
4. **Distributed / external cache**:A standalone caching service (like a Redis cluster) running on its own dedicated servers. All of your application servers connect to this single shared cache over the network, making it the standard baseline for keeping data consistent across your backend. Every app server shares it, it scales independently, supports eviction/TTL. **This is the default answer in system design interviews** — start here, then layer CDN or in-process on top only if the problem calls for it.
5. **Database-level cache**: buffer pools (e.g. Postgres shared buffers), query/result caches inside the DB. Works for single-node read optimization but hits limits in distributed environments.

A common senior pattern is a **multi-tier cache**: a small in-process L1 (for the very hottest keys, avoiding even the network hop) backed by a shared Redis L2, backed by the database. This is also a standard hot-key mitigation.


**The Architecture: L1 and L2**
Instead of choosing just one caching location, senior engineers layer them to create a **multi-tier cache**.


Here is how the flow works when a user requests data:

1. **The L1 Cache (In-Process):** The application server first checks its own internal memory (like a sticky note right on the server's monitor). This is blazingly fast because there is zero network travel, but it is kept small.
2. **The L2 Cache (Distributed/Redis):** If the data isn't in L1, the server checks the shared Redis cache over the network (like the shared office whiteboard).
3. **The Database:** If both caches miss, it finally queries the slow database.

| **Layer** | **Location 📍**       | **Speed ⚡**           | **Capacity 📦** | **Shared? 🤝**           |
| --------- | --------------------- | --------------------- | --------------- | ------------------------ |
| **L1**    | Inside the App Server | Nanoseconds (Fastest) | Very Small      | No (Local to one server) |
| **L2**    | Redis (Over Network)  | Milliseconds (Fast)   | Massive         | Yes (All servers see it) |
| **DB**    | Database Server       | Tens of Milliseconds  | Complete        | Yes (Source of Truth)    |


**Why is this a "Hot-Key Mitigation"?**
A "hot key" happens when a single piece of data (like a viral video) becomes so overwhelmingly popular that the thousands of requests for it melt the single Redis server responsible for holding it.


By adding an L1 cache, every single application server keeps its own local copy of that viral video. Because the app servers answer the requests directly from their L1 memory, those thousands of requests never even reach the Redis L2 cache, completely protecting it from the traffic spike.


Because those application servers do not share their L1 memory, if Server A updates the database and the L2 cache, Servers B, C, D, and E are left holding old, stale data in their L1 caches.  
In system design, this is called a **coherence problem**.  
To fix it, senior engineers build a **broadcast invalidation bus** 📢. When any server updates a piece of data, it publishes a message (using a tool like Redis Pub/Sub or Kafka) that essentially shouts to all the other servers, "Hey, delete your local copy of this video title!". All the servers subscribe to this broadcast, hear the message, and instantly evict that stale data from their L1 caches

