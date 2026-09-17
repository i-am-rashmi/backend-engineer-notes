---
title: "System Design : Distributed Transactions"
---


# The Saga Pattern — Distributed Transactions Without 2PC


## 1. Why This Problem Exists


In a monolith, a single relational database handles an entire business workflow as one ACID transaction — if any step fails, the database rolls everything back atomically, and consistency is essentially free. Once a system is broken into microservices, a single workflow like “place an order” spans multiple independent databases: deduct stock in Inventory, charge a card in Payment, generate a label in Shipping. There’s no longer one database to ask for a rollback — each service owns its own data, and the challenge becomes **how do you keep these independently-owned databases consistent with each other** without ever, say, charging a customer for an item that turns out to be out of stock.


---


## 2. Why Two-Phase Commit (2PC) Is Usually the Wrong Answer


**The mechanism, via analogy:** coordinating dinner with friends. **Phase 1 (Prepare):** “Can you commit to 7 PM? Don’t make other plans yet” — everyone replies yes, and everyone is now locked, unable to accept other invitations until they hear back from you. **Phase 2 (Commit):** once everyone has confirmed, you tell them all “dinner is officially on.”


Technically, a central Coordinator does exactly this across independent databases. The critical detail: during Phase 1, **each database physically locks the rows it’s about to update** — if Inventory says “yes, I’m ready,” it locks that product’s row so no other customer can buy it until Phase 2 completes.


**Why this breaks down in a real cloud environment:** if the Payment service takes an extra 15 seconds to respond to the Prepare request (a network hiccup, a temporary overload — completely normal in a distributed system), the Inventory and Shipping databases stay locked for those entire 15 seconds too, waiting on a service they have no relationship to otherwise. **The whole system’s performance degrades to the speed of its single slowest participant.** Worse: if a service crashes outright while holding a lock, everything downstream of it can freeze indefinitely, since nothing is coordinating a way out of that state. This is precisely why 2PC is considered an anti-pattern for modern, highly-available cloud systems — it trades away availability and performance for a strict consistency guarantee that most workflows don’t actually need at that cost.


---


## 3. Sagas & Compensating Actions


The Saga pattern’s core move: replace one giant, cross-network, coordinated transaction with a **sequence of independent, local transactions**, each committing and releasing its lock immediately:

1. Inventory deducts stock, commits, releases its lock.
2. Payment charges the card, commits, releases its lock.
3. Shipping generates a label, commits, releases its lock.

Because no lock is ever held across the network, the system stays fast and highly available throughout — the direct trade for this is giving up strict consistency for **eventual consistency**: for a brief window mid-saga, the system is in a state that doesn’t yet reflect the final outcome of the whole workflow.


**The problem this creates:** since Inventory and Payment already _permanently committed_ their changes in steps 1 and 2, a failure in step 3 (say, an invalid delivery address) can’t be fixed with a database `ROLLBACK` — that data is already durably saved. Instead, the system needs to explicitly run **Compensating Actions** — new, deliberate transactions that semantically undo the already-committed work: Payment issues a refund, Inventory adds the item back into stock.


---


## 4. Choreography vs. Orchestration


Once compensating actions are designed, something still has to trigger them — Payment and Inventory need to actually _find out_ that Shipping failed. Two fundamentally different coordination strategies answer this.


### Choreography — the dance troupe


No central boss. Every service listens for events from others and reacts independently. Payment publishes `PaymentSuccessful`; Shipping, listening for that event, starts preparing a label. If Shipping fails, it publishes `ShippingFailed`, and both Payment and Inventory — independently subscribed — react by running their own compensating actions.


**The concrete payoff, demonstrated by adding a new Loyalty Points service:** to award points the moment a payment succeeds, the Loyalty service simply subscribes to the existing `PaymentSuccessful` event. **Payment never needs to know Loyalty exists at all.** This is Choreography’s real strength — extremely easy to extend, since adding a new participant never requires touching any existing service’s code.


### Orchestration — the symphony


A central Conductor (a dedicated workflow engine or coordinator service) explicitly drives the whole sequence: tell Inventory to deduct, wait for success, tell Payment to charge, wait for success, and so on. If Shipping fails, the Conductor explicitly issues “Refund” and “Restock” commands to the relevant services by name.


