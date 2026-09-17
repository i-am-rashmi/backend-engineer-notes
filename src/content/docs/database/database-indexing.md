---
title: "Database : Indexing"
---


Up until now, our architectural journey has mostly focused on how the storage engines find data using the **Primary Key** (like looking up `user_999`). But in the real world, you rarely just query by the primary ID. You need to find users by their email, search for transactions by a date range, or find all drivers in a specific zip code.


That is where **Secondary Indexes** come into play. They sit on top of the storage engines we discussed to make these alternative lookups fast. However, applying an index to a B-Tree looks vastly different from applying one to an LSM-Tree or a Columnar database.


---


## 1. B-Tree Indexes (MySQL/InnoDB-style)


### 1.1 Clustered Index (Primary Key)

- **Analogy:** A physical dictionary — words (keys) are sorted, and the definition (the actual data) sits right next to the word.
- In InnoDB, the B-Tree built on the Primary Key **is** the table itself.
- **Leaf nodes = full rows of data.**

### 1.2 Secondary Index

- Built on a non-primary column (e.g., `Email`), sorted by that column.
- **Key design question:** what do the leaf nodes store?
    - ❌ Storing the full row → massive duplication of data for every index.
    - ✅ Storing a **pointer back to the Primary Key** → leaf nodes hold `[Email, User_ID]`.

### 1.3 The “Double Read” Problem


Query: `SELECT * FROM users WHERE email = 'alice@example.com'`


This requires **two separate B-Tree traversals**:
1. Search the **Email B-Tree** → get `User_ID`.
2. Search the **Clustered B-Tree** (using `User_ID`) → get the full row.


This is called a **bookmark lookup** / **double read**. At scale, doing this millions of times (e.g., in a login service) is a real performance cost, since disk I/O is the biggest bottleneck.


### 1.4 Why Not Store a Physical Pointer Instead?


Some databases (e.g., **PostgreSQL**, via its Row ID / ctid) do store a direct physical pointer (e.g., “Block 500, Row 3”) in the secondary index, skipping the second B-Tree search entirely.


**But this breaks under a clustered-index architecture (like MySQL/InnoDB):**
- The Clustered B-Tree physically **reorganizes itself** as rows are inserted — pages split, and rows physically move on disk (e.g., Alice’s row moves from Block 500 → Block 510).
- If the secondary index held a physical pointer, that pointer is now **stale/broken**.
- A single page split can move 100 rows → **every secondary index on that table** would need 100 pointer updates. Massive write penalty.


**This is why InnoDB stores the** **`User_ID`** **(Primary Key) in secondary indexes, not a physical pointer** — the Primary Key never changes, so it stays valid even when the row moves physically on disk.


### 1.5 Covering Indexes — Solving the Double Read


Problem: we still want to avoid the double read for a hot query like:


```sql
SELECT status FROM users WHERE email = 'alice@example.com'
```


**Solution:** Add the needed column(s) directly into the secondary index’s leaf nodes.
- Before: leaf node = `[Email, User_ID]`
- After: leaf node = `[Email, User_ID, status]`


**Analogy:** A textbook index that says “Apple (a red fruit) — Page 50” lets you skip flipping to page 50 entirely.


This is called a **Covering Index** — the index “covers” the entire query, so the database never needs to touch the Clustered Index at all.

> ⚠️ **Why** **`SELECT *`** **defeats this:** If a query asks for _all_ columns, the index can’t cover it (that would mean duplicating the entire table into the index). This forces the slow double-read again — hence the common advice: **never use** **`SELECT *`** **in production.**

---


## 2. LSM-Tree Indexes (Cassandra, DynamoDB-style)


### 2.1 Why LSM-Trees Are Different

- Optimized for **very fast writes** by appending to sequential files (**SSTables**) rather than updating in place.
- Data isn’t neatly organized in one tree — it’s **scattered across many SSTable files**, which are periodically merged/rewritten by a background process called **Compaction**.
- These systems are also usually **distributed** across many servers, adding a second layer of complexity for secondary indexes.

### 2.2 The Distributed Setup


Example: a ride-sharing app, 10 servers, `Driver_ID` as Primary Key.
- The database hashes `Driver_ID` to decide which server stores a driver’s full profile.
- Now we want a secondary index on `License_Plate_Number`. Two architectural options:


### 2.3 Option A — Local Index

