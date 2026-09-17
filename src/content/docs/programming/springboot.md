---
title: "SpringBoot"
---


# Spring Boot — Staff-Level Architectural Pillars


Four pillars for building/operating Spring Boot at scale: **Observability, Concurrency, Security, Testing**. Your source material covers Pillars 2–4 in depth; Pillar 1 (Observability) is referenced throughout (Trace IDs, Actuator, Micrometer) but its actual content wasn’t in this export — reconstructed in Section 0 below since the other three pillars lean on it.


---


## 0. Pillar 1: Observability (reconstructed — referenced but not included in source)


Since your notes assume this pillar going into Concurrency/Security/Testing, here’s the core of what it covers:


### Spring Boot Actuator


A set of built-in production-ready endpoints exposing the internal state of a running application without you having to build monitoring from scratch:
- `/actuator/health` — liveness/readiness status (and per-dependency health: DB, disk space, Kafka connectivity, etc.).
- `/actuator/metrics` — raw metric values (JVM memory, HTTP request counts/latencies, thread pool stats).
- `/actuator/info`, `/actuator/env`, `/actuator/loggers` — build metadata, active config, and **runtime log-level changes without a restart**.
- Security note: these endpoints expose real operational detail (env vars, internals) — they must be locked down (usually a separate management port + authentication) in production, never left open on the same unauthenticated port as your public API.


### Micrometer


The metrics-facade library Spring Boot Actuator is built on — a vendor-neutral API (like SLF4J, but for metrics) that can export the same instrumented counters/timers/gauges to Prometheus, Datadog, CloudWatch, or others by swapping a dependency, not your code. You instrument once (`@Timed`, `MeterRegistry.counter(...)`), and the export target is a config/dependency choice.


### Distributed Tracing & Trace IDs


The mechanism that makes the “VIP customer’s failed booking” scenario (Section 4.2) solvable: every incoming request gets a unique **Trace ID** generated at the edge (API Gateway or the first service it hits). That Trace ID is propagated forward on every downstream call (as an HTTP header, typically `traceparent` under the W3C Trace Context standard, or vendor-specific headers) across all microservices involved in handling that one logical request. Every log line each service writes includes that same Trace ID.


**Why this matters at scale:** at 10,000 requests/sec across 5 microservices, searching logs for `"ERROR"` returns noise from thousands of unrelated requests. Searching for one specific **Trace ID** instantly isolates every log line — across every service — belonging to that single request’s journey, showing exactly where in the chain it broke. Tools like Datadog, Splunk, Jaeger, or Zipkin visualize this as a **trace waterfall** — a timeline showing which service call took how long and where the failure/latency actually occurred. Spring Boot 3+ ships this via **Micrometer Tracing** (the successor to Spring Cloud Sleuth), typically paired with an exporter like Zipkin or OpenTelemetry.


**Correlation ID vs. Trace ID:** used near-interchangeably in casual conversation, but worth knowing the distinction if pressed — a Trace ID typically refers to the full distributed-tracing standard (with parent/child **Span IDs** for each hop), while “Correlation ID” is the more generic/older term for any identifier threaded through logs to tie a request together, which may or may not follow a formal tracing standard.


---


## 1. Pillar 2: Concurrency at Scale


### The Problem: Thread-Per-Request Exhaustion


Standard Spring MVC (`@RestController` on Tomcat) dedicates **one OS worker thread per request**, start to finish — Tomcat’s default pool is 200 threads.


**Worked example:** an endpoint calls a slow external payment API (2 seconds). 1,000 concurrent requests hit a 200-thread pool.
- All 200 threads immediately become **blocked** — doing zero CPU work, just idly holding ~1MB of stack memory each while waiting on a network socket.
- The remaining 800 requests queue in Tomcat’s `accept-count` queue. If the queue fills or requests wait too long, Tomcat starts returning **503 Service Unavailable** or connection timeouts.
- **The diagnostic signature:** CPU utilization stays low (often single digits) while the app is completely unresponsive — because the bottleneck isn’t compute, it’s threads sitting idle waiting on I/O. This is **Thread Pool Exhaustion**, and low CPU + high error rate is its fingerprint (see the Black Friday scenario in Section 4.1).


