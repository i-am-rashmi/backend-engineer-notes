---
title: "Databases : Storage Engines  "
---


At the most fundamental level, a database does two things: it saves data when you give it, and it retrieves it back when you ask for it. The "storage engine" is the underlying software component that dictates exactly _how_ this data is structured on disk and in memory.


### What is a database engine?


A **database engine** (also called a **storage engine**) is the underlying software component that actually handles how data is stored, retrieved, updated, and deleted on disk/memory. The database _system_ (Postgres, MySQL, MongoDB) is the whole product — the SQL parser, query planner, transaction manager, connection handling, replication, etc. The **engine** is specifically the part responsible for the physical storage layer underneath all of that.


A useful mental split:


```plain text
Client sends query
     ↓
Query Parser (turns SQL into an internal representation)
     ↓
Query Planner/Optimizer (decides HOW to execute it — which index, join order, etc.)
     ↓
Execution Engine (runs the plan)
     ↓
Storage Engine  ← this is what we've actually been discussing
     ↓
Disk / Memory
```


Everything we talked about — B-trees, LSM-trees, WAL, pages, heap files — lives in that **storage engine** layer. It's the part that answers: "given a request to read/write a row, how do I physically find it or place it, and how do I guarantee it survives a crash?"


**Important nuance**: not every database has a single fixed engine. MySQL is famous for being _pluggable_ — you literally choose per-table:


sql


```sql
CREATE TABLE orders (...) ENGINE=InnoDB;   -- transactional, B-tree based
CREATE TABLE logs (...) ENGINE=MyISAM;     -- older, non-transactional, faster for some read-heavy cases
```


Postgres, by contrast, has one built-in storage engine (though it now supports pluggable "table access methods" as an extension point, rarely swapped in practice).


## 1. Physics of Storage 


Before we talk about trees or tables, we have to look at the hardware where our data actually lives: the disk (HDD or SSD). When a database interacts with the disk, it can do so in two primary ways:

1. **Sequential I/O** **🚂:** Reading or writing data in a continuous, straight line. Think of this like writing on a long scroll of paper. You just keep adding to the bottom.
2. **Random I/O 🦘****:** Jumping around to different, scattered locations on the disk to read or update specific pieces of data. Think of this like updating specific index cards in a massive filing cabinet.

Here is the golden rule of database architecture: _**Sequential operations are exponentially faster than random operations.**_ This was massively true for older spinning hard drives (because the mechanical arm literally had to move), but it remains true even for modern SSDs due to how memory blocks are erased and written at the hardware level.


If a database wants to be incredibly fast at saving data, it needs to minimize jumping around (Random I/O) and maximize writing in a straight line (Sequential I/O).


> 🤔 Based on this hardware constraint, imagine you are designing a database for a system that receives a massive, continuous flood of data—like recording every single click, swipe, and scroll of millions of users on a social media app.  
> To get that data safely onto the disk as fast as possible without crashing your system, which write strategy would you want your storage engine to prioritize?   
>   
> Sequential I/O, it is the secret to handling massive, continuous write loads without breaking a sweat.


## 1.1 Sequential I/O design - LSM tree & SST 


If a database wants to be incredibly fast at saving data, it needs to minimize jumping around (Random I/O) and maximize writing in a straight line (Sequential I/O).


To actually build this, database engineers use something called an _**Append-Only Log.**_


Instead of searching the disk for an old record to overwrite it (which would be Random I/O), the storage engine just writes the new data at the very end of a file, like adding a new line to a receipt. Even an _update_ or a _delete_ is just a new entry appended to the bottom.


Imagine our log looks like this over time:


Plaintext


```plain text
1. user_123_status: "online"
2. user_456_status: "offline"
3. user_789_status: "online"
4. user_123_status: "offline"  <-- An update!
5. user_456: [DELETED]         <-- A deletion!
```


This makes writing incredibly fast because the disk head just continuously pours data onto the disk in a straight line.