- Each of the 10 servers builds its **own mini secondary index** for only the data it locally holds.
- **Write path:** fast — a server just updates its own local index, no network hop needed.
- **Read path:** slow for a plate lookup — since we don’t know which server holds a given plate, the query must be **broadcast to all 10 servers simultaneously**, and results combined. This pattern is called **Scatter-Gather**.
- **When Local Index is the right choice:**
    - Writes must be as fast as possible.
    - The query already includes the Primary Key (e.g., “all 5-star reviews for Driver 999”) — the database hashes `999`, goes straight to the correct server, and uses that server’s local index. No scatter-gather needed, because we already know which server to ask.

### 2.4 Option B — Global Index

- Instead of per-server mini-indexes, build **one logical secondary index**, partitioned by the _indexed column_ itself (e.g., plates A–M on Server 1, N–Z on Server 2).
- **Read path:** fast — a lookup for plate “B123” goes straight to Server 1. No scatter-gather.
- **Write path:** slow — because the Global Index is really a **separate hidden table**, partitioned independently from the main table.

### **How the Global Index actually works under the hood:**


There are now _two_ independent structures, each partitioned by hashing a different column: 

1. **Main Table** — partitioned by hashing `Driver_ID`. Holds the full profile.
2. **Hidden Index Table** — partitioned by hashing `License_Plate_Number`. Holds only `[License_Plate, Driver_ID]`.

 Since `Driver_ID` and `License_Plate` are unrelated strings, their hashes usually land on **different servers**.


**Write example:** Alice signs up — `Driver_ID = 999` hashes to Server 4 (main profile); 


`License_Plate = B123` hashes to Server 1 (index entry). 


Server 4 must now make a **network call to Server 1** to write the index entry — this extra network round-trip is what makes Global Index writes slower.


### 2.4.1 Walkthrough: Global Index Write & Read Flow (3-Server Example)


To make the mechanics concrete, imagine a ride-sharing database spread across **three servers: A, B, C**, with:

- **Main Table** — partitioned by hashing `Driver_ID`.
- **Global Secondary Index (GSI)** — a separate hidden table, partitioned by hashing `License_Plate`.

Alice signs up: `Driver_ID = 999`, `License_Plate = B123`, `Car = Honda`.

- Hashing `999` → her main profile belongs on **Server A**.
- Hashing `B123` → her index entry belongs on **Server C**.

**✍️ The Write Process (inserting Alice)**

1. The app sends Alice’s full profile (`ID: 999, Plate: B123, Car: Honda`) to the database.
2. **Main Table write:** the system hashes `999`, routes the data to **Server A**, and writes the full profile into Server A’s LSM-tree (MemTable first, later flushed to an SSTable).
3. **Extracting the index record:** the database sees there’s a Global Index on `License_Plate`, and builds a tiny record: `[Plate: B123, Driver_ID: 999]`.
4. **Index Table write:** the system hashes `B123`, determines it belongs on **Server C**, and sends this small record _across the network_. Server C writes `[B123 → 999]` into its own LSM-tree.

**📖 The Read Process (finding Alice by plate)**


A police officer searches for plate `B123`:

1. Hash `B123` → ask **Server C**.
2. Server C’s index returns: “No full profile here, but `Driver_ID = 999`.”
3. Hash `999` → ask **Server A**.
4. Server A returns the full profile (Alice, Honda), which is sent back to the officer.

Notice: the read requires **two separate network hops to two different servers** — this is the read-side cost of a Global Index (as opposed to the “ask all servers” cost of a Local Index).


### **⚠️ The Consistency Gap**


Because writing to the Main Table (step 2, Server A) and writing to the Index Table (step 4, Server C) both happen over the network, there is a small window of time between them where they’re out of sync.


> 🤔 **What if the officer searches for** **`B123`** **in that exact gap** — after Server A has Alice’s profile, but before Server C has received the index update?  
> Server C would respond: “I have no record of plate B123” — an **empty result**, even though Alice’s data already exists on Server A.


This phenomenon is called **Eventual Consistency** (or **index lag**). 


Distributed databases accept that secondary indexes may be a few milliseconds stale, trading perfect instant accuracy for the ability to scale writes across many machines. This is a direct consequence of the Global Index design: because the main data and its index live on different servers by design, there is no way to update both **atomically** without sacrificing the write-speed benefits that make LSM-trees attractive in the first place.


### 2.5 What Do LSM Secondary Index Leaf Nodes Actually Store?


Same underlying principle as B-Trees: **never store a physical pointer.**