### Fix Option A: Spring WebFlux (Reactive)


Runs on an **event-loop** (typically Netty) with a small, fixed thread pool (~CPU core count). When an I/O call starts, the thread is **immediately released** back to the pool to serve other requests instead of blocking.


**Core reactive types:**
- **`Mono<T>`** — 0 or 1 item (a single Order, a single User).
- **`Flux<T>`** — 0 to N items over time (a list of Users, a live stock-price stream).


**Two routing styles, same underlying engine:**
- **Annotation-based** — identical syntax to Spring MVC (`@RestController`, `@GetMapping`), just returning `Mono`/`Flux` instead of plain objects.
- **Functional Endpoints** — explicit `RouterFunction` acting as a central switchboard mapping routes to handler methods, no annotations/reflection.


**`WebFluxConfigurer`** — the reactive counterpart to `WebMvcConfigurer`, for CORS, reactive `WebFilter`s (non-blocking request/response interception), static resources, and formatters.


**Why** **`WebFilter.filter(...)`** **returns** **`Mono<Void>`****, not** **`void`** **(the open question from your source):** in a reactive pipeline, nothing is allowed to block the thread while “doing” something — a plain `void` return would imply synchronous, immediate completion, which defeats the entire non-blocking model. Returning `Mono<Void>` signals “this operation will complete _eventually_, asynchronously,” letting the filter be composed into the same non-blocking reactive chain as everything else (e.g., `return chain.filter(exchange)` — itself a `Mono<Void>` representing the rest of the pipeline) rather than forcing the calling thread to sit and wait for the filter’s own work to finish.


### Fix Option B: Virtual Threads (Java 21+ / Spring Boot 3.2+)


Lightweight threads managed by the **JVM itself**, not the OS. When a virtual thread blocks on I/O, the JVM runtime automatically **unmounts** it from its underlying carrier (OS) thread, freeing that OS thread to run other work — you keep writing normal blocking-style code (`@RestController`, standard JDBC), but the JVM handles the “don’t waste an OS thread on I/O wait” optimization transparently.


**Choosing between the two — the deciding factor from your source:** if your service relies on **traditional blocking JDBC drivers with no reactive equivalent** (which describes most JDBC drivers, including standard PostgreSQL/MySQL drivers), **Virtual Threads are the easier adoption path** — you don’t have to rewrite your data-access layer in a reactive style (`R2DBC`, reactive Mongo driver, etc.) the way WebFlux would effectively require to get its full benefit. WebFlux’s non-blocking guarantee only holds end-to-end if _every_ I/O call in the chain is reactive — mixing in a blocking JDBC call inside a WebFlux app reintroduces the exact thread-blocking problem WebFlux exists to solve.


### Gap — Virtual Thread Pinning (a real, non-obvious gotcha, not in the source)


Virtual threads don’t unmount from their carrier thread in every blocking scenario — most notably, a virtual thread executing inside a **`synchronized`** **block** stays **pinned** to its carrier OS thread for the block’s duration, even while blocked on I/O inside it. At scale, heavy use of `synchronized` (common in older libraries, connection pool internals, or legacy code) can silently reintroduce the exact carrier-thread exhaustion problem Virtual Threads are meant to eliminate — worth knowing to look for `synchronized` usage (and prefer `java.util.concurrent.locks.ReentrantLock`, which doesn’t pin) when adopting Virtual Threads in an existing blocking codebase.


### Gap — Backpressure (a core WebFlux concept, not in the source)


