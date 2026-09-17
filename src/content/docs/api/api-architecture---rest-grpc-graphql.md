---
title: "API Architecture - REST, gRPC, graphQL "
---


# API Architectures — Consolidated Study Notes


_(Merged from the senior-depth reference guide + worked examples from the Q&A walkthrough)_


Format: each topic has **Core Concept** (the mental model), **Worked Example** (the scenario that made it click), and **Senior/Staff Signal** (what separates this answer from a junior one, or what an interviewer probes next).


---


## 1. REST Design


### 1.1 What REST actually means (don’t skip this — it’s the foundation everything else stands on)


**REST = Representational State Transfer.** The core discipline: URLs are **nouns** (resources), HTTP methods are the **verbs** (actions). Before REST, APIs were action-based (`/getUser`, `/deleteUser`); REST insists the URL names a _thing_, and the HTTP method says what you’re doing to it.


| Old (action-based)     | RESTful (resource-based) |
| ---------------------- | ------------------------ |
| `POST /getUserDetails` | `GET /users/{id}`        |
| `POST /createNewUser`  | `POST /users`            |
| `POST /deleteUser`     | `DELETE /users/{id}`     |


### 1.2 Resource modelling that survives


Don’t model resources after your database tables (leaks schema) or your UI (leaks frontend flow). Model them after **stable business concepts** — things that would still make sense as a URL if you rewrote the database tomorrow.


**Worked example — cancelling an order:**
The naive instinct is `DELETE /orders/{id}` — but that implies erasing the record, and support needs it later for refunds. Enterprise systems rarely delete; they change state. The next instinct is `PUT /orders/{id}` — but PUT implies replacing the _entire_ resource, forcing the client to resend the whole payload just to flip a status. Two better options:
- `PATCH /orders/{id}` with `{"status": "canceled"}` — minimal, but reads as “update a field,” which undersells what’s actually happening.
- `POST /orders/{id}/cancel` — **treats the process itself as a resource/action.** This is the senior move: cancelling isn’t just a data mutation, it triggers a cascade (refund calculation, alerting the restaurant, freeing the driver). `POST /cancel` makes that cascade explicit and safely encapsulated, rather than implying it’s “just a field update.”


**Rule of thumb**: if the action has meaningful side effects beyond changing one field, model it as its own resource/process (`POST /cancellations`, `POST /orders/{id}/cancel`), not a disguised PATCH.


**Staff-level heuristic**: resource shape should mirror your _aggregate boundaries_ — things that are transactionally consistent together. If two things are never written in the same transaction, they’re probably not sub-resources of each other.


### 1.3 Error taxonomy & partial failure semantics


**Worked example — mixed cart checkout:** `POST /orders` with items A (in stock), B (in stock), C (just sold out). Whether to fail the whole order or partially fulfill is **a business-domain decision, not a technical one** — buying a laptop + mouse, ship the laptop even if the mouse is out; buying a left shoe + right shoe, partial fulfillment is meaningless. Always ask what the domain implies before picking a failure strategy.


Once you decide to partially succeed, the real design problem is: **a single HTTP response has one status code, but the outcome is mixed.**
- `200 OK` → client may assume total success and never check the body.
- `400`/`500` → client may blindly retry, causing a **double-purchase** of the items that already succeeded (the exact double-charge failure mode idempotency exists to prevent — these two topics are the same underlying problem).
- **`201 Created`** **+ a structured body listing per-item status** (a `failed_items` / `errors` array alongside the successful data) is the pattern real platforms like Stripe use. The catch: HTTP client libraries (fetch, Axios) resolve `201` as success automatically — if a frontend dev doesn’t inspect the body, the user never learns item C failed.
- **`207 Multi-Status`** exists specifically to signal “mixed outcome, inspect the body” more explicitly than `201` does — worth knowing as an alternative, with the trade-off that it’s less universally supported/expected than a `2xx` + structured body.


**Staff-level framing**: partial failure isn’t an edge case — it’s the _default state_ of any request spanning multiple downstream systems. Design the state machine and recovery path first; the happy path is a special case of it.


### 1.4 HTTP caching headers


