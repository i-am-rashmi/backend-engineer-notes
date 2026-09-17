---
title: "System Design : Service Boundaries "
---


# Service Boundaries & Microservices


The best way to handle distributed transactions is to avoid needing them in the first place — and that’s entirely a function of getting service boundaries right in the first place. This is the architectural decision everything in the Saga/2PC notes exists to work around.


---


## 1. The Distributed Monolith Trap


The industry swung hard from monoliths (one codebase, one database) to microservices (many small, independent services). But when a system is sliced in the wrong places, the result is a **Distributed Monolith**: something with all the deployment complexity and network latency of microservices, but where the services are so tightly coupled that a single feature change requires updating several of them at once, in lockstep.


**The classic mistake that causes this: slicing by technical layer instead of business capability.** Splitting into a “Frontend Service,” an “API Gateway Service,” and a “Database Service” looks like microservices, but adding one simple feature — a new “Discount Code” field — now requires touching and redeploying all three together. You haven’t decoupled anything; you’ve just made a monolith that talks to itself over a slower network.


---


## 2. Finding the Seams: Bounded Contexts


The fix, borrowed from Domain-Driven Design (DDD), is the **Bounded Context**: instead of looking at the code’s technical layers, look at the actual business. Group things by **business capability**, and design each service to own everything it needs — from UI concerns down to its own database — to fulfill one specific business area end to end.


**Worked example — a hospital management system** with six features: appointment scheduling, X-ray storage/viewing, insurance claims, staff shift management, pharmacy prescriptions, and patient billing. Grouped by genuine business capability rather than technical layer:

- **Billing & Insurance** — the financial lifecycle.
- **Scheduling** — patient appointments _and_ staff shifts together, deliberately, because you can’t book a patient without a doctor on shift; these two features share a real business dependency.
- **Imaging (X-rays)** — heavy, specialized diagnostic file handling, naturally distinct from everything else.
- _(A commonly-missed fourth: pharmacy prescriptions would naturally form its own “Clinical Treatment” service — a good illustration that finding correct boundaries usually takes more than one pass.)_

**The payoff:** if the hospital changes its insurance billing rules, the Scheduling team doesn’t need to test or deploy anything at all — the two are genuinely, structurally independent, because the boundary was drawn around real business capability rather than an arbitrary technical split.


---


## 3. Data Ownership & the “Shared Nothing” Rule


The golden rule: **each microservice completely owns its own database, and no other service is ever allowed to connect to it directly.** Direct cross-service database access is exactly what creates the Distributed Monolith at the data layer — services become coupled to each other’s internal schema, and that schema can never change safely again.


**The hard problem this creates:** multiple services legitimately need overlapping data about the same real-world entity. Scheduling needs a patient’s name and phone number for reminders; Billing needs their name and address for mailing invoices. In a monolith, one shared `Patients` table serves everyone. In microservices, that’s exactly what’s forbidden.


**Two strategies to resolve this — widely considered the single hardest problem in microservices architecture:**


### Option 1 — The API Call (“ask when you need it”)


