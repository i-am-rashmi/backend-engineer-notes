---
title: "System Design : CQRS , Event Sourcing"
---


# CQRS & Event Sourcing


Two advanced data patterns that often pair together, both born from the same realization that hit in the Service Boundaries notes: sometimes a single database model genuinely can’t serve every need a system has, and forcing it to creates real, avoidable friction.


---


## 1. CQRS — Command Query Responsibility Segregation


### The core idea


A long name for a simple split: separate how a system **writes** data from how it **reads** data.


| Type        | What it does                       | Example                                               |
| ----------- | ---------------------------------- | ----------------------------------------------------- |
| **Command** | Changes data (write/update/delete) | Depositing money, uploading a video, placing an order |
| **Query**   | Asks for data (read-only)          | Checking a balance, searching, viewing a receipt      |


Traditional applications use the exact same database model for both. **CQRS physically separates them** — one database/model optimized for enforcing complex business rules and safely writing data, and a completely different database/model optimized purely for fast reading and searching.


**Analogy:** a restaurant. The Command side is the kitchen — strict, rule-following, transforming raw ingredients into meals. The Query side is a bakery’s display case — no cooking happens there at all; it exists purely so a customer can look at already-finished products and pick one quickly.


### Why bother — the read/write asymmetry


On platforms like YouTube or Instagram, **queries (reads) outnumber commands (writes) by thousands to one** — millions of people scroll and view content for every one person who actually uploads something. Forcing both workloads through the same database means the read-heavy traffic and the write-heavy traffic compete for the same resources, even though they have almost nothing in common structurally.


### The full architecture, worked through with Instagram

1. **The Command (Write)** — posting a photo sends an HTTP POST to the Command API. It does the heavy lifting: checks account status, runs spam filters, and saves to the **Write Database** (often a relational database like PostgreSQL, for strict data integrity). It then immediately responds “Success!” to the user’s app.
2. **The Bridge (Message Queue)** — once the write database is safely updated, the Command API publishes an event to a broker like Kafka: `NewPostCreated: {userId, image_url, ...}`.
3. **The Query Update (Read)** — a completely separate Query API listens to that Kafka topic in the background, consumes the event, and updates the **Read Database** — which typically isn’t a traditional relational database at all. It might be Elasticsearch (fast caption/content search) or Redis (instant feed loading for followers).
4. **The User Reading** — when a friend opens the app, their feed request goes straight to the Query API, which serves it directly from Redis. **It never touches PostgreSQL.**

This lets the write side scale for correctness and complex business rules, while the read side scales independently and near-infinitely for enormous view volume — the two workloads never contend with each other at all.


### The cost: Eventual Consistency


Because the read database is updated asynchronously via the message queue, there’s a real, unavoidable delay — Instagram is explicitly fine with a friend not seeing your new photo for a couple of seconds, because nothing of real consequence depends on that delay.


**Where CQRS genuinely doesn’t fit: strict-consistency workloads.** A banking transfer is the clearest counter-case: if you have $50 and initiate two $50 transfers in quick succession, a lagging, eventually-consistent read model could still show a $50 balance for both requests — allowing a **double-spend**, since the second transfer decision is being made against stale data rather than the true, current state. Core financial ledgers generally need strict, immediate (ACID) consistency for exactly this reason — the cost of a stale read is fundamentally different (real financial loss) from Instagram’s cost of a stale read (a photo appearing a few seconds late).


**Worth being precise about a nuance the pure “CQRS is banned in banking” framing slightly overstates:** the actual problem isn’t CQRS itself — it’s making a **write decision** (should this transfer be allowed?) based on an **eventually-consistent read model**. A banking system can still use a physically separate read database for account statements, transaction history browsing, and reporting (workloads exactly as read-heavy and query-shaped as Instagram’s feed) — the constraint is specifically that the _authorization decision_ for a new transaction must always check against the current, authoritative write-side state, never the separate, potentially-stale read replica. CQRS as an architecture isn’t disqualified from finance; it’s the specific pattern of using a stale read to gate a new write that’s disqualified, in finance or anywhere else consistency-critical decisions are made.


---


## 2. Event Sourcing


### The core idea


A traditional database **overwrites** state — deposit $20 into a $50 balance, and the record now just says $70; the fact that it was ever $50 is gone. Event Sourcing changes this fundamentally: the database is an **append-only, immutable log of everything that happened**, and current state is never stored directly — it’s always **derived by replaying the log**.


**Worked example — Account #456’s event log:**


```plain text
AccountOpened   (Amount: $0)
MoneyDeposited  (Amount: $100)
CardSwiped_CoffeeShop (Amount: -$5)
MoneyDeposited  (Amount: $50)
```


To answer “what’s the current balance,” the system replays every event in order and sums them: `0 + 100 - 5 + 50 = $145`. **The balance is never a stored fact — it’s a computed result of the full history**, recalculated (or reconstructed from a snapshot, below) whenever it’s needed.


### Why this is more than just an implementation detail


