---
title: "Caching : Invalidation"
---


# Cache Invalidation — Study Notes


## 1. TTL: The Safety Net Under Everything Else


Every other invalidation trick in this document has a hidden dependency on TTL, so it’s worth understanding _why_ before anything else.


Imagine you never expired anything — every cache entry lived forever unless something explicitly deleted it. Now imagine one of those deletes gets lost: a message drops on the network, a worker crashes mid-job, a bug ships. That one entry is now stale _forever_, silently, until someone notices something’s wrong in production. That’s the nightmare TTL exists to prevent.


By giving every key a lifespan, you guarantee an upper bound on staleness even in the worst case: “whatever happens, this data is never more than N minutes wrong.” Nothing else in this document — versioned keys, the outbox pattern, staleness budgets — actually removes the need for TTL. They all lean on it as the fallback that fires when the “smarter” invalidation mechanism doesn’t.


The trade-off is the flip side of that same guarantee: TTL doesn’t promise freshness, only a ceiling on staleness. If your TTL is 5 minutes, a value can genuinely be up to 5 minutes wrong at any moment, and that’s simply the price of using TTL as your only tool. That’s exactly why senior engineers layer explicit invalidation _on top of_ TTL for anything where freshness actually matters — TTL alone is a floor, not a solution.


---


## 2. Explicit Invalidation: Deleting on Write


Here’s the scenario that makes this concrete. A user changes their password. Somewhere in your system, two things need to happen: the database needs the new password, and the cache — which is still holding the _old_ password from a previous login — needs to stop serving it. If only the first happens, the user tries to log in with their new password… and fails, because the cache confidently hands back the stale one. Worse, neither the app nor the database has any idea anything is wrong. From their point of view, everything succeeded.


The mechanism that’s supposed to prevent this is simple: on every write, write to the database first, then **delete** the cache key — never update it in place. (Why delete instead of update? Because if two writes race — say a slow network reorders them — an “update” can leave the _older_ value sitting in the cache even though the database has the newer one. A delete has no such failure mode: it just forces the next reader to go ask the database directly, so there’s never a “wrong” value left behind, only a temporary absence.)


**A concrete walkthrough — sneaker drop inventory:** Picture a flash sale. A shoe has 1,000 pairs in stock, and that number is cached as `product:sneaker-drop`. A shopper buys a pair; the database correctly drops the count to 999. If nothing else happens, every other shopper refreshing the page still sees “1,000 available” — the cache never got the memo. Some of them will try to buy shoes that don’t exist (“phantom inventory”). The fix is exactly the pattern above: the instant the database write succeeds, the app deletes the `product:sneaker-drop` key, so the very next person to load the page is forced to hit the database and see the real number, 999.


### But deletes can get lost too — the Outbox Pattern


Notice the password example above is really describing a _failure_ of explicit invalidation: the delete message itself got dropped on the way to the cache. “Write DB, then send a delete” sounds airtight, but it’s actually two separate operations, and anything can happen between them — the app crashes right after the DB write, the network blips, the cache is temporarily unreachable. When that happens, the DB and the app both believe the operation succeeded, and nobody is left holding the responsibility of retrying that delete. The cache just quietly keeps serving old data indefinitely.


The fix senior engineers reach for is the **Outbox Pattern**, usually paired with a durable message stream like Kafka:

1. When the write happens, the database does _two_ things in the _same transaction_: it saves the new data, and it writes a row into a special “Outbox” table saying, in effect, “please delete this cache key.”
2. Because both actions are in one transaction, they’re atomic — if either fails, both fail. There’s no way to end up with “the data changed but nobody recorded that the cache needs invalidating.”
3. A separate, relentless background worker continuously reads that Outbox table and pushes the DELETE to the cache — retrying for as long as it takes if the network hiccups.

The elegance here is that it converts “best effort, might silently fail” into “guaranteed to eventually happen.” The user’s password change might take an extra second to propagate to the cache under network trouble, but it _will_ propagate — the invalidation intent is durably recorded the moment the underlying data changes, not just fired off and forgotten.


