---
title: "GoF Design Patterns"
---


# GoF Design Patterns — The Remaining Patterns (Part 2)


A companion to the main GoF notes, covering the 14 classic patterns that weren’t part of the original tutoring session, in the same style and continuing the QuickBite story — organized under the same three categories so this reads as a direct extension of that document.


---


## Creational Patterns (continued)


### Abstract Factory


**The idea:** a “factory of factories” — produces a whole _family_ of related objects that are guaranteed to work together, without the calling code ever naming a concrete class.


**The problem it fixes:** QuickBite is integrating with restaurant Point-of-Sale (POS) systems — Square, Toast, and Clover. Each POS vendor needs a matching, compatible _set_ of integration objects: an `OrderSync`, a `MenuSync`, and an `InventorySync`. Using a plain Factory per object type risks a dangerous mismatch — accidentally pairing a `SquareOrderSync` with a `ToastMenuSync`, which would silently corrupt data because the two were never designed to talk to the same backend.


**The fix:**


```java
public interface OrderSync { void pushOrder(Order order); }
public interface MenuSync { void syncMenu(Menu menu); }

public interface PosIntegrationFactory {
    OrderSync createOrderSync();
    MenuSync createMenuSync();
}

public class SquareIntegrationFactory implements PosIntegrationFactory {
    public OrderSync createOrderSync() { return new SquareOrderSync(); }
    public MenuSync createMenuSync() { return new SquareMenuSync(); }
}

public class ToastIntegrationFactory implements PosIntegrationFactory {
    public OrderSync createOrderSync() { return new ToastOrderSync(); }
    public MenuSync createMenuSync() { return new ToastMenuSync(); }
}

// Usage — the caller only ever asks for "a compatible family," never a specific vendor class
public class RestaurantOnboarding {
    public void setup(PosIntegrationFactory factory, Order order, Menu menu) {
        factory.createOrderSync().pushOrder(order);
        factory.createMenuSync().syncMenu(menu);
    }
}
```


Whichever concrete factory (`SquareIntegrationFactory` or `ToastIntegrationFactory`) is injected, `RestaurantOnboarding` is structurally guaranteed to get a compatible `OrderSync`/`MenuSync` pair — it’s impossible to accidentally mix vendors, because the factory that produces one also produces the other.


**When it should be used:** when a system needs to work with multiple _families_ of related products, and it’s critical that the members of a chosen family are never mixed with another family’s members.


**When it should NOT be used:** if there’s only ever one product type per “family” (i.e., you’d never actually mix-and-match), a plain Factory is simpler and sufficient — Abstract Factory earns its extra layer of indirection specifically from the _multi-product, must-stay-compatible_ constraint. Don’t reach for it just because “Factory” is in the name and feels related.


### Prototype


**The idea:** create new objects by cloning a fully-configured existing instance, rather than constructing one from scratch.


**The problem it fixes:** QuickBite offers curated “Combo Meals” — a specific pizza, a specific side, a specific drink, each with their own nested topping/configuration objects loaded from the database. Constructing a fresh combo object from scratch for every single order that selects a popular, unmodified combo means repeating the same expensive database reads and object assembly over and over, even though the result is identical every time.


**The fix:**


```java
public interface MealPrototype extends Cloneable {
    MealPrototype clone();
}

public class ComboMeal implements MealPrototype {
    private String pizzaType;
    private String sideType;
    private String drinkType;
    private List<String> toppings;

    // Expensive to build originally — loaded from DB, assembled once
    public ComboMeal(String pizzaType, String sideType, String drinkType, List<String> toppings) {
        this.pizzaType = pizzaType;
        this.sideType = sideType;
        this.drinkType = drinkType;
        this.toppings = new ArrayList<>(toppings);
    }

    @Override
    public ComboMeal clone() {
        // Cheap: copy the already-assembled data instead of reconstructing it
        return new ComboMeal(pizzaType, sideType, drinkType, toppings);
    }
}

// Usage
ComboMeal familyFeastPrototype = loadComboFromDatabase("FAMILY_FEAST"); // expensive, done once
ComboMeal customerOrder = familyFeastPrototype.clone();                 // cheap, done per order
customerOrder.addTopping("extra jalapeños");                            // customize the clone freely
```


