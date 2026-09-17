---
title: "SOLID Principles"
---


# SOLID Principles — Senior-Level Notes


The five principles told through one growing startup’s codebase — QuickBite, a food delivery app — because every SOLID violation is really the same story: code that worked fine on day one starts actively fighting you as the team and requirements grow.


---


## 0. The Core Intuition


SOLID exists as a defense mechanism against changing requirements. When a product manager asks for a new feature, you shouldn’t have to rewrite half the application. The overarching goal is designing software like **LEGO bricks** — easy to swap, extend, and attach — rather than a solid block of concrete that cracks the moment you try to modify it.


At a senior level, the principles themselves are the easy part. The actual skill is knowing **when adhering to them too strictly starts costing more than it gives** — every principle below has a “senior perspective” callout for exactly this reason, because over-applying SOLID is a very real, very common way for a codebase to become harder to work in, not easier.


---


## 1. Single Responsibility Principle (SRP)


**Baseline:** a class should have only one reason to change.


QuickBite’s MVP ships a single `Order` class handling everything: calculating the total, generating an HTML receipt, and saving to the database — three genuinely distinct jobs living in one file. This works fine on day one, with one engineer. It stops working the moment the team grows: Alice is updating the receipt format, Bob is optimizing the database query, and Charlie is adding a discount calculation — all three editing `Order.ts` simultaneously. This produces **merge conflict hell** (everyone stepping on each other in source control) and **fragility** (a typo in the HTML receipt code can accidentally crash the core checkout calculation, because unrelated concerns are welded together in one file).


The class has three reasons to change — business rules, UI formatting, and database storage — which is precisely what SRP says shouldn’t happen. The fix: split it into an `Order` class (business rules), an `OrderRepository` (database), and a `ReceiptFormatter` (UI) — each with exactly one job, and exactly one reason to ever be opened and edited.


**The senior trade-off:** over-applying SRP leads to “class explosion,” where understanding one simple flow requires opening ten files to trace a single piece of logic. It’s worth being precise about what “one reason to change” actually means, since it’s commonly over-simplified into “keep classes tiny” — the more accurate framing (from Robert Martin’s later clarification of the principle) is **one reason to change per distinct stakeholder or business concern**, not an arbitrary line-count or method-count target. A class handling three tightly related steps of the _same_ business concern isn’t automatically an SRP violation just for having multiple methods; a class that would need to change for two _unrelated_ reasons (a UI team’s request and a database team’s request) is the actual smell SRP is naming.


---


## 2. Open/Closed Principle (OCP)


**Baseline:** software should be open for extension, but closed for modification.


QuickBite launches discounts with a `DiscountCalculator` using a chain of `if/else` statements keyed on a discount-type string (`WELCOME`, `FESTIVAL`, `STUDENT`). This works until marketing starts inventing a new discount code every week — at which point every single new promotion requires a developer to reopen this exact file and add another `else if`. The file is never “closed” — it’s perpetually being modified for a class of change (new discount types) that should be routine, not risky.


The fix uses polymorphism: define a `DiscountRule` interface with a single `calculateDiscount(total)` method, then implement each discount as its own class (`WelcomeDiscount`, `BuyOneGetOneFreeDiscount`, and eventually `RainyDayDiscount`). `DiscountCalculator` now depends only on the _interface_, never on any specific discount’s logic. Adding a brand-new discount type means writing a brand-new class that implements the contract — `DiscountCalculator` itself is never touched again. This is what “open for extension, closed for modification” concretely means: the _set_ of behaviors can grow indefinitely without editing the code that consumes them.


**The senior trade-off:** prematurely abstracting “just in case” adds unnecessary indirection before there’s a real, demonstrated need for it. A common, useful rule of thumb: wait for the second or, better, third time a requirement actually changes in a given direction before introducing an abstraction for it — abstracting after one hypothetical future need is usually paying complexity for a flexibility that may never actually get used. A separate, pragmatic real-world response to the discount problem worth naming, even though it’s not the OOP answer: moving simple flat-percentage discounts into database-driven configuration entirely, so launching a new promo code doesn’t require a code deploy at all — reserving the interface/polymorphism approach specifically for discounts complex enough that they genuinely need real code, like conditional multi-item logic that can’t be expressed as a stored percentage.


