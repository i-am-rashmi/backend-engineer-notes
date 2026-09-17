---
title: "Caching : Strategies"
---


# Caching Strategies — Study Notes


## 1. Cache-Aside (Lazy Loading)


**App is the orchestrator.** Cache and DB never talk to each other.


**Read path:**
1. Check cache
2. Hit → return
3. Miss → query DB → populate cache → return


**Write path:**
- Write to DB **first**, then **delete** the cache key (never update it in place)
- Deletion avoids the race where two concurrent writes land in the cache out of order and leave stale data stuck there


**Pros:** Only caches what’s actually requested (no wasted memory); degrades gracefully if cache dies (app falls back to DB)
**Cons:** First request for any key always misses (“cold” reads); extra round trip logic lives in app code


**Best for:** Read-heavy, tolerant-of-brief-staleness workloads — e.g. product catalogs


**Real-world example:** Instagram/Facebook profile pages use cache-aside over Memcached. Billions of profiles exist, but only a tiny fraction are viewed at any moment — lazily caching only what’s requested avoids pre-loading data nobody looks at, and brief staleness on a bio or follower count is invisible to users.


---


## 2. Read-Through


Cache sits **inline** — app only ever talks to the cache, never directly to the DB.

- On miss, the cache layer itself fetches from DB, stores it, returns it
- Centralizes miss-handling logic (cleaner app code)

**Cons:** Cache becomes a **single point of failure** — if it’s down, reads are down. No automatic fallback to DB (unlike cache-aside).


**Best for:** When you want cache-aside’s laziness but don’t want to duplicate fetch logic across services — usually paired with a caching library/proxy (e.g. Varnish, some ORMs) rather than hand-rolled.


**Real-world example:** CDN edge caching (e.g. CloudFront, Varnish in front of a web app) — the browser/client only ever hits the CDN edge; on a miss, the edge node itself fetches from origin, caches, and serves. The single-point-of-failure risk is why CDNs run many redundant edge nodes rather than one central cache.


---


## 3. Write-Through


Every write goes to **cache and DB synchronously**; success is only returned once both confirm.


**Pros:** Strong read-after-write consistency — cache is never stale
**Cons:** Higher write latency (“pays two hops”); wastes memory on write-once/rarely-read data (e.g. archival uploads)


**Best for:** Data needing perfect consistency — session state, account balances, anything read immediately after write.


**Real-world example:** Banking apps and payment platforms (e.g. a wallet balance service) write-through cache the balance so that the instant after a deposit/withdrawal, every read — even from a different service instance — reflects the new value. The extra write latency is an acceptable cost for correctness.


---


## 4. Write-Behind (Write-Back)


Write goes to **cache only**; cache ACKs immediately; DB write happens **asynchronously**, batched.


**Pros:** Fastest possible writes, highest throughput
**Cons:** **Data-loss risk is inherent** — if the cache crashes before flushing, unflushed writes are gone permanently


**Best for:** High-volume, loss-tolerant data — analytics counters, game leaderboards, view counts. **Never** for financial/transactional data.


**Real-world example:** YouTube/TikTok view counters — every view increments an in-memory counter (e.g. Redis) which is flushed to the durable DB in batches every few seconds. Losing a handful of view increments on a crash is a non-issue; forcing every view to hit the DB synchronously would collapse under load.


---


## 5. Write-Around


Writes go **straight to DB**, completely bypassing the cache (no update, no delete).

- Cache only gets populated later, on a read miss
- Differs from cache-aside: cache-aside _actively deletes_ the stale key on write; write-around _ignores_ the cache entirely — so a previously-cached item can serve stale data until it’s naturally evicted or re-fetched

**Best for:** Write-once/read-rarely data (bulk imports, archives) where you don’t want to trigger cache churn.


**Real-world example:** Bulk data migrations or nightly ETL jobs loading millions of historical order records into a DB — writing straight to the DB avoids flooding the cache (and issuing millions of cache-delete/update commands) for records that are rarely, if ever, read back immediately.


---


## Senior Decision Framework (4 questions)

1. Read-heavy or write-heavy workload?
2. Consistency need: strong (read-your-writes) vs. tolerable short lag?
3. Cost of a cache miss: milliseconds vs. cascading failure?
4. Cache-down behavior: fail closed, degrade gracefully, or serve stale?

**Worked example:** E-commerce product catalog → read-heavy, tolerant of brief staleness, cache miss is cheap → **Cache-aside**.


---


## Mixing Strategies in One System


Real systems rarely pick just one. Common combination, using an e-commerce platform as the example:
- **Cache-aside** for product page reads (read-heavy, staleness-tolerant)
- **Write-around** for bulk catalog imports/price-list uploads (write-once, rarely re-read immediately)
- **Write-through** for the user’s shopping cart / session state (needs read-after-write correctness)
- **Write-behind** for “recently viewed” or click-analytics counters (high volume, loss-tolerant)


The senior-level skill isn’t picking one strategy for the whole system — it’s recognizing that different data _within the same system_ has different read/write/consistency profiles and deserves a different strategy each.


---


## Strategy Comparison at a Glance