The expensive assembly happens exactly once per distinct combo definition; every actual customer order is a cheap clone, optionally customized afterward without touching the original prototype.


**When it should be used:** object construction is expensive (database reads, complex computation, deep nested assembly) and you frequently need many near-identical, only-slightly-customized copies.


**When it should NOT be used:** if construction is already cheap, Prototype adds cloning machinery (and the real complexity of getting deep-vs-shallow copying correct for nested mutable fields) for no real benefit — a plain constructor call is simpler and just as fast.


---


## Structural Patterns (continued)


### Facade


**The idea:** provide one simple, unified interface in front of a complex subsystem made of many interacting parts, hiding that complexity from callers who just want a straightforward entry point.


**The problem it fixes:** placing an order at QuickBite actually requires coordinating several independent subsystems: checking `InventoryService` for stock, charging via `PaymentService`, awarding points through `LoyaltyService`, and triggering `NotificationService`. Without a Facade, every place in the codebase that needs to place an order (the web app, the mobile app, a future voice-assistant integration) has to independently know the correct order to call all four services in, and correctly handle each one’s own error cases — a maintenance and duplication nightmare, and a correctness risk every time a new caller gets the orchestration slightly wrong.


**The fix:**


```java
public class CheckoutFacade {
    private InventoryService inventory;
    private PaymentService payment;
    private LoyaltyService loyalty;
    private NotificationService notifications;

    public CheckoutFacade(InventoryService i, PaymentService p, LoyaltyService l, NotificationService n) {
        this.inventory = i; this.payment = p; this.loyalty = l; this.notifications = n;
    }

    // One simple method hides four coordinated subsystem calls
    public void placeOrder(Order order) {
        inventory.reserve(order.getItems());
        payment.charge(order.getCustomer(), order.getTotal());
        loyalty.awardPoints(order.getCustomer(), order.getTotal());
        notifications.sendOrderConfirmation(order.getCustomer());
    }
}

// Any caller — web, mobile, voice assistant — just does this:
checkoutFacade.placeOrder(order);
```


Every caller gets the same, correct orchestration for free, and if the sequence ever needs to change (say, adding a fraud check before payment), it’s changed once, inside the Facade, rather than in every calling location.


**When it should be used:** a subsystem genuinely has multiple moving parts that are almost always used together in a fixed sequence, and you want to give callers one clean entry point instead of forcing them to understand the internals.


**When it should NOT be used:** if callers legitimately need fine-grained control over the individual subsystems independently (skip loyalty points for a corporate account, say), a Facade that only exposes the “do everything” method can become a straitjacket — either expose the underlying services too for callers that need granularity, or don’t collapse them into a single method that hides options someone actually needs.


### Composite


**The idea:** treat individual objects and groups of them through the same interface, so client code doesn’t need to know or care whether it’s working with a single item or an entire tree of them.


**The problem it fixes:** QuickBite’s menu is naturally hierarchical — a `Category` (“Pizzas”) can contain individual `MenuItem`s and also nested sub-`Category` objects (“Specialty Pizzas”). Computing something like “total calorie count for this section of the menu” naturally needs to recurse through this tree — but without Composite, that recursion logic has to be duplicated everywhere the menu structure is walked, with explicit type-checking to distinguish a leaf item from a category at every level.


**The fix:**