**Core mechanism**: `Cache-Control: public, max-age=300` tells clients/CDNs “don’t ask again for 5 minutes.” When that window expires, instead of re-fetching the whole payload, the client sends the stored `ETag` (a fingerprint/hash of the data) via `If-None-Match`. If unchanged, the server replies `304 Not Modified` with an **empty body** — saving bandwidth and DB load even after the freshness window lapses.


**Where it gets senior**: `Vary` tells caches the response differs by another header (e.g. `Authorization`) — forgetting `Vary: Authorization` on a per-user cacheable endpoint is a classic way to leak one user’s data to another via a shared cache. `stale-while-revalidate` serves stale content instantly while refreshing in the background — a big latency win for read-heavy, eventually-consistent data.


---


## 2. API Versioning


### 2.1 Where the version goes


Two standard places: **URL** (`/v1/users` — simple, visible, testable in a browser; used by Stripe/Twitter) or **header** (`Accept: application/json; version=2` — keeps URLs clean but harder to eyeball/test). A senior engineer’s actual goal is to **avoid bumping the version at all** for as long as possible — every version bump means running parallel code paths and eventually forcing a painful client migration.


### 2.2 What counts as backward-compatible


**Safe (no version bump)**: adding a new optional response field (e.g. adding `email` alongside `id`/`name`) — standard JSON clients ignore fields they don’t recognize. Adding new optional params. Adding new endpoints.


**Breaking (needs a version bump)**: renaming a field (`id` → `userId`), changing a field’s type, removing a field, tightening validation, changing default behavior on an omitted param.


**Caveat worth knowing**: “safe” assumes lenient client deserialization. If a mobile client uses strict schema validation that rejects unknown fields, even an additive change breaks them — so “clients must ignore unknown fields” needs to be a rule enforced at the SDK level from day one, not something retrofitted later.


### 2.3 Deprecation policy + consumer-driven contracts — how they actually interact


These two mechanisms are often described separately but the real skill is knowing **the correct sequence and who owns which step.**


**Worked example — removing a** **`status`** **field, used by a mobile team’s CDC contract:**

1. **Backend deploys first**, adding `Deprecation` and `Sunset` (with an exact timestamp) headers to the response — the field itself stays alive and fully functional. A `Link` header can point to migration docs.
2. **Mobile team (the consumer) sees the warnings** in their logs/monitoring — _not_ from an email, from the headers themselves showing up in their tooling.
3. **Mobile team updates their own app code** to stop depending on `status`, then updates **their own** CDC contract to no longer expect it, and pushes the new contract to the broker.
    - Important ownership detail: the backend team does **not** edit the consumer’s contract. Consumer-driven means the consumer drives it.
4. **Months later, after the sunset date**, backend deletes the field’s code. Their CI/CD pipeline runs all published consumer contracts against the change — since the mobile contract no longer expects `status`, it passes, and the deploy proceeds safely.

**What CDC actually solves**: without it, the backend team is guessing which of N consumers depend on which fields, and either freezes the API forever (“never break anything”) or breaks someone eventually. CDC turns “did we break anyone?” from a guess into an automated, continuously-verified CI check — each consumer’s contract is a machine-readable spec of exactly the slice of the API they depend on, so the provider can change anything _no_ contract depends on, safely and continuously.


---


## 3. Idempotency


### 3.1 The problem: at-least-once delivery is the default


**Worked example — the payment double-charge:** client sends `POST /payments`, server charges the card and sends `201 Created`, but the response is lost mid-transit (phone loses signal). The client sees a timeout, assumes failure, and retries — sending a **second, brand-new** POST. Without protection, that’s a double charge.


This is not an edge case — **any client with retry logic, any queue, any load balancer that retries a failed backend, assumes at-least-once delivery** by default. “Exactly-once” is an application-level illusion built on top of at-least-once delivery + deduplication, not a network-level guarantee. Worth being able to state this precisely.


### 3.2 Idempotency keys — mechanism