---


## 3. Versioned Keys: Invalidating Millions of Entries at Once


Explicit invalidation works cleanly when you’re changing _one_ record. But what happens when you’re not changing data — you’re changing the _shape_ of the data? Say your team ships a code update that changes the structure of every user profile object. Every single cached profile — potentially millions of them — is now instantly incompatible with the new code. If the app reads an old-format profile out of the cache, it could crash.


The instinct might be “just delete all the old keys.” But sending millions of DELETE commands simultaneously would hammer your system just as hard as the problem you’re trying to avoid.


The actual senior-level trick is almost sleight-of-hand: you don’t touch the old data at all. Instead, you change what the _application asks for_. If profiles were cached as `user:42:v1`, you ship a deploy where the app now only ever requests `user:42:v2`. From that moment on, nobody is reading the `v1` keys anymore — they’re not deleted, they’re simply orphaned. And because they still have a TTL sitting on them from before, they quietly expire on their own over the following minutes or hours, without a single explicit delete command being sent.


It’s a clean example of leaning on the TTL safety net deliberately rather than fighting it: instead of trying to synchronously invalidate a huge blast radius, you let time do the cleanup for you.


**The one real cost:** for the window between the deploy and the old keys’ TTL expiry, your cache is holding _both_ the `v1` and `v2` versions of the same underlying data — meaning roughly double the memory footprint for that dataset until the transition finishes. That’s the price of a mass invalidation that doesn’t require a single coordinated delete operation.


---


## 4. Coherence Across Replicas / Regions


Everything above gets meaningfully harder the moment there’s more than one cache. A single “write DB, delete the key” is trivial when there’s one cache instance sitting next to one database. But real systems at scale often run caches in multiple regions — say, one serving the US, one serving Europe — for latency reasons: you want a European user’s request served by a nearby cache, not one on another continent.


Here’s the problem that creates: if a user in the US region updates their account settings, the US cache gets its delete-on-write invalidation just fine. But the European cache never heard about the change — it’s a completely separate instance. It keeps serving the old settings until _its own_ TTL happens to expire, which could be minutes away, even though the “true” data changed the instant the US write landed.


The fix is to explicitly propagate invalidations across the whole footprint, not just the region where the write happened — for example using pub/sub-style invalidation (Redis keyspace notifications are one concrete mechanism) so that a delete in one region broadcasts out and triggers the equivalent delete everywhere else. Without this, “coherence” quietly degrades into “eventually consistent, on a timer nobody chose deliberately” — which is a very different, much weaker guarantee than an engineer usually intends when they design an invalidation strategy.


---


## 5. Deliberately Accepting Staleness (the “Staleness Budget”)


Everything so far has been in service of one goal: make invalidation happen as fast and reliably as possible. The last idea flips that instinct on its head — sometimes the most senior move is to _stop trying_ to invalidate perfectly, and instead decide up front how much staleness you’re willing to tolerate.


**The Netflix example makes this vivid.** Netflix explicitly accepts that a user in Ireland and a user in Virginia might see slightly different homepage recommendations for a few minutes after either of them interacts with the service. That’s not a bug they haven’t gotten around to fixing — it’s a deliberate design choice.


To see why, imagine the alternative: perfect global consistency. Every time a user in Virginia likes a movie, the system would need to lock the relevant record, ship that update across the Atlantic, wait for Ireland’s servers to confirm they’ve saved it, and _only then_ tell the Virginia user “saved.” That single interaction now involves a cross-continent round trip before the UI can even acknowledge the click. Multiply that by every interaction, every user, everywhere — the system would grind to a halt under the weight of global coordination.