Compare a traditional system that only ever stores a shopping cart’s final status (`Cart Status: Abandoned`) against an event-sourced one that stores the full sequence: `ItemAdded(Shoes) → ItemRemoved(Shoes) → ItemAdded(Boots) → CartAbandoned`. The final-status version tells you _what_ happened; the event log tells you **why** — you can see the customer genuinely considered shoes, changed their mind, moved to boots, and then abandoned anyway. This is **capturing intent, not just outcome**, and it’s exactly the raw material behind meaningful UX analysis, recommendation engines, and root-cause investigation of confusing user flows — data that a final-state-only system has already permanently thrown away by the time anyone thinks to ask for it.


### Performance at scale: Snapshots


Replaying 10,000 events for an account with 5 years of history on every single balance check would be prohibitively slow. The standard fix is **Snapshots** — periodically (e.g., at the end of every month) saving the fully-computed state as of that point. To get today’s balance, the system loads the latest snapshot and replays only the handful of events that occurred _since_ it, rather than the account’s entire history — turning an unbounded replay cost back into a small, constant one.


### How CQRS and Event Sourcing usually combine


The two patterns pair naturally, though they’re independent — you can use either without the other. In the common combined architecture: the write side is an immutable event ledger (Event Sourcing); a separate background process listens to that event stream and continuously builds a fast, easy-to-query current-state table for the UI to read from (CQRS’s read side). The event log is the ultimate source of truth; the read model is a disposable, rebuildable _projection_ of it.


---


## 3. Practical Complications Worth Knowing


A few real operational issues that come up quickly once Event Sourcing moves from concept to production, worth having ready even though they weren’t part of the session:


**Rebuilding read models is a genuine superpower, worth stating explicitly.** Because the event log is the permanent source of truth and the read-side table is just a derived projection, you can always throw away and completely rebuild a read model from scratch by replaying the full event history through new projection logic — this makes fixing a bug in how the read model was built, or adding a brand-new read view the business didn’t originally anticipate, something you can do _after the fact_, against real historical data, rather than something that had to be planned for on day one.


**Event schema evolution (“upcasting”).** Business requirements change, and eventually the shape of an event itself needs to change — `MoneyDeposited` might originally have no currency field, and later needs one. Because old events are immutable and can never be edited, the system needs a strategy for handling a mix of old-shape and new-shape events in the same log — commonly an **upcaster**, a small transformation step that converts an old-version event into the current expected shape at read time, so the replay logic only ever has to reason about one, current event shape. This is a real, recurring maintenance cost of Event Sourcing that isn’t obvious until a system has been running long enough to need its first schema change.


**Optimistic concurrency control.** If two commands try to append conflicting events to the same aggregate’s stream at nearly the same time (two concurrent withdrawal requests against the same account), the system needs to detect and reject one of them rather than silently accepting both — typically by tagging each event stream with a version number and requiring a new event’s append to specify the version it expected to be appending after; a mismatch means someone else already wrote a newer event, and the operation is rejected and retried against the now-current state. This is conceptually identical to the optimistic locking pattern from your SQL data-modeling notes (a version column checked on `UPDATE`), just applied to an append-only event stream instead of a mutable row.


**The right-to-be-forgotten problem.** Regulations like GDPR can require permanently deleting a specific user’s personal data on request — a direct conflict with Event Sourcing’s core premise that the log is immutable and never deleted. The common resolution is **crypto-shredding**: personal data within events is encrypted with a per-user key from the start, and “deleting” a user’s data means permanently destroying _only their encryption key_ — the event log itself stays physically intact and immutable (preserving its value for aggregate/anonymous analytics and the mechanics of replay), but the specific personal fields become permanently, irreversibly unreadable. This is a genuinely important gap to know about before adopting Event Sourcing for any system that will ever hold regulated personal data — it’s not an edge case, it’s close to a mandatory design consideration.


---


## 4. Summary


CQRS separates the write model (Commands — optimized for enforcing business rules and integrity) from the read model (Queries — optimized purely for fast, flexible retrieval), connected asynchronously via events, which is exactly why systems like Instagram can scale reads independently of writes at massive volume. The unavoidable cost is Eventual Consistency on the read side — acceptable for a social feed, but not for a write decision (like authorizing a bank transfer) that needs to check current, authoritative state rather than a potentially-stale read replica; the constraint is on stale-reads-gating-writes specifically, not on CQRS as an architecture wholesale.


Event Sourcing replaces stored current-state with an immutable, append-only log of everything that happened, deriving current state by replaying that log (with Snapshots keeping replay cost bounded at scale) — trading the simplicity of “just read the current value” for the ability to reconstruct not just what a system’s state is, but the full history and intent behind how it got there, which is genuinely valuable for analytics and debugging in a way a final-state-only system can never recover after the fact. The two patterns commonly combine — an event-sourced write side feeding a CQRS-style, continuously rebuilt read projection — but each stands independently and can be adopted alone.


Production use of Event Sourcing specifically comes with real, recurring complications worth planning for upfront: rebuildable read models are a genuine benefit, but event schema evolution (upcasting old event shapes), optimistic concurrency control on concurrent writes to the same stream, and the right-to-be-forgotten conflict with immutability (resolved via crypto-shredding) are all standard, expected engineering costs of the pattern rather than rare edge cases.