```java
public interface MenuComponent {
    int getCalories();
}

public class MenuItem implements MenuComponent {
    private int calories;
    public MenuItem(int calories) { this.calories = calories; }
    public int getCalories() { return calories; }             // a leaf: just returns its own value
}

public class MenuCategory implements MenuComponent {
    private List<MenuComponent> children = new ArrayList<>();

    public void add(MenuComponent component) { children.add(component); }

    public int getCalories() {
        // A composite: delegates to children, whether they're leaves or sub-categories
        int total = 0;
        for (MenuComponent child : children) { total += child.getCalories(); }
        return total;
    }
}

// Usage — the caller treats a single item and a whole nested category identically
MenuCategory specialtyPizzas = new MenuCategory();
specialtyPizzas.add(new MenuItem(800));
specialtyPizzas.add(new MenuItem(950));

MenuCategory allPizzas = new MenuCategory();
allPizzas.add(specialtyPizzas);       // a category containing another category
allPizzas.add(new MenuItem(700));

System.out.println(allPizzas.getCalories()); // recurses through the whole tree automatically
```


`getCalories()` is called identically on a single `MenuItem` or an entire nested `MenuCategory` tree — the caller never needs to know or check which one it has.


**When it should be used:** genuinely tree-shaped data — file/folder structures, UI component trees, org charts, nested menus — where operations should apply uniformly regardless of depth or whether a given node is a leaf or a branch.


**When it should NOT be used:** if the data isn’t actually hierarchical (a truly flat list with no nesting), Composite’s tree-traversal machinery is solving a problem you don’t have — a plain collection and a simple loop is clearer.


### Proxy


**The idea:** a stand-in object that controls access to a real object, transparently adding behavior (lazy loading, access control, caching) without the caller knowing a proxy is involved at all.


**The problem it fixes:** QuickBite’s menu items have high-resolution photos that are expensive to load from cloud storage. Loading every photo immediately when a customer opens the app’s menu list — even for items they never scroll down to see — wastes bandwidth and slows down the initial page load.


**The fix:**


```java
public interface MenuImage {
    void display();
}

public class RealMenuImage implements MenuImage {
    private String url;
    public RealMenuImage(String url) {
        this.url = url;
        loadFromCloudStorage(url);    // expensive — happens immediately on construction
    }
    private void loadFromCloudStorage(String url) { System.out.println("Downloading " + url + "..."); }
    public void display() { System.out.println("Displaying " + url); }
}

public class MenuImageProxy implements MenuImage {
    private String url;
    private RealMenuImage realImage;   // not created yet!

    public MenuImageProxy(String url) { this.url = url; }

    public void display() {
        if (realImage == null) {
            realImage = new RealMenuImage(url);   // only loads the very first time it's actually displayed
        }
        realImage.display();
    }
}
```


Every menu item can safely hold a `MenuImageProxy` from the start — the expensive download only happens the moment `display()` is actually called (e.g., the item scrolls into view), and the calling code never has to know whether it’s holding a real image or a proxy, since both implement `MenuImage` identically.


**When it should be used:** lazy initialization of something expensive that might never actually be needed; adding an access-control or logging layer transparently in front of a real object; caching results of expensive calls without the caller’s code changing at all.


**When it should NOT be used:** if the underlying object is cheap to create or is always going to be used immediately anyway, a Proxy adds a layer of indirection purely for a deferral benefit that never materializes.


### Bridge


**The idea:** decouple an abstraction from its implementation so the two can vary and evolve completely independently, avoiding a combinatorial class explosion when _both_ dimensions can vary.


**The problem it fixes:** QuickBite needs several kinds of notifications (`OrderConfirmation`, `PromoAlert`) sent over several different channels (SMS, Email, Push). Naive inheritance modeling this as one hierarchy produces a class per _combination_ — `OrderConfirmationSms`, `OrderConfirmationEmail`, `PromoAlertSms`, `PromoAlertEmail`, and so on — and every new notification type or every new channel multiplies the total class count (this is the same class-explosion shape covered under Decorator, but here it’s two independent _hierarchies_ combining, not stackable add-ons).


**The fix** — split “what kind of notification” from “how it’s delivered” into two separate hierarchies, connected by composition rather than inheritance:


```java
// The "implementation" hierarchy — HOW to deliver
public interface DeliveryChannel { void deliver(String message); }
public class SmsChannel implements DeliveryChannel { public void deliver(String m) { System.out.println("SMS: " + m); } }
public class EmailChannel implements DeliveryChannel { public void deliver(String m) { System.out.println("Email: " + m); } }

// The "abstraction" hierarchy — WHAT kind of notification, holding a reference to a channel
public abstract class Notification {
    protected DeliveryChannel channel;      // the bridge: composition, not inheritance
    public Notification(DeliveryChannel channel) { this.channel = channel; }
    public abstract void send();
}

public class OrderConfirmation extends Notification {
    public OrderConfirmation(DeliveryChannel channel) { super(channel); }
    public void send() { channel.deliver("Your order is confirmed!"); }
}

public class PromoAlert extends Notification {
    public PromoAlert(DeliveryChannel channel) { super(channel); }
    public void send() { channel.deliver("50% off this weekend!"); }
}

// Usage — any notification type can be paired with any channel, freely
Notification n1 = new OrderConfirmation(new SmsChannel());
Notification n2 = new PromoAlert(new EmailChannel());
```


Adding a new notification type means one new class in the abstraction hierarchy; adding a new channel (Push) means one new class in the implementation hierarchy — the two dimensions grow additively (2 + 2 = 4 classes for 2 types × 2 channels) instead of multiplicatively (2 × 2 = 4 classes today, but _every_ new type or channel multiplies the total).


**When it should be used:** two dimensions of variation that both need to grow independently over time, and combining them via plain inheritance would multiply class count with every new addition on either side.


**When it should NOT be used:** if only one dimension ever actually varies in practice (channels are fixed forever, only notification types grow), the second hierarchy is unnecessary ceremony — plain inheritance or even a Strategy on the single varying dimension is simpler.


### Flyweight


**The idea:** share a single instance of expensive, immutable data across many logical objects to cut memory usage, instead of duplicating that data per instance.


**The problem it fixes:** QuickBite’s app renders a scrollable list of thousands of menu items, each displaying a small category icon (a pizza slice icon, a drink icon, a salad icon). If every single `MenuItem` object loads and holds its own independent copy of the icon’s image data, memory usage balloons even though there are really only a handful of _distinct_ icons being repeated thousands of times.


**The fix:**


```java
public class CategoryIcon {                      // the shared, immutable "flyweight"
    private final byte[] imageData;               // expensive to hold — loaded once
    public CategoryIcon(String category) {
        this.imageData = loadImageBytes(category); // pretend this is expensive
    }
    public void render() { System.out.println("Rendering icon (" + imageData.length + " bytes)"); }
}

public class IconFactory {
    private static Map<String, CategoryIcon> cache = new HashMap<>();

    public static CategoryIcon getIcon(String category) {
        return cache.computeIfAbsent(category, CategoryIcon::new);  // reuse if already loaded
    }
}

public class MenuItem {
    private String name;
    private CategoryIcon icon;    // just a reference to a SHARED icon, not its own copy

    public MenuItem(String name, String category) {
        this.name = name;
        this.icon = IconFactory.getIcon(category);   // thousands of items, handful of real icon objects
    }
}
```


Ten thousand pizza `MenuItem`s all reference the exact same single `CategoryIcon` instance for “pizza” — the expensive image data is loaded once and shared, not duplicated ten thousand times.


**When it should be used:** a very large number of objects that share significant amounts of identical, immutable data — icons, fonts/glyphs in a text renderer, tile textures in a game map.


**When it should NOT be used:** if the shared data would need to be mutable per-instance (each item needing to independently modify “its own” icon), Flyweight’s whole premise (safe sharing because the data never changes) breaks down — don’t force sharing onto genuinely per-instance mutable state.


---


## Behavioral Patterns (continued)


### Command


**The idea:** encapsulate a request — an action plus everything it needs to execute — as a standalone object, decoupling the thing that triggers an action from the thing that knows how to perform it, and enabling queuing, logging, and undo.