---


## 3. Liskov Substitution Principle (LSP)


**Baseline:** subclasses should be fully substitutable for their base class without breaking the program’s correctness.


QuickBite has a `DeliveryDriver` base class with `routeToDestination()` and `deliverOrder()`. When drone delivery launches, a junior engineer extends `DeliveryDriver` to reuse the existing dispatch code — but a drone doesn’t navigate roads, so `DroneDelivery.routeToDestination()` just throws an error. An automated dispatcher looping over a list of `DeliveryDriver` instances and calling `routeToDestination()` on each one crashes the instant it reaches a drone.


This is an LSP violation specifically because `DroneDelivery` **cannot honestly substitute** for `DeliveryDriver` — it changes the expected behavior of an inherited method rather than fulfilling it. The root cause is usually a flaw in domain modeling: inheritance was used purely to reuse dispatch code, not because a drone genuinely _is a_ driver in any meaningful behavioral sense. The fix is to stop forcing the shared parent and instead model the behavior both vehicles actually share: introduce a `Deliverer` interface with just `deliverOrder()`. A `Car` can still have its own `routeToDestination()` method separately, but nothing forces a `Drone` to pretend it drives on roads — any `Deliverer` (car, drone, bicycle) can now be swapped into the system without breaking anything, because none of them are claiming a capability they don’t actually have.


**The senior trade-off:** LSP violations are usually a symptom, not the disease — they almost always point to a deeper flaw in how the domain was modeled in the first place. The general remedy worth internalizing: **favor composition over inheritance** as a default. Inheritance implicitly promises “this subclass behaves exactly like its parent, plus possibly more” — a promise that’s very easy to accidentally break under real-world requirement pressure. Composition (building a class out of the pieces it needs, rather than inheriting a bundle of behaviors it may only partially want) sidesteps the LSP trap entirely, because there’s no implicit substitutability promise being made to begin with.


### The recurring confusion: OCP vs. LSP


Both principles lean on interfaces and inheritance, which makes them easy to blur together — but they guard against two fundamentally different failure modes, best separated with a wall-outlet analogy:

- **OCP is the builder’s rule.** The house’s wiring is closed for modification (you don’t tear open the drywall to add a new lamp), but the system is open for extension (you can plug in a lamp, a TV, or a blender whenever you want). OCP is _why the outlet exists at all_ — so new things can be added easily as the house grows.
- **LSP is the appliance’s rule.** Imagine a new toaster that plugs in perfectly (it fits the interface) but is wired backward internally and blows the house’s fuse the moment it’s plugged in. It fit the _shape_ of the contract but violated the _expected behavior_ of anything using that contract.

Applied to a concrete test case: QuickBite’s `CheckoutService` expects a `CreditCard` interface. A new `PrepaidGiftCard` implements that interface cleanly — no rewrite of the checkout engine was needed to _accept_ it, so OCP was successfully followed. But if the gift card, on insufficient funds, freezes the entire checkout screen instead of returning a normal “declined” result the way every other card does, that’s the fuse blowing — an LSP violation, entirely independent of whether OCP was respected. **OCP asks “can I plug new things in without rewriting the core?”; LSP asks “when I do plug something in, does it honestly behave the way everything else expects?”** — the same tools, two different questions.


---


## 4. Interface Segregation Principle (ISP)


**Baseline:** don’t force a class to depend on methods it doesn’t use.


QuickBite’s automated kitchen defines one master interface, `SmartAppliance`, with `bakePizza()`, `spinToMix()`, and `dispenseIce()`. `SmartOven` is forced to implement all three, even though an oven has no meaningful way to spin-mix or dispense ice — its implementations of those two methods are empty stubs.


This is a genuine, not merely cosmetic, problem: an empty method is a ticking time bomb. If some other part of the system loops over all appliances and calls `spinToMix()` uniformly, the oven either silently does nothing (a confusing, hard-to-debug no-op) or crashes outright. It also means every time the interface grows (adding `brewCoffee()`, say), every appliance that doesn’t actually brew coffee — the oven, the fridge — has to be revisited just to add another meaningless stub.


