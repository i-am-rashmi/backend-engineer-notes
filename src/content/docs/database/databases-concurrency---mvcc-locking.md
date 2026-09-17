---
title: "Databases : Concurrency - MVCC , Locking"
---


Picture a busy database — thousands of people reading and writing the same rows, at the same time, every second. There are really only three situations that can ever happen:

1. Two people just want to _read_ — easy, no conflict, they never block each other.
2. One person wants to _read_ while another is _writing_ — this is where things get interesting.
3. Two people both want to _write_ to the exact same row — this is where things get dangerous.

## Handling A Concurrent Read and write - MVCC 


**MVCC** stands for **Multi-Version Concurrency Control** 🕰️. It is the mechanism modern databases use to allow thousands of users to read and write the exact same data at the exact same time, without corrupting the database or forcing everyone to wait in a single-file line.


To understand why it is so important, we have to look at the older alternative: **Strict Locking** 🔒.

- Imagine User A is updating a bank account balance. In a locking system, the database puts a lock on that row.
- If User B tries to simply read that balance at the same time, they are blocked.
- They must wait until User A finishes. In a high-traffic system, this creates massive traffic jams.

**The MVCC Solution** 🔀


Instead of locking the row and overwriting it immediately, MVCC does exactly what the name implies: it keeps _multiple versions_ of the data.


Instead of locking + overwriting immediately:

- Old version of the row is **kept**, not erased.
- A new version is created, stamped with a hidden **Transaction ID (TXID)**.
- Writer (A) works on the new version.
- Everyone else keeps reading the **old** version until A's transaction commits.

When User A updates the balance, the database does not erase the old balance. Instead, it creates a brand new version of the row, stamped with a new, hidden "transaction ID."

- User A works with this new, unfinalized version.
- User B (and anyone else querying the database) continues to be served the _old_ version of the row until User A's transaction is officially complete.

The golden rule of MVCC is: **Readers never block writers, and writers never block readers.**


Everybody just gets a version of the truth that's consistent for them, and nobody has to stand in line.


### **Two engines, two personalities**


Now here's where it gets fun — not every database engine handles this the same way, because it depends entirely on how they physically store data on disk.


Take an **LSM-Tree** (the kind of engine under things like Cassandra or RocksDB). LSM-Trees never overwrite anything in place — they just keep appending new data to a log. So when a row changes, the old version doesn't disappear, it's just... still sitting there in an older part of the log. MVCC is basically a side effect of how LSM-Trees already work. They get it almost for free.


A **B-Tree** engine — like the one under PostgreSQL or MySQL — has a very different personality. B-Trees like to overwrite data _in place_, right where it lives. That's efficient for reads, but it means the old version is about to be destroyed the moment a write happens. So to support MVCC, a B-Tree has to do some extra bookkeeping: before it overwrites a row, it copies the old version out into a separate stash called the **Undo Log**. Then it overwrites the main tree, and leaves behind a little breadcrumb — a pointer — saying "if you're not allowed to see me, the version you want is back in the Undo Log."


| Engine                                            | Behavior                                                                   | MVCC cost                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **LSM-Tree** (e.g. underlying Cassandra, RocksDB) | Never overwrites in place — always appends new versions to the log/SSTable | Gets MVCC almost **for free** — old versions are already sitting there                                   |
| **B-Tree** (e.g. PostgreSQL, MySQL/InnoDB)        | Overwrites data in place                                                   | Has to do **extra work**: copy the old row into a separate **Undo Log** before overwriting the main tree |

> _So: LSM-Trees inherit MVCC naturally. B-Trees have to work for it._

---


## What "Does "Taking a Snapshot Actually Mean?

- **Transaction ID (TXID):** a unique, incrementing number/timestamp assigned to every write.
- **Taking a snapshot:** does **not** mean copying all the data (too slow/expensive). It's just recording the **current TXID** at the moment a query starts.
    - Analogy: a time-stamped theme-park wristband. "12:00 PM" wristband → you can only see things committed before 12:00 PM; anything after is invisible to you.
- **Snapshot Isolation:** the guarantee that a query sees a consistent, frozen-in-time view of the database, no matter how many writes happen while it's running. Useful for long-running analytics/reports.

Here's a common misconception — when a database "takes a snapshot" for a query, it does **not** copy all the data somewhere. That would be absurdly slow and would eat up memory for no reason.


Instead, a snapshot is really just a number. When your query starts, the database simply notes down the current transaction ID and hands it to your query like a wristband. Think of it exactly like a timestamped wristband at a theme park: if yours says "12:00 PM," the rule is you're only allowed onto rides that were officially open before 12:00 PM. Anything that opens at 12:01 doesn't exist for you — you can't even see it.


Let's make this concrete. Say a bank balance has been updated three times, and each version got tagged with the transaction ID that created it:

- TXID 100 → $50
- TXID 105 → $70
- TXID 110 → $20

Now imagine a reporting script kicks off a long read query, and it gets handed **snapshot TXID 107**. Which balance should it see?


