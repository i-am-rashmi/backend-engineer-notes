---
title: "JVM Insiders"
---


JVM is what and why java is executable on any device. 
Once an application is compiled and converted to byte code, that byte code can be run on any device that has a JVM.  



JVM helps in executing the byte code by converting it into machine code while managing memory. 


![ChatGPT_Image_Jul_27_2026_12_03_23_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/abdd5fd7-0f2c-459b-a8fc-2aaa2c6414bd/ChatGPT_Image_Jul_27_2026_12_03_23_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664IDQVDAK%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T104415Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEAAaCXVzLXdlc3QtMiJHMEUCIQDX92%2FZ7GhSMsNS64hVy89VifNoVnTyyNZXfnyADqfkTgIgT%2BDLQIOE2AkT%2FIcO%2FHG0SwSy17rASCoqGxN6GUzW6MQqiAQIyP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDFCj7OO9KthFAMOdUircAxiBPxBvyC9YtWsGpiGbN2nLAWQiUQV%2FxhOBwUhHE185aP0pfeCyAiTKSyBJoPgJ4zVCE714uqDBHLWwxA6K1g6whqcGcm6nrYkJ69U51kKxcHGRxI%2BSAlnsmB7dIIB1V4XSo0mbTfdAHEgnurPl3ra%2FUxryTL%2BMkbeP7xtjm0AbKXbXVKicia7MMHLsDLb0t9fjHawKLkxShItIwImmwsPx3VmBy%2BEUbI3DgPXtaRwUBiOqr%2BNF0Uuh9dRiSIvMJ0U6LF2gaJF6SflXKMqyXpabqdEYtklLJWh9Ocm6fg7fsawEv6fU%2B7gGrxoXnM9ULW4WqgiqYPoYZ97pkEI%2Bobq%2B3s6tYQb3MoWT7KRkrWcnWjFm7PfOV%2BMdttujU2k9vq4FbB9SC956z2aYjSS6arWg%2BgmUm9vKFPxQhXQEtgwFUS3r6XBomSvu97DszbdWGhIFtfvndy9h2K7mEiZOOM4M0Xc8hK1AWRfdjEOUHD8%2BsD90sjX6z1u4Lo97RpHt2nUD%2Fj%2F751uk0xjU1dyZLvvNuLEnXIDwhhB5%2B5jGLxZMZeFFxSXqKYTrpq9aBOYRwyTH%2Bxjj78nyyWTD1jJtXFaen300uZnP0mUBUJctxoDpmTu4jI0LOm1BBj6jMLeNwtYGOqUBW157LssB0Htjrtae%2FimNNInSPTpfLySa7OHz8aj49LJPcFFmc1O8yfRB66nWjUzS60WvmJKvXOqQx2LYq%2BYVJvtZqKAtt5aRE0UuvaJT3C8dnwDZJOk9gAOi%2ByFS6UQNA66drScR505bZpZCBBGm6n6RR4YmF8VBE12Pvv4PYlioRKRbbfirnb7Lw0XLBFL4lQi219G2N%2Ba2VYgqrXBN8Vco4KtT&X-Amz-Signature=125290636595700c3c8f2ae3f6ab740ea8884d8e0f9fbb365c6077afb5f1d44d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


JVM has 3 main subsystems:


![ChatGPT_Image_Jul_27_2026_12_09_46_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/45ce1727-e4f5-4277-aa01-9c2b63a6c572/ChatGPT_Image_Jul_27_2026_12_09_46_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664IDQVDAK%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T104415Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEAAaCXVzLXdlc3QtMiJHMEUCIQDX92%2FZ7GhSMsNS64hVy89VifNoVnTyyNZXfnyADqfkTgIgT%2BDLQIOE2AkT%2FIcO%2FHG0SwSy17rASCoqGxN6GUzW6MQqiAQIyP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDFCj7OO9KthFAMOdUircAxiBPxBvyC9YtWsGpiGbN2nLAWQiUQV%2FxhOBwUhHE185aP0pfeCyAiTKSyBJoPgJ4zVCE714uqDBHLWwxA6K1g6whqcGcm6nrYkJ69U51kKxcHGRxI%2BSAlnsmB7dIIB1V4XSo0mbTfdAHEgnurPl3ra%2FUxryTL%2BMkbeP7xtjm0AbKXbXVKicia7MMHLsDLb0t9fjHawKLkxShItIwImmwsPx3VmBy%2BEUbI3DgPXtaRwUBiOqr%2BNF0Uuh9dRiSIvMJ0U6LF2gaJF6SflXKMqyXpabqdEYtklLJWh9Ocm6fg7fsawEv6fU%2B7gGrxoXnM9ULW4WqgiqYPoYZ97pkEI%2Bobq%2B3s6tYQb3MoWT7KRkrWcnWjFm7PfOV%2BMdttujU2k9vq4FbB9SC956z2aYjSS6arWg%2BgmUm9vKFPxQhXQEtgwFUS3r6XBomSvu97DszbdWGhIFtfvndy9h2K7mEiZOOM4M0Xc8hK1AWRfdjEOUHD8%2BsD90sjX6z1u4Lo97RpHt2nUD%2Fj%2F751uk0xjU1dyZLvvNuLEnXIDwhhB5%2B5jGLxZMZeFFxSXqKYTrpq9aBOYRwyTH%2Bxjj78nyyWTD1jJtXFaen300uZnP0mUBUJctxoDpmTu4jI0LOm1BBj6jMLeNwtYGOqUBW157LssB0Htjrtae%2FimNNInSPTpfLySa7OHz8aj49LJPcFFmc1O8yfRB66nWjUzS60WvmJKvXOqQx2LYq%2BYVJvtZqKAtt5aRE0UuvaJT3C8dnwDZJOk9gAOi%2ByFS6UQNA66drScR505bZpZCBBGm6n6RR4YmF8VBE12Pvv4PYlioRKRbbfirnb7Lw0XLBFL4lQi219G2N%2Ba2VYgqrXBN8Vco4KtT&X-Amz-Signature=a3e80bd36218a9bba899fc6a3d5f0787d98e1c30259013c0c10653962152a154&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

1. Class loader subsystem
2. Execution engine
3. Runtime Data area

# Class loader 


The **Class Loader Subsystem** is the unsung hero of the JVM. Before your code can execute, or before memory can be allocated on the Heap and Stack, the Class Loader has to find your `.class` files, bring them into memory, and make sure they are safe to run.


It doesn't just load everything all at once when your app starts; it loads classes **dynamically, on-demand** (lazy loading) the exact moment they are referenced in the code.


The Class Loader Subsystem does its job in three sequential phases: **Loading**, **Linking**, and **Initialization**.


## **Phase 1: Loading (The Hierarchy)**


The JVM utilizes three built-in Class Loaders. They operate in a strict hierarchy using the **Delegation Principle**: when a class needs to be loaded, a child class loader always asks its parent first before attempting to find it itself.

1. **Bootstrap Class Loader:** The ultimate parent. It's written in native code (like C/C++) and loads core Java API classes (like `java.lang.String` or `java.util.ArrayList`) from the base runtime modules.
2. **Platform Class Loader (formerly Extension):** The middle child. It loads platform-specific extensions and oversight packages defined by the modular runtime.
3. **Application (System) Class Loader:** Your local neighborhood loader. It looks at your application's `CLASSPATH` or module path to load the classes _you_ wrote, as well as any third-party libraries (dependencies) you imported.

### How Delegation Works:


If your code references a class called `User`, the **Application Class Loader** receives the request. Instead of looking for it, it delegates it up to the **Platform Class Loader**, which delegates it to the **Bootstrap Class Loader**.

- Bootstrap looks in the core library. Can't find it? It passes the request _down_ to Platform.
- Platform looks. Can't find it? It passes it _down_ to Application.
- Application looks at your project files, finds `User.class`, and loads it. If even Application can't find it, you get the infamous `ClassNotFoundException`.

## Phase 2: Linking


Once a file is found and read into memory, it must undergo **Linking**, which consists of three distinct steps:

- **Verification 🛡️:** This is a crucial security step. The JVM inspects the binary data of the `.class` file to ensure it structurally conforms to the Java Language Specification. It checks that the code won't corrupt memory, corrupt the stack, or perform illegal operations. This ensures that even if someone maliciously tampered with the bytecode after compilation, the JVM catches it before execution.
- **Preparation 🗄️:** The JVM allocates memory for any **static fields** (class-level variables) defined in the class and initializes them to their _default values_ (e.g., `0` for ints, `false` for booleans, `null` for object references). _Note: It does not execute your custom assignment values yet!_
- **Resolution 🔗:** The JVM replaces symbolic references in the bytecode (like a method string name referring to another class) with direct memory references pointing to the actual data structures in the JVM's Method Area.

## Phase 3: Initialization


This is the final phase where the class is prepared for actual deployment. The JVM executes the class's **static initializers** and assigns the actual, explicit values you defined in your code to the static variables.


For example, if you wrote:


Java


```plain text
public static int maxConnections = 50;
```

- During **Preparation** (Phase 2), `maxConnections` is allocated memory and given a default value of `0`.
- During **Initialization** (Phase 3), the JVM actually executes the assignment, changing `maxConnections` from `0` to `50`.

# Execution Engine


When your Java bytecode (`.class` file) is loaded into memory, the Execution Engine is responsible for actually running the instructions. To give you the best balance of startup speed and performance, it uses a smart multi-tool approach:

- **The Interpreter** **🗣️:** The moment your program starts, the interpreter begins reading the bytecode line-by-line and converting it into machine code. It starts instantly, but executing code line-by-line can become slow for large programs.
- **The JIT (Just-In-Time) Compiler** **⚡:** As the interpreter runs, a profiler monitors the code to find "hot spots"—sections of code (like loops or frequently called methods) that run over and over again. The JIT compiler takes these hot spots and compiles the _entire_ section directly into native machine code at once. The next time that code is needed, it runs at blistering speed.  
A little more about JIT :

    [link_to_page](https://www.notion.so/3aa0ab25-6204-8007-80db-f10d940d71e7)

- **The Garbage Collector (GC)** **🧹:** In languages like C or C++, developers have to manually allocate and free up computer memory. In the JVM, the Garbage Collector automatically tracks objects in memory. When it detects that your program no longer needs an object, it sweeps it away to free up space, preventing your program from crashing due to memory leaks. We will see garbage collection in depth in /pag

    [link_to_page](https://www.notion.so/3aa0ab25-6204-80ee-ba25-f29123dbe9cd)


To see how this works in practice, imagine you have a program that calculates a user's monthly bank statement. It contains a loop that runs 10,000 times to process individual transactions.


> 💡 Based on how the Execution Engine operates, how do you think the JVM would handle that specific transaction loop differently than a piece of code that only runs once when the app starts?   
>   
> The Interpreter actually starts executing those iterations line-by-line initially. But as soon as the JIT compiler notices, "Hey, this loop is a hot spot!" it steps in, compiles the entire loop into native machine code, and caches it. From that moment on, the interpreter is bypassed for that loop, and the CPU runs the ultra-fast compiled machine code directly for the remaining iterations.


# Runtime Data Areas :


# 1. Shared Memory (All Threads Access This)


## 🏰 The Heap


![ChatGPT_Image_Jul_27_2026_12_44_07_PM.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/dcd998d6-74fa-4953-9828-ede9147d94e1/96609066-9b68-44f2-a62f-0ea042ad8a3c/ChatGPT_Image_Jul_27_2026_12_44_07_PM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB4664IDQVDAK%2F20261015%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20261015T104415Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEAAaCXVzLXdlc3QtMiJHMEUCIQDX92%2FZ7GhSMsNS64hVy89VifNoVnTyyNZXfnyADqfkTgIgT%2BDLQIOE2AkT%2FIcO%2FHG0SwSy17rASCoqGxN6GUzW6MQqiAQIyP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARAAGgw2Mzc0MjMxODM4MDUiDFCj7OO9KthFAMOdUircAxiBPxBvyC9YtWsGpiGbN2nLAWQiUQV%2FxhOBwUhHE185aP0pfeCyAiTKSyBJoPgJ4zVCE714uqDBHLWwxA6K1g6whqcGcm6nrYkJ69U51kKxcHGRxI%2BSAlnsmB7dIIB1V4XSo0mbTfdAHEgnurPl3ra%2FUxryTL%2BMkbeP7xtjm0AbKXbXVKicia7MMHLsDLb0t9fjHawKLkxShItIwImmwsPx3VmBy%2BEUbI3DgPXtaRwUBiOqr%2BNF0Uuh9dRiSIvMJ0U6LF2gaJF6SflXKMqyXpabqdEYtklLJWh9Ocm6fg7fsawEv6fU%2B7gGrxoXnM9ULW4WqgiqYPoYZ97pkEI%2Bobq%2B3s6tYQb3MoWT7KRkrWcnWjFm7PfOV%2BMdttujU2k9vq4FbB9SC956z2aYjSS6arWg%2BgmUm9vKFPxQhXQEtgwFUS3r6XBomSvu97DszbdWGhIFtfvndy9h2K7mEiZOOM4M0Xc8hK1AWRfdjEOUHD8%2BsD90sjX6z1u4Lo97RpHt2nUD%2Fj%2F751uk0xjU1dyZLvvNuLEnXIDwhhB5%2B5jGLxZMZeFFxSXqKYTrpq9aBOYRwyTH%2Bxjj78nyyWTD1jJtXFaen300uZnP0mUBUJctxoDpmTu4jI0LOm1BBj6jMLeNwtYGOqUBW157LssB0Htjrtae%2FimNNInSPTpfLySa7OHz8aj49LJPcFFmc1O8yfRB66nWjUzS60WvmJKvXOqQx2LYq%2BYVJvtZqKAtt5aRE0UuvaJT3C8dnwDZJOk9gAOi%2ByFS6UQNA66drScR505bZpZCBBGm6n6RR4YmF8VBE12Pvv4PYlioRKRbbfirnb7Lw0XLBFL4lQi219G2N%2Ba2VYgqrXBN8Vco4KtT&X-Amz-Signature=8302944b4b0dc85b66979e56f90639f02d0b08c2e9c43a6f03f3a377497704e1&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)


The JVM Heap is a single, large memory pool divided into two main dynamic regions:
• 🐣 **Young Generation**: The nursery where new objects are born.
• 🌳 **Old Generation**: The long-term storage for surviving objects.



**🚀 2. Fast Track: Eden Space & Bump Pointers**
Every time you call `new Foo()`, the object lands in the **Eden Space** (inside the Young Gen).
Instead of searching for free memory like standard C `malloc`, Java uses a **Bump Pointer**. It simply advances a pointer forward in memory to allocate space—a blazing-fast $O(1)$ operation!


**💡 3. The Core Rule: Weak Generational Hypothesis**
Java’s entire memory strategy relies on one key empirical observation: **Most objects die almost immediately after creation.**
Think of local method variables, HTTP request context, or temporary string concatenations—they become useless milliseconds after execution.



**🧹 4. The GC Execution Pipeline**
To manage these two spaces, the JVM uses two distinct cleaning routines:


    1. **Minor GC (Young Gen)** ⚡
        ◦ Triggers when Eden fills up.
        ◦ Causes a brief, harmless Stop-The-World (STW) pause.
        ◦ Scans Eden and wipes away dead objects instantly.
    2. **Promotion** 📈
        ◦ Objects that survive multiple Minor GCs are moved to the **Old Generation**.
    3. **Major GC (Old Gen)** 🐢
        ◦ Scans the much larger Old Generation space.
        ◦ Causes long, noticeable pauses (**p99 latency spikes**).


**🎯 The Golden Goal for Developers**
Write code so temporary objects are reclaimed during **Minor GC**, preventing them from ever reaching the **Old Generation**.


## 📚 Metaspace _(Native Memory)_

- **What it is:** The **architectural blueprint library** of your application.
- **How it works:** It stores class definitions, bytecode, constant pools, and method metadata.
- **Key Detail:** Unlike the old "PermGen" (pre-Java 8), Metaspace lives in native OS memory—not inside the Heap (`Xmx`). It expands dynamically based on OS RAM, but heavy reflection or dynamic proxy creation (Spring, Hibernate) can still trigger `OutOfMemoryError: Metaspace` if class loading isn't managed well.

# 2. Per-Thread Private Memory (Isolated to Each Thread)


## 🥞 The JVM Stack

- **What it is:** The private execution scratchpad assigned to _every single thread_.
- **How it works:** Every time a method is called, a **Stack Frame** is pushed onto the top of the stack. A frame contains:
    1. **Local Variables:** Primitive values (`int x = 5`) or reference pointers pointing to objects on the Heap.
    2. **Operand Stack:** The mini computational workspace where bytecode instructions execute math and logic operations.
    3. **Constant Pool Reference:** Quick lookup links to the class metadata in Metaspace.
- **When it pops:** Once a method returns, its frame is immediately popped off and destroyed.
- **The Failure:** If you write an infinite recursive loop, frames keep piling up until you run out of stack space ➔ `StackOverflowError`.

## 📍 The PC (Program Counter) Register

- **What it is:** A lightweight bookmark for the thread.
- **How it works:** It holds the memory address of the exact bytecode instruction the thread is currently executing.
- **Why it matters:** When the CPU switches between threads (context switching), the PC Register remembers where the thread was interrupted so it can resume right where it left off. _(For native C/C++ methods, the PC pointer is undefined/null)._

## The Practical Connection 


Here is how all four interact during a simple line of code:


Java


```plain text
public void createUser(){
    User u = new User();
}
```

1. **Metaspace** holds the class blueprint for `User`.
2. **JVM Stack** pushes a frame for `createUser()` and reserves space for the local variable pointer `u`.
3. **Heap** allocates the memory for `new User()` in the Young Gen (Eden).
4. **PC Register** moves step-by-step through the instructions to execute this creation.