WebFlux’s reactive streams have a built-in **backpressure** mechanism — a subscriber can signal upstream how many items it’s ready to receive, so a fast producer (e.g., a `Flux` streaming database rows) doesn’t overwhelm a slow consumer’s memory buffer. This is a genuinely distinctive WebFlux concept with no real equivalent in the thread-per-request or Virtual Thread models, and worth knowing exists — it’s a common area probed in “why would you actually choose WebFlux over Virtual Threads even for a greenfield service” follow-up questions (answer: backpressure control for genuine streaming workloads, e.g., large result sets or live data feeds, is where WebFlux still has an edge Virtual Threads don’t address).


### CORS Clarification


CORS is **not** WebFlux-specific — it’s a **browser-enforced** security mechanism, identical in concept for Spring MVC (`WebMvcConfigurer`/`@CrossOrigin`) and WebFlux (`WebFluxConfigurer`/`@CrossOrigin`), just configured via a different interface per framework. **Server-to-server calls are never subject to CORS** — there’s no browser runtime enforcing it; a Java/Python/Go HTTP client (`WebClient`, `RestTemplate`, `curl`) simply ignores CORS entirely and completes the request directly.


---


## 2. Pillar 3: Advanced Security


### The Filter Chain


Every secured request passes through a sequence of **Filters** (checkpoints) before ever reaching your `@RestController`. A failure at any checkpoint rejects the request immediately (typically `401`/`403`) — your controller code never even runs.


Typical sequence: **CORS Filter → CSRF Filter → Authentication Filter → Authorization Filter.**


**Authentication must happen before Authorization** — you have to establish _who_ is asking before you can evaluate _what_ they’re allowed to do.


### Passing Identity Down the Chain

1. Authentication filter validates credentials → builds an **`Authentication`** object (principal + granted authorities/roles).
2. Stored in **`SecurityContextHolder`** for the request’s duration.
3. Downstream filters/controllers/services inspect the `SecurityContext` at any point to check roles.

### Gap — CSRF, explained (mentioned in the filter list but never actually explained in the source)


CSRF (Cross-Site Request Forgery) protection matters when your app uses **cookie-based sessions** — a malicious site can trick a logged-in user’s browser into submitting a request to your app, and the browser will automatically attach the session cookie, making the forged request look legitimate. CSRF tokens defend against this by requiring a second, unpredictable value the attacker’s page can’t know. **This is why CSRF protection is typically disabled for pure stateless JWT-in-header APIs** — if the token has to be explicitly attached by your own JavaScript (not automatically sent by the browser like a cookie), a forged cross-site request simply won’t have it. Worth knowing this connection explicitly: the stateless JWT model doesn’t just simplify scaling (below) — it also sidesteps an entire class of attack that session-cookie-based auth has to actively defend against.


### Stateful Sessions vs. Stateless JWTs


|                        | Server-Side Session              | Stateless JWT                                                                                      |
| ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Where data lives       | Server’s memory/DB               | Inside the token itself (client-held)                                                              |
| Lookup on each request | Yes (looks up Session ID)        | No — only signature verification                                                                   |
| Multi-server scaling   | Needs a shared store (Redis)     | Any server with the secret key can verify independently                                            |
| Instant revocation     | Easy (delete the session record) | **Hard** — the token is self-contained and valid until it expires, regardless of server-side state |


**The revocation trade-off (the open question from your source, answered directly):** sessions make instant banning trivial — delete the row, the next request fails its lookup. JWTs don’t have that lever by default, because there’s nothing to delete; the token is cryptographically self-validating until its expiry timestamp passes. This is _the_ fundamental cost of statelessness, and it’s why short-lived access tokens (below) exist — they bound the _maximum_ damage window of a compromised or “revoked” token to minutes, not weeks.


### Gap — Actually Revoking a JWT Early (the source never resolves this)