| Strategy      | Who writes to cache        | Sync or async | Consistency                         | Failure mode                       | Best for                              |
| ------------- | -------------------------- | ------------- | ----------------------------------- | ---------------------------------- | ------------------------------------- |
| Cache-Aside   | App (on miss)              | —             | Eventual (brief staleness)          | Graceful degrade to DB             | Read-heavy, general-purpose           |
| Read-Through  | Cache layer (on miss)      | —             | Eventual                            | Single point of failure            | Same as cache-aside, cleaner app code |
| Write-Through | App, synchronously to both | Sync          | Strong                              | Slower writes                      | Read-after-write critical data        |
| Write-Behind  | App, to cache only         | Async         | Weak (data-loss risk)               | Data loss on crash                 | High-throughput, loss-tolerant data   |
| Write-Around  | App, to DB only            | —             | Eventual (first read always misses) | N/A (no cache dependency on write) | Write-once/read-rarely data           |


**1. The Microservice Config Store (Read-Through)**
Imagine you work at a massive company with 50 different microservices (Payment Service, Email Service, User Service). All of them need to read shared configuration rules (like "is the summer discount turned on?").
If you used **Cache-aside**, every single one of those 50 teams would have to write custom logic in their code: _"Check cache, if miss, go to DB, put in cache, return."_ That is messy and prone to bugs.
Instead, you use **Read-through with a Distributed Cache**. The cache sits directly in front of the database. All 50 services just say, _"Hey Cache, give me the config."_ If the cache doesn't have it, the cache itself automatically fetches it from the database. This provides a clean, consistent interface across all services without requiring everyone to write cache-miss logic.  


 **2. E-commerce Product Catalog (e.g., Amazon)**
• **The Strategy:** Cache-aside + TTL.  
• **The "Why":** Think about how people shop. Millions of users are browsing (read-heavy), but a merchant might only update a product's price or description once a month (low write volume). Furthermore, you have millions of products, but people only look at a small percentage of them (unpredictable access).  
• **The Tradeoff:** We use Cache-aside because it only caches what people actually click on (saving memory). If a merchant changes a price and the cache is stale for a few seconds before the TTL expires, it is practically invisible to users. We happily trade strict consistency for massive read speed and memory efficiency.  



**3. Banking Account Balance (e.g., Chase)**
• **The Strategy:** Write-through + Read-through.  
• **The "Why":** If you deposit $500 from your phone, the very next time you refresh your screen, that $500 absolutely _must_ be there. You need perfect "read-after-write" consistency.  
• **The Tradeoff:** We cannot tolerate eventual consistency here; serving stale financial data is a catastrophe. Therefore, we use Write-through to force the system to save to both the cache and the database synchronously. We willingly accept the tradeoff of higher write latency (waiting for two systems to confirm the save) because human banking activity has a "moderate write volume" that won't overwhelm our database.  



**4. Gaming Leaderboard / Metrics (e.g., Call of Duty / Fortnite)**
• **The Strategy:** Write-behind.  
• **The "Why":** Imagine millions of players globally generating points, kills, and location metrics every single second. This is an "extreme write volume". If we forced every single point scored to write to the slow database immediately, the database would instantly crash.  
• **The Tradeoff:** We write _only_ to the lightning-fast cache so the game feels perfectly responsive. The cache groups these updates and flushes them to the database later. We deliberately accept the massive "data-loss risk"—if a server loses power and a few seconds of metrics are lost on crash, it is an acceptable tradeoff to keep the whole game infrastructure alive


**2. The Senior Tradeoffs Explained**



When an interviewer asks you to pick a strategy, they want to hear you say the quiet part out loud—the risks. Here is what those summaries actually mean:
• **Cache-aside:** Gives you low write latency (because writes only hit the DB, then just delete the cache key), but risks **stampedes** (when the cache timer expires, suddenly all users hit the database at once).  
• **Read-through:** Gives you simpler app code, but introduces a **SPOF (Single Point of Failure)**. If the inline cache crashes, your app doesn't know how to talk to the DB directly, so reads are completely broken.  
• **Write-through:** Gives you perfect, strong consistency, but doubles your write time (since you wait for two systems to save). This creates a **write-bottleneck risk** if you get a sudden spike of users trying to save data.  
• **Write-behind:** Gives you the absolute fastest writes, but introduces a massive **data-loss risk**. If the cache crashes before it flushes its background data to the database, that data is gone forever.


**3. Your Decision Flowchart**
Here is your mental decision matrix. When faced with a system design problem, run your scenario through these parameters to pick your strategy


**Step 1: Write VolumeStep 2: Consistency NeedStep 3: Tolerance for Data Loss➡️ Winning StrategyLow / Moderate**Eventually consistent (Brief staleness is fine)Low (Cannot lose data)
**Cache-aside** (The default)  **Low / Moderate**Perfect / Strong (Must read-after-write)Low (Cannot lose data)
**Write-through**
  **Extreme (Millions/sec)**Eventually consistentHigh (Losing a few seconds is OK)
**Write-behind**
  **Write-Once / Bulk**Eventually consistentLow (Cannot lose data)
**Write-around**
  


(Note: Read-through can be paired with Write-through or Cache-aside purely to make the app code cleaner.) 