Client generates a unique key (`Idempotency-Key: <UUID>`) **per logical operation**, not per HTTP attempt. Server logic:
1. Seen this key before (within the dedup window)? → skip reprocessing, return the **stored response** from the original attempt.
2. Not seen? → process normally, store `(key) → (status, response body, timestamp)`.


**Common mistake**: storing just a boolean (“this key was seen”) instead of the full original response — that leaves a retry-after-success client with no way to learn what actually happened.


**Dedup window**: how long keys are retained before being treated as new (e.g. 24h for payments). This is a **product decision disguised as an infra parameter** — it should exceed the longest plausible client retry delay (mobile clients with offline queuing might retry hours later).


### 3.3 Natural vs. synthetic keys — and which HTTP methods even need one


**Worked example — PUT for an avatar update:** if the network drops mid-`PUT /users/123/avatar` and the client retries three times, does it need a synthetic idempotency key? **No** — uploading the same image once or three times leaves the system in an identical end state. This is why `PUT`, `GET`, and `DELETE` are **inherently idempotent by HTTP spec** — repeating them is safe by design. `POST` is the one that’s _not_ inherently idempotent (each POST is normally “create a new thing”), which is exactly why idempotency keys are a POST-specific pattern.

- **Natural key**: something already unique to the operation (`order_id` — an order can only be paid once, so the ID itself prevents duplicates). No extra client-side generation needed.
- **Synthetic key**: client-generated UUID per attempt, required when there’s no natural uniqueness, or when legitimately-repeatable actions (e.g., “add $10 to cart” twice, on purpose) would otherwise get wrongly deduped by a natural key.

**Staff-level distinction**: idempotency keys protect against retries of the _same_ operation. They do nothing for two _different_ concurrent writes racing on the same resource — that’s optimistic concurrency control (ETags/version numbers on the resource), a different mechanism entirely. Don’t conflate the two in an interview.


---


## 4. Pagination


### 4.1 Why OFFSET dies — the mechanical reason


**Worked example — page 500:** `LIMIT 20 OFFSET 10000` sounds like “jump to row 10,001.” What the database actually does:
1. Loads 10,020 rows from disk.
2. Sorts all of them per `ORDER BY`.
3. **Discards** the first 10,000.
4. Returns the remaining 20.


Like being told “read me 20 words starting at word 10,000” in a book — you can’t teleport there, you have to count from the start and throw away the count. Page 1 discards 0 rows (instant); page 500 discards 10,000 (slow); at large enough offsets, this can time out or crash the DB entirely. **Offset cost is O(offset), not O(page size).**


### 4.2 The stability bug under concurrent writes


**Worked example — shifting offsets:** user is on page 1 (rows 1–20, last item “Taco Palace” at row 20). A new restaurant is inserted at row 1, pushing everything down — Taco Palace is now at row 21. User clicks “next page” → `LIMIT 20 OFFSET 20` → the response starts with **Taco Palace again**, because it shifted into the row-21 slot that page 2 now reads from. If rows were _deleted_ instead of inserted, the user would silently **skip** items instead of seeing duplicates. This isn’t rare — it’s the default behavior of offset pagination under any concurrent write load.


### 4.3 Cursor (keyset) pagination — the fix


Instead of “skip N rows,” say “give me rows _after_ this specific value”:


```sql
SELECT * FROM restaurants WHERE id > 8532 ORDER BY id ASC LIMIT 20;
```


If `id` is indexed, the engine **seeks directly** to 8532 and reads forward 20 rows — no scan-and-discard, and the cost is the same whether you’re on page 2 or page 5000. It’s also immune to the shifting-offset bug: a cursor is anchored to an actual value, not a row count, so inserts/deletes elsewhere in the table don’t move your position.


**The tiebreaker isn’t optional**: sorting by a non-unique column alone (e.g. `created_at` with second/millisecond precision under load) can produce ties, which makes the cursor ambiguous at that boundary. Always pair the sort column with a unique tiebreaker (usually the PK) for a total order: `(created_at, id)`.


**What you give up**: no “jump to page N” (cursors are sequential-only), and exact total counts become expensive at scale. Pagination strategy is a genuine UX-vs-scale trade-off, not a strictly-better choice either way — know which one your product actually needs.