If you truly need to kill a specific token before its natural expiry (compromised account, employee offboarding), stateless JWTs alone can’t do it — common real mitigations:
- **A short-lived blocklist** (in Redis, keyed by token ID/`jti` claim) — checked on every request, defeating pure statelessness but only for a small, bounded set of explicitly revoked tokens rather than a full session-per-user store.
- **Rely on the short access-token TTL** and instead revoke the associated **Refresh Token** (which _is_ tracked server-side) — the compromised access token still works until it naturally expires (5–15 min), but no new one can be issued after that.


Most production systems accept the second option’s small window as good enough, given how short access-token lifetimes already are, and reserve the blocklist approach for genuinely high-severity, immediate-effect scenarios.


### The Access Token + Refresh Token Pattern

- **Access Token** — short-lived (5–15 min), sent as `Authorization: Bearer <token>` on every request, fully stateless to validate.
- **Refresh Token** — long-lived (days/weeks), used _only_ to mint new Access Tokens, stored securely (HttpOnly cookie) and **tracked server-side** — this is the one piece of state that reintroduces a revocation lever into an otherwise stateless system.

**Flow:** Access Token expires → client gets `401` → client calls `/auth/refresh` with the Refresh Token → server validates it’s not revoked → issues a new Access Token (often rotating the Refresh Token too) → client retries the original request transparently.


**Why keep Access Tokens short-lived instead of one long-lived token:** bounds the blast radius of a leaked token. A stolen 10-minute token is a minor incident; a stolen 30-day token is a major one — and since Access Tokens can’t be revoked early (above), keeping the window itself small is the primary defense.


**Where to store the Refresh Token:** an **HttpOnly cookie** (with `Secure` and `SameSite` attributes) — inaccessible to JavaScript, so even a successful XSS injection can’t read it via `document.cookie`. **Never** `localStorage`/`sessionStorage` for tokens — any injected script can read those directly and exfiltrate them.


**Initial token issuance (bootstrap):** user submits credentials → server verifies (password hash check, or validates an external OAuth provider) → server generates and returns both tokens in the same response (Access Token typically in the JSON body, Refresh Token in a secure cookie).


### Gap — Signing Algorithm Choice (not covered, a real design decision)


JWTs need a signing algorithm — commonly **HS256** (symmetric — one shared secret signs and verifies; simple, but every service that needs to _verify_ tokens must also hold the secret, which is a real key-distribution risk in a microservice fleet) vs. **RS256** (asymmetric — the auth server holds a private key to _sign_, while every other service only needs the public key to _verify_, so a compromised downstream service can’t forge new tokens). **RS256 is generally the better default in a multi-service architecture** for exactly that reason — worth knowing this trade-off exists, since defaulting to HS256 “because it’s simpler” is a common real mistake as a system grows past one service.


### Method-Level Authorization


Instead of manual `if`/`else` role checks scattered through code, declare rules directly on methods:


```java
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(Long userId) { ... }
```


`@PreAuthorize` (SpEL-based, supports rich expressions like `#userId == authentication.principal.id` for object-level checks) is the modern standard; the older `@Secured` annotation only supports plain role-name checks with no expression support — worth knowing `@PreAuthorize` is the more capable, generally preferred choice today.


### Defense in Depth: Gateway vs. Service-Level Security


The industry-standard answer is **both**, at different granularities:


|                    | API Gateway (Coarse-Grained)                                                                                                                                            | Service/Method Level (Fine-Grained)                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Best for           | Perimeter checks: JWT signature validation, rate limiting, IP allowlisting, coarse route blocking                                                                       | Context-specific rules: object-level permissions (`userId == principal.id`), business-rule authorization |
| Risk if used alone | Internal services become a “soft center” — one breach or one misrouted internal call (Service A → Service B directly, bypassing the gateway) grants unrestricted access | N/A — this is the necessary complement                                                                   |