But every design choice has a trade-off. 


> 🤔 Imagine this log grows to be 500 GB, containing billions of lines. If I ask the database, "What is the current status of `user_789`?"... what is the catastrophic problem we face when trying to answer that read request?  
> If we have a billion lines, we'd have to start at the top and read every single line until we find the most recent entry for `user_789`. In database terms, this is a _full table scan_, and it is brutally slow for reads.


So, we have a dilemma: we want the blazing fast write speed of appending to a file, but we need a way to read that data back quickly without scanning the whole thing.


To solve this, engineers added a brilliant twist. Instead of just dumping data in the order it arrives, what if we periodically took chunks of this log, sorted the data by the key (in this case, the user ID), and saved _that_ to disk?


This creates a file called an **SSTable** (Sorted String Table).

> SST - Sorted String Table , its a chunk of data from the append log that is sorted by key and stored on the disk.

Imagine our chunk of data is now neatly organized on disk like a dictionary, sorted alphabetically or numerically by the user ID:


```plain text
user_123_status: "offline"
user_456: [DELETED]
user_789_status: "online"
user_999_status: "offline"
```


> 🤔 If you know this file is perfectly sorted by the user ID, how does that change how you search for `user_789`? What classic search technique can you use instead of reading line-by-line from the top? BINARY SEARCH 


Because the data is perfectly sorted, we don't have to read it line-by-line. We can use binary search—jumping to the middle of the file, checking if `user_789` is higher or lower, and cutting the search space in half over and over. This gives us lightning-fast reads.


So, engineers combined these two ideas to create the core of the **LSM-Tree** (Log-Structured Merge-Tree) storage engine:

1. **Write fast:** Incoming data is first written to an append-only log in memory (often called a _MemTable_).
2. **Save smart:** When that memory gets full, we sort the data by key and flush it to the disk as a brand new, immutable (unchangeable) **SSTable**.

This is the exact storage strategy powering massive, write-heavy databases like Cassandra, RocksDB, and DynamoDB.


But there is a catch. Think about what happens as the system runs for days and weeks. We keep filling up memory and writing _new_ SSTable files to the disk.


> 🤔 If we end up with 100 different SSTable files on our disk, and we need to find the latest status for `user_789`, what happens? If we have to do a binary search on all 100 files to see which one has the most recent update, what new bottleneck have we just accidentally created?


We are storing multiple outdated versions of the same data, wasting disk space, and making our reads slower because we have to check so many files.


To solve this, LSM-Tree databases run a continuous background process called **Compaction**.


Because every SSTable is already perfectly sorted, the database can efficiently merge them together in the background without using much memory—very similar to zipping two sorted decks of cards together.


Imagine the compaction process grabs two SSTables from the disk:

- **Table A (Older):** `user_123: "online"`, `user_456: "offline"`, `user_789: "online"`
- **Table B (Newer):** `user_123: "offline"`, `user_456: [DELETED]`, `user_999: "online"`

The logic that compaction process follows is that the newest data always wins. 


For `user_123`, it updates their status to "offline". And for `user_456`, that `[DELETED]` marker (often playfully called a **tombstone** 🪦 in database engineering) tells the compaction process to permanently erase that record. This keeps the disk from filling up and speeds up our future binary searches.
We've just conquered **LSM-Trees and SSTables**. Because they rely on sequential I/O (appending to a log), they are the undisputed champions of the _Write-Heavy_ world ✍️  powering systems like Cassandra, DynamoDB, and RocksDB. 


## 1.2 Random I/O - Hash Index and B-Tree(B+ Tree) 


### 1.2.1 Hash Index


Imagine you are building a caching system (like Redis) or a simple key-value store. You aren't dealing with a massive flood of writes, and you _never_ need to query a range of users (like "show me all users from ID 100 to 200"). You just want to instantly say, _"Give me the data for user_999"_ and get the answer back immediately in `O(1)` time.


