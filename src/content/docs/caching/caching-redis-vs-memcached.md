---
title: "Caching : Redis vs Memcached"
---


### Redis vs Memcached (know the one-liner)


Memcached is a simple, multi-threaded, in-memory key-value string cache — lean and great as a pure LRU cache. Redis is a "data-structure server": strings, hashes, lists, sets, sorted sets, streams, bitmaps, HyperLogLog, geospatial, plus replication, Lua scripting, transactions, persistence, pub/sub, and Cluster mode. Since the user's stack already includes Redis and DynamoDB, the guide focuses on Redis. Redis is single-threaded for command execution (using an epoll-based event loop and I/O multiplexing), which is why individual slow commands (e.g. `KEYS`, big `SMEMBERS`) block everything — a recurring interview pitfall.