**Why gateway-only isn’t enough:** if Service A calls Service B directly over the internal network (a very normal microservice pattern), that call never passes back through the gateway — so any authorization logic that lives _only_ at the gateway simply doesn’t apply to it. A breach of one internal service, or even a routing bug, then grants unrestricted lateral access to everything else. This is precisely why authorization needs to be enforced **again**, independently, at each service — never trusting that “it must have already been checked upstream.”


---


## 3. Pillar 4: Testing Infrastructure


### Slice Testing: `@SpringBootTest` vs. `@WebMvcTest`


|               | `@SpringBootTest`                                                        | `@WebMvcTest`                                            |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| What it loads | The **entire** application — DB, all services, security, background jobs | Only web-layer components (controllers, JSON converters) |
| Speed         | Slow (full context startup)                                              | Fast — a “slice” that ignores almost everything else     |
| Use case      | True integration tests                                                   | Testing controller routing/serialization in isolation    |


**The gap** **`@WebMvcTest`** **creates:** since it deliberately skips loading `@Service`/`@Repository` beans, a controller that depends on a service will fail to start — Spring has nothing to inject.


**The fix — mocking the dependency into the test context:**


```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc; // simulates incoming HTTP requests

    @MockBean // deprecated as of Spring Boot 3.4 — see gap below
    private UserService userService;

    // tests go here
}
```


**`@Mock`** **vs.** **`@MockBean`****:** `@Mock` (plain Mockito) creates a bare fake object in memory with no Spring awareness. `@MockBean` creates the fake **and registers it in the Spring** **`ApplicationContext`**, so when `UserController` asks Spring to inject `UserService`, Spring hands it the mock instead of failing to find a real bean.


### Gap — `@MockBean` Is Deprecated (current information not in your source, verified via search)


As of **Spring Boot 3.4**, `@MockBean` and `@SpyBean` are **deprecated** in favor of Spring Framework’s own `@MockitoBean` and `@MockitoSpyBean`, and are slated for **removal in Spring Boot 3.6.0** — worth using the new annotations in any code written going forward:


```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserService userService;
}
```


There are real behavioral differences between the old and new annotations (not just a rename) — e.g., differing behavior around `@Configuration` classes and manually-registered singleton beans — so a straight find-and-replace during migration isn’t always safe; check call sites that interact with custom bean configuration.


### Gap — Other Common Test Slices (not covered, worth knowing by name)

- **`@DataJpaTest`** — loads only JPA repositories and an in-memory (or Testcontainers-backed) database, for testing repository/query logic without the web or service layers.
- **`@JsonTest`** — isolates just JSON serialization/deserialization config.
- **Testcontainers** — spins up a real Dockerized Postgres/Kafka/Redis instance for integration tests instead of mocking or using an in-memory substitute, giving much higher test fidelity for anything involving actual query behavior or driver quirks. Spring Boot 3.1+ has first-class Testcontainers support (`@ServiceConnection`), and 3.4 further improved this — genuinely worth knowing given how much of your other study material centers on real Postgres/Kafka behavior that an in-memory fake wouldn’t reproduce.

---


## 4. Scenario Walkthroughs (from your source — production incident triage)


### 4.1 Black Friday Checkout Timeout


**Symptom:** checkout page hangs, eventually `503`s. CPU at 10%, RAM plentiful.
**Diagnosis:** **Thread Pool Exhaustion** — low CPU + high failure rate is the signature of threads blocked waiting (likely on a slow DB or external API call), not threads doing real work.
**Fix:** adopt **Virtual Threads** or **WebFlux** so the server can wait on I/O without holding an OS thread hostage.


### 4.2 VIP Customer’s Failed Ride Booking


**Symptom:** one user’s request failed somewhere across 5 microservices, at a moment with 10,000 req/s of traffic — searching logs for `"ERROR"` is useless noise.
**Diagnosis/Fix:** use **Distributed Tracing** — find the user’s request in the API Gateway logs around the failure time to get their **Trace ID**, then filter the centralized logging dashboard (Datadog/Splunk) by that Trace ID to see the exact cross-service journey and pinpoint where it broke.