**The problem it fixes:** QuickBite wants to support an “Undo” button after applying a discount code at checkout, and separately wants every order-affecting action logged for audit purposes. Calling methods directly (`applyDiscount(order, code)`) gives no natural place to record _what happened_ as a reusable, replayable/reversible unit — undo and audit logging would each need bespoke, scattered bookkeeping wherever an action might be triggered from.


**The fix:**


```java
public interface OrderCommand {
    void execute();
    void undo();
}

public class ApplyDiscountCommand implements OrderCommand {
    private Order order;
    private double discountAmount;
    private double previousTotal;

    public ApplyDiscountCommand(Order order, double discountAmount) {
        this.order = order;
        this.discountAmount = discountAmount;
    }

    public void execute() {
        previousTotal = order.getTotal();               // remember state for undo
        order.setTotal(previousTotal - discountAmount);
    }

    public void undo() {
        order.setTotal(previousTotal);                   // restore exactly what execute() changed
    }
}

// A central invoker that can log, queue, and undo any command uniformly
public class CommandInvoker {
    private Deque<OrderCommand> history = new ArrayDeque<>();

    public void run(OrderCommand command) {
        command.execute();
        history.push(command);
        System.out.println("Logged: " + command.getClass().getSimpleName());
    }

    public void undoLast() {
        if (!history.isEmpty()) { history.pop().undo(); }
    }
}
```


`CommandInvoker` never needs to know anything about discounts specifically — it works uniformly with any `OrderCommand`, and undo/logging are handled generically for every action, rather than being bolted onto each action’s method individually.


**When it should be used:** you need undo/redo, request queuing/scheduling, or a uniform audit log across many different kinds of actions — anywhere “an action” needs to be treated as data that can be stored, passed around, and executed later rather than invoked immediately and forgotten.


**When it should NOT be used:** for a simple, one-off action with no need for undo, queuing, or logging, wrapping it in a Command object is pure ceremony — just call the method.


### Chain of Responsibility


**The idea:** pass a request along a chain of potential handlers until one of them handles it, without the sender needing to know in advance which handler will actually process it.


**The problem it fixes:** every incoming QuickBite order needs to pass several independent checks before being accepted — fraud screening, inventory availability, and payment authorization. Hardcoding all three checks into one method creates a rigid, monolithic validation block that’s hard to reorder, disable individually, or extend with a new check later. This is directly the same architectural shape as a Spring Security filter chain (from your Spring Boot notes) — a request passes through an ordered sequence of independent checkpoints, any one of which can stop it.


**The fix:**


```java
public abstract class OrderHandler {
    protected OrderHandler next;
    public void setNext(OrderHandler next) { this.next = next; }

    public void handle(Order order) {
        if (process(order) && next != null) {
            next.handle(order);      // pass it along the chain
        }
    }

    protected abstract boolean process(Order order); // true = passed, continue the chain
}

public class FraudCheckHandler extends OrderHandler {
    protected boolean process(Order order) {
        System.out.println("Checking for fraud...");
        return !order.looksSuspicious();
    }
}

public class InventoryCheckHandler extends OrderHandler {
    protected boolean process(Order order) {
        System.out.println("Checking inventory...");
        return order.allItemsInStock();
    }
}

// Wiring the chain
FraudCheckHandler fraud = new FraudCheckHandler();
InventoryCheckHandler inventory = new InventoryCheckHandler();
fraud.setNext(inventory);
fraud.handle(order);   // enters at the front; each handler decides whether to continue
```


Reordering checks, disabling one, or adding a new one (`PaymentAuthorizationHandler`) means changing the chain’s wiring, never the logic inside any individual handler — each handler stays completely ignorant of the others.


**When it should be used:** a request needs to pass through a sequence of independent, potentially-reorderable checks or processing steps, especially when it’s not fixed in advance how many steps there are or which one might ultimately handle/reject the request.


**When it should NOT be used:** if the sequence of steps is truly fixed and will never be reordered, extended, or conditionally skipped, a plain sequence of method calls is more directly readable than a chain of handler objects — Chain of Responsibility earns its cost specifically from needing that flexibility.


### Mediator