> 🤔 _What fundamental computer science data structure is built exactly for this kind of lightning-fast, one-to-one key lookup?_  
>  Hash maps (or dictionaries).


In a database, a **Hash Index** uses this exact concept. You give it a key (like `user_999`), it runs it through a mathematical hash function, and that function instantly tells the database the exact byte offset on the disk where that record lives.
This gives us lightning-fast $O(1) $lookups. It is the perfect storage engine choice if your application _only_ needs to look up specific, individual items by their ID (like a session cache or a simple key-value store).


But there is a major limitation that brings us to the most famous database structure of all: the **B-Tree**.


A good hash function scrambles data to distribute it evenly. This means that even though `transaction_100` and `transaction_101` are right next to each other numerically, the hash function will place them in completely different, unconnected locations on the disk - Random I/O


> 🤔 Given this scrambling effect, what happens if your banking application needs to run a query like, "Show me all transactions from ID 100 to ID 200"? Why would a Hash Index struggle with this kind of request?  
> Because the hash function scatters the data randomly across the disk, finding a range of IDs (like 100 to 200) means doing 100 separate random lookups. As we learned from our storage physics, doing massive amounts of Random I/O is a performance nightmare.


In production, maintaining a Hash Index directly on a spinning disk or SSD is generally avoided. If you try to update an on-disk hash table, you are still doing random I/O for every write, which we know is a bottleneck.
Instead, engines that rely on hash indexes (like Bitcask, used in Riak) typically keep the _entire Hash Index in RAM_. The in-memory hash map doesn't hold the actual data; it just maps a key (like `user_999`) to a specific file ID and byte offset on the disk where the data was sequentially appended.
This gives you blazing-fast $O(1)$ reads and sequential $O(1)$ writes. 


_But it introduces a hard architectural constraint: your database can only store as many distinct keys as you have RAM to hold the hash map._ If your keys exceed your RAM, the engine crashes or grinds to a halt.


Overcoming the RAM Limit of Hash Indexes 🔀


When your dataset outgrows your server's RAM, there are three primary engineering approaches:

1. 🌐 **Horizontal Sharding:** Partition your key space across multiple machines (e.g., **Redis Cluster**). Instead of 1 machine with 64 GB RAM, you use 10 machines to get 640 GB of RAM.
2. 🧊 **Tiered Memory / Flash Spilling:** Keep hot keys in RAM while paging cold data out to fast NVMe SSDs (e.g., **Redis on Flash** or **RocksDB-backed stores**). Under the hood, this often bridges a Hash Index in RAM with an LSM-Tree on disk!
3. 📦 **Compact Encoding:** Eliminate pointer overhead. For small objects, Redis packs data into contiguous memory arrays (like `ziplists`) instead of full pointer-heavy hash buckets, saving up to 80% RAM.

> ### 👉🏻 A short note on hash based cache - Redis  
>   
> Redis is fundamentally built on top of hash tables (hash indexes).  
> The crucial distinction between a system like Bitcask (Riak) and a cache like Redis is where the _data itself_ lives.  
> In the Bitcask example we just discussed, the hash index is in RAM, but the actual data values (which could be large documents or media) are written to the disk. This balances fast lookups with large storage capacity.  
> Redis, being an **in-memory data store** 🧠, takes the ultimate speed approach: it stores _both_ the hash index and the actual data entirely in RAM. When you ask Redis for `user_999`, it checks its in-memory hash table, finds the pointer, and reads the value directly from memory—without ever touching a physical disk for the read operation. This is why Redis operates with microsecond latency.  
> The hard architectural constraint still applies, but it's even stricter: your entire dataset (both keys _and_ values) must fit into your available RAM.  
> But this brings up a critical design challenge for a senior developer. If Redis keeps absolutely everything in volatile RAM to maintain its blistering speed, what happens to all that data if the server loses power or crashes? How do you think an engine like Redis might try to solve this problem so you don't lose everything, without ruining its $O(1)$ in-memory read/write speeds?  
>   
> Redis Persistence: Fast Recovery with Logs 📝  
>   
> To survive crashes without sacrificing in-memory speed, Redis combines two mechanisms:  
>   
> - 📜 **AOF (Append-Only File):** Just like the write-ahead logs in SQL databases, Redis sequentially appends every `SET`, `DEL`, or update command to a disk log. On restart, it replays this log line-by-line to rebuild the memory state.  
>   
> - 📸 **RDB (Snapshots):** To avoid replaying a multi-gigabyte log from scratch (which would take hours), Redis periodically takes a point-in-time snapshot of the entire RAM and saves it to disk.  
>   
> - ⚡ **Hybrid Recovery:** On startup, Redis loads the fast snapshot, then replays _only_ the few AOF log entries created since that snapshot was taken.