### 4.3 Junior Developer Sees the CEO’s Salary


**Symptom:** a valid JWT let a junior developer successfully call a sensitive `/api/employees/salaries` endpoint.
**Diagnosis:** **Authentication succeeded, Authorization was missing** — the system correctly verified _who_ the user was, but never checked whether that specific user held the required role (`ROLE_HR`/`ROLE_EXECUTIVE`) before returning the data.
**Fix:** enforce fine-grained, method-level authorization (`@PreAuthorize`) on sensitive endpoints — never rely on “they have a valid token” as a stand-in for “they’re allowed to see this.”


---


## 5. Quick-Reference Glossary

- **Thread-per-Request** — traditional Spring MVC/Tomcat model; one OS thread dedicated to a request until it fully completes.
- **Thread Pool Exhaustion** — all worker threads blocked on slow I/O; new requests queue then get rejected (`503`); diagnostic signature is low CPU + high error rate.
- **Spring WebFlux** — reactive, event-loop (Netty) web framework; small fixed thread pool, non-blocking I/O.
- **`Mono<T>`** **/** **`Flux<T>`** — reactive types for 0-or-1 vs. 0-to-N async item streams.
- **Virtual Threads** — JVM-managed lightweight threads (Java 21+) that unmount from the OS carrier thread on I/O blocking; lets blocking-style code scale without a rewrite.
- **Virtual Thread Pinning** — a virtual thread stuck to its OS carrier thread during a `synchronized` block, reintroducing the exhaustion problem Virtual Threads exist to solve.
- **Backpressure** — a WebFlux/Reactive Streams mechanism letting a slow consumer signal a fast producer to slow down.
- **Actuator** — Spring Boot’s built-in production endpoints (`/health`, `/metrics`, `/env`, etc.).
- **Micrometer** — the vendor-neutral metrics facade underlying Actuator; instrument once, export anywhere (Prometheus, Datadog, CloudWatch).
- **Trace ID / Span ID** — a unique identifier propagated across every service handling one logical request, letting distributed logs be filtered down to one request’s exact journey.
- **Filter Chain** — the ordered sequence of Spring Security checkpoints a request passes through before reaching a controller.
- **Authentication vs. Authorization** — _who_ you are vs. _what_ you’re allowed to do; Authentication must be established first.
- **`SecurityContextHolder`** — where the authenticated user’s identity/roles live for the duration of a request.
- **Stateless JWT** — self-contained, signature-verified token requiring no server-side lookup; can’t be revoked early without extra machinery (blocklist).
- **Access Token / Refresh Token** — short-lived stateless token for API calls + long-lived, server-tracked token used only to mint new access tokens.
- **HttpOnly Cookie** — a cookie inaccessible to JavaScript, the safe storage location for a Refresh Token against XSS.
- **HS256 vs. RS256** — symmetric (shared secret, simpler, riskier key distribution) vs. asymmetric (private key signs, public key verifies) JWT signing; RS256 generally preferred in multi-service systems.
- **`@PreAuthorize`** — SpEL-capable method-security annotation, the modern preferred choice over the plain-role-only `@Secured`.
- **Defense in Depth** — enforcing security at both the API Gateway (coarse) and each individual service (fine-grained), since internal service-to-service calls bypass the gateway entirely.
- **`@SpringBootTest`** — full application context integration test; slow, thorough.
- **`@WebMvcTest`** — web-layer-only slice test; fast, requires mocking service dependencies.
- **`@MockitoBean`** — the current (Spring Boot 3.4+) replacement for the deprecated `@MockBean`, registering a Mockito mock inside the Spring `ApplicationContext`.
- **Testcontainers** — Dockerized real dependencies (Postgres, Kafka, Redis) for higher-fidelity integration tests than mocks/in-memory fakes.