**The idea:** centralize how a set of objects communicate through one mediator object, instead of every object holding direct references to every other object it needs to talk to.


**The problem it fixes:** QuickBite’s kitchen has independent stations — Grill, Fryer, Salad — that need to coordinate (“grill’s pizza is ready, tell the expediter”; “fryer is backed up, tell the front counter to delay drink prep”). If every station holds direct references to every other station it might need to notify, the stations become a tangled web of interdependencies — adding a new station means updating the internals of every existing station that might need to talk to it.


**The fix:**


```java
public interface KitchenMediator {
    void notify(String sender, String event);
}

public class KitchenCoordinator implements KitchenMediator {
    private GrillStation grill;
    private FryerStation fryer;

    public void register(GrillStation g, FryerStation f) { this.grill = g; this.fryer = f; }

    public void notify(String sender, String event) {
        if (sender.equals("Grill") && event.equals("READY")) {
            System.out.println("Coordinator: telling Fryer to start sides now");
            fryer.startSides();
        }
    }
}

public class GrillStation {
    private KitchenMediator mediator;
    public GrillStation(KitchenMediator mediator) { this.mediator = mediator; }
    public void finishCooking() { mediator.notify("Grill", "READY"); }  // talks only to the mediator
}
```


`GrillStation` never holds a reference to `FryerStation` at all — it only knows about the mediator. Adding a `SaladStation` later means teaching the mediator about one new relationship, without touching `GrillStation`’s or `FryerStation`’s code.


**When it should be used:** a set of objects have complex, many-to-many interdependencies that would otherwise require each one to know about most of the others — centralizing that coordination logic in one place.


**When it should NOT be used:** if there are only two objects that ever need to talk to each other, or the interactions are simple and unlikely to grow, a Mediator adds an indirection layer for a coordination problem that doesn’t really exist yet — direct communication is simpler.


### Memento


**The idea:** capture an object’s internal state externally so it can be restored later, without exposing or violating that object’s own encapsulation.


**The problem it fixes:** QuickBite wants to let a customer undo changes to their cart — removing an item that was actually meant to stay, or reverting an accidental “clear cart.” Simply exposing every internal field of the `Cart` class publicly so an external `UndoManager` could save and restore them would break encapsulation, letting any code freely poke at internals it has no business touching.


**The fix:**


```java
public class CartMemento {                       // an opaque snapshot — no public way to inspect/modify it
    private final List<String> items;
    CartMemento(List<String> items) { this.items = new ArrayList<>(items); }   // package-private constructor
    private List<String> getItems() { return items; }                          // private — only Cart can read it
}

public class Cart {
    private List<String> items = new ArrayList<>();

    public void addItem(String item) { items.add(item); }

    public CartMemento save() { return new CartMemento(items); }   // Cart creates its own snapshot

    public void restore(CartMemento memento) {
        this.items = new ArrayList<>(memento.getItems());          // Cart is the only one that can read it back
    }
}

public class UndoManager {
    private Deque<CartMemento> history = new ArrayDeque<>();

    public void save(Cart cart) { history.push(cart.save()); }
    public void undo(Cart cart) {
        if (!history.isEmpty()) { cart.restore(history.pop()); }
    }
}
```


`UndoManager` holds and manages `CartMemento` objects but can never see or manipulate their actual contents — only `Cart` itself knows how to create or restore from one, keeping the snapshot mechanism fully encapsulated.


**When it should be used:** you need undo/rollback/checkpoint functionality for an object’s state, while keeping that state’s internal representation fully private to the object itself.


**When it should NOT be used:** if the object’s state is large and snapshots would be taken very frequently, naive Memento (storing a full deep copy each time) can become a real memory/performance cost — worth considering storing incremental diffs instead in that specific scenario, rather than full snapshots every time.


### Visitor


**The idea:** separate an algorithm from the object structure it operates over, letting you add new operations across a whole family of classes without modifying those classes themselves.