### 


Because the hash function scatters the data randomly across the disk, finding a range of IDs (like 100 to 200) means doing 100 separate random lookups. As we learned from our storage physics, doing massive amounts of Random I/O is a performance nightmare.


This is exactly why the **B-Tree** (Balanced Tree) was invented. It has been the default storage engine for relational databases (like PostgreSQL and MySQL) for decades.


### 1.2.2 B-Trees: The B+Tree Evolution


Instead of scrambling data, a B-Tree _preserves the order_ of your keys . It breaks your database down into fixed-size chunks called "pages" or "blocks" (usually 4KB or 8KB in size).


It organizes these pages into a tree structure. The top pages act like street signs pointing you in the right direction:

- _"Looking for IDs 1-100? Go to the left page."_
- _"Looking for IDs 101-200? Go to the middle page."_

Because the data at the bottom of the tree (the leaf nodes) is perfectly ordered, a range query is incredibly fast. The database just traverses down the tree to find ID 100, and then simply reads the pages from left to right until it hits ID 200. It's beautiful, ordered, and highly optimized for read-heavy workloads. 🌲


> 🤔 Remember our LSM-Tree, which just appended new data to the very bottom of a log file?   
> If a B-Tree has to maintain this strict, perfectly ordered page structure on the disk at all times, what has to happen physically on the disk when you want to _update_ a user's record right in the middle of the tree? Are we using Sequential I/O or Random I/O here?   
> Random I/O - this makes writes slower 


Because the B-Tree must keep everything in perfect order, updating a record in the middle of the tree means the disk head has to jump to that specific page, overwrite it, and potentially shuffle other pages around to maintain the tree's balance. That is classic **Random I/O**.


This perfectly illustrates the core database trade-off:

- **B-Trees:** Optimize for structured reads and range queries, but suffer on massive write loads due to Random I/O.
- **LSM-Trees:** Optimize for massive write loads using Sequential I/O, but require constant background work (compaction) to keep reads fast.

When we talk about relational databases like PostgreSQL or MySQL (InnoDB), they do not actually use a standard B-Tree. They use a highly optimized variant called a **B+Tree**.


