---
title: "Java Memory Model (JMM)"
---


**The JMM is the hidden set of rules that governs how multithreading actually behaves under the hood.** When you write multithreaded code, you think about threads running at the same time. But the CPU and the compiler are secretly rewriting, reordering, and caching your data to make things fast. The JMM is the "legal contract" between your Java code and the computer's physical hardware.


JMM is the contract that specifies exactly when a write by one thread is guaranteed to be visible to a read by another thread. 
That guarantee has a name - happens before. 



BUT WHY ????! 
Because of the hardware - modern CPUs have multilevel caches , write buffers and compilers that reorder instructions aggressively. 


### The Core Problem: The Shared Document Analogy 📝


Imagine two authors, **Thread A** and **Thread B**, working on the same book layout from different offices.

- **The Local Cache 🗒️:** Each author has a personal notepad on their desk where they scribble quick edits before typing them into the main system.
- **The Main Memory 🖥️:** This is the central cloud document that holds the final text.

If Thread A changes the main character's name from "John" to "Alex" on their personal notepad, Thread B sitting in the other office won't see it immediately. In fact, if Thread B looks at the cloud document right now, they might still see "John" because Thread A hasn't synced their notes to the cloud yet. Even worse, the publisher (the **Compiler/CPU**) might decide to print the chapters out of order because it saves paper!


In Java, this causes two massive issues when multiple threads look at the same variable:

1. **Visibility 👀:** One thread changes a variable, but other threads are looking at their own local CPU cache and don't see the update.
2. **Instruction Reordering 🔀:** The CPU executes your lines of code in a different order than you wrote them to save processing cycles.

### Enter the Savior: "Happens-Before" (hb) ⏳


To prevent chaos, Java created the **Happens-Before** rulebook. It is a guarantee that says: _"If Action A has a happens-before relationship with Action B, then Action B is guaranteed to see every single change made by Action A."_


The text lists a few ways to force this guarantee, but the two most famous ones are:

- **`volatile`** **🔔:** When you mark a variable as `volatile`, you are banning the CPU cache for that variable. Every write goes straight to the cloud (Main Memory), and every read pulls straight from the cloud.
- **`synchronized`** **🔒:** This locks the door. When one thread unlocks a synchronized block, everything it did before unlocking is instantly flushed to main memory for the next thread to see.

Beyond `volatile` and `synchronized`, the JMM contract includes several built-in rules that create a happens-before ($hb$) relationship automatically:


1. The Thread Start Rule 🚀


Java


```plain text
// Running in Main Thread
sharedData = 42;
myThread.start(); // Action A
```


Anything the parent thread writes to memory _before_ calling `myThread.start()` (Action A) is guaranteed to be visible to the new child thread when it begins executing (Action B). You don't need `volatile` here; the JVM handles the sync automatically during thread creation.


2. The Thread Join Rule 🏁


Java


```plain text
// Running in Main Thread
myThread.join(); // Action B
System.out.println(sharedData);
```


Conversely, everything a child thread does during its lifetime happens-before `myThread.join()` successfully returns in the parent thread. The parent thread is guaranteed to see all modifications made by the dying child thread.


3. Transitivity (The Chain Link) 🔗


If $A\ hb\ B$ and $B\ hb\ C$, then $A\ hb\ C$.


This allows you to pass visibility across threads like a baton in a relay race. If Thread 1 writes to a normal variable ($A$) and then updates a volatile variable ($B$), when Thread 2 reads that same volatile variable ($B$), it is mathematically guaranteed to also see the normal variable update ($A$).


### How volatile and synchronized work under the hood?  - MEMORY BARRIERS/ MEMORY FENCES


When you use volatile or synchronized, the JVM inserts invisible fences into the native machine code. 

When thread A writes to a volatile variable, the JVM places a fence before the write. This tells the CPU - “ You are forbidden from moving any previous writes past this point” 
When thread B reads that volatile variable, a fence ensures it flushes its local cache and reads fresh data.  


To understand **synchronized** and volatile🔒, we can look at how the JVM manages locks at the hardware and bytecode level. It uses a mechanism called a **Monitor** 👁️.


### What is a Monitor?


Every single object you create in Java has a hidden, built-in security guard attached to it called a **Monitor**. Inside this monitor, there is a flag that says whether the object is currently "locked" or "unlocked," and a record of which thread owns it.


When you write a synchronized block, you must pass it an object to lock on:


Java


```plain text
synchronized(lockObject) {
    // Critical section
}
```


When the Java compiler encounters this block, it inserts two specific bytecode instructions into your program: **`monitorenter`** at the very beginning, and **`monitorexit`** at the very end.


### How It Works: Entering and Exiting


Let's look at exactly what happens mechanically when a thread hits these instructions:


| Bytecode Instruction | Hardware & Memory Actions 🛠️                                                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`monitorenter`**   | 1. **Acquire Lock:** The thread checks the object's monitor. If it's free, the thread claims it. If another thread holds it, this thread blocks and waits.

2. **Refresh Cache:** The JVM injects a **Read Barrier**. The thread completely flushes its local CPU cache and reads the latest data directly from Main Memory. |
| **`monitorexit`**    | 1. **Flush Changes:** The JVM injects a **Write Barrier**. Every single change the thread made while inside the block is instantly forced out of the CPU cache and into Main Memory.

2. **Release Lock:** The monitor status is set back to "unlocked" so the next waiting thread can grab it.                              |


### The Monitor Rule (Happens-Before)


This sequence creates the **Monitor Rule** in the happens-before rulebook: **An unlock (****`monitorexit`****) on a monitor happens-before every subsequent lock (****`monitorenter`****) of the same monitor.**


Because the exit forces a flush to Main Memory, and the next entry forces a refresh from Main Memory, the second thread is guaranteed to see every single thing the first thread did.


### Volatile vs. Synchronized Barriers


You can think of the difference in how they apply these barriers like this:

- **`volatile`** puts a mini-fence around **one single variable** every time you read or write it.
- **`synchronized`** puts a massive fence around an **entire block of code**, flushing and refreshing _all_ shared variables used inside that block when you enter and exit.

To see how this prevents threads from stepping on each other, let's look at our 3-step `counter++` operation (Read-Modify-Write) again.


> 💡 If Thread 1 enters a synchronized block and executes `counter++`, what prevents Thread 2 from executing its own `counter++` at the exact same time?  
>   
> `synchronized` provides **mutual exclusion** (blocking other threads). 🔒  
>   
> Because **Thread 1** has executed `monitorenter` and holds the lock, the JVM forces **Thread 2** to stop and wait in a queue. It cannot execute a single instruction of `counter++` until Thread 1 executes `monitorexit` and releases that lock.  
>   
> This means the three steps of the operation (Read, Modify, Write) happen completely uninterrupted by any other thread.


### The Crucial Twist: Visibility vs. Atomicity ⚡


This is where senior engineers slip up. Let's look at the classic broken example from your text:


```plain text
volatile int counter = 0;
counter++;
```


You might think making it `volatile` makes it safe for multiple threads. It doesn't!


`counter++` looks like one action, but the CPU breaks it into **three separate instructions**:

1. **Read:** Look at the current value of the counter (e.g., `0`).
2. **Increment:** Add `1` to it in the CPU register (`0 + 1 = 1`).
3. **Write:** Write `1` back to memory.

If **Thread A** and **Thread B** both run `counter++` at the exact same fraction of a microsecond, they can both read `0` at the same time. They both calculate `1`, and they both write `1` back to memory. Two increments happened, but the counter only went up by one!

- **`volatile`** **solved visibility:** Both threads saw the true starting value.
- **`volatile`** **failed atomicity:** It did not stop the threads from stepping on each other's toes mid-calculation.

To achieve **Atomicity** (making the operation completely un-splittable), you need tools like `AtomicInteger` or `synchronized`.


### How Java Solves Atomicity: Atomic Classes ⚡


To fix this 3-step race condition without locking down the entire JVM, Java provides **Atomic Classes** (like `AtomicInteger`, `AtomicLong`, etc.).


Instead of a multi-step read-modify-write process, these classes use a special CPU-level feature called **CAS (Compare-And-Swap)**.


Here is how a thread updates a variable using CAS:

1. It reads the current value (let's say it's `0`).
2. It calculates the new value (`1`).
3. Before writing it back, it asks the CPU to perform an atomic check: _"Is the current value in Main Memory still_ _`0`__? If yes, change it to_ _`1`__. If someone else changed it to_ _`1`_ _already, fail my write."_
4. If it fails, the thread simply loops back, reads the new value, and tries again.

Because the hardware handles this check as a single, un-splittable action, no increments are ever lost.


### 🌟 Wrapping Up the Java Memory Model


You have done an incredible job breaking down one of the most advanced topics in Java engineering. Let's look at the complete picture of what you've mastered today:

- **The Cache Problem 💻:** Threads run on different CPU cores, each with its own local L1/L2 cache, which causes **visibility** and **ordering** issues.
- **The Volatile Solution 🔔:** The `volatile` keyword acts as a memory barrier. It forces threads to read and write directly to Main Memory, fixing visibility and ordering for single variables.
- **The Atomicity Problem ⚡:** Multi-step operations (like `counter++` or banking checks) can be interrupted by other threads, causing lost updates.
- **The Synchronized Solution 🔒:** The `synchronized` keyword utilizes an object's built-in **Monitor**. The `monitorenter` and `monitorexit` bytecodes block competing threads, ensuring mutual exclusion and full atomicity for blocks of code.