**The problem it fixes:** QuickBite’s menu item hierarchy (`Pizza`, `Drink`, `Side`) is stable, but the _operations_ performed over it keep growing — a tax report, a nutrition report, an allergen report, each needing type-specific logic per menu item type. Adding a `calculateTax()`, then a `calculateCalories()`, then a `listAllergens()` method directly onto `Pizza`, `Drink`, and `Side` bloats those classes with concerns that have nothing to do with what a pizza or drink fundamentally _is_ — and violates Single Responsibility by tangling multiple unrelated reporting concerns into the core menu item classes.


**The fix:**


```java
public interface MenuItemVisitor {
    void visit(Pizza pizza);
    void visit(Drink drink);
}

public interface MenuItem {
    void accept(MenuItemVisitor visitor);   // each item just knows how to "accept" a visitor
}

public class Pizza implements MenuItem {
    public double price = 12.0;
    public void accept(MenuItemVisitor visitor) { visitor.visit(this); }  // calls back with its own concrete type
}

public class Drink implements MenuItem {
    public double price = 3.0;
    public void accept(MenuItemVisitor visitor) { visitor.visit(this); }
}

// A NEW operation, added without touching Pizza or Drink at all
public class TaxReportVisitor implements MenuItemVisitor {
    public double totalTax = 0;
    public void visit(Pizza pizza) { totalTax += pizza.price * 0.08; }   // pizzas taxed differently...
    public void visit(Drink drink) { totalTax += drink.price * 0.05; }   // ...than drinks
}
```


Adding an entirely new report (`NutritionReportVisitor`) means writing one new class implementing `MenuItemVisitor` — `Pizza` and `Drink` are never touched again, no matter how many new operations get added over time.


**When it should be used:** the object structure (the set of classes) is stable and rarely changes, but the _operations_ performed over that structure grow frequently — Visitor inverts the usual trade-off, making new operations cheap at the cost of new classes in the hierarchy being expensive (every new `MenuItem` subtype requires updating every existing Visitor).


**When it should NOT be used:** if the class hierarchy itself changes frequently (new menu item types added often) while operations stay stable, Visitor is actively the wrong trade-off — every new class forces edits to every existing visitor, which is exactly the “modify existing code” pain OCP tries to avoid.


### Iterator


**The idea:** provide a standard way to sequentially access elements of a collection without exposing how that collection is actually stored internally.


**The problem it fixes:** QuickBite’s order history might be backed by different internal representations at different times — an in-memory list for recent orders, a paginated remote API call for older ones. Code that wants to “go through a customer’s orders one at a time” shouldn’t need to know or care which representation is behind it.


**The fix:**


```java
public interface OrderIterator {
    boolean hasNext();
    Order next();
}

public class OrderHistory implements Iterable<Order> {
    private List<Order> orders;

    public Iterator<Order> iterator() {
        return new OrderIterator() {                 // an anonymous class implementing the traversal
            private int index = 0;
            public boolean hasNext() { return index < orders.size(); }
            public Order next() { return orders.get(index++); }
        };
    }
}

// Usage — completely agnostic to how OrderHistory actually stores its data internally
for (Order order : orderHistory) {
    System.out.println(order);
}
```


**Worth being explicit about a practical caveat:** in modern languages, this is very rarely something you hand-roll from scratch the way the pattern is classically taught — Java’s own `Iterable`/`Iterator` interfaces (used transparently by the enhanced for-loop above), and equivalents in virtually every modern language, already implement this pattern as a first-class language feature. The pattern is worth understanding conceptually — and you’ll write custom `Iterator` implementations for custom collection types — but you’re using it constantly via built-in language support even when you never explicitly think of it as “the Iterator pattern.”


**When it should be used:** any custom collection-like data structure needs to support standard sequential traversal without leaking its internal storage details to callers.


**When it should NOT be used:** essentially never a case of avoiding it outright — if you’re working with a standard collection type in a modern language, you’re already using this pattern via the language’s built-in iteration support; there’s rarely a reason to build a custom iterator for a data structure that already fits `List`, `Map`, or similar built-in shapes.