**The same Loyalty Points addition, under Orchestration:** the Loyalty service _cannot_ just jump in on its own — the central `OrderOrchestrator`’s own workflow definition (“sheet music”) has to be explicitly rewritten and redeployed to add a new step: “after Payment succeeds, explicitly tell Loyalty to add points.” Extending an orchestrated saga always means touching the orchestrator itself.


### The key distinction: Events vs. Commands, not sync vs. async


What makes something “Orchestration” versus “Choreography” is not _how_ data physically travels over the network — it’s the **intent of the communication**. Choreography broadcasts **Events** (“a fact about something that already happened” — `PaymentCompleted`). Orchestration issues **Commands** (“a direct order to do something” — `ChargeCreditCard`). An orchestrator can be implemented using either synchronous API calls _or_ asynchronous messaging — the choice of transport is a completely separate architectural decision from the choreography/orchestration choice itself.


### Synchronous vs. Asynchronous Orchestration — a concrete failure comparison


**Method A — synchronous API calls (e.g., Spring** **`RestTemplate`****):**


```java
public void processOrder(Order order) {
    try {
        // The Orchestrator's thread STOPS here and waits for a response.
        ResponseEntity<String> response = restTemplate.postForEntity(
            "http://payment-service/charge", order, String.class);
        if (response.getStatusCode().is2xxSuccessful()) {
            // proceed to next service...
        }
    } catch (RestClientException e) {
        // Eventually times out (e.g., 30s)
        triggerCompensatingActions(order);
    }
}
```


If Payment crashes for 5 minutes, every single incoming order’s Orchestrator thread gets stuck waiting until it individually times out. At any real volume (1,000 orders during that window), 1,000 threads pile up stuck — the Orchestrator itself can run out of memory/threads and crash. This is a **cascading failure**: one dependency’s outage takes down an entirely unrelated component (the Orchestrator) purely through resource exhaustion.


**Method B — asynchronous messaging (e.g., RabbitMQ/Kafka):**


```java
// Send and immediately move on
public void processOrder(Order order) {
    rabbitTemplate.convertAndSend("payment.commands.queue", new ChargeCommand(order));
}

// Listen for the result whenever it arrives
@RabbitListener(queues = "payment.results.queue")
public void handlePaymentResult(PaymentResult result) {
    if (result.isSuccessful()) {
        rabbitTemplate.convertAndSend("inventory.commands.queue", new DeductCommand(result.getOrderId()));
    } else {
        triggerCompensatingActions(result.getOrderId());
    }
}
```


If Payment crashes for 5 minutes, the Orchestrator doesn’t notice or care — it keeps dropping `ChargeCommand` messages onto the queue, which acts as a **shock absorber**, safely buffering them. The Orchestrator’s threads are never blocked; it stays fully healthy and keeps processing unrelated orders normally. When Payment comes back online, it reconnects to the queue, pulls the full backlog, and rapidly works through it — orders were delayed, but **never lost**, and the Orchestrator never crashed in the first place. This is precisely why asynchronous messaging is the standard backbone for real-world sagas, whether choreographed or orchestrated.


---


## 5. Choosing Between Them — A Decision Framework


| Factor           | Choose Choreography                                               | Choose Orchestration                                                            |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Workflow size    | Short (2–4 services)                                              | Long or growing (5+ services)                                                   |
| Flow logic       | Simple and linear                                                 | Complex branching, timers, conditional retries                                  |
| Visibility needs | End-to-end tracking isn’t critical, or separate tooling covers it | The business needs a central dashboard showing exactly where a process is stuck |
| Team structure   | Teams want total independence, release on their own schedule      | Teams are fine with coordinating changes through a shared central controller    |


**The common real-world trajectory worth naming explicitly:** many systems _start_ with Choreography specifically because it’s fast to build and doesn’t require standing up a dedicated coordinator service. As more steps get added over time (fraud detection, loyalty points, warehouse routing), the growing web of events becomes what’s often called **“spaghetti architecture”** — a system where no single place shows the whole picture, and tracing a stuck workflow means manually reconstructing a chain of independent event logs across many services. At that tipping point, teams frequently migrate to Orchestration specifically to regain a central, debuggable view of the process.


**This directly answers the question of troubleshooting a 15-service choreographed saga:** the hardest part isn’t any single service failing — it’s that **no service, and no single log, has the full picture** of “where is this specific order right now, and what’s it waiting on.” Diagnosing a stuck order means manually correlating events across a dozen-plus independent services’ logs, typically requiring a shared trace/correlation ID threaded through every event (directly the same Trace ID mechanism from the distributed tracing/observability notes) just to reconstruct one order’s journey after the fact — something an Orchestrator would have given you for free, since it already holds the entire workflow’s current state in one place by design.