---


## 5. gRPC


### 5.1 Why binary over JSON


Binary Protobuf skips the CPU cost of parsing text (matching brackets, converting strings to typed objects) — the machine reads bytes straight into memory. At millions of requests/second, this is a real bandwidth-cost and CPU-cost reduction, which is why Google/Netflix/Uber-scale internal systems adopted it over REST+JSON for service-to-service calls.


### 5.2 The four streaming modes, with concrete examples


gRPC runs over HTTP/2, enabling persistent connections — a real departure from REST’s strictly request/response model.


| Mode                 | Shape                                      | Concrete example                                                                                                                                                                   |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unary**            | 1 request → 1 response                     | Fetching a user profile by ID — REST-equivalent                                                                                                                                    |
| **Client streaming** | many requests → 1 response                 | A delivery driver’s phone streaming GPS coordinates every second; server just says “Trip recorded” once at the end. Also: chunked video upload, server stitches and confirms once. |
| **Server streaming** | 1 request → many responses                 | A live stock ticker: client sends “Subscribe to AAPL” once, server pushes price updates all day on the same connection. Also: a live log viewer.                                   |
| **Bidirectional**    | both stream independently, same connection | Real-time chat or a multiplayer game — client continuously sends player movement while server continuously pushes other players’ movement, fully decoupled directions.             |


**Why streaming matters beyond “it’s more efficient”**: HTTP/2’s built-in per-stream flow control means a slow consumer in server-streaming naturally throttles the producer without custom backpressure code — a real advantage over REST-based polling for high-throughput feeds.


### 5.3 Schema evolution — the mechanics, precisely


The `.proto` contract uses **field tags** (numbers), not names, on the wire — this is why gRPC evolution rules differ from REST’s “just add optional fields”:


```protobuf
message DriverProfile {
  int32 id = 1;
  string first_name = 2;
  string middle_name = 3;
}
```

- **Renaming is safe** (`first_name` → `given_name`) — the tag number, not the name, is what’s on the wire.
- **Deleting and reusing a tag number is dangerous.** If `middle_name = 3` is deleted and a new field `license_plate` later claims tag `3`, an **old, unrebuilt client** still has `middle_name` mapped to tag 3 in its compiled stub — it will happily display the license plate string as if it were a middle name (“Hello, Alex XYZ-123!”). Best case: garbled output. Worst case: the decoder throws a fatal error and the app crashes, because the bytes for one type don’t decode cleanly as another.
- **The fix —** **`reserved`**: permanently retires a tag number (and optionally the old field name) so the compiler physically refuses to let anyone reuse it:

```protobuf
message DriverProfile {
  reserved 3;              // retire the tag number
  reserved "middle_name";  // retire the name too

  int32 id = 1;
  string first_name = 2;
  string license_plate = 4; // next dev safely uses a fresh number
}
```

- **Changing a field’s type is (almost always) breaking** — e.g. `string first_name = 2` → `int32 first_name = 2` is a straight type mismatch on the wire: an old client’s decoder expects string-formatted bytes at tag 2, gets integer-formatted bytes instead, and either garbles the output or crashes. This is exactly the kind of change a CI schema-linter (e.g. **Buf**) should auto-reject on a PR before a human even reviews it.

### 5.4 How the contract is actually distributed (not sent per-request)


Unlike REST/JSON, the `.proto` file is **never sent over the wire during a live request** — it’s a build-time contract, not a runtime payload. The real lifecycle:
1. `.proto` files live in a **central shared repo**, accessible to both client and server teams.
2. Both sides run the **Protobuf compiler (****`protoc`****)** ahead of time to generate native-language **stubs** (Swift, Java, Go, etc.) — developers call generated functions, not raw HTTP.
3. On a PR that changes the contract, an automated tool (e.g. **Buf**) checks for breaking changes (reused tags, type changes, missing `reserved`) _before_ merge.
4. Once merged, the repo’s pipeline regenerates and **publishes the stubs as versioned packages**; consumer teams bump a dependency version to pick up new fields — no manual file-sharing.