By instead treating staleness as a _budget_ — “it’s fine if this is up to a few minutes old” — Netflix sidesteps three expensive things at once: **global locking** (no need to freeze a record while a cross-region update is in flight), **quorum writes** (no waiting for a majority of distributed nodes to agree before responding), and **cross-continent network lag** (the write completes locally and instantly, and quietly syncs to other regions in the background afterward). The user experience is fast specifically _because_ the system isn’t chasing perfect freshness.


This is really the same trade every TTL makes, just elevated to a conscious architectural decision rather than an incidental side effect: you’re choosing, explicitly and by design, how much staleness the business can tolerate — instead of treating staleness purely as a bug to be minimized at any cost.


---


## Tying It Together


The common thread across all five ideas is the same tension: **how fresh does this data need to be, and what are you willing to pay for that freshness?**

- TTL says: “I don’t know exactly when this becomes stale, but I guarantee it’s never wrong for longer than N minutes.”
- Explicit invalidation (with the Outbox pattern) says: “I want freshness the instant something changes, and I’m willing to build the infrastructure to guarantee that delete never gets lost.”
- Versioned keys say: “I need to invalidate millions of entries at once, so I’ll redirect traffic to new keys and let TTL clean up the old ones for free.”
- Cross-region propagation says: “Freshness isn’t just about one cache — it’s about every cache my system relies on, so invalidation has to travel as far as the data does.”
- The staleness budget says: “Actually, for this particular data, perfect freshness costs more than it’s worth — I’ll decide in advance how stale is acceptable and design around that instead.”

A common interview question captures this directly: _“How do you keep cache and database consistent?”_ The honest answer is that you can’t do it perfectly for free — TTL bounds staleness cheaply but not precisely; explicit invalidation buys real freshness but only if you also pay for the reliability engineering (the Outbox pattern) to make sure the delete never silently fails; and at large enough scale, the senior move is often to stop paying for consistency altogether and design deliberately around an accepted staleness budget instead.


---


The Outbox Pattern solves a specific reliability problem: how do you guarantee a side effect (like "delete this cache key") actually happens, when the action that triggers it and the action itself are two separate steps that can fail independently?


**The problem it's fixing**


Say a user changes their password. Your app does two things: write the new password to the database, then send a DELETE command to the cache so it stops serving the old password. That sounds fine — until you picture what happens if the app crashes, or the network blips, right between those two steps. The database write succeeded. The delete never went out. Nobody knows it failed — there's no error, no retry, nothing. The cache just sits there silently serving stale data until a user notices login is broken.


The root issue: you're trying to keep two separate systems (the database and the cache) in sync using two separate, uncoordinated operations. Anything that can happen between "operation 1 succeeds" and "operation 2 fires" is a window where things can quietly fall apart.


**How the Outbox Pattern fixes it**


Instead of firing the second action (the cache delete) directly, you record your _intent_ to do it, durably, as part of the very same transaction as the original write:

1. When the user's password changes, the database does two things **in one transaction**: saves the new password, and inserts a row into a special "Outbox" table saying something like "delete cache key user:123."
2. Because they're in the same transaction, they're atomic — either both happen or neither does. There's no scenario where the password changes but the outbox row silently fails to get written.
3. A separate background worker continuously polls that Outbox table and sends the actual DELETE to the cache. If the cache is unreachable or the network hiccups, the worker just keeps retrying until it succeeds, then marks the row as done.

**Why this actually solves it**


The trick is that step 1 turns "did we remember to invalidate the cache?" from a fragile, easy-to-drop action into a durable fact recorded in the database itself. Even if the background worker crashes, restarts, or takes a while to get to it, the outbox row is still sitting there — nothing is lost. The delete is guaranteed to _eventually_ happen, even if it's delayed by a few seconds under network trouble, instead of being a "fire and hope" message that can vanish without a trace.


It's commonly paired with a durable message stream like Kafka in higher-throughput systems — the worker publishes the outbox events to Kafka instead of (or in addition to) hitting the cache directly, which gives you replay, ordering, and multiple consumers if more than one system needs to react to the same invalidation event.

