---
title: "System Design : Traffic Routing & Control"
---


![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/113adef6-5461-4f3f-a459-d3b25b8a3c1c/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466YE3XSRWZ%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024812Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIH1ceWHmo7dWHa%2FujMmR8c56qPUkWvw9x89oxxz55PGkAiEAiTYntG9wYhztAazDwh%2FsbutLs4AKkpqegeT4u5dcva8qiAQIwv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDIzwvT1plszLcW3MNCrcA110V4ai3DKHQ3IM0hQUQ0R2gBV6%2BZE%2F2dRs%2FZ1Rwn4Abp3wVLrTXDIM4t9PVq%2FsR6uMOXpITGbGVfixflEX0%2FNmXdr9M5hdmxbeEElqFEQMbiipTGz%2BCTmsr2faS8gRGESewybGC%2BaJMm2w62ChjBv%2FCztUyoTULbUDRwjKdBQ%2FyGRCZE2VdTjijZ3chZ8M3VBD%2BG1Xim0cWyBp5U2AiwCKe9Ef9FblMfypAQjAMySmlGMrnRCH7RRsU%2BCxz0bYcYk3r5c1SaDITFg%2FD19eGfL3cfz%2BGYEHE3apMYdUbdbohGDhIxKdRVlZwPK8d%2BhAiPp4xJ13QpP3081JxQSGyNjInmQ6ITa508dSaq5Gb4pLWBB1gtEuLCTcLrbrt4fc2s9QBYIjV9AkWzV5aM1FFdyPdMObOWbnpRMfUCyiwfjvV77s0n27e8rjhjMWKOEc1djdXqHnmkafbT33l29b9jUtDZe9g9HD8RvZ5UQlG3bfVGbOvFECTvOr8w%2B8LXkvSKN0slT%2BcIxwGtMtuALVx369RCISXRXm%2BRUBFTXKt4uES10j9pC0BvMYFxgAxYKAgwP4I9%2F4X6xwGUQ8zyoGyFldC60%2BsxyFhMdSB6fyh8f8Oc%2FQZ43GmmsQrhsFMKTbwNYGOqUBiXARSTrJUlsuALJLV8w0iXRkN1z3yVnUJkSncMRgrGuM%2BzAJsD%2FMWT4xPHD2PBjv5xYE81hNRhxWXTzN0SepURJNsbOI6djc%2Fk4tzKz%2Ft9ovbJhRHTTT17YyOGpDdKY931jLU%2FcUv1sLwcHjOZatnteMgwp%2Fgm%2B0lEGWcMnxUgYoFmcVjIDW%2FwYBEGy9h9lC3PUtqa6FJCeGkKDzhMH2Z1k2pZ1B&X-Amz-Signature=04aa9b89c6f1bba188744233397b0595fd655b7ff5dddf3c6fe0eae0ef1c98f3&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


Load balancers distribute incoming client requests to computing resources such as application servers and databases. In each case, the load balancer returns the response from the computing resource to the appropriate client. Load balancers are effective at:

- Preventing requests from going to unhealthy servers
- Preventing overloading resources
- Helping to eliminate a single point of failure

Load balancers can be implemented with hardware (expensive) or with software such as HAProxy.


Additional benefits include:

- **SSL termination** - Decrypt incoming requests and encrypt server responses so backend servers do not have to perform these potentially expensive operations
    - Removes the need to install [X.509 certificates](https://en.wikipedia.org/wiki/X.509) on each server
- **Session persistence** - Issue cookies and route a specific client's requests to same instance if the web apps do not keep track of sessions

To protect against failures, it's common to set up multiple load balancers, either in [active-passive](https://github.com/donnemartin/system-design-primer#active-passive) or [active-active](https://github.com/donnemartin/system-design-primer#active-active) mode.


## 1. What problem is a load balancer solving?


You have **one logical service** but **many physical instances** of it running (for capacity, redundancy, or both). Clients don't want to know about 40 backend servers — they want to talk to "the API." A load balancer (LB) sits between clients and that pool of servers and:

1. **Distributes traffic** across instances so no single one is overwhelmed.
2. **Hides failures** — if a server dies, the LB stops sending it traffic and clients never notice.
3. **Enables scaling** — add/remove servers behind the LB without touching clients.

Think of it as a receptionist routing visitors to available desks, not a specific person.


```plain text
┌────────────┐
Client ─┤            │
Client ─┤    Load    ├──► Server 1
Client ─┤  Balancer  ├──► Server 2
Client ─┤            ├──► Server 3
        └────────────┘
```


Two big questions define almost every LB design decision:

- **Where in the network** **stack does it operate?** → L4 vs L7
- **How does it pick** **which server gets the next request?** → the algorithm
- **How does it know a server is healthy?** → health checks
- **How does it retire a server without dropping in-flight work?** → connection draining

---


## 2. L4 vs L7 Load Balancing


> 💡 Reference of network models for reference   
> ![Screenshot_2026-07-28_at_3.02.00_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/d38ba8d3-1757-44b7-afd1-19ecef385573/Screenshot_2026-07-28_at_3.02.00_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466SKUMIQKU%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T024813Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIQCjT5naIsRbfNEDoXtaS7wy2ZP4SFIA1VLNSQLiaVIGEAIgItUKTsEa1l9X9UKUuP7fitPc1B5tSC2Oenj5zGa7MXQqiAQIwv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDOaY3JoWfqxkXDaVsSrcA3XGgbR%2FbgGreT3CYNenXdvgzm81TkMtpQbfuehvQmW376I51fSO98VbWQm%2BEJEU3P43XCWFmQ4J%2BD5kBI7898h7qCcsH6u3gMxlhVi8Y7V3T%2B3hynnhHu%2FYHGgs86v8x3LN2Jo%2FQO2dR0CUSb%2FbaJud8qzKGVMtx7ZVhHtVFZoSfkd60WWh7S4kDcDysE1pf53TW0%2B6JdcAVLQ84i1LA8vNuJWcv%2ByvIMAK26%2BafKEckJ6uKkC5QogNqtMQFM4rOgtr7bLZ9KrMpawKMjz9qvMVoa7Ny0wCPpU4%2B6yMJM7cTcnj7%2F7S%2BB0TlfBWkrgpXH1WO1lhFYxAn5br%2B6FTnB4tIkx%2FiLjjGWiFRro%2FBO7xYD0Q%2FYsB12Y%2FAEoukesHLuyCApy%2B3ClTcccncNWujNrtxe7yUiff8Ru22WkZjiRyCTgeNBaC8WddKqyg5pI%2B8GezFPWsCbHQB4wNqx%2BQcAEfihQkNWEQb2WBvjeh6JMQnekQmeglBuFH9A23bAA0bLzsDzTzHAy3ptEDGYSiTvpNhtxnwVgZTEp6dOEi9gNa1rA4SYhc4QY5QB%2BvN4sz4f0MmLNvvHCsjVY0%2FBBQ2NyWpTIGDjvk2toLu0OTeR1l19iUS5dEyI8VL52sMNfcwNYGOqUBqtV0ziPyKkYqv%2BA52wMH1%2BXJX0ufTOMijl8%2F7FTlDopLyUguPqcrN8Aq3sdicC2CIDCi1%2FjJRHvEwa8QeRiTeyBu2w26Lk4YO4n%2Fk2hPTbzZARY%2FlAjkjOiDbeZhrI6TfkQI6weHlOon3CF5sCWe2yGL3EG%2BGoxD8QJEA60dL50jvfARM3FDI9jDh3o8Ni1GqLPCoTs7UfnSMIU4Ic6hRn76427q&X-Amz-Signature=cff5308f7613cd22c3659de67c19dc2d210b11dbd5b0aa181bfd1d2e1b7ceac0&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


This is about **which layer of the OSI model the LB reads to make its decision**.


### L4 (Transport layer — TCP/UDP)


The LB looks only at **IP address + port + protocol**. It does **not** open or read the actual request content (no HTTP headers, no URL path, no cookies — it may not even fully terminate TLS(Transport Layer Security)).

- **How it routes:** Once a TCP connection is opened, the LB picks a backend and then just forwards packets back and forth — often via NAT or direct packet rewriting. It's largely blind to what's inside.
- **Speed:** Extremely fast, low CPU cost — it's essentially plumbing.
- **Blind to content:** Can't route `/api/users` differently from `/api/orders`. Can't read cookies. Can't do anything HTTP-aware.
- **Examples:** AWS Network Load Balancer (NLB), IPVS, raw TCP proxies, HAProxy in `tcp` mode.
- **Use when:** You need raw throughput, you're load balancing non-HTTP protocols (databases, gRPC at the connection level, custom TCP protocols), or you want the absolute lowest latency overhead.

### L7 (Application layer — HTTP/gRPC/etc.)


The LB **terminates the connection and reads the actual request** — HTTP method, path, headers, cookies, body if needed.

- **How it routes:** Because it understands the request, it can make smart decisions: route `/checkout` to the checkout service, route based on a session cookie, retry a failed request on a different backend, rewrite headers, do A/B testing by header value.
- **Cost:** Slower than L4 (has to parse and often terminate TLS itself), more CPU per request, but the intelligence is usually worth it for typical web/API traffic.
- **Examples:** NGINX, Envoy, HAProxy in `http` mode, AWS Application Load Balancer (ALB), most API gateways.
- **Use when:** You're serving HTTP(S)/gRPC traffic and want content-based routing, retries, circuit breaking, canary releases, or per-path/per-tenant rules.

### Quick comparison


|                                                | L4                                         | L7                                          |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Sees                                           | IP + port                                  | Full request (path, headers, cookies, body) |
| Routing granularity                            | Per-connection                             | Per-request                                 |
| Speed / overhead                               | Very low                                   | Higher (parsing, often TLS termination)     |
| Smart features (retries, content routing, A/B) | No                                         | Yes                                         |
| Typical use                                    | Raw TCP/UDP, DB traffic, ultra-low-latency | Web APIs, microservices, HTTP/gRPC          |


> 💡 **Rule of thumb for interviews:** if the question is "how do you route HTTP traffic to microservices with path-based rules and retries" → L7. If it's "how do you load balance a fleet of TCP/UDP game servers or a Kafka broker cluster at wire speed" → L4.  
> Many real systems use **both layered together**: an L4 LB (e.g., NLB) in front for raw distribution and DDoS absorption, then L7 LBs/API gateways (e.g., Envoy) behind it for smart per-service routing.


---


## 3. Load Balancing Algorithms


Once traffic reaches the LB, _how_ does it pick which backend gets the next request/connection?


### 3.1 Round Robin


Send request 1 to server A, request 2 to server B, request 3 to server C, request 4 back to server A, and so on — cycling through the list in order.

- **Weighted Round Robin**: a variant where beefier servers get more turns (e.g., server A has weight 3, gets 3 requests for every 1 that server B gets).
- **Pros:** Dead simple, no state needed, fair if all requests are roughly equal cost and all servers are equally capable.
- **Cons:** Ignores actual server load. If one request takes 10x longer than others (e.g., a slow DB query), round robin keeps sending new work to that overloaded server anyway — it has no feedback loop.
- **Good for:** Homogeneous backends handling roughly uniform, short-lived requests (e.g., stateless API calls of similar cost).

### 3.2 Least Connections


Send the next request to whichever server currently has the **fewest active connections**.

- **Why it's better than round robin for uneven workloads:** it actually reacts to load. If server B is stuck processing a few slow requests, its connection count stays high, so new traffic naturally flows to A and C instead.
- **Weighted Least Connections:** combine with capacity weights — a server with 2x the CPU/RAM gets to hold 2x the connections before being deprioritized.
- **Cons:** Needs the LB to track state (a live connection count per backend) — a bit more overhead than round robin, and this state has to be consistent especially if you run _multiple_ LB instances.
- **Good for:** Long-lived connections (websockets, streaming), variable request costs, workloads where load isn't uniform.

Other algorithms worth knowing by name (less commonly asked in depth):

- **Least response time**: like least-connections, but factors in observed latency too.
- **Random / Weighted random**: surprisingly competitive at scale with far less bookkeeping than round robin (this is the idea behind "power of two random choices" — pick 2 servers at random, send to whichever has fewer connections).
- **IP hash**: hash the client IP to consistently pick the same backend — a simple (but rigid) way to get session stickiness.

### 3.3 Consistent Hashing


This solves a different problem than the two above: **not "which server is least loaded" but "which server should always handle requests for this particular key" (a user ID, a cache key, a session).**


**Why not just** **`hash(key) % N`****?**
Because if you add or remove a server, `N` changes, and `hash(key) % N` remaps almost _every_ key to a different server. For a cache, that's catastrophic — you basically wipe out your entire cache's usefulness on every scaling event.


**How consistent hashing fixes this:**

1. Imagine a circle (the "hash ring") representing all possible hash values, from 0 to some max value, wrapping back to 0.
2. Each **server** is hashed onto a point on this ring (e.g., `hash("server-A")` → some position).
3. Each **key** (e.g., a user ID) is also hashed onto the ring.
4. A key is assigned to the **next server clockwise** from its position on the ring.

```java
server-C
               ●
          ╱         ╲
   key2 ● ╲           ╲
         ↘  ring        ● server-A
           ╲           ╱
            ╲         ╱
               ●  ← key1 goes to next server clockwise (server-A)
              server-B
```


When you add or remove a server, only the keys that fell in that server's slice of the ring get remapped — everything else stays put. Typically only about `1/N` of keys move, instead of nearly all of them.


**Virtual nodes:** in practice, each physical server is hashed to _many_ points on the ring (e.g., 100–200 "virtual nodes" per server), not just one. This spreads each server's load more evenly around the ring and avoids one server unluckily owning a huge arc.

- **Used for:** distributed caches (Memcached, Redis Cluster), CDN request routing, sharding databases, session affinity at scale, DynamoDB/Cassandra style partitioning.
- **Not really used for:** general "give me the least busy web server" load balancing — that's what least-connections/round-robin are for. Consistent hashing is about **stable key→server mapping**, not instantaneous load awareness.

### Picking the right one — mental model


| Question you're actually asking                                                                                     | Algorithm                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| "Give this request to _whoever's free_"                                                                             | Round robin / Least connections |
| "This same user/session/cache-key must _always_ land on the same backend, and scaling shouldn't reshuffle everyone" | Consistent hashing              |
| "Requests are cheap and uniform, servers are identical"                                                             | Round robin                     |
| "Requests vary wildly in cost, or connections are long-lived"                                                       | Least connections               |


---


## 4. Health Check Design


An LB is only as good as its knowledge of which backends are actually alive. This is what "hides failures from clients" actually depends on.


### Types of health checks

- **Passive health checks****:** the LB infers health from real traffic — e.g., if the last 5 requests to server X all returned 5xx or timed out, mark it unhealthy. No extra traffic generated, but reactive (you find out only after real users hit failures).
- **Active health checks****:** the LB proactively pings each backend on a schedule (e.g., every 5s, `GET /healthz`), independent of real traffic. Faster detection, but adds background load and needs endpoints built for it.

Most production systems use **both**: active checks catch dead servers before real traffic hits them, passive checks catch degradation active checks might miss (e.g., a server that responds to `/healthz` fine but is failing on the actual business logic).


### Key parameters to tune

- **Interval****:** how often to check (e.g., every 5–10s). Too frequent = wasted load; too infrequent = slow to detect failure.
- **Timeout****:** how long to wait for a response before counting it as a failure.
- **Unhealthy threshold****:** how many consecutive failures before marking a server down (e.g., 3 in a row) — avoids flapping on a single blip.
- **Healthy threshold****:** how many consecutive successes before bringing a recovered server back in (often set higher than unhealthy threshold, to avoid readmitting a flapping server too eagerly).

### What should a health check actually verify?

- **Shallow check:** "Is the process up and can it respond?" (`GET /healthz` returns 200). Cheap, but can lie — the process is up but its DB connection pool is exhausted.
- **Deep check:** verifies the service can actually do its job — e.g., it can reach its database, its cache, its downstream dependencies. More honest signal, but risk: if the deep check pings a shared downstream (like a database) and _that_ database is slow, you might mark _every_ backend unhealthy at once (a "thundering herd" of false failures) — so deep checks need their own timeouts/circuit-breaking logic and shouldn't cause a cascading outage.

**Interview-worthy nuance:** health checks need to distinguish _"this instance is broken"_ from _"a shared dependency everyone relies on is broken."_ If you get that wrong, one flaky shared dependency can make your LB conclude your entire fleet is dead and take down the whole service — when actually nothing was wrong with the servers themselves.


---


## 5. Connection Draining (a.k.a. Graceful Deregistration)


**The problem:** you want to take a server out of rotation (deploying new code, scaling down, it failed a health check) — but it currently has in-flight requests. If you just yank it out immediately, those in-flight requests get dropped, and users see errors mid-request.


**The fix — connection draining:**

1. Mark the server as "draining" — the LB **immediately stops sending it** _**new**_ **requests**.
    1. **Existing/in-flight requests are allowed to finish naturally**, up to some **drain timeout** (e.g., 30–300 seconds depending on how long your longest legitimate request should ever take).
2. Once all in-flight requests complete (or the timeout expires, whichever comes first), the server is fully removed from the pool and can be terminated safely.

```plain text
Normal            Draining               Removed
──────►           (new: ✗, old: finish)  (terminate now)
Server X ●───────────●══════════════●───────X
         accepting    stop new        drain
         new traffic  traffic         timeout
                                       reached
```


This matters most for:

- **Rolling deployments** — you deploy new code one instance at a time; each old instance needs to drain before shutdown or you cause a wave of dropped requests on every deploy.
- **Auto-scaling scale-down** — when your autoscaler decides to remove instances under low load, draining prevents killing a server mid-request.
- **Long-lived connections** (websockets, gRPC streams, SSE) — these need _especially_ generous drain timeouts since "in flight" might mean minutes, not milliseconds.

**Cloud terms you'll see for this same concept:** AWS calls it "deregistration delay" (ALB/NLB target groups), Kubernetes calls it `terminationGracePeriodSeconds` combined with removing the pod from Service endpoints, NGINX/HAProxy call it "drain mode."


---


## 6. How these pieces fit together (end-to-end mental model)

1. Client sends a request.
2. **L4 or L7 decision** determines what the LB is even capable of seeing (raw packets vs full HTTP request).
3. **Health checks** determine the _candidate pool_ — only servers currently marked healthy are eligible.
4. **The algorithm** (round robin / least-connections / consistent hashing) picks one server from that healthy pool.
5. If a server needs to leave the pool (deploy, scale-down, failed health check), **connection draining** ensures it exits gracefully instead of dropping active work.

```plain text
Client Request
      │
      ▼
 [ L4 / L7 decision : how much can the LB see? ]
      │
      ▼
 [ Healthy backend pool : health checks filter out dead servers ]
      │
      ▼
 [ Algorithm picks one : round robin / least-conn / consistent hash ]
      │
      ▼
   Backend Server ──(if being removed)──► Draining ──► Removed
```


---


## 7. Quick-reference cheat sheet


| Concept                     | One-line summary                                                           |
| --------------------------- | -------------------------------------------------------------------------- |
| **L4**                      | Routes by IP/port only, blind to content, very fast                        |
| **L7**                      | Reads the full HTTP request, enables smart/content-based routing           |
| **Round robin**             | Cycle through servers in order; no load awareness                          |
| **Least connections**       | Send to the server with fewest active connections; load-aware              |
| **Consistent hashing**      | Stable key→server mapping; minimizes remapping when servers change         |
| **Health checks (active)**  | LB proactively pings backends on a schedule                                |
| **Health checks (passive)** | LB infers health from real traffic failures                                |
| **Connection draining**     | Stop new traffic to a server, let in-flight requests finish before removal |


### **Disadvantage(s): load balancer**

- The load balancer can become a performance bottleneck if it does not have enough resources or if it is not configured properly.
- Introducing a load balancer to help eliminate a single point of failure results in increased complexity.
- A single load balancer is a single point of failure, configuring multiple load balancers further increases complexity.

> ### 💡 Practice prompt for yourself  
>   
> Design the load balancing layer for a service with: (a) some endpoints that are cheap/uniform (GET by ID) and others expensive/variable (bulk export), (b) websocket connections for live notifications, (c) a requirement that a given user's requests during an A/B test always hit the same backend. Which algorithm(s) would you use where, and why would one algorithm not be enough for all three?


## How is an API Gateway different from a Load Balancer


    how is a load balancer different from an API gateway or are they the same ?


    Decided to directly compare load balancers and API gateways comprehensively


    Decided to directly compare load balancers and API gateways comprehensively


    Good question — they overlap a lot in practice (especially since L7 LBs and API gateways are often literally the same software, like Envoy or NGINX, just configured differently), but they're built to answer different questions.


    **Load balancer's job:** "I have N identical copies of the same service. Which one should get this request?" It's about distributing traffic across a homogeneous pool.


    **API gateway's job:** "I have a request coming in from the outside world — what does it even need, and who handles it?" It's about being the single front door for a whole system, often made of many _different_ services.


    Here's the practical breakdown:


    |                                 | **Load Balancer**                                         | **API Gateway**                                                                                              |
    | ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
    | Core question                   | Which instance of _this one service_?                     | Which _service_ handles this at all?                                                                         |
    | Typical scope                   | One service's replica pool                                | The entire system's public surface (many services)                                                           |
    | Routing basis                   | Round robin / least-conn / hash across identical backends | Path/host/API-version rules across _different_ backends (`/users` → user service, `/orders` → order service) |
    | Auth / rate limiting / API keys | Not its job                                               | Very much its job                                                                                            |
    | Request/response transformation | No                                                        | Often yes (aggregating multiple backend calls, reshaping payloads, protocol translation e.g. REST↔gRPC)      |
    | Health-aware routing            | Yes, core feature                                         | Sometimes, but usually delegates this down to the LB in front of each service                                |
    | Where it sits                   | Right in front of a set of replicas                       | In front of the whole system, before requests even reach individual services' load balancers                 |


    A concrete way to see the relationship: a typical request path is


    ```plain text
    Client → API Gateway → (routes to the right service) → Load Balancer → one of that service's instances
    ```


    The gateway decides _which service_ your request is even going to (and handles cross-cutting stuff like auth, rate limiting, request logging, maybe combining calls to 3 services into 1 response for a mobile client). Once it's decided "this goes to the order service," _that_ service typically has its own load balancer in front of its replica fleet deciding which instance actually processes it.


    Why they blur together in real tooling: something like an **AWS ALB** or **Envoy** can do both jobs at once — path-based routing across services _and_ algorithm-based distribution across each service's replicas — because both are just "L7-aware traffic decisions." Smaller systems often don't bother separating them; a single NGINX/Envoy layer does gateway-ish routing and LB-ish distribution together. Larger systems (think: real microservice architectures with dozens of services) tend to split them because the gateway's concerns (auth, rate limits, API versioning, request shaping) are a different axis of complexity than a service's own load balancing.


    **One-line gut check for interviews:** if the question is about traffic distribution _within_ one service's replicas → load balancer. If it's about _routing, security, and shaping requests across many different services at the edge of your system_ → API gateway.


    Want me to fold this into the load-balancing module as a section, or keep it as its own short note (since it's really its own topic — API Gateway pattern — that touches LB rather than being part of it)?