So what actually travels over the wire on a real request is the **raw binary-encoded message bytes** — no field names, no schema, just tag-number-keyed binary data that both sides already know how to decode because they compiled the same contract ahead of time.


### 5.5 Deadline propagation


**Core concept**: a **deadline** is an absolute point in time by which the client expects the operation to finish (e.g. “2:30:05 PM”) — not a duration (“wait 5 seconds”). That distinction matters the moment a request crosses more than one service, because a _duration_ restarts naively at each hop while an _absolute deadline_ carries a true, shrinking budget forward.


**Worked example — a 4-hop chain (Mobile Client → Service A → Service B → Service C):**


The client gives Service A a 5.0-second deadline. If A does 1.0s of work and then calls B **with a blindly fresh 5.0-second timeout of its own**, B has no idea the client’s actual budget is already down to 4.0s — B might spend the next several seconds doing real work (DB calls, downstream calls) that the mobile client has already given up on and closed the app for. That work is now pure waste: CPU, DB connections, and downstream capacity spent computing an answer nobody will ever read.


**With correct propagation**, each hop computes _remaining_ budget and passes that forward, not a fresh window:


| Service hop | Processing time used | Remaining deadline propagated |
| ----------- | -------------------- | ----------------------------- |
| Client → A  | 0.0s                 | 5.0s                          |
| A → B       | 1.0s                 | 4.0s                          |
| B → C       | 2.5s (cumulative)    | 1.5s                          |


If C would take longer than the 1.5s it’s actually been given, it can fail fast with `DEADLINE_EXCEEDED` immediately — rather than burning time on an answer the whole chain above it has already abandoned. gRPC does this natively: deadlines are carried in the call context and automatically shrink as they flow through each hop, so you get this behavior without hand-rolling timeout math at every service boundary.


**Why this compounds badly at scale if you get it wrong**: in a deep call graph under load, every service re-issuing its own fresh timeout means slow dependencies keep consuming resources long after the top-level caller has abandoned the request — and because those wasted resources make the _next_ request slower too, this is one of the mechanisms behind cascading overload / retry-storm outages, not just an isolated inefficiency on one request.


**Staff-level framing**: deadline propagation is really a **load-shedding mechanism**, not just a timeout mechanism — it lets every layer in a call graph fail fast and free up resources for a request the caller has already given up on, rather than each layer optimistically finishing work nobody will consume. This is a strong thing to bring up unprompted in a “design a resilient microservices system” interview.


### 5.6 gRPC vs REST — when each wins


**gRPC**: internal service-to-service (you control both ends), high-throughput/low-latency needs, native streaming requirements, strong typed contracts across polyglot services.
**REST/JSON**: public/third-party/browser-facing APIs (gRPC needs `grpc-web` proxying to work in-browser), debuggability (JSON is human-readable in dev tools; protobuf needs `grpcurl`/reflection), standard HTTP caching infra, simple CRUD with no perf/streaming pressure.


**Common real-world pattern worth naming in interviews**: gRPC internally between services, REST/GraphQL at the public edge, translated by a gateway.


---


## 6. GraphQL


### 6.1 The problem it solves: under/over-fetching, counted precisely


**Worked example — a “User Profile” screen needing:** the user’s name, their last 3 orders, and the restaurant name for each order.


With **strict REST** (one URL per resource type): `GET /users/123` (1) + `GET /orders?user=123` (1) + `GET /restaurants/{id}` **per order** (3) = **5 total round trips** for one screen. Scale that to the last 20 orders instead of 3, and it’s **22 round trips** — this exact pattern is the famous **N+1 problem**: 1 request for the list, N requests for each item’s details. On a mobile 4G connection, this is a real, felt latency cost, not a theoretical one.


**GraphQL’s fix**: a single endpoint (`POST /graphql`), where the **request body itself** specifies the exact shape of data wanted — the query’s shape mirrors the desired response shape:


```graphql
query {
  user(id: "123") {
    name
    recentOrders(limit: 3) {
      id
      totalAmount
      restaurant { name }
    }
  }
}
```


One request, exactly the fields needed, no over-fetching (extra unused fields) or under-fetching (needing follow-up calls).