**Worked example — a 3-service food delivery startup (Order, Payment, Restaurant):** by the framework, this genuinely sits closer to the Choreography end — small workflow, simple linear flow. Orchestration is still defensible (a central place to see exactly how an order is processed makes debugging easier from day one), but it comes at the real cost of building, deploying, and maintaining a fourth service — the Orchestrator itself — for a workflow simple enough that it may not need one yet.


**Worked example — a 4-step travel booking saga (flight, hotel, car, payment) with required compensating cancellations and a live customer-support dashboard showing exactly which step a booking is stuck on:** this clearly lands on the Orchestration side of the framework. The two decisive details are the **explicit compensating-action requirement across multiple steps** (which benefits enormously from one place that knows the full sequence and exactly what needs undoing) and the **explicit live-dashboard requirement** — visibility is the single factor the framework weighs most heavily, and “the business needs to see exactly where a process is stuck” is closer to a hard requirement for Orchestration than any of the other factors.


---


## 6. Pivot Transactions & Semantic Compensation


Not every step in a real saga is created equal, and treating them as if they were is a common design mistake. Because some actions genuinely cannot be undone — sending an email, physically printing a shipping label, cutting a piece of metal in a factory — every step in a saga actually falls into one of three distinct categories:

1. **Compensatable Transactions** — steps with a true, literal undo (reserving inventory, which can simply be unreserved).
2. **The Pivot Transaction** — the actual “point of no return.” Once this step commits successfully, the saga is committed to running to completion; it can never be rolled back from here, only compensated _before_ it, never after.
3. **Retriable Transactions** — steps that run _after_ the pivot, with no compensating action at all. Instead of being undone on failure, they’re simply **retried forward, as many times as necessary, until they eventually succeed**.

**Worked example — a 4-step e-commerce checkout:**

- Step A: Deduct item from Inventory
- Step B: Charge the customer’s credit card
- Step C: Print a physical shipping label in the warehouse
- Step D: Send a “Thank You” confirmation email

**The intuitive-but-wrong answer** is to call Step C the pivot, reasoning that a physically printed label can’t be un-printed. But look at what actually happens when Step C fails — say the warehouse system goes offline for an hour, or the label printer runs out of paper. Do you cancel the entire order, refund the customer, and restock the item over a paper jam? **No — you keep retrying until the printer is fixed.** No business wants to lose a confirmed $1,000 sale over a mechanical hiccup. Because Steps C and D are actions the system will retry endlessly rather than ever undo, **they’re both Retriable Transactions, not the pivot.**


**The actual pivot is Step B — charging the credit card.** Once the customer’s money has been successfully captured, the business is financially committed to fulfilling the order — it will not refund a completed sale just because a downstream, physical step temporarily failed. Payment succeeding is the genuine point of no return: everything before it (Inventory) is still cleanly compensatable if something goes wrong; everything after it (printing, emailing) is retried forward rather than compensated, precisely because compensating them would mean unwinding a payment that’s already been deliberately treated as final.


**Why this classification matters as a design discipline, not just terminology:** it forces an explicit, upfront decision for every single step in a saga — “if this fails, do we compensate backward, or retry forward?” — rather than defaulting to a uniform “just write a compensating action for everything” approach that breaks down the moment a step (like sending an email) genuinely has no meaningful undo.


---


## 7. Idempotency & Orchestrator Crash Recovery


Async messaging protects the Orchestrator from a _downstream_ service crashing (Section 4) — but what happens if the **Orchestrator itself** crashes, mid-workflow?


**The dangerous scenario:**

1. The Orchestrator drops a `ChargeCommand` for $1,000 onto the queue.
2. Payment reads it, successfully charges the card, and drops a `PaymentSuccess` reply onto the response queue.
3. **Exactly one millisecond before the Orchestrator reads that reply, its server crashes and reboots.**

When the Orchestrator comes back up, it checks its own database, sees the order still sitting in a `Pending Payment` state, and — with no memory of ever having sent the first charge command or received a reply — concludes the payment never happened. It sends a **second** `ChargeCommand` for the same order. If Payment naively processes this at face value, the customer is charged **twice**.