- If the index stored something like “SSTable #5, Row 10,” it would break constantly — **Compaction** continuously merges/rewrites SSTables and deletes old ones, invalidating any physical pointer almost immediately.
- **Solution:** the secondary index stores only the **Primary Key** (e.g., `Driver_ID`).
- A lookup on `License_Plate = "B123"` returns `Driver_ID: 999`. The database then does a standard **Primary Key lookup** (checking MemTable → Bloom Filters → SSTables, in order) to find wherever that data currently lives at that moment.

---


## 3. Columnar Indexing — "The Anti-Index" (Snowflake, BigQuery-style)


### 3.1 A Different Problem to Solve


Columnar databases aren't built to find _one_ row quickly — they're built for **massive analytics**, e.g.:


```sql
SELECT SUM(fare_amount) FROM rides WHERE date = '2026-07-29'
```


A query like this may need to process **millions of rows** at once.


**Why traditional B-Tree indexes don't fit here:**

- A B-Tree gives you a precise pointer for _every single matching row_ ("go to Block 5, Row 2," then "Block 8, Row 1," ...).
- If a query needs to sum 50 million records, following 50 million individual pointers means the disk head is constantly **jumping back and forth** across scattered locations — extremely slow, especially on spinning disk, and still wasteful even on SSDs.

### 3.2 The Columnar Layout Itself Is the First Optimization

- Data for a **single column is stored contiguously** on disk (unlike row-based storage, where a whole row — all columns — sits together).
- For an aggregate query, the database only needs to read the `fare_amount` and `date` columns — it can **ignore every other column entirely**. No traditional index required for this to work; it's a property of the storage layout itself.

### 3.3 The Trade-off: Point Lookups Become Expensive


Columnar storage is great for aggregates, but bad for finding _one specific row_, e.g.:


```sql
WHERE ride_id = '12345'
```


Without help, the database would have to scan the entire `ride_id` column, block by block, top to bottom — very inefficient for a single-record lookup.


### 3.4 The Fix: Zone Maps 🗺️


A **Zone Map** is lightweight metadata stored per disk block: just the **minimum and maximum value** of the indexed column within that block.

- Before reading a block, the database checks its Zone Map.
- If the searched value (or range) falls **outside** the block's min/max → the entire block is **skipped instantly**, no read needed.
- If it falls **inside or overlaps** the range → the block is opened and scanned.

**Example — range query** `WHERE date BETWEEN '2026-01-01' AND '2026-01-31'`:


| Block   | Min        | Max        | Decision                          |
| ------- | ---------- | ---------- | --------------------------------- |
| Block 1 | 2025-05-01 | 2025-10-31 | Outside range → **skip entirely** |
| Block 2 | 2025-12-15 | 2026-01-15 | Overlaps → **scan**               |
| Block 3 | 2026-01-05 | 2026-01-20 | Fully inside → **scan**           |


By checking tiny Zone Map metadata first, a columnar database can often skip **gigabytes or terabytes** of irrelevant data — without ever needing a row-by-row B-Tree index.

> **Key mental model:** Zone Maps don't tell you _exactly_ where a value is (like a B-Tree pointer would) — they only tell you which blocks are **definitely not worth opening**. That's a much cheaper guarantee to maintain, and it's exactly what large sequential analytical scans need.

## 5. Composite Indexes & The Left Prefix Rule


### 5.1 What Is a Composite Index?


A **composite index** is simply an index built on **two or more columns**, e.g. `(last_name, first_name)`.


### 5.2 The Phone Book Analogy


A composite index on `(last_name, first_name)` is sorted **exactly like a phone book**:

- First, sorted by `last_name`.
- Within each `last_name`, sorted by `first_name`.
- **"Find John Smith"** → jump straight to the "S" section, then scan down to "John." Fast.
- **"Find everyone named Smith"** → jump to "Smith," read the whole block. Fast.
- **"Find everyone whose first name is John" (skipping** **`last_name`****)** → the "Johns" are scattered across every letter of the alphabet (Adams, Baker, Carter...). You'd have to flip through the **entire book, page by page**. There's no way to jump directly to them.

### 5.3 What "Left" Actually Means


"Left" simply refers to **column order, read left to right**, in the index definition:


```plain text
(last_name, first_name)
 ^^^^^^^^^ leftmost column
```


The database physically sorts data by the **leftmost column first**. If a query doesn't filter on that leftmost column, the database can't use the sorted structure to jump anywhere — it has to check everything.


**The Left Prefix Rule:** a query can only use a composite index efficiently if it includes (at minimum) the **leftmost column(s)** of that index, in order, starting from the left.


### 5.4 Designing a Composite Index: The Golden Rule


**Equality before Range** — when deciding column order:

- Columns searched with an **exact match** (`=`) go **on the left**.
- Columns searched with a **range** (`>`, `<`, `BETWEEN`) go **further right**.

**Example:** `WHERE status = 'active' AND age > 18` → index as `(status, age)`, not `(age, status)`. `status` is an equality check (left); `age` is a range check (right).


### 5.5 Practical Limits on Composite Indexes

- **Hard limit:** most databases (PostgreSQL, MySQL) cap composite indexes around **16–32 columns**.
- **Practical limit:** rarely go beyond **3–4 columns**.
- **Why:** every `INSERT`/`UPDATE`/`DELETE` has to update the index too. A bloated, many-column index eats RAM/disk and significantly slows down writes.

---


## 6. Composite Keys in B-Trees vs. LSM-Trees


### 6.1 B-Trees (PostgreSQL, MySQL)

- The database physically **bundles the composite values together** as single entries, strictly sorted by the left prefix:

```plain text
('active', 19) → ('active', 25) → ('active', 40) → ('inactive', 18) → ('inactive', 30)
```

- Balanced structure → root → branches → leaf in just **3–4 hops**, even across millions of rows.

**What happens with** **`WHERE age = 25`** **alone (skipping** **`status`****)?**

- The root node only knows how to split on `status` first ("active" down one path, "inactive" down another).
- A 25-year-old could exist down _either_ path, so the database can't pick a branch — it's forced into a **Full Index Scan**, walking every leaf. This completely defeats the purpose of the tree.
- This is exactly why the Left Prefix Rule exists: **the physical branch structure itself cannot be navigated without the first key.**

### 6.2 LSM-Trees (Cassandra, RocksDB)

- Writes: **MemTable** (in-memory, sorted) → flushed to **SSTable** (immutable, sorted file on disk) once full → SSTables merged/compacted over time in the background.
- A composite key `(status, age)` is typically **flattened into a single concatenated string**, e.g.:

```plain text
"active:19"
  "active:25"
  "active:40"
  "inactive:18"
  "inactive:30"
```

- These strings are sorted **lexicographically** (alphabetically) across the MemTable and SSTables.

**What happens with** **`WHERE age = 25`** **alone (skipping** **`status`****)?**

- The database is effectively looking for the pattern `:25` — but the strings are alphabetically sorted by the _whole_ string, starting with `status`.
- There's no way to jump directly to `:25` — it has to scan **every string in every MemTable and SSTable**.
- **The Left Prefix Rule still applies here too** — even though the physical mechanics (concatenated sorted strings vs. a branching tree) are totally different from a B-Tree, both are fundamentally governed by **left-to-right sort order**, and both degrade to a full scan without the leftmost key.

### 6.3 Design Fix


If an application frequently needs to search by `age` alone (without knowing `status`), the fix is straightforward: **make** **`age`** **the leftmost key** in the index — e.g., build the index as `(age, status)` instead, or create a separate index with `age` first.


---


## 7. Composite Index vs. Covering Index — Not the Same Thing


These two terms sound related but describe **different concepts**:


|            | Composite Index                     | Covering Index                                                                                   |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Describes  | **What** the index is made of       | **How** an index is used by a specific query                                                     |
| Definition | Any index built on 2+ columns       | An index that contains _every_ column a specific query needs (both `WHERE` and `SELECT` columns) |
| Effect     | Enables sorted multi-column lookups | Lets the database skip the main table entirely — no second lookup needed                         |


**Example** — composite index on `(status, age)`:

- `SELECT status, age FROM users WHERE status = 'active';` → **covering** ✅ (everything requested is already in the index — no trip to the main table needed).
- `SELECT email FROM users WHERE status = 'active';` → **not covering** ❌ (`email` isn't in the index, so the database must go back to the main table to fetch it).
> A composite index _may or may not_ act as a covering index — it depends entirely on which columns a given query asks for.

---


## 8. Breaking the Left Prefix Rule: Specialized Indexes


### 8.1 Why Some Data Doesn't Fit Sorted Trees


B-Trees and LSM-Trees rely on **sorting combined values**. But some data — full paragraphs of text, JSON objects, arrays — doesn't sort meaningfully as one unit. E.g., searching a `bio` column for the word "Python" — "Python" could be the 1st word, the 50th word, or absent. A B-Tree can't help here.


### 8.2 Inverted Indexes (GIN in PostgreSQL, core tech behind Elasticsearch)


**Analogy:** the index at the back of a textbook — it doesn't care what the first word of a chapter is; it gives an alphabetical list of _every_ important concept and exactly which pages it appears on.


For a bio = `"loves database engineering"`, an Inverted Index splits the text into **individual tokens**, each becoming its own independent key:


```plain text
"database"    → Row 42
"engineering" → Row 42
"loves"       → Row 42
```


Because every word is its own independent entry point, **the Left Prefix Rule disappears entirely** — any word can be searched instantly, with no dependency on what came before it.


### 8.3 The Cost of GIN Indexes


GIN's power comes with real trade-offs:

1. **Heavy write penalty** — a single row with, say, an array of 10 tags creates **10 separate index entries**. Every `INSERT`/`UPDATE`/`DELETE` has to touch all of them.
2. **Large disk/memory footprint** — GIN indexes can be **2–5x larger** than an equivalent B-Tree index.
3. **Pending list overhead** — PostgreSQL buffers new GIN entries in a temporary "pending list" to keep writes fast; once that list fills up, the database pauses to merge it into the main index, which can cause sudden **latency spikes** during write bursts.

**When GIN is worth it:**


| Scenario         | Example                              | Why GIN wins                                    |
| ---------------- | ------------------------------------ | ----------------------------------------------- |
| Full-text search | Keyword search across articles/blogs | Maps individual words → document IDs instantly  |
| JSONB queries    | `data @> '{"status": "active"}'`     | Indexes all keys and values inside the document |
| Array matching   | `tags @> ARRAY['python', 'sql']`     | Efficiently matches overlapping elements        |


**Golden rule for GIN:** use it for **read-heavy, multi-value data** (arrays, JSON, full-text) where search speed matters and write volume is moderate — not for high-throughput, rarely-queried write streams (e.g., ingesting 10,000 raw JSON logs/sec that are seldom searched).


### 8.4 Expression (Functional) Indexes — Indexing _Part_ of a JSON Column


If you only need to query one or two specific keys inside a large JSON document, a full GIN index is overkill. Instead, index the **extracted value** of just that key using a normal, lightweight B-Tree:


sql


```sql
CREATE INDEX idx_json_status ON users ((data->>'status'));
```


This creates a small B-Tree of just the extracted values (`"active"`, `"inactive"`, ...) pointing to their rows — ignoring the rest of the JSON document entirely. Keeps writes fast and the index small.


**The trade-off:** this targeted index only knows about `status`. If a new query later needs `WHERE data->>'role' = 'admin'`, the database has **no index for** **`role`** — it falls back to a **Full Table Scan** (reading every row, opening the JSON, checking manually). A full GIN index would have handled that new query instantly, since it indexes every key/value by default.

> **Classic trade-off:** Expression indexes sacrifice future query flexibility to save disk space and keep writes fast today. GIN sacrifices write speed and disk space to stay flexible for any key/value query, always.

---


## 9. Core Takeaways (All Three Architectures)


| Concept                     | B-Tree (MySQL/InnoDB)                                               | LSM-Tree (Cassandra/DynamoDB)                                                                  | Columnar (Snowflake/BigQuery)                                                                 |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Optimized for               | Balanced reads/writes, point lookups                                | Very fast writes                                                                               | Massive analytical scans/aggregates                                                           |
| Primary structure           | Clustered B-Tree = the table                                        | SSTables + MemTable, rewritten via Compaction                                                  | Column-contiguous storage, split into blocks                                                  |
| Secondary index leaf holds  | Primary Key (not physical pointer)                                  | Primary Key (not physical pointer)                                                             | N/A — uses Zone Maps (min/max metadata per block), not row pointers                           |
| Why not a physical pointer  | Page splits move rows on disk → pointers go stale                   | Compaction constantly rewrites/deletes files → pointers go stale                               | Not applicable — Zone Maps only decide "skip block or not," they never point to a row         |
| Fix for "double lookup"     | Covering Index (embed needed columns in the secondary index itself) | N/A — still does PK lookup, but via MemTable/Bloom Filter/SSTable chain                        | N/A — good for aggregates by design; point lookups remain relatively weak even with Zone Maps |
| Distributed indexing choice | N/A (mostly single-node concept)                                    | Local Index (fast write, scatter-gather read) vs Global Index (fast read, cross-network write) | N/A — typically not distributed via secondary indexes; relies on block pruning                |


**The one golden rule underlying all of this:** physical pointers are fast to read but fragile — they break the moment data physically moves. Primary-key-based pointers are slightly slower (need a second lookup) but stay valid forever. Covering indexes exist specifically to claw back that lost read performance without reintroducing the fragility of physical pointers.


## 