### 6.2 The server-side N+1 trap (the flip side)


Resolving that nested query naively still triggers N+1 **on the server**: 1 query for orders, then N queries (one per order) for each restaurant, because resolvers are typically written per-field, unaware of sibling data being fetched in the same request. **Fix: the Dataloader pattern** — batches all “give me restaurant X” calls that occur within one tick of the event loop into a single `WHERE id IN (...)` query. Worth knowing by name — “how do you solve N+1 in a GraphQL resolver” is a very standard interview question with “Dataloader / batch-and-cache per request” as the expected answer.


### 6.3 Why GraphQL is hard to cache — and the actual fix (APQ)


**The problem, precisely**: standard REST caching keys off the **URL** (`GET /restaurants/5` is trivially cacheable by any CDN). GraphQL sends nearly everything to the **same URL** (`POST /graphql`) — a URL-based cache can’t distinguish one query from another, so it would either serve nothing or (worse) serve one user’s private query result to a different user who happened to hit the same URL. On top of that, CDNs generally **refuse to cache POST requests at all** by convention (GET = safe to cache, POST = assumed to mutate state).


**The fix — Automatic Persisted Queries (APQ)**, worked mechanically:
1. Client hashes its full query string into a short ID (e.g. `hash=84xyz9`) and sends a **GET**: `GET /graphql?query_hash=84xyz9`.
2. **First time** the server sees that hash, it doesn’t know the query yet → replies with a specific error, `PersistedQueryNotFound`.
3. Client catches that error and sends a **POST** containing both the hash and the full query text.
4. Server stores `hash → query` in a registry, executes it, returns the result.
5. **From then on**, any client hitting `GET /graphql?query_hash=84xyz9` is a plain cacheable GET — the CDN can now cache it exactly like a REST resource.


**Why the extra round trip on the first call is worth it**: the _first_ user pays the two-round-trip “tax” (failed GET + POST-to-register), but the next N users requesting that same query get a CDN-cached response in a single trip — the backend/database doesn’t even wake up. At scale (millions of users hitting the same handful of query shapes), this amortizes to essentially free.


### 6.4 Why it’s usually wrong for internal services

- Internal services already know their access patterns end-to-end — GraphQL’s flexibility solves a problem (unpredictable, evolving client needs) that mostly exists at the client-you-don’t-control boundary, not between two backend teams who can just agree on the right endpoint shape.
- It trades a bounded, load-testable REST/gRPC cost model for an unbounded one — a GraphQL endpoint’s cost is a function of whatever the client asks for, which needs **query cost/complexity limiting** (assigning weights to fields, summing pre-execution, rejecting over-budget queries) or **depth limiting** to defend against expensive nested queries — overhead most internal services don’t need to pay.
- The genuine sweet spot is a **BFF (backend-for-frontend)** layer serving multiple evolving frontend clients (web/iOS/Android) with different data needs — that’s where the client-flexibility problem is real. Reaching for GraphQL as a general internal API style, rather than specifically for that frontend-aggregation layer, is the pattern worth being able to push back on in an interview.

---


## Quick-recall drill (test yourself before moving on)

- Why does `POST /orders/{id}/cancel` beat `PATCH` for a cancellation with side effects?
- Walk the exact 4-step sequence of who does what, in what order, when deprecating a field under a CDC contract.
- Why are `PUT`/`GET`/`DELETE` inherently idempotent but `POST` isn’t?
- Trace mechanically why `OFFSET 10000` is slow and why it’s _unstable_ under concurrent inserts — these are two separate bugs, not one.
- Why does reusing a deleted protobuf tag number corrupt data instead of just erroring cleanly?
- Walk the APQ handshake end to end, including why the first request pays a tax the rest don’t.
- Explain why a deadline (absolute point in time) behaves differently than a timeout (duration) across a multi-hop service chain, and why naive per-hop timeouts can cause cascading waste under load.
- Argue, with reasons, why GraphQL is usually the wrong choice for two internal backend services talking to each other.

If you want, I can turn these into a timed mock-interview format next — you answer, I push back with the follow-up an interviewer would actually ask.