**The fix: Payment must be an idempotent consumer.** The command message carries a unique `orderID` (or a dedicated Idempotency Key). Before actually charging anything, Payment checks its own database: _“Have I already successfully processed_ _`orderID: 12345`__?”_ If yes, it skips the credit card call entirely, safely ignores the duplicate command, and simply drops a `PaymentSuccess` reply back onto the queue anyway — which is exactly what unblocks the Orchestrator’s stuck workflow, letting it move forward as if the (redundant) command had just now succeeded.


**Why this connects directly to concepts already established elsewhere:** this is the exact same idempotent-consumer discipline covered under Kafka delivery semantics — a unique key checked before taking any side-effecting action, so an at-least-once delivery guarantee (which a crash-and-retry scenario like this one always produces) never translates into a duplicated real-world effect. An orchestrator’s own crash recovery is not a hypothetical edge case; it’s a routine, expected failure mode that every command in the saga has to be designed to tolerate, not just the downstream services’ own crashes.


---


## 8. The Outbox Pattern — Guaranteeing Events Actually Get Sent


Choreography (and any Saga relying on published events generally) depends entirely on services reliably publishing their events — but publishing genuinely involves two separate operations across two separate systems:

1. Update the service’s own database (e.g., set order status to `Paid`).
2. Send an event to the message broker (e.g., publish `PaymentSuccessful` to Kafka).

**The danger:** if the database update succeeds but the server crashes before the Kafka publish completes, the customer has been charged, but the rest of the saga never gets notified — the warehouse never learns it should ship the box. This is the **Dual-Write Problem**, and it’s exactly the same failure shape as the Orchestrator crash scenario above, just occurring at the boundary between one service’s database and the message broker instead of inside the Orchestrator’s own workflow.


**The fix — the Outbox Pattern:** avoid the cross-network call at the moment of the initial save entirely. Instead, write **both** the business data update _and_ the event payload into a dedicated `outbox_events` table, **inside the exact same local database transaction**. A separate background process (e.g., Debezium, reading the database’s own transaction log) later picks up that outbox row and safely publishes it to Kafka.


**The core guarantee, worth stating precisely:** this relies entirely on ordinary relational **Atomicity** — the “all or nothing” rule. Because the business-data update and the outbox-event write are glued together in one transaction, a mid-save power loss causes the database to roll back _both_ of them together, with no partial outcome possible. When the server reboots, the order still correctly says `Pending Payment`, and no event was ever sent — the system is left in a fully consistent state, with nothing lost and nothing spuriously triggered. This completely avoids the nightmare scenario of the database reflecting a payment that no other service ever heard about.


---


## 9. Summary


2PC keeps distributed data consistent by holding cross-network locks until every participant confirms readiness — but this makes the whole system only as fast as its slowest participant and risks indefinite freezes if any participant crashes mid-lock, which is why it’s generally avoided in modern microservice/cloud architectures. The Saga pattern replaces this with a sequence of independent local transactions that commit and release immediately, trading strict consistency for eventual consistency and using explicit **Compensating Actions** to semantically undo already-committed work when a later step fails.


Coordinating a saga is either **Choreography** (decentralized Events, easy to extend since new participants just subscribe without anyone else needing to know they exist, but hard to observe end-to-end as the number of services grows) or **Orchestration** (a central controller issuing explicit Commands, giving one clear place to see and modify the whole workflow, at the cost of that controller being required infrastructure). The choice is orthogonal to synchronous-vs-asynchronous transport — synchronous orchestration risks cascading failure when a downstream dependency goes down, while asynchronous messaging treats a queue as a shock absorber, staying healthy and buffering work until the dependency recovers. The decision between Choreography and Orchestration hinges most heavily on workflow size, flow complexity, and — especially — whether the business genuinely needs centralized visibility into where a process is stuck.


Real, production-grade sagas require three further disciplines beyond the basic pattern. **Pivot Transactions** split every step into Compensatable (undo backward), the Pivot itself (the true point of no return, chosen based on genuine business commitment — like a captured payment — not merely physical irreversibility), and Retriable (retried forward endlessly, never compensated). **Idempotency** must extend to the orchestrator’s own crash recovery, not just downstream service crashes — a duplicated command after an orchestrator restart needs the same idempotent-consumer treatment (a unique key checked before any side-effecting action) as any other at-least-once delivery scenario. And the **Outbox Pattern** guarantees that publishing a saga’s triggering events never falls victim to the Dual-Write Problem, by gluing the business-data update and the event payload into one atomic local database transaction, leaning on ordinary relational Atomicity to guarantee both happen together or neither does.