The fix is to split the bloated interface into small, cohesive ones matching real capability groupings: `BakingAppliance` (with just `bakePizza()`), `CoolingAppliance`, `MixingAppliance`, and so on. `SmartOven` now implements only `BakingAppliance` — it never even sees a `dispenseIce()` method it has no business implementing, eliminating the entire class of accidental-invocation bugs.


**The senior trade-off:** taken to an extreme, ISP produces a proliferation of single-method interfaces scattered everywhere, which can obscure genuinely cohesive behavior that belongs together. The judgment call is grouping methods that represent one real, coherent capability — not mechanically splitting every interface down to one method each just to satisfy the letter of the rule. `BakingAppliance` having just one method today is fine; if a baking appliance naturally also needs `preheat()` and `setTemperature()`, those belong together in the same interface, because they represent one cohesive capability, not three separate ones that happen to be unrelated.


---


## 5. Dependency Inversion Principle (DIP)


**Baseline:** depend on abstractions, not concretions — high-level business logic shouldn’t be hardwired to specific low-level implementation details.


QuickBite’s `CheckoutService` (the high-level business policy) directly instantiates `StripeAPI` (a low-level implementation detail) and calls it internally. This tightly glues the two together: if the CEO decides tomorrow that Stripe’s fees are too high and the company needs to switch to PayPal, `CheckoutService` itself has to be edited — the business logic file is now coupled to a specific vendor’s SDK, for no reason intrinsic to what checkout actually needs to do.


**The analogy that makes this click:** think of `CheckoutService` as a hiring manager. A bad job posting says “I need to hire StripeAPI to process payments” — if StripeAPI quits (or the company drops the vendor), the manager is stuck. A good job posting describes a _role_: “I need to hire a Payment Processor who knows how to charge money.” In code, that role is an interface:


```typescript
interface PaymentProcessor {
  charge(amount: number): boolean;
}

class StripeAPI implements PaymentProcessor {
  charge(amount: number): boolean { /* Stripe logic */ return true; }
}

class PayPalAPI implements PaymentProcessor {
  charge(amount: number): boolean { /* PayPal logic */ return true; }
}
```


`CheckoutService` now depends only on `PaymentProcessor`, never on `StripeAPI` or `PayPalAPI` by name.


### The missing piece: who actually creates the concrete instance?


If `CheckoutService` is no longer allowed to `new StripeAPI()` internally (that would just recreate the original tight coupling), something else has to hand it the concrete tool it needs. This is **Dependency Injection**: instead of a class building its own tools, the tools are handed to it from the outside — typically through its constructor:


```typescript
class CheckoutService {
  private paymentProcessor: PaymentProcessor;

  constructor(processor: PaymentProcessor) {
    this.paymentProcessor = processor;
  }

  completeCheckout(amount: number): void {
    this.paymentProcessor.charge(amount);
  }
}
```


The actual concrete choice — which specific processor to use — is made at the very top level of the application, in a dedicated setup/entry file:


```typescript
// index.ts — the Composition Root
const myStripeProcessor = new StripeAPI();
const checkout = new CheckoutService(myStripeProcessor);
checkout.completeCheckout(100);
```


If the CEO later mandates a switch to PayPal, the change is confined entirely to this one line — `new StripeAPI()` becomes `new PayPalAPI()` — and `CheckoutService` itself is never touched. This is the entire point of Dependency Inversion: a firm boundary (the interface) sits between core business logic and the outside world, so a vendor swap is a one-line change at the edge of the system rather than a surgery on its core.


**Worth being precise about a common conflation:** _Dependency Inversion_ (the design **principle** — depend on abstractions, not concretions) and _Dependency Injection_ (the **technique** — supplying a dependency from outside rather than constructing it internally) are related but distinct. DIP is the “why”; DI is one common “how” — you can follow DIP without using a formal DI framework at all (manual wiring in a single `index.ts`, as above, is still DI in the broadest sense), and conversely, using a DI framework doesn’t automatically mean your code respects DIP if high-level modules still directly reference low-level concrete types elsewhere.


