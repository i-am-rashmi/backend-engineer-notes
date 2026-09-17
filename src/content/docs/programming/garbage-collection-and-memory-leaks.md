---
title: "Garbage Collection and memory leaks "
---


Garbage collection 🧹 (GC) is a form of automatic memory management. The main goal is to find data objects in a program that are no longer needed and reclaim the storage they occupy so other parts of the program can reuse it.


To help us tackle this broad topic, let's look at a quick roadmap of how a program manages memory.


### How and When GC Occurs


In languages with automatic memory management (like Java, C#, or JavaScript), the runtime environment constantly tracks memory allocation.

- **When it occurs:** GC typically triggers when the system runs low on available memory (specifically in the "heap" where objects live), or when memory allocations reach a certain threshold.
- **How it occurs:** At a high level, the GC engine starts from a set of known active pointers—called **GC Roots** (like local variables currently in use or active threads)—and traces every object they point to. Any object that cannot be reached through this chain of references is considered "garbage" and is cleared out.

## The Core Mechanics: The Foundation


Before an engine can clean up memory, it has to find the garbage. Modern production engines almost exclusively use **Tracing (Mark-and-Sweep)** rather than reference counting.


### The Graph Tracing Strategy


The GC views your application's memory as a directed graph.

1. **Mark Phase:** The GC starts at the **GC Roots** (active thread stacks, global/static variables). It traverses the graph, "marking" every object it can reach as **alive**.
2. **Sweep Phase:** It scans the heap. Anything _not_ marked is unreachable (dead) and its memory is reclaimed.

### The Big Problem: Fragmentation & Pauses


If you just sweep away dead objects, your memory becomes a block of Swiss cheese—plenty of total free space, but scattered in tiny chunks. If you try to allocate a large array, it fails.


To fix this, collectors use one of two methods:

- **Compacting:** Moving live objects together at one end of the memory block to create a large, contiguous space of free memory.
- **Copying:** Copying live objects out of the current memory space into an entirely fresh, empty memory region, leaving the old region completely clear.

**The Catch:** Moving objects in memory means their memory addresses change. To prevent your app from crashing, the GC historically had to enforce a **Stop-The-World (STW)** pause—freezing your application entirely while it safely updated all the object pointers. Modern algorithms are judged by how effectively they eliminate or minimize these STW pauses.


# **Modern GC Algorithms**



With those mechanics in mind, let's look at how **G1** and **ZGC** revolutionized this process.


## **G1 (Garbage-First)**


Introduced to replace the old Concurrent Mark Sweep (CMS) collector, G1 was designed for multi-gigabyte heaps with a predictable pause-time goal.

- **How it works:** Instead of splitting the heap into two or three massive, continuous generational sections, G1 chops the heap into thousands of small, equal-sized **Regions** (typically 1MB to 32MB each). Each region can dynamically act as Eden, Survivor (Young generation), or Old generation memory.
- **The "Garbage-First" Strategy:** G1 tracks how much garbage is in each region. When it's time to collect, it targets the regions that are _mostly full of garbage_ first (hence the name). It copies the few live objects out of those regions into a fresh one, completely clearing the old ones out.
- **The Benefit:** By focusing only on the dirtiest regions, G1 can limit its work to fit within a user-defined pause time target (e.g., "Keep pauses under 200ms").

### 1. Large Objects: The Humongous Regions 🦖


When an object is larger than 50% of a standard G1 region size, G1 classifies it as a **Humongous Object**.


Instead of trying to force this giant object into a single standard region, G1 dynamically allocates a contiguous chain of multiple regions to fit it. These are called **Humongous Regions**.

- **The Problem:** Humongous regions belong to the Old Generation and are treated with special care. Because they require _contiguous_ free blocks of memory, they can quickly lead to severe **memory fragmentation**. If you have plenty of total free space, but it's scattered, G1 will struggle to find a sequence of empty regions next to each other to host a new giant object.

### 2. When G1GC Fails: The "To-Space Exhaustion" 💥


G1 is a copying collector. To clean memory, it must copy live objects from one region into an empty "Survivor" or "Old" region.


A critical failure occurs when the application allocates memory faster than the GC can clear it, or if memory is too fragmented. This failure is called **To-Space Exhaustion** (or Promotion Failure).


Here is exactly why it happens and how G1 reacts:

- **The Trigger:** During a garbage collection pause, G1 attempts to copy live objects to a fresh target region (the "To-Space"). If G1 completely runs out of empty regions to copy these objects into, it panics.
- **The Consequence:** G1 is forced to abort its fast, region-based concurrent work. It falls back to a **Full GC**, which invokes a single-threaded, old-school, Stop-The-World compaction of the _entire_ heap.
- **The Impact:** Your application will completely freeze. For a massive heap (e.g., 32GB), this pause can last for several painful seconds or even minutes.

if you increase the region size so that the object's size falls **below 50%** of that new region size, it loses its "humongous" status. It becomes a regular, everyday small object.


Because it is now a regular object, G1 relaxes its strict rules:

- 📦 **No more isolation:** G1 will happily pack other small objects into the remaining space of that region.
- 🛑 **No more locked space:** The leftover space is no longer wasted or locked out.

However, remember our classic engineering trade-off. While you completely solve the wasted space for _that specific object_, all the regions in the heap are now much larger.


Let's think about how this impacts the rest of the application. If G1 now has to clean these much larger regions, what do you think happens to the **time** it takes to copy objects out of a single region during a collection pause?


it will be longer


Because the region is much larger, it holds significantly more live objects. When G1 goes to clean it, copying all of those objects out of that massive region takes **longer**. This directly threatens G1's main goal: keeping those Stop-The-World pauses short and predictable. ⏱️


So, as an engineer, tuning G1 is all about finding that sweet spot:

- **Too small:** You get flooded with humongous objects and run out of contiguous space.
- **Too large:** Your pause times spike because cleaning a single region takes too long.

## ZGC


ZGC is a modern, ultra-low latency garbage collector designed for massive heaps (from Megabytes to Terabytes). Its defining feature? **STW pauses do not scale with the size of the heap.** Whether you have a 10GB heap or a 16TB heap, pauses stay consistently under a millisecond.

- **How it works:** ZGC performs almost all of its work—including marking, copying, and compacting—**concurrently**, while your application threads are actively running.
- **The Secret Sauce (Colored Pointers & Load Barriers):** * **Colored Pointers:** ZGC utilizes reference coloring. It uses a few metadata bits directly inside the memory address pointer itself to track the state of the object (e.g., whether it has been marked or moved).
    - **Load Barriers:** When your application code tries to read an object from the heap, a tiny piece of code intercepted by ZGC (a load barrier) runs. It checks the "color" bits of the pointer. If it sees that the object was recently moved by the GC, the load barrier automatically updates the pointer to the new address on the fly.

Because the application threads fix pointers on the fly as they run, ZGC doesn’t need to freeze the world to update memory addresses.


QUICK COMPARISON


| Feature       | G1GC                                                          | ZGC                                                 |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Heap Strategy | Region-based, Generational                                    | Region-based, Generational (added recently)         |
| Primary Goal  | High throughput with _predictable_ pauses                     | Ultra-low latency (_sub-millisecond_ pauses)        |
| Compaction    | Done during short STW pauses                                  | Done concurrently while application runs            |
| Best Used For | General purpose, large heaps where <200ms pause is acceptable | Low-latency applications, massive heaps (up to TBs) |


### Moving Beyond G1: Enter ZGC 🚀


This exact trade-off is why engineers designed **ZGC** (Z Garbage Collector). Remember how G1 has to pause the application to copy objects? ZGC completely changes the game.


ZGC can copy and compact memory **concurrently**—meaning it moves objects around while your application threads are actively running. It doesn't need to freeze the world just because a region is large or full of objects.


How do you think doing the heavy lifting of moving objects _while the app is running_ affects the overall CPU usage of your server?


Because ZGC operates concurrently, it trades **CPU cycles** for **ultra-low latency**. Running those load barriers on every object read, plus having background GC threads actively marking and shifting objects around, means the server's CPU has to work significantly harder.


This brings us to a fundamental law of software architecture: **There is no free lunch.** Now that we have explored both G1 and ZGC, we can see how they represent two different philosophies in modern garbage collection:

- **G1 GC** focuses on **throughput and efficiency** (using brief pauses to clean memory with minimal overall CPU waste).
- **ZGC** focuses on **responsiveness and predictability** (using extra CPU power to eliminate application pauses entirely).

To understand how to tune a collector, you have to understand the **core design compromise** of computer science: **Throughput vs. Latency**.

- **Throughput 🏎️:** How much raw computational work your application can do per second.
- **Latency ⏱️:** How long a single specific request takes (your p99 spikes).

### 1. G1GC: The Regional Accountant 📊


Before G1, the Heap was divided into massive, continuous blocks of memory. If the Old Generation filled up, the GC had to clean the _entire_ thing at once, causing massive freezes.


G1 changes the game by chopping the Heap into thousands of small, equal-sized **Regions** (1MB to 32MB).

- Regions aren't locked into being "Young" or "Old" forever. A region can be part of Eden today, get wiped, and become part of the Old Gen tomorrow.
- **How it saves time:** It constantly tracks how much dead data is in each region. When it's time to clean, it picks _only_ the regions packed with the most garbage first (hence, **Garbage-First**). It copies the survivors to a fresh region and wipes the old ones.
- **The Trade-off:** It still has to stop your application threads (Stop-The-World) during the final compaction phase to move objects safely.

### 2. ZGC & Shenandoah: The Moving-Van Collectors 🚚


ZGC and Shenandoah are algorithmic marvels. They achieve sub-millisecond pauses because they perform the heaviest, most time-consuming task—**moving and compacting objects**—while your application threads are actively running!


Think about how dangerous that is. If the GC moves an object from Memory Slot A to Memory Slot B at the exact microsecond your code tries to read it, your program could crash or corrupt data.

- **ZGC uses Colored Pointers 🎨:** It uses a few unused bits in the 64-bit reference pointer itself to store metadata about the object (e.g., "Has this object been moved?").
- **Shenandoah uses Forwarding Pointers ➡️:** Every single object gets a tiny, hidden header pointing to itself. If the GC moves the object, it updates that pointer to point to the new location.
- **Load Barriers:** Both collectors use "Load Barriers". If your application thread tries to access an object that the GC is currently moving, the load barrier intercepts the request, quickly checks the colored/forwarding pointer, redirects your thread to the new location, and updates the reference on the fly.
- **The Trade-off:** This interception costs CPU cycles! You trade **10-15% of your total CPU throughput** just to buy that ultra-low p99 latency.

# 💻 Enabling and Tuning G1 GC


To turn on G1 GC in your Java application, you use the following command-line flag:

- `XX:+UseG1GC`

Once enabled, the single most important tuning parameter is setting your desired maximum pause time goal:

- `XX:MaxGCPauseMillis=200`

This tells G1 to dynamically adjust its region sizes and collection strategies to keep Stop-The-World pauses under **200 milliseconds** whenever possible.


### 🛠️ Turning the Knobs


If you notice your application is throwing a lot of **Humongous Object** warnings in the logs, you can manually increase the region size to stop them from being treated as humongous:

- `XX:G1HeapRegionSize=16m`
> ⚠️ **Remember our trade-off:** Setting this value too high (e.g., 32m) gives small objects more room but can cause longer pause times because cleaning a larger single region requires more work from the GC.

## Part 2: Analyzing Production Logs & Tuning


To know what's happening in production, you must first tell the JVM to print unified GC logging. Since JDK 9, this is done using the `-Xlog` flag:


Bash


```plain text
-Xlog:gc*,gc+phases=debug:file=/var/log/app/gc.log:time,uptime,pid:filecount=5,filesize=100M
```


### How to Read a G1GC Log Line (The Anatomy) 🔬


When you open a production log file, a typical G1GC pause event looks like this:


Plaintext


```plain text
[2026-06-05T10:30:15.123+0200][1.523s][info][gc,start    ] GC(12) Garbage Collection (G1 Evacuation Pause) (young)
[2026-06-05T10:30:15.143+0200][1.543s][info][gc          ] GC(12) Pause Young (Normal) (G1 Evacuation Pause) 1024M->256M(4096M) 20.125ms
```


Let's decode exactly what this means:

- `G1 Evacuation Pause`: G1 is copying live objects out of full regions into empty ones.
- `(young)`: This was a Minor GC cleaning the Eden/Survivor spaces.
- `1024M->256M(4096M)`: The heap occupancy went from 1024 Megabytes down to 256 Megabytes, out of a total maximum allocated heap of 4096 Megabytes.
- `20.125ms`: Your application threads were entirely frozen for 20.125 milliseconds.

### The Production Tuning Cheat Sheet 🛠️


When analyzing these logs, you look for patterns to decide which parameters to change.


Problem A: "Humongous Allocations" in G1GC


If an object is larger than 50% of a single G1 region, G1 classifies it as a **Humongous Object**. It bypasses the young generation and allocates it directly in the Old Gen, which triggers frequent, aggressive Full GCs.

- **The Log Sign:** Look for `G1 Humongous Allocation` or rapid Old Gen growth.
- **The Fix:** Increase the region size explicitly so your large objects fit normally:
`XX:G1HeapRegionSize=16m` (or 32m).

Problem B: ZGC/Shenandoah "Allocation Stalls"


If your application creates objects faster than ZGC can concurrently clean them up, ZGC runs out of memory space entirely. It is forced to completely freeze your application threads to let the collector catch up. This is called an **Allocation Stall**.

- **The Log Sign:** Look for `Allocation Stall` or `Pause ZGC (Garbage Collection Trigger) (Allocation Stall)`.
- **The Fix:** 1. Give ZGC more background worker threads so it cleans faster: `XX:ConcGCThreads=4`.
2. Tell ZGC to start its concurrent cleaning cycles much earlier before memory gets tight: `XX:ZAllocationSpikeTolerance=5`.

### Putting It Together: A Real-World Diagnostic Case 🩺


Imagine a Spring Boot trading application running on a **16GB Heap**.

- The system needs to maintain a p99 latency of under **10ms**.
- You look at the production GC logs and see hundreds of lines showing `G1 Evacuation Pause (mixed)` taking **120ms** every few minutes.

Based on our discussion of trade-offs and flags, would you try to tune G1GC using `-XX:MaxGCPauseMillis=10`, or would it make more sense to migrate this specific application to **ZGC**? Why?

