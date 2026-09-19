---
title: "System Design : Traffic Routing & Control"
---


![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/113adef6-5461-4f3f-a459-d3b25b8a3c1c/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466WWA2SJYR%2F20260919%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260919T195457Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEJv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIHJb%2FHW%2FHwicjWIMwjPH98X3DYpEMyGxoGHugmgESFQxAiEA4rrGjIPFfN4lruofCe%2FG0JA7ieXF41NMqs3AgwP%2FeRUq%2FwMIZBAAGgw2Mzc0MjMxODM4MDUiDMIV9b%2FT24S%2BUyDAQCrcA8058WIlfsRak%2FRqRh3JW%2Fe4k5TNQ4qHP%2F%2Btq7Jt%2FZcqdk0ksfFoz4NcV2s8HzcGHuXvh1vhq2E7MPeiZlOVlV0yjU63WyckaszPoElmzpOa9ZuuUSEmNDATY%2Fcbpx2oLy9t1aD%2BUf6XprLMNRINZI3wK0M%2BkAx2wRcHEuFMP%2BlrxHLQ4iKikoAvmnQlJpvF4hx%2FltxYMJu7yu0r1DGsfAn2W2CnfxLqjoxlL%2Fv0ukZ%2BoOyulARS%2B1Xgp3gSPWU72X3WEH6SXWpl8YKqaG%2Bf1nJG9Sy3Fv6tRspRBWtkjrkccLNoJgvRTIAa02jijHL%2B13dGDIwxmQUzNAYppGiXYpP77yifnYcLxI4sgG8XsZ5KqDZGs8d%2BCcubbVb4zUE0FLJSpY%2FAvIMTqIA4F9CsVpxZbarG0k3grEcGvXDGvPJd2G611Qte1Pii4QpNdJ1rTpmGXSUoPS5OZ5ErYgRYHUnNj1vWTfbJs6y6%2BKuZQikl5%2BHwpZ3G4SU%2FXKt4kuOumuP1QPGihCkNoUcflVRYKkkLTP6n31S370edwSF1V6UcksB2OocIsxtgPMVaUQw5LkYnGTmTalyMXvJW67BMWmT8lr%2FfHzye6BHKobUONXnrRZWeuOKlrn1VjBOkMJC8u9UGOqUB8t2pplWbmNwwRR0LpSfiPSPUwDDPMVainRG89s9hG0SWl0d4fqilPYe1Zw7n9CLZdMKH%2FP%2BNvXXT%2Fb4spWsDzBrx5de0QzMMmX4HXKfAPH6AQNQ862OC6QTzb5sohsCou7BbBlcQattbOWnZUuuwogw%2BgO%2FbbqdrV3LoUbFcpfiWVP84Z8d%2BnUR%2FW%2Fj3gvwW5om0rVbertyzhqsf2e4WlJX%2B2T7x&X-Amz-Signature=eb5a20995550ae438b0c63ad66f86e32cb16fd8ce7135c9bf38d88a21df33c46&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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
> ![Screenshot_2026-07-28_at_3.02.00_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/d38ba8d3-1757-44b7-afd1-19ecef385573/Screenshot_2026-07-28_at_3.02.00_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466VPAI3GCS%2F20260919%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260919T195459Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEJn%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJHMEUCIDnDl9lCymff0HTrvY122OxD9rAQGRk36xl3%2BWEaqNmgAiEAiliuCCqayRn9ze38j%2FJFIA1tAMVv8%2FSL9CKapV3y3zAq%2FwMIYhAAGgw2Mzc0MjMxODM4MDUiDJP4rFY%2FaLP7EfDjOyrcA5NYkKxsifApCEbrb0sEIdAJgTSRD0b%2FoT8rXiMQijFGqGt3J3YuFARIlAmAbASe0p51cMwaSJuqPWi3Ar3K%2FQ%2FkCstllvQnJkcBp7RhYdpaWNIN7t1sfR6wVfzQ45AOlU351XYqoMuiKmqLk9HEa0FxbwQB%2Fym3O2sNQGU3zpEOp1pjLScHyKcaUKueWcybJ2HVf9cmarZ3xEVOLBwlOuy5B3Iy2sMws5oToeAHdl8cRUuOTeAbhXMKQGH7iIG3uOeQwofLfJ1WcAeOjnxdxvK7Kr6l68Hz0t3trZi9L%2F7G3cibqg%2FF%2Fyo6%2BcvnVRlvWOE0G19F93CVY67ho96VH103KKuqHC0K3frS1z1X9hgnDV7cA74BLFlz%2FeWcDr7eQ6vhUxOFsGVvBIs4v435YBbohiUL8gc8b9T7t8rUKo%2F12V%2FeUIUfkZBxsy7PYCXWACEJqUaa713lzEeitZtyNAhWI8DzbxYFDHuJM5aLS7il3i0%2FrpYB1Ed9aT3VONyRAHM9s9cGgMInmnr687cAcLF9R8TVMEHGdXUOfD62eUPmzZYFrpSEoIyf5n%2Bf2DmvJTXOwJPrBNHFxbNgktkYak4wjJhyOBkT4ppW8reXvwR1nb410Sp1PGhn0nYOMMT6utUGOqUBV2YcAvoyQVP62STfEyZ2%2BR%2Fgv%2FwNZeqCkmNqqGrId1lhSlqAE%2FnHyee7OPV5nljHHWNrdWrThxr2xjsV6NSrW89ZVj7ZGbVGSzVUoqqrtuOfGseBxIYJqY7PY%2BleBzYdE81qQTw9ThJzhRMq6SBqFoXit3dHAXyxlWgStMeR0PsoMZ5ywGu%2BEXA0cw1%2FJ%2FJyBt2Fr4VdSOjoqpyn5gQ6Lqc7Ytg3&X-Amz-Signature=bd43355a2591e126fdafdb9cd61106091cea5798bad406d2621a5007fed1db08&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


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