That single top-level wiring location (`index.ts` in the example) has a standard name worth knowing: the **Composition Root** — the one place in an application where concrete implementations are chosen and wired together, deliberately kept separate from all the business logic that only ever sees interfaces. In a Spring Boot application specifically, this manual wiring is what Spring’s own dependency injection container automates: `@Component`/`@Service` classes declare what they need via constructor parameters (typed as interfaces), and Spring’s `ApplicationContext` acts as the Composition Root, resolving and injecting the appropriate concrete bean at startup — the exact same pattern demonstrated by hand above, just handled by the framework instead of a manually-written `index.ts`.


**The senior trade-off:** DIP is arguably the most architecturally important of the five principles, but injecting dependencies indiscriminately — wrapping every single class in an interface “just in case,” including ones that will only ever have one real implementation — makes a codebase hard to trace, since every call site becomes an indirection that has to be followed through a DI container to find out what’s actually running. The discipline worth applying: reserve interface boundaries for genuine **architectural boundaries** — databases, external APIs, third-party services, anything that might plausibly be swapped or that needs to be faked in a test — rather than applying DIP reflexively to every class in the system.


### Why this matters concretely: testability


This is the direct payoff of DIP, worth making explicit with the motivating example: a tightly-coupled `OrderService` that directly instantiates a MySQL connection and a Stripe client inside its own method makes even a trivial unit test (checking that a negative amount throws an error) painful — it forces mocking a live database connection and a payment gateway just to test a one-line validation rule. Once the service depends on interfaces instead, a test can simply inject a fake `PaymentProcessor` and a fake repository that do nothing but return canned values, testing the actual business rule in complete isolation from any real infrastructure. This connection — DIP as the thing that makes a class testable at all — is exactly the seam a senior engineer is expected to reach for automatically when code resists being tested cleanly.


---


## 6. Rapid Recap

- **S** — Avoid merge-conflict hell by keeping UI, database, and business logic in separate files, each with one reason to change (per stakeholder/concern, not per line count).
- **O** — Don’t tear open the drywall to plug in a new appliance. Use an interface so new behaviors can be added without editing old files — but wait for a real, repeated need before introducing the abstraction.
- **L** — Don’t plug in a toaster that blows the fuse. A subclass must behave the way the rest of the system already expects; when it doesn’t, the fix is usually to remodel the domain, often by favoring composition over inheritance.
- **I** — Don’t give an oven a `spinToMix()` method. Keep interfaces small and grouped around genuinely cohesive capabilities, not split reflexively down to one method each.
- **D** — Hire for a role, not a specific vendor. Inject dependencies from the outside (via a Composition Root, or a framework like Spring’s container) so core business logic never hardcodes a specific tool — reserved for real architectural boundaries, not applied to every class indiscriminately.

---


## 7. Quick-Reference Glossary

- **Single Responsibility Principle (SRP)** — a class should have one reason to change, scoped to one stakeholder/concern, not an arbitrary size limit.
- **Open/Closed Principle (OCP)** — code should be extendable with new behavior without modifying existing, already-working code.
- **Liskov Substitution Principle (LSP)** — a subclass must be fully, behaviorally substitutable for its base class without breaking correctness.
- **Interface Segregation Principle (ISP)** — don’t force a class to implement methods irrelevant to it; split bloated interfaces into cohesive, focused ones.
- **Dependency Inversion Principle (DIP)** — high-level modules should depend on abstractions, not on specific low-level implementations.
- **Dependency Injection (DI)** — the technique of supplying a class’s dependencies from outside rather than having it construct them internally; one common way (not the only way) to satisfy DIP.
- **Composition Root** — the single, deliberate place in an application (an entry-point file, or a DI framework’s container) where concrete implementations are chosen and wired to the abstractions that depend on them.
- **Composition over inheritance** — building behavior by combining smaller, focused pieces rather than inheriting a bundle of behavior from a parent class; the general remedy for LSP-prone domain models.
- **Class explosion** — the SRP over-application failure mode: understanding one simple flow requires opening many small files.
- **Pattern-itis** — reflexively applying design patterns/abstractions without a demonstrated need, adding indirection that doesn’t pay for itself (directly related to the OCP “wait for the second or third change” guidance).