### Interpreter


**The idea:** define a representation for a simple grammar, plus an interpreter that evaluates sentences written in that grammar — modeling each grammar rule as its own class.


**The problem it fixes:** QuickBite’s marketing team wants to define discount eligibility rules dynamically, without a code deploy for every new rule — e.g., “if cart total is over $50 AND customer tier is VIP, apply a 10% discount.” Hardcoding every possible rule combination as Java conditionals means every new rule needs a deploy; Interpreter instead models the rule itself as a small tree of evaluable expression objects.


**The fix:**


```java
public interface Expression {
    boolean evaluate(Order order);
}

public class CartTotalOver implements Expression {
    private double threshold;
    public CartTotalOver(double threshold) { this.threshold = threshold; }
    public boolean evaluate(Order order) { return order.getTotal() > threshold; }
}

public class CustomerTierIs implements Expression {
    private String tier;
    public CustomerTierIs(String tier) { this.tier = tier; }
    public boolean evaluate(Order order) { return order.getCustomer().getTier().equals(tier); }
}

public class AndExpression implements Expression {
    private Expression left, right;
    public AndExpression(Expression left, Expression right) { this.left = left; this.right = right; }
    public boolean evaluate(Order order) { return left.evaluate(order) && right.evaluate(order); }
}

// Building and evaluating a rule: "cart total > 50 AND tier == VIP"
Expression vipDiscountRule = new AndExpression(
    new CartTotalOver(50.0),
    new CustomerTierIs("VIP")
);

if (vipDiscountRule.evaluate(order)) {
    applyDiscount(order, 0.10);
}
```


New rules are composed by combining existing expression objects (`AndExpression`, `OrExpression`, new leaf conditions) rather than writing new conditional code — and this tree structure is exactly what a rule-definition UI or a stored, database-driven rule configuration would ultimately be parsed into and built from.


**When it should be used:** genuinely building a small domain-specific language or expression evaluator — rule engines, search query parsers, simple formula evaluators.


**When it should NOT be used:** this is the least commonly needed GoF pattern in ordinary application code, and for good reason — it’s usually significant, dedicated complexity. If a handful of straightforward `if` statements already covers every rule you actually need, building an expression-tree grammar for it is a severe case of pattern-itis; reach for Interpreter only when rules genuinely need to be dynamically composed, stored, or authored by non-developers.


---


## Updated Summary


Combined with the original set, the classic GoF catalogue is now fully covered:

- **Creational** — Singleton, Factory, Builder, **Abstract Factory** (families of compatible objects, never mixed), **Prototype** (cheap cloning instead of expensive reconstruction).
- **Structural** — Adapter, Decorator, **Facade** (one simple entry point over a complex subsystem), **Composite** (uniform treatment of trees and leaves), **Proxy** (transparent lazy-loading/access-control/caching stand-in), **Bridge** (two independently-varying hierarchies connected by composition, not multiplied by inheritance), **Flyweight** (sharing immutable data across many instances to save memory).
- **Behavioral** — Strategy, Observer, Template Method, State, **Command** (actions as objects, enabling undo/queuing/logging), **Chain of Responsibility** (a request passed through an ordered sequence of independent handlers), **Mediator** (centralizing many-to-many object coordination), **Memento** (externally-stored, encapsulation-preserving state snapshots for undo), **Visitor** (adding new operations over a stable class hierarchy without touching it), **Iterator** (standard traversal without exposing internal storage — mostly built into modern languages already), **Interpreter** (modeling a small grammar as evaluable expression objects, for genuine rule-engine/DSL needs).

The same senior-level filter applies to every pattern in this second batch as the first: know the structure, but the real skill is recognizing the specific shape of problem each one is built for, and refusing to reach for one just because the scenario is superficially similar — Abstract Factory for family-of-objects consistency, not any multi-object creation; Visitor for stable-hierarchy/growing-operations, not the reverse; Interpreter only when rules genuinely need to be dynamic and composable, not as a generic “cleaner if-statements” tool.