In a standard textbook B-Tree, the actual row data (the user's name, email, etc.) is stored inside every node of the tree—including the root and the internal branches.


In a **B+Tree**, the architecture is strictly divided:

1. **Internal Nodes** **(The Routing Layer):** These nodes contain _only_ keys used for routing (e.g., "IDs < 100 go left"). They contain absolutely no row data.
2. **Leaf Nodes** **(The Data Layer):** All the actual row data is stored strictly at the very bottom of the tree.
3. **The Linked List****:** Every leaf node has a pointer to the leaf node immediately next to it, forming a continuous doubly-linked list at the bottom of the tree.

**B+ tree Performance :** 


Think about how this architecture impacts performance. If an internal database page (usually 8KB in size) only holds routing keys instead of full user records, it can hold vastly more keys per page.


Because an internal page can hold so many more routing keys, how does that affect the overall physical shape (the height) of the tree, and why does that matter for disk I/O when searching for a specific record?


To connect this directly to disk I/O: every time the database steps down a level in the tree, it has to fetch a new page from the disk. If a B+Tree holding a billion records is only 3 or 4 levels deep, it means it takes a maximum of 3 or 4 physical disk reads to find any specific record. That predictable, low I/O cost is exactly why B+Trees are the gold standard for traditional relational databases.


> 🤔 Now that we have a solid grasp on B+Trees (for structured reads) and Hash Indexes (for in-memory caching), let's look at that scenario I mentioned earlier to bridge us to our final topic.  
> If you were designing a system to handle **10 Terabytes of time-series log data** arriving continuously at high speed every single day, which storage engine from what we've discussed so far (LSM-Tree, B+Tree, or Hash Index) would you choose to handle that massive ingestion, and why?  
>   
> An LSM-Tree is exactly the right engine for this. In fact, most purpose-built time-series databases (like InfluxDB or Prometheus) use heavily optimized LSM-Trees precisely because of that continuous, append-only write speed.  
>   
> Because time-series logs are usually immutable (we generally don't go back and change a server metric from yesterday), we aren't constantly overwriting old records like we were in our previous user status example.   
>   
> **Compaction in time series LSM based databases :**   
>  In a standard key-value LSM-Tree, compaction is about **deduplication** (the newest key wins). In a time-series LSM-Tree, compaction is about **consolidation and time-bucketing**.  
>   
> Since time-series logs are mostly immutable, we rarely discard data during the initial merge. Instead, the background compaction process takes those twelve 5-minute SSTables and literally stitches them end-to-end to create a single, perfectly sorted 1-hour SSTable. Later, it might merge twenty-four 1-hour tables into one massive 1-day table.  
>   
> Time-series compaction also introduces a second powerful concept: **Downsampling** (or rollups). As data ages (say, past 30 days), the compaction process might calculate the average of the 1-second logs and save only a 1-minute average, discarding the raw high-resolution data to permanently save massive amounts of disk space.  
>   
> **Stitching** vs. **Downsampling**.  
>   
> **1. Standard Compaction (Stitching) 🧵**  
> If the compaction process _only_ stitches twelve 5-minute files into a single 1-hour file without changing the data, you don't lose anything. The full, raw data is still there. When a query asks for the data, the database simply opens that one larger file instead of twelve small ones and reads the raw logs exactly as they were written.  
>   
> **2. Downsampling (Rolling up) 📉**  
> If the compaction process includes _downsampling_ (e.g., turning 1-second logs into 1-minute averages), the harsh reality is: **you cannot get the full data back.** It is a destructive, one-way process. The high-resolution data is permanently deleted to save disk space.  
>   
> In the real world, database architects accept this trade-off because nobody usually needs millisecond-level server metrics from three years ago; they just want to see the long-term trends.  
>   
> But what if a business rule says you _must_ keep the raw data forever for legal or security reasons, but you still want the database to run fast and cheap?  
>   
> To solve this, architects use **Tiered Storage**. Before the high-resolution data is deleted from the fast, expensive SSDs (the "Hot" tier), it is shipped off as massive, read-only files to incredibly cheap, slow storage like Amazon S3 or magnetic tape (the "Cold" tier).


## **Columnar Storage** 📊 for massive analytics (OLAP).


Imagine a traditional relational database (using a B+Tree) storing employee records. The data is stored **row by row** on the disk. This means John's `Employee_ID`, `First_Name`, `Last_Name`, `Home_Address`, `Phone_Number`, and `Salary` are all written physically next to each other in one block, followed immediately by Mary's complete information in the next block.


Now, imagine this table has 50 different columns and one billion rows.


The CEO runs an analytics query asking: _"What is the average salary of all one billion employees?"_


It has to load the names, addresses, and phone numbers into memory just to immediately throw them away. When you are dealing with billions of rows, reading 49 unnecessary columns just to get 1 column creates a massive, crushing disk I/O bottleneck.


**Columnar Storage** 📊 solves this by physically storing data on the disk column by column, rather than row by row.


Instead of writing John's complete record together, the engine writes all the `Employee_ID`s in one continuous block, all the `First_Name`s in another block, and all the `Salary` values in yet another block.


This gives us two massive advantages for analytics (OLAP):

1. **Zero Wasted I/O:** When the CEO asks for the average salary, the database _only_ reads the blocks containing the `Salary` column. It completely ignores the other 49 columns, speeding up the query exponentially.
2. **Extreme Compression****:** Because a column contains only one type of data (e.g., millions of integers in the `Salary` column), compression algorithms work incredibly well compared to compressing a row with mixed strings, dates, and numbers.

This is the engine powering data warehouses like Snowflake, Amazon Redshift, and Google BigQuery.


But as always, there is a trade-off. We have optimized perfectly for reading millions of values from a single column.


> 🤔 Think about the physical layout on the disk. If HR hires a new employee and wants to do a simple `INSERT` of their complete record (ID, Name, Address, Salary, etc.), how many different places on the disk does the database have to touch to write that one person's data, and why would this be slow?   
>   
> If you have 50 columns, a single row `INSERT` forces the database to open, update, and close 50 completely different files or disk blocks.  
>   
> This is the ultimate bottleneck of Columnar storage: **It is terrible at single-row writes and updates.**  
>   
> Because of this, data warehouses like Snowflake or Redshift almost never insert data one row at a time. Instead, they batch incoming data (often using an in-memory LSM-like structure first!) and then write millions of rows into the columnar format all at once behind the scenes.


## **🏛️ The Architect's Matrix (Synthesis)**


We have now explored the four pillars of database storage engines. You know the physics, the structures, and the trade-offs:

1. **Hash Indexes (In-Memory):** $O(1)$ speed, bounded by RAM. (e.g., Redis)
2. **B-Trees / B+Trees:** Perfectly ordered, optimized for structured reads/range queries, limited by Random I/O on writes. (e.g., PostgreSQL, MySQL)
3. **LSM-Trees / SSTables:** Append-only Sequential I/O, optimized for massive write ingestion, requires compaction. (e.g., Cassandra, DynamoDB)
4. **Columnar Storage:** Data grouped by column, optimized for massive aggregations and analytics, terrible at single-row writes. (e.g., Snowflake, Redshift)

> 🤔 Imagine you are the Lead Architect for a massive new ride-sharing app (like Uber). I will give you three different microservices you need to build. Based on the read/write workloads, tell me which of the four storage engines you would choose for each, and why:  
> - **Service A (The Driver Location Tracker):** Receives a GPS coordinate ping from 500,000 active drivers every 3 seconds. We mostly just write this data, though occasionally a debugging tool needs to read a driver's recent path.  
>   
> - **Service B (The Session Manager):** Checks if a user's login token is valid every time they open the app. It must respond in under 2 milliseconds, and if the server crashes and we lose the tokens, users just have to log in again.  
>   
> - **Service C (The Billing & Accounts System):** Stores the user's profile, their current wallet balance, and their linked credit cards. Drivers and riders frequently update their profiles, and customer support often searches for users by ID or name ranges.  
>   
>   
> • **Service A (LSM-Tree):** 500,000 writes every 3 seconds is a massive firehose of data. If you tried to use a B-Tree for this, the random I/O would melt your disk. An LSM-Tree easily absorbs this via sequential append-only logs.  
> • **Service B (Hash Index):** A sub-2 millisecond latency requirement screams "in-memory." Because a server crash just means users have to log in again, the RAM-size limits and volatility of a Hash Index (like Redis) are a perfectly acceptable trade-off for $O(1)$ speed.  
> • **Service C (B-Tree / B+Tree):** Financial accounts require precise, frequent in-place updates (wallet balances), and customer support needs to do range queries (searching names alphabetically). This eliminates Columnar (bad at single updates) and Hash Indexes (bad at range queries), making the B+Tree the undisputed champion.