Billing stores nothing about the patient itself; every time it needs to print a bill, it makes a live network call to whichever service actually owns that data (“give me the details for Patient #123”).


**The risk:** if the owning service (Patient Service) goes down, Billing is completely stranded — it can’t function at all, even for work that has nothing conceptually to do with the Patient Service’s health. And a live network call on every single operation adds real, cumulative latency.


### Option 2 — Data Duplication (“keep your own lite copy”)


Billing maintains its _own_ local table holding just the fields it actually cares about (name, address) — nothing about medical history, insurance codes, or anything outside its concern. When the source of truth changes (a patient updates their address), an event (`PatientAddressUpdated`) is published, and Billing’s local copy updates itself asynchronously, in the background.


**The trade-off this introduces: Eventual Consistency.** The duplicated copy can be briefly out of sync with the source of truth.


**Worked failure case:** a patient’s address update takes 5 minutes to propagate through a backed-up message queue. If Billing auto-generates and mails an invoice during that window, the bill goes to the old address. **Is this catastrophic?** No — mail gets forwarded, bounces back, or the patient calls in. It’s an administrative annoyance, not a system failure, and the system itself stayed fast and fully available the entire time. **This is the fundamental trade Eventual Consistency makes:** perfect, instantaneous accuracy (which demands tight coupling and synchronous network calls) is traded for availability and resilience — and for the overwhelming majority of business data, that trade is clearly worth it.


---


## 4. When a Monolith Is Actually the Correct Choice


Everything above — Sagas, compensating actions, idempotency, the Outbox Pattern, bounded contexts, eventual consistency — is a _substantial_ amount of engineering machinery just to safely place an order or mail a bill. That machinery has to be worth its cost, and often it isn’t yet. Three concrete situations where a monolith is the smarter move:

- **Small scale** — a project not serving significant traffic doesn’t need message queues, outbox tables, and compensating-action machinery it will likely never stress-test in practice.
- **Finding product-market fit** — when a startup’s core business model is still changing constantly, a well-organized **Modular Monolith** lets a small team rewrite features and iterate quickly, without fighting network boundaries between services whose _responsibilities themselves_ are still in flux.
- **Small team size** — a handful of developers trying to maintain 15 microservices, 15 databases, and 15 deployment pipelines will be paralyzed by operational overhead rather than accelerated by architectural cleanliness.

**Martin Fowler’s First Rule of Distributed Object Design: “Don’t distribute your objects.”** Starting with a cleanly-structured monolith and only splitting off microservices once the system genuinely can’t handle the load, or the engineering team has grown too large to work productively in one codebase, is frequently the most successful real-world trajectory — not a compromise, but often the correct sequencing.


---


## 5. Additional Concepts Worth Knowing


A few directly relevant ideas that extend this discussion, not covered in the session but standard companions to it:


**Conway’s Law** — “organizations design systems that mirror their own communication structure.” This is the reason bounded-context boundaries and _team_ boundaries tend to converge in practice: if Scheduling and Billing are owned by the same team, the software boundary between them tends to blur over time regardless of the original design, and conversely, drawing a clean bounded context around a business capability often only sticks if a single team owns it end to end. Worth knowing this by name — it explains why microservices decisions are frequently as much an organizational decision as a technical one.


**The Strangler Fig Pattern** — the standard, practical way to migrate an existing monolith toward microservices incrementally rather than in one large rewrite. New functionality (or a carved-out bounded context) is built as a new service sitting alongside the monolith; traffic for that specific capability is gradually rerouted to the new service (often via a proxy or gateway), while the rest of the system continues running unchanged in the monolith. Over time, more capabilities are peeled off this way until the original monolith either shrinks to a small core or disappears entirely — named for how a strangler fig plant grows around a host tree, eventually replacing it, without the tree needing to be cut down and replanted all at once.


**Anti-Corruption Layer (ACL)** — a DDD pattern for the specific case where a bounded context needs to integrate with another system (a legacy system, a third-party API, or even another bounded context with a fundamentally different data model) without that external model “leaking” into and corrupting its own internal model. A translation layer sits at the boundary, converting between the external representation and the service’s own internal one — directly the same idea as the Adapter pattern from your GoF notes, applied specifically at the level of an entire bounded context’s model rather than a single class interface.


**Backend for Frontend (BFF)** — when multiple bounded contexts need to be composed together to serve a single client screen (a mobile order-summary page pulling from Billing, Scheduling, and Imaging simultaneously), a dedicated BFF service sits between the client and the underlying services, aggregating and reshaping their responses into exactly what that one client needs — keeping the underlying bounded contexts themselves clean and unaware of any particular UI’s specific composition requirements.


---


## 6. Summary


Microservices done wrong produce a **Distributed Monolith** — all of the network/deployment cost of microservices, none of the independence — most commonly by slicing along technical layers instead of business capability. **Bounded Contexts** (from DDD) fix this by grouping services around real business capabilities, verified by the test: can this team change and deploy their service without coordinating with any other team? **Shared Nothing** at the database layer is the non-negotiable companion rule — no direct cross-service database access — which forces a real design decision about overlapping data ownership, resolved either via live API calls (simple, but couples availability across services and adds latency) or data duplication with eventual consistency (resilient and fast, at the cost of brief windows of staleness that are usually a minor, tolerable business annoyance rather than a system failure). Despite all of this, a monolith remains the correct starting point for small-scale systems, teams still searching for product-market fit, or small engineering teams — Fowler’s “don’t distribute your objects” is a genuine rule of thumb, not just a hedge. Conway’s Law, the Strangler Fig migration pattern, Anti-Corruption Layers, and BFFs round out the practical toolkit for actually executing a boundary decision once it’s made.