It should see **$70** — the version from TXID 105. Why? Because TXID 107 is its wristband time, and TXID 110 happened _after_ that. As far as this query is concerned, TXID 110 hasn't happened yet. It's invisible — off in the future.


This idea has a name: **Snapshot Isolation**. It's what lets a huge, slow-running analytics query — say, an end-of-day financial report — see one perfectly frozen, self-consistent picture of the database, even while thousands of new transactions are being written in the background. The report never sees a half-finished, inconsistent mess.


Who enforces all this?


 There's a component doing the actual bookkeeping behind the scenes — call it the **Transaction Manager**. It applies one simple rule every time your query tries to read a row:


_Is this row's TXID less than or equal to my snapshot TXID?_


If yes, great, that version is visible to you. If no, it's from the future — not for you. On a B-Tree, when that happens, the Transaction Manager follows the pointer into the Undo Log, finds the next older version, and checks the rule again. It keeps walking backward through history until it finds a version that's actually old enough for your wristband.


In our example: query has snapshot TXID 107, but it finds the row is currently at TXID 110. Is 110 ≤ 107? No. So it follows the pointer to the Undo Log, finds TXID 105. Is 105 ≤ 107? Yes. That's the version it returns.


---


## Concurrent Writes: Two Writers, Same Row - Pessimistic vs Optimistic Locking


MVCC solves _readers vs. writers_. But it doesn't touch a much scarier problem: what happens when _two writers_ try to change the exact same row at the exact same moment?


Picture Alice and Bob, both staring at a joint bank account with $100 in it. At the exact same instant, Alice tries to withdraw $80, and Bob tries to withdraw $80. If the database isn't careful about this, there's nothing stopping _both_ withdrawals from succeeding — leaving the account sitting at **-$60**. That's obviously not okay.


Databases generally reach for one of two philosophies here.


### A. Pessimistic Locking 🔒


**Pessimistic Locking** assumes conflict is coming, so it prepares for the worst. The instant Alice starts her update, the database slaps an exclusive write lock on that row. Bob's transaction simply has to wait in line until Alice is completely done. This is the default approach for most B-Tree relational databases — it's cautious, and it works.

- Assumes conflicts **will** happen.
- The moment Alice starts her update, the row gets an exclusive **write lock**.
- Bob is blocked and queued until Alice finishes.
- Default for most B-Tree relational databases.

### B. Optimistic Concurrency Control (OCC) 🏃


**Optimistic Concurrency Control (OCC)** takes the opposite bet — it assumes conflicts are rare, so why waste time locking things preemptively? Both Alice and Bob are allowed to do their calculations and prepare their updates at the same time. But right before either one commits, the database asks one question: _"has anyone else touched this row since you started?"_ Whoever hits save first wins. The other person's save gets rejected, and they have to start over. This approach is more common in LSM-Tree databases.

- Assumes conflicts are **rare**.
- Alice and Bob both proceed and prepare their updates simultaneously.
- At commit time, the database checks: _"has this row changed since you started?"_
- First commit wins; the other is **rejected and must retry**.
- Common in LSM-Tree databases.

### Which One Should You Actually Use? A Concert Ticket Story


**Setup:** 10,000 people click "Buy" on the same front-row concert seat in the same second.


Both strategies technically prevent double-booking — the real difference is **user experience** and **system load**.


### Optimistic scenario

1. Click "Buy Ticket" → app lets everyone through.
2. User spends ~3 minutes entering name, address, card number.
3. Hits "Confirm Purchase."
4. _Only then_ → "Sorry, someone else bought this ticket 2 minutes ago."
- Downsides: wasted user time/frustration at the worst possible moment, **and** a wasteful processing spike from 10,000 simultaneous commit attempts.

### Pessimistic scenario

1. Click "Buy Ticket."
2. First clicker's row is locked immediately.
3. Everyone else instantly sees: "This ticket is currently being purchased by another fan."
- **Fails fast** — other users can immediately move on to a different seat instead of wasting time.

**Conclusion:** For high-demand inventory (concert tickets, flight seats), **Pessimistic Locking** wins — failing fast beats a late-stage optimistic rejection.

> **Side note:** this is why ticket sites show a "You have 5:00 to complete your purchase" timer — it's a pessimistic lock with a TTL. If the timer expires, the lock releases for the next person.

---


## Quick Recap

- **Concurrent reads:** no handling needed.
- **Concurrent read + write:** MVCC — keep multiple versions, readers see a consistent snapshot via TXID comparison.
    - LSM-Trees: MVCC nearly free (append-only).
    - B-Trees: need an Undo Log to fake the same effect.
- **Concurrent writes:** need explicit conflict handling.
    - **Pessimistic** = lock first, fail fast, better UX under high contention.
    - **Optimistic** = let both proceed, reject on conflict, better when conflicts are rare and load matters more than instant feedback.

**Conclusion:** For high-demand inventory (concert tickets, flight seats), **Pessimistic Locking** wins — failing fast beats a late-stage optimistic rejection.

> **Side note:** this is why ticket sites show a "You have 5:00 to complete your purchase" timer — it's a pessimistic lock with a TTL. If the timer expires, the lock releases for the next person.

---

