---
title: "DSA Interview Prep — Structured Notes"
---

> Rebuilt from the original **Google Prep** and **Focused Google Prep** pages into one clean, navigable structure. Nothing from the originals was intentionally dropped — code, tables, theory, problem lists, and study plans have all been carried over and organized by topic below.

## 🎯 Interview Goal & Timing Strategy


For a Google interview: solve **2 medium–hard questions in 45 minutes** → roughly **20 minutes per question**, broken down as:


| Phase                                                               | Time       |
| ------------------------------------------------------------------- | ---------- |
| Understand the problem, clarify requirements                        | 2 min      |
| Come up with solution(s) — brute force → optimized, explain clearly | 8 min      |
| Code the solution                                                   | 6 min      |
| Time & space complexity analysis                                    | 2 min      |
| **Target per question**                                             | **18 min** |


## 📚 How these notes are organized


This page is a hub — each section below is a linked sub-page:

- **01 · Prep Plans, Mock Sets & Edge-Case Playbook** — the L4 mock interview set, 14-day plan, topic-wise 5–10 day mastery plans (two pointers/sliding window, BFS, DFS, graphs, DP, stacks/queues, heaps, tries), edge-case checklist, and reference links
- **02 · Java Fundamentals & Snippets** — language-level tips (String vs StringBuilder, collections, PriorityQueue, common snippets)
- **03 · Core Data Structures** — arrays, linked lists, stacks, queues, hashmaps, trees, BSTs, heaps, graphs, tries, disjoint set, LRU cache
- **04 · Algorithms I — Sorting, Binary Search, Tree Traversals**
- **05 · Algorithms II — DP Theory, Bit Manipulation, Greedy, String Algorithms**
- **06 · Algorithms III — Graph Algorithms** — BFS/DFS deep dive, SCC (Tarjan/Kosaraju), bridges & articulation points, MST (Prim's & Kruskal's)
- **07 · Problem-Solving Patterns (Reference)** — sliding window, two pointers, in-place LL reversal, merge intervals, cyclic sort, two heaps, subsets, top-K, k-way merge, monotonic stack
- **08 · Topic Playbook — Patterns, Templates & Code** — the practical, pattern-tagged deep dive: array/two-pointer problems, prefix sum, monotonic stack code, heaps/quickselect, tries, recursion & backtracking, bit manipulation, DP patterns with identification templates, string algorithms, Fenwick trees, and more
- **09 · Full Problem Bank (228 problems)** — every problem from the tracker, grouped by topic, tagged with data structure / pattern / difficulty / approach notes, split across two parts
- **10 · Revision Checklist** — topic revision tracker with last-revised dates

---


_Original sources: "Google Prep" and "Focused Google Prep" Notion pages._


## 01 · Prep Plans, Mock Sets & Edge-Case Playbook

## 🧠 Google L4 Mock Interview Set (5 Problems)


### 1. Graph / BFS + DFS


**Problem**: LC 127 – Word Ladder


**Why it's L4-level**: Tests graph construction, shortest path (BFS), and efficient data modeling (dictionary-based adjacency list).


### 2. Dynamic Programming + State Optimization


**Problem**: LC 322 – Coin Change


**Why it's L4-level**: Classic unbounded knapsack. Checks if you can model subproblems, handle large inputs, and use bottom-up DP efficiently.


### 3. Two Pointers + Greedy + Intervals


**Problem**: LC 986 – Interval List Intersections


**Why it's L4-level**: Requires careful two-pointer logic and corner case handling. Perfect for testing clarity and correctness.


### 4. Trie + Backtracking


**Problem**: LC 212 – Word Search II


**Why it's L4-level**: Combines Trie (for prefix pruning) with DFS/backtracking. Efficient implementation and optimization are key.


### 5. Binary Search + Math / Logic


**Problem**: LC 410 – Split Array Largest Sum


**Why it's L4-level**: Tricky binary search over the answer. Tests your ability to reason about constraints and apply BS to a non-sorted space.


### ⚙️ Mock Interview Tip


Pick any 1 problem. Set a **45 min timer**. Talk through your thought process **as if explaining to an interviewer**. After finishing:

- Analyze runtime
- Discuss edge cases
- Consider follow-ups (e.g., "What if input was streaming?")

---


## 📆 Google L4 Interview: 14-Day Structured Prep Plan


**Day 1: Sliding Window & Two Pointers** — Concepts: fixed/variable window, character frequency

- LC 3 – Longest Substring Without Repeating Characters
- LC 76 – Minimum Window Substring
- LC 438 – Find All Anagrams in a String

**Day 2: BFS / DFS on Graphs** — Concepts: visited array, queue/stack, adjacency list

- LC 200 – Number of Islands
- LC 207 – Course Schedule
- LC 994 – Rotting Oranges

**Day 3: Topological Sort & Union-Find** — Concepts: Kahn's algorithm, DSU with path compression

- LC 210 – Course Schedule II
- LC 684 – Redundant Connection
- LC 261 – Graph Valid Tree

**Day 4: Easy-Medium DP** — Concepts: 1D DP, base cases, recurrence

- LC 198 – House Robber
- LC 62 – Unique Paths
- LC 70 – Climbing Stairs

**Day 5: DP on Strings** — Concepts: LCS, edit distance, memoization

- LC 1143 – Longest Common Subsequence
- LC 72 – Edit Distance
- LC 647 – Palindromic Substrings

**Day 6: Binary Search Patterns** — Concepts: first/last occurrence, rotated arrays

- LC 33 – Search in Rotated Sorted Array
- LC 34 – Find First and Last Position
- LC 74 – Search a 2D Matrix

**Day 7: Tries & Prefix Matching** — Concepts: Trie insert/search, DFS on trie

- LC 208 – Implement Trie
- LC 212 – Word Search II
- LC 648 – Replace Words

**Day 8: Medium-Hard DP + State Encoding** — Concepts: memoization with multiple states

- LC 139 – Word Break
- LC 131 – Palindrome Partitioning
- LC 741 – Cherry Pickup I

**Day 9: Trees & Recursion** — Concepts: inorder traversal, LCA, tree DFS

- LC 236 – Lowest Common Ancestor
- LC 543 – Diameter of Binary Tree
- LC 124 – Binary Tree Maximum Path Sum

**Day 10: Greedy + Intervals** — Concepts: sort by start/end, greedy decisions

- LC 56 – Merge Intervals
- LC 253 – Meeting Rooms II
- LC 134 – Gas Station

**Day 11: Heap + Top K Problems** — Concepts: min heap, max heap, frequency maps

- LC 347 – Top K Frequent Elements
- LC 23 – Merge K Sorted Lists
- LC 215 – Kth Largest Element in Array

**Day 12: Segment Tree & Fenwick Tree** — Concepts: range sum, point update, log(N) queries

- LC 307 – Range Sum Query Mutable
- LC 315 – Count of Smaller Numbers After Self

**Day 13: Hard String Algorithms** — Concepts: KMP, Z, Rabin-Karp

- LC 28 – Implement strStr()
- LC 1044 – Longest Duplicate Substring
- LC 187 – Repeated DNA Sequences

**Day 14: Mock + Review**

- Solve 1–2 full-length problems with interview timer (~45 mins each)
- Review all mistakes from the last 2 weeks
- Practice articulating your thought process out loud

---


## 💡 Tips for Coding


### Thinking Edge Cases


**1. Think About Input Extremes**

- Smallest inputs (`0`, `1`, empty lists, single elements)
- Largest inputs (max constraints, very large numbers, long arrays)
- Edge transitions (e.g., going from `n-1` to `n`)
- _Example_: LRU cache → test `capacity = 1` or `capacity = 0`

**2. Consider Special Values**

- Negative numbers, zeros and ones, duplicates, all elements the same, sorted vs unsorted
- _Example_: array algorithm → test `[0,0,0]` or `[1,1,1]`

**3. Check for Empty or Null Inputs**

- `null` or empty input? String → `""`? Array → `[]`?
- _Example_: binary search → test with an empty array

**4. Think About Order & Structure**

- Already sorted? Reverse sorted? All unique? All identical? Tree with one node? Graph with no edges?
- _Example_: graph traversal → test a single-node graph

**5. Push the Algorithm to Its Limits**

- Will it still work with huge inputs? Could it overflow?
- _Example_: Fibonacci (DP) → test `n = 10^6`

**6. Consider Concurrency & Real-World Scenarios**

- Multiple users accessing it? Rapid insertions/deletions?
- _Example_: cache design → think about concurrent access

---


## 📚 Reference Links

- [takeuforward – Striver's A2Z DSA Course](https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2)
- [Interview Cake – Coding Interview Practice](https://www.interviewcake.com/table-of-contents#section_algorithmic-thinking_article_data-structures-coding-interview)
- [14 Patterns to Ace Any Coding Interview Question – HackerNoon](https://hackernoon.com/14-patterns-to-ace-any-coding-interview-question-c5bb3357f6ed)
- [Graph Theory Tutorial – Google Engineer](https://www.youtube.com/watch?v=09_LlHjoEiY)
- [Graph Algorithms for Technical Interviews – Full Course](https://www.youtube.com/watch?v=tWVWeAqZ0WU)
- [Java Collection Interface – Programiz](https://www.programiz.com/java-programming/collection-interface)
- [L1. Introduction to Bit Manipulation](https://www.youtube.com/watch?v=qQd-ViW7bfk&list=PLgUwDviBIf0rnqh8QsJaHyIX7KUiaPUv7&index=1)

## Topic-wise Mastery Plans (AI-generated revision strategy)

# Two Pointer and Sliding Window


    ## 📅 7-Day Two-Pointer & Sliding Window Mastery Plan


    ### ✅ Day 1: Basics of Two Pointers (Opposite Ends)


    Understand how two pointers help shrink or expand from opposite ends.

    - Two Sum (Sorted Array) – LC 167
    - Valid Palindrome – LC 125
    - Reverse String – LC 344
    - Container With Most Water – LC 11 🔥

    Key learnings: two pointers optimize brute force O(N²) → O(N); best for sorted arrays, palindromes, boundary problems.


    ### ✅ Day 2: Two Pointers (Same Direction – Fast & Slow)

    - Linked List Cycle – LC 141
    - Find the Duplicate Number – LC 287 🔥
    - Middle of the Linked List – LC 876
    - Happy Number – LC 202

    Key learnings: fast & slow pointers detect cycles in O(N); useful in linked lists, number problems, repetitions.


    ### ✅ Day 3: Classic Two Pointer Sorting Problems

    - Merge Sorted Array – LC 88
    - Remove Duplicates from Sorted Array – LC 26
    - Squares of a Sorted Array – LC 977
    - 3Sum – LC 15 🔥

    Key learnings: sorting + two pointers solves pair problems in O(N log N).


    ### ✅ Day 4: Sliding Window (Fixed Size)

    - Maximum Sum Subarray of Size K – LC 643
    - Find the Highest Altitude – LC 1732
    - Best Time to Buy and Sell Stock – LC 121 🔥
    - Max Consecutive Ones III – LC 1004

    Key learnings: sliding window avoids redundant recalculation; used for continuous subarrays, sums, optimizations.


    ### ✅ Day 5: Dynamic Sliding Window (Variable Size)

    - Longest Substring Without Repeating Characters – LC 3 🔥
    - Minimum Size Subarray Sum – LC 209
    - Permutation in String – LC 567
    - Longest Repeating Character Replacement – LC 424

    Key learnings: expand window to find solutions, shrink to optimize; combine with HashMaps for character-based problems.


    ### ✅ Day 6: Advanced Sliding Window (Substring Problems)

    - Find All Anagrams in a String – LC 438
    - Substring with Concatenation of All Words – LC 30 🔥
    - Minimum Window Substring – LC 76 🔥
    - Longest Substring with At Most K Distinct Characters – LC 340 (Premium)

    ### ✅ Day 7: Mock Interview & Review

    - Solve 3 problems from previous days in a 45-min limit
    - Review edge cases & optimizations; compare Two Pointers vs Sliding Window

    ## 🚀 Tips for Google Interviews


    ✔️ **When to use Two Pointers?** Sorted array → optimize search. Palindrome check → move from both ends. Linked list cycle → fast & slow pointers.


    ✔️ **When to use Sliding Window?** Fixed window → move right pointer only. Variable window → move both pointers. Substring problems → HashMaps.


    ✔️ **Optimizations**: two pointers O(N²)→O(N); sliding window eliminates redundant recalculation; HashMaps for substring tracking.


# BFS


    ## 📅 7-Day BFS Mastery Plan


    ### ✅ Day 1: BFS Basics & Level Order Traversal

    - Binary Tree Level Order Traversal – LC 102
    - Binary Tree Zigzag Level Order Traversal – LC 103
    - Minimum Depth of Binary Tree – LC 111

    Key learnings: BFS processes nodes level by level using `queue.size()`; differentiate from DFS in trees.


    ### ✅ Day 2: Grid BFS & Multi-Source BFS

    - Number of Islands – LC 200 🔥
    - Rotting Oranges – LC 994 🍊
    - Walls and Gates – LC 286

    Key learnings: use a visited[][] array for grids; multi-source BFS expands from multiple starting points simultaneously.


    ### ✅ Day 3: Graph BFS & Shortest Path

    - Shortest Path in Binary Matrix – LC 1091 🔥
    - Word Ladder – LC 127 🔥
    - Snakes and Ladders – LC 909

    Key learnings: BFS finds shortest path in unweighted graphs; Queue ensures correct exploration order.


    ### ✅ Day 4: Graph Cycle Detection & Topological Sorting

    - Clone Graph – LC 133
    - Course Schedule – LC 207 🔥
    - Course Schedule II – LC 210

    Key learnings: BFS (Kahn's Algorithm) detects cycles in directed graphs and does topological sorting.


    ### ✅ Day 5: Advanced Grid BFS & Variations

    - Pacific Atlantic Water Flow – LC 417
    - Surrounded Regions – LC 130
    - Jump Game III – LC 1306

    ### ✅ Day 6: BFS + Backtracking & Optimizations

    - Word Ladder II – LC 126
    - K-Similar Strings – LC 854
    - Sliding Puzzle – LC 773

    ### ✅ Day 7: Mock Interview & Review

    - Solve 3 problems under a 45-min limit; review mistakes; implement BFS recursively and iteratively; revisit Word Ladder, Number of Islands, Course Schedule.

    ## 🚀 Tips to Speed Up Problem-Solving


    ✔️ Identify the type: Tree traversal → level-order BFS. Grid movement → BFS with visited[][]. Graph with dependencies → topological BFS. Shortest path unweighted → BFS.


    ✔️ Optimize with pruning: use HashSet instead of boolean[][] where applicable; mark visited early to avoid redundant queue insertions.


    ✔️ Write edge cases before coding: empty grid? large numbers? multiple sources? cycles?


# DFS


    ## 📅 7-Day DFS Mastery Plan


    ### ✅ Day 1: Basic DFS (Tree Traversal)

    - Binary Tree Preorder/Inorder/Postorder Traversal – LC 144/94/145
    - Maximum Depth of Binary Tree – LC 104

    Key learnings: DFS can be recursive or stack-based; preorder/inorder/postorder visit nodes in different orders; useful for depth-based calculations.


    ### ✅ Day 2: Graph DFS & Cycle Detection

    - Number of Connected Components in an Undirected Graph – LC 323
    - Graph Valid Tree – LC 261
    - Detect Cycle in a Directed Graph – LC 207 🔥
    - Detect Cycle in an Undirected Graph – LC 785

    Key learnings: use a visited set; directed-graph cycle detection uses a recursion stack; undirected uses parent tracking.


    ### ✅ Day 3: DFS on Grids (Flood Fill & Islands)

    - Number of Islands – LC 200 🔥
    - Surrounded Regions – LC 130
    - Flood Fill – LC 733
    - Max Area of Island – LC 695

    Key learnings: recursive DFS can stack-overflow on large grids; convert grid problems into graph traversal problems.


    ### ✅ Day 4: DFS + Backtracking (Classic Problems)

    - Permutations – LC 46 🔥
    - Combinations – LC 77
    - Subsets – LC 78
    - Letter Combinations of a Phone Number – LC 17

    Key learnings: backtracking = DFS with undoing choices; use a temporary path list; pruning improves efficiency.


    ### ✅ Day 5: DFS + Backtracking (Hard Problems)

    - Generate Parentheses – LC 22 🔥
    - Word Search – LC 79
    - N-Queens – LC 51 🔥
    - Palindrome Partitioning – LC 131

    ### ✅ Day 6: Topological Sorting (DFS in DAGs)

    - Course Schedule II – LC 210
    - Alien Dictionary – LC 269 (Premium) 🔥
    - Find Eventual Safe States – LC 802

    Key learnings: DFS postorder traversal helps topological sort; DFS detects cycles in dependency graphs; Kahn's (BFS) is an alternative.


    ### ✅ Day 7: Mock Interview & Review

    - Solve 3 DFS problems under 45 min; revisit DFS + backtracking; compare DFS vs BFS.

    ## 🚀 DFS Strategy for Google Interviews


    ✔️ Use DFS for: tree traversal, graph traversal (components/cycles), grid traversal (islands/flood fill/backtracking), state space search.


    ✔️ Recursive DFS is easier but risks stack overflow; iterative DFS (explicit stack) is preferred for deep graphs/grids.


    ✔️ Backtracking optimizations: pruning to cut unnecessary calls; memoization to avoid redundant state exploration.


# Graphs Essentials


    ### ✅ Day 1: Graph Representation & Union-Find

    - Graph Representation (Adjacency List & Matrix)
    - Union-Find Basics (Path Compression & Union by Rank)
    - Find if a Graph is a Tree – LC 261
    - Number of Connected Components in an Undirected Graph – LC 323

    Key learnings: adjacency list best for sparse graphs; Union-Find great for connectivity & cycle detection; path compression → near O(1).


    ### ✅ Day 2: Kruskal's & Prim's (MST)

    - Kruskal's Algorithm (Union-Find + Sorting)
    - Prim's Algorithm (Priority Queue – Greedy)
    - Minimum Cost to Connect All Points – LC 1584 🔥
    - Connecting Cities with Minimum Cost – LC 1135 (Premium)

    Key learnings: Kruskal's = sorting + union-find, O(E log E); Prim's = greedy selection with priority queue.


    ### ✅ Day 3: Dijkstra's Algorithm

    - Dijkstra's Algorithm (Priority Queue / Min-Heap)
    - Shortest Path in a Grid with Obstacles – LC 1293 🔥
    - Network Delay Time – LC 743
    - Cheapest Flights Within K Stops – LC 787

    Key learnings: best for single-source shortest paths with non-negative weights; doesn't work with negative-weight cycles.


    ### ✅ Day 4: Bellman-Ford (Negative Weights)

    - Bellman-Ford Algorithm (Relaxation)
    - Detect Negative Cycle in a Graph
    - Cheapest Flights Within K Stops (Bellman-Ford) – LC 787

    Key learnings: handles negative weights, unlike Dijkstra; O(VE); used for arbitrage/cycle detection.


    ### ✅ Day 5: Floyd-Warshall & Topological Sorting

    - Floyd-Warshall (All-Pairs Shortest Path, O(V³))
    - Course Schedule II – LC 210
    - Alien Dictionary – LC 269 (Premium)
    - Find Eventual Safe States – LC 802

    ### ✅ Day 6: Advanced Graph Problems (Hard, Google-level)

    - Reconstruct Itinerary – LC 332 🔥
    - Word Ladder II – LC 126
    - The Maze II – LC 505
    - Swim in Rising Water – LC 778

    ### ✅ Day 7: Mock Interview & Review

    - Solve 3 graph problems under 45 min; compare Dijkstra vs Bellman-Ford vs Floyd-Warshall.

    ## 🚀 Graph Strategy for Google Interviews


    ✔️ Union-Find → connectivity & cycles, MST (Kruskal's), islands, components.


    ✔️ Dijkstra (greedy) → non-negative weights. Bellman-Ford (DP) → negative weights exist. Floyd-Warshall → all-pairs shortest paths.


    ✔️ Topological sort → DAGs, dependency resolution.


    ✔️ MST: Kruskal's for fewer edges (union-find), Prim's for dense graphs (priority queue).


# Dynamic Programming


    ## 📅 10-Day Dynamic Programming Mastery Plan


    ### ✅ Day 1: Recursion & Memoization (Top-Down DP)

    - Fibonacci Number – LC 509
    - Climbing Stairs – LC 70
    - House Robber – LC 198
    - Memoization vs. Tabulation

    Key learnings: identify overlapping subproblems; recursive → memoization (top-down DP).


    ### ✅ Day 2: Bottom-Up DP (Tabulation)

    - House Robber II (Circular) – LC 213
    - Min Cost Climbing Stairs – LC 746
    - Decode Ways – LC 91

    Key learnings: eliminate recursion, convert to iteration; use 1D arrays instead of recursion stack.


    ### ✅ Day 3: 0/1 Knapsack Pattern

    - 0/1 Knapsack Problem
    - Partition Equal Subset Sum – LC 416
    - Target Sum – LC 494
    - Subset Sum

    Key learnings: choice diagram (take/not take); 2D dp[i][j] can optimize to 1D dp[j].


    ### ✅ Day 4: Unbounded Knapsack Pattern

    - Coin Change – LC 322
    - Coin Change II – LC 518
    - Integer Break – LC 343

    Key learnings: loop order matters; use 1D DP array to optimize space.


    ### ✅ Day 5: Longest Common Subsequence (LCS) Pattern

    - Longest Common Subsequence – LC 1143
    - Longest Palindromic Subsequence – LC 516
    - Edit Distance – LC 72

    Key learnings: dp[i][j] represents subproblems of two strings; 2D → can optimize to 1D.


    ### ✅ Day 6: Palindromic DP

    - Palindromic Substrings – LC 647
    - Longest Palindromic Substring – LC 5
    - Minimum Cuts for Palindrome Partitioning – LC 132

    ### ✅ Day 7: Grid DP Problems

    - Unique Paths – LC 62
    - Unique Paths II (Obstacles) – LC 63
    - Minimum Path Sum – LC 64

    ### ✅ Day 8: Advanced DP (Digit DP, Bitmasking)

    - Counting Numbers without Consecutive 1s (Digit DP)
    - Travelling Salesman Problem (Bitmask DP)
    - Super Egg Drop – LC 887 🔥

    ### ✅ Day 9: Google-Level Hard DP Problems

    - Burst Balloons – LC 312 🔥
    - Best Time to Buy and Sell Stock IV – LC 188
    - Russian Doll Envelopes – LC 354

# Stacks and Queues


    ### ✅ Day 1: Basics

    - Stack: push(), pop(), peek(), isEmpty(), size()
    - Queue: enqueue(), dequeue(), peek(), isEmpty(), size()
    - Applications — Stacks: expression evaluation, backtracking, undo/redo. Queues: job scheduling, level-order traversal, BFS.

    ### ✅ Day 2: Implementing Stacks and Queues

    - Array-based Stack, Linked-list based Queue
    - Circular Queue – LC 622
    - Stack using Queue – LC 225 / Queue using Stack – LC 232

    ### ✅ Day 3: Monotonic Stacks and Queues

    - Monotonic Stack: Next Greater Element – LC 739, Largest Rectangle in Histogram – LC 84, Stock Span Problem
    - Monotonic Queue: Sliding Window Maximum – LC 239

    ### ✅ Day 4: Stack & Queue Problems

    - Valid Parentheses – LC 20, Min Stack – LC 155, Next Greater Element – LC 739, Sliding Window Maximum – LC 239, Queue Reconstruction by Height – LC 406, Trapping Rain Water – LC 42

    ### ✅ Day 5: Mock Interview & Review


    ## 🚀 Monotonic Stack & Queue Strategy


    ✔️ Monotonic Stack → next greater element, histogram area, stock span.


    ✔️ Monotonic Queue → sliding window max/min tracking.


# Heaps


    ### ✅ Day 1: Understanding Heaps and Basic Operations


    Max-heap: parent ≥ child. Min-heap: parent ≤ child. Ops: insert/extractMin/extractMax/peek/heapify/buildHeap — insert/delete O(log n), peek O(1).


    ### ✅ Day 2: Implementing Heaps


    Array-based: parent at i, children at 2i+1, 2i+2. Implement Min Heap – LC 703, Max Heap – LC 215.


    ### ✅ Day 3: Heap-Based Algorithms

    - Heap Sort, Priority Queue, Kth Largest Element – LC 215, K Smallest Elements – LC 378, Merge k Sorted Lists – LC 23, Find Median from Data Stream – LC 295

    ### ✅ Day 4: Advanced Heap Problems

    - Top K Frequent Elements – LC 347, Kth Largest Element in a Stream – LC 703, Sliding Window Maximum – LC 239, Kth Smallest in Sorted Matrix – LC 378, Super Ugly Number – LC 313

    ### ✅ Day 5: Mock Interview & Review


    ## 🚀 Heap Strategy


    ✔️ Priority queues, Kth largest/smallest, merge k sorted lists.


    ✔️ Master insert O(log n), extract min/max O(log n), heapify O(n).


# Tries


    ### ✅ Day 1: Understanding Tries and Basic Operations


    Tree-like structure for strings; root = empty string; ops insert/search/startsWith/delete, O(m) where m = string length. Applications: autocomplete, prefix matching, dictionary.


    ### ✅ Day 2: Implementing Tries


    Node = children map + isEndOfWord boolean. Implement Trie – LC 208, Design Add and Search Words – LC 211.


    ### ✅ Day 3: Trie Applications and Problems


    Autocomplete/suggestions via prefix matching; Word Search II – LC 212 combines Trie + backtracking.


    ### ✅ Day 4: Advanced Trie Problems

    - Word Search II – LC 212, Maximum XOR of Two Numbers in an Array – LC 421, Add and Search Word – LC 211, Implement Magic Dictionary – LC 676

    ### ✅ Day 5: Mock Interview & Review


## 02 · Java Fundamentals & Snippets

## Quick Hits

- **Subarray vs Subsequence**: Subarray = contiguous part of an array. Subsequence = subset of an array; order doesn't matter (elements can be non-contiguous but relative order is preserved).
- **Unique triplet/quad in a HashSet**: sort the triplet/quad before adding, so permutations of the same values collapse to one entry:

```java
Set<List<Integer>> set = new HashSet<>();
List<Integer> triplet = new ArrayList<>(Arrays.asList(2, 1, 1));
Collections.sort(triplet); // sort before adding
set.add(triplet);
```


## Java Array Limits

- Theoretical max size: **2^31 − 1** elements (~2.1 billion) — arrays are indexed with a 32-bit signed int (`Integer.MAX_VALUE`).
- Practical limit is memory-bound: 1 billion ints ≈ 4 GB (4 bytes/int). 32-bit JVMs cap out far lower; 64-bit JVMs with enough RAM can approach the theoretical max.
- For very large datasets: use `List<int[]>` (chunking), accept `ArrayList<Integer>` overhead, or fall back to disk-based storage.

## String vs StringBuilder vs StringBuffer


| Feature       | `String` (Immutable)           | `StringBuilder` (Mutable)              | `StringBuffer` (Mutable, thread-safe)     |
| ------------- | ------------------------------ | -------------------------------------- | ----------------------------------------- |
| Mutability    | New object per change          | Modifies in place                      | Modifies in place                         |
| Performance   | Slow for repeated modification | Fast                                   | Slower than StringBuilder (sync overhead) |
| Thread safety | Safe (immutable)               | Not thread-safe                        | Thread-safe                               |
| Use case      | Fixed/rarely-changed text      | Frequent modification, single-threaded | Frequent modification, multi-threaded     |


**`substring()`** **complexity**: O(1) up to Java 6 (shared the underlying `char[]`, could cause memory leaks by pinning large arrays). **Java 7+: O(n)** — it copies characters into a new array. `s.substring(start, end)`: start inclusive, end exclusive.


For large-string / performance-sensitive substring work: `subSequence()` is O(1) (returns a `CharSequence` view, no copy, but you lose `String`-specific methods); `StringBuilder`/`char[]` avoid repeated allocations; memory-mapped files (`RandomAccessFile` + `MappedByteBuffer`) for GB/TB-scale text.


## Thread Safety (reference)


Thread safety = no race conditions / inconsistent state when multiple threads touch the same code or data. Key aspects: **atomicity** (single indivisible ops), **visibility** (changes seen across threads), **ordering** (correct instruction sequencing).


Ways to achieve it:

1. `synchronized` keyword — only one thread in the critical section at a time.
2. `volatile` — guarantees visibility, not atomicity.
3. `java.util.concurrent` (`ReentrantLock`, `ConcurrentHashMap`, `CopyOnWriteArrayList`).
4. Atomic classes (`AtomicInteger`, etc.) via `java.util.concurrent.atomic`.
5. Immutable objects — inherently thread-safe.

## Java Collections Framework (structure)


Three core interfaces: **Collection** (parent) → **List**, **Set**, **Queue**; plus **Map** (separate hierarchy, key/value pairs) and **Iterator**.

- **List** (ordered, allows duplicates): implemented by `ArrayList` (resizable array, fast random access) and `LinkedList` (doubly-linked list — implements `List`, `Queue`, and `Deque`; stores data + prev/next pointers).
- **Vector**: like `ArrayList` but every method is synchronized (thread-safe but slower); prefer `Collections.synchronizedList()` on an `ArrayList` instead in most cases.
- **Stack**: extends `Vector`. Extra methods beyond Vector: `push(x)`, `pop()`, `peek()`, `search()` (position from top), `empty()`.
- **Set** (no duplicates, mirrors mathematical sets) → `SortedSet`.
- **Queue** (FIFO) → `Deque`.
- **Map**: key/value pairs, unique keys → `SortedMap`.
- **Iterator**: sequential access to collection elements → `ListIterator`.
- `Collections.binarySearch()`: returns the index if found, else `-(insertion point) - 1`.

Useful `ArrayList` methods: `add`, `addAll`, `get`, `iterator`, `set`, `remove`, `removeAll`, `clear`, `size`, `toArray`, `contains`, `sort`, `clone`, `ensureCapacity`, `isEmpty`, `indexOf`.


**Is Java pass-by-value or pass-by-reference?** Java is strictly **pass-by-value** — for objects, the _value of the reference_ (pointer) is copied, not the object itself, which is why mutating an object's fields through a passed reference is visible to the caller, but reassigning the parameter inside the method is not.


## Handy Snippets


**ArrayList → Array**


```java
List<Integer> arrayList = new ArrayList<Integer>();
int[] arr = new int[arrayList.size()];
arrayList.toArray(arr);
```


**Array → ArrayList**


```java
int[] arr = new int[10];
List<Integer> arrayList = new ArrayList<>(Arrays.asList(arr));
```


**LinkedList → array (object / primitive)**


```java
LinkedList<Integer> list = new LinkedList<>();
list.add(10); list.add(20); list.add(30);
Integer[] array = list.toArray(new Integer[0]);
int[] intArray = list.stream().mapToInt(Integer::intValue).toArray();
```


**Representing "Infinity"**: don't use `Integer.MAX_VALUE` if you'll be adding two "infinities" together — it overflows.

- `Integer.MAX_VALUE` = 2,147,483,647 (32-bit int cap)
- A safer large sentinel: `int highValue = 1_000_000_000;` (1e9, underscores allowed for readability, well within `int` range)
- Need bigger than 10^9? Use `long highValue = 1_000_000_000L;` (`Long.MAX_VALUE` = 9,223,372,036,854,775,807)
- Or `double highValue = 1e9;` if exact integer precision isn't required (watch for float precision issues in arithmetic)

**PriorityQueue —** **`add()`** **vs** **`offer()`**


|               | `add(E e)`                        | `offer(E e)`                 |
| ------------- | --------------------------------- | ---------------------------- |
| On full queue | throws `IllegalStateException`    | returns `false`              |
| Return type   | `boolean` (true unless exception) | `boolean` (false on failure) |
| Use when      | you're sure there's space         | you want safer insertion     |


**ArrayList vs LinkedList vs ArrayDeque**: if you need to insert at the _beginning_ frequently, prefer `LinkedList` (or `ArrayDeque`) over `ArrayList` (which is O(n) for front-inserts).


## 03 · Core Data Structures

## What is a Data Structure?


A way of organizing data in memory so it can be stored, accessed, and modified efficiently for the problem at hand. Interviews test this because writing efficient code requires understanding these tradeoffs.


**Memory vs storage**: RAM ("memory") holds variables while code runs — fast, limited capacity. Disk ("storage") holds persistent files — slower, larger capacity. RAM is addressed like a giant numbered bookcase (each address/shelf holds a byte = 8 bits); the memory controller has a _direct connection_ to every address, which is why it's called Random Access Memory. The processor also keeps a **cache** of recently-read memory — sequential memory access is faster than jumping around because of this caching effect.


**Fixed-width integers**: Java `int` = 32 bits, `long` = 64 bits. An n-bit integer has 2^n possible values — exceeding that range causes **integer overflow** (e.g., an 8-bit unsigned int wraps from 255+1 back to 0 instead of 256). Fixed-width integers are O(1) space and O(1) time for basic ops, at the cost of a limited value range.


**Java primitive types**:


| Type    | Default | Size    | Range                           |
| ------- | ------- | ------- | ------------------------------- |
| boolean | false   | 8 bits  | true/false                      |
| byte    | 0       | 8 bits  | -128 to 127                     |
| char    | u0000   | 16 bits | 0–255 (Unicode)                 |
| short   | 0       | 16 bits | -32,768 to 32,767               |
| int     | 0       | 32 bits | -2,147,483,648 to 2,147,483,647 |
| long    | 0       | 64 bits | ±9,223,372,036,854,775,807      |
| float   | 0.0     | 32 bits | ~7 decimal digits               |
| double  | 0.0     | 64 bits | ~16 decimal digits              |


**Classifying data structures by memory layout**:

- **Contiguous** — single slab of memory (arrays, matrices, heaps).
- **Linked** — distinct chunks bound by pointers; every node has data field(s) + a pointer to at least one other node, plus a head pointer (linked lists, trees, graph adjacency lists).
- **Abstract Data Types (ADTs)** — a conceptual contract of operations/behavior, implementation-agnostic (stacks, queues, dictionaries). E.g. a stack can be backed by an array or a linked list; a HashTable is one implementation of the Dictionary ADT.

---


## Arrays


Fixed-size, contiguous, indexable in O(1): `address = start_address + (index * element_size)`.


**Tradeoffs**: O(1) index access, space-efficient (no pointer overhead), cache-friendly (contiguous) — but can't resize mid-execution and needs one large contiguous memory block.


**Pointer arrays**: instead of storing data inline, store _addresses_ of the data elsewhere in memory. Fixes the "fixed element size" and "needs contiguous free space" problems, but loses cache-friendliness since the actual data is scattered.


**Dynamic arrays**: backed by an underlying static array with a tracked `end_index`. When capacity is exceeded: allocate a new (usually 2x) array, copy every element over, free the old array, then append. A single doubling append costs O(n), but **amortized over m appends the total cost is O(m)** (geometric series: 1+2+4+...+m/2 ≈ m, so m appends + doubling ≈ 3m = O(m) → O(1) amortized per append). Advantage over static arrays: no need to know size ahead of time. Disadvantage: occasional expensive append.


---


## Linked Lists


Efficient insertion/deletion vs. arrays; supports search, insertion, deletion.


**Singly linked list node:**


```java
public class Node {
	int data;
	Node next;
	public Node(int data){ this.data = data; this.next = null; }
}
```


**Traverse** — O(n): walk `curr = curr.next` until null.


**Search** — O(n): walk and compare `curr.data` to target.


**Insertion**:

- _At beginning_: new node's `next` → current head; move head → new node.
- _At end_: if empty, new node becomes head; else traverse to the last node and link it to the new node.
- _At position_: traverse to `(position-1)`, splice the new node in between.

**Deletion**:

- _First node_: move head to `head.next`, discard old head.
- _Last node_: traverse to the second-to-last node (`curr.next.next == null`), set its `next` to null.
- _At position_: traverse to the node before the target, bypass the target node by relinking.

**Reverse** (three-pointer technique):


```javascript
prev = null, current = head, next = null
while current != null:
    next = current.next
    current.next = prev
    prev = current
    current = next
head = prev
```


**Doubly linked lists** beat singly linked lists when you need:

- **Bidirectional traversal** (browser history, playlists).
- **O(1) deletion of a given node** — no need to traverse to find the previous node, since each node already has a `prev` pointer.
- **Implementing other structures efficiently** — deques (O(1) insert/delete at both ends), memory allocators, undo/redo stacks.

_(Circular linked lists — noted as a topic but no detail was captured in the original notes.)_


---


## Stacks


LIFO — insertion and removal both happen at one end ("top").


**Types**: Fixed-size (overflow/underflow errors at capacity limits) vs. Dynamic-size (typically linked-list backed, grows/shrinks automatically).


| Operation                                      | Time | Space |
| ---------------------------------------------- | ---- | ----- |
| push() / pop() / peek() / isEmpty() / isFull() | O(1) | O(1)  |


**Array-based implementation:**


```java
class Stack {
    int size = 10000;
    int[] arr = new int[size];
    int top = -1;
    void push(int x) { arr[++top] = x; }
    int pop() { return arr[top--]; }
    int top() { return arr[top]; }
    int size() { return top + 1; }
}
```


**Linked-list implementation:** push = insert new node at head (O(1)); pop = remove head node after checking for underflow, return its data; size tracked via a counter; `isEmpty()` checks `top == null`.


---


## Queues


FIFO — insert at rear, remove from front. Terminology: **front/head** (next to be served), **rear/tail** (most recently added), **size** (current count), **capacity** (max count).


**Types**: Simple Queue (FIFO only), Deque (insert/delete at both ends — _input-restricted_: enqueue one end only, dequeue either; _output-restricted_: enqueue either end, dequeue one end only), Circular Queue (rear wraps back to connect with front).


| Operation                                           | Time | Space |
| --------------------------------------------------- | ---- | ----- |
| enqueue / dequeue / front / size / isEmpty / isFull | O(1) | O(1)  |

- **Enqueue**: check for overflow → increment rear → insert at rear.
- **Dequeue**: check for underflow → remove element at front → increment front.
- Peek / size / isEmpty / isFull are straightforward accessor checks.

---


## HashMap / HashTable / Dictionary


Organizes data for fast key → value lookup.


**Strengths**: O(1) average lookup; flexible (hashable) keys.


**Weaknesses**: O(n) worst-case lookup; unordered (no fast min/max/range queries); single-directional (value→key lookup is O(n)); not cache-friendly (many implementations chain via linked lists).


|                          | Average | Worst case |
| ------------------------ | ------- | ---------- |
| space                    | O(n)    | O(n)       |
| insert / lookup / delete | O(1)    | O(n)       |


Conceptually, a hash map is an array where a **hashing function** converts an arbitrary key into an array index (e.g., sum character codes, then `% array_size` to fit the range).


**Collision handling:**

- **Chaining** — each bucket holds a list/collection of all entries that hash to that index. Simple, grows dynamically, but degrades toward O(n) if too many keys collide into one bucket; extra memory for the lists.
- **Open addressing** — on collision, probe for the next open slot in the table itself (linear probing: i+1, i+2…; quadratic probing: i+1², i+2²…; double hashing: a second hash function picks the step). No extra list memory and better cache locality, but risks clustering and needs rehashing as load factor grows; more complex to implement.

**HashMap vs Hashtable (Java)**:


|                  | HashMap                                   | Hashtable                  |
| ---------------- | ----------------------------------------- | -------------------------- |
| Thread safety    | Not synchronized                          | Synchronized               |
| Null keys/values | 1 null key, multiple null values allowed  | Neither allowed (NPE)      |
| Performance      | Faster (no sync overhead)                 | Slower                     |
| Iteration        | Fail-fast `Iterator`                      | Non-fail-fast `Enumerator` |
| Era              | Java 1.2 Collections Framework, preferred | Legacy (pre-1.2)           |


---


## Trees


Hierarchical parent-child structure. **Binary tree**: each node has ≤ 2 children. Edges = N-1 for N nodes; exactly one path between any two nodes. **Depth of a node** = number of edges from root to that node.


### Binary Search Trees (BST)


Left subtree < node < right subtree, recursively, no duplicates (or duplicates handled via a defined convention).


**Insert** — walk from root, go left if key < node else right, until a null slot is found, attach there:


```java
static Node insert(Node root, int key){
    if (root == null) return new Node(key);
    if (root.data == key) return root;
    if (key < root.data) root.left = insert(root.left, key);
    else root.right = insert(root.right, key);
    return root;
}
```


Time: O(h) worst case O(n) if skewed. Space: O(1) (O(h) if recursive, due to call stack).


**Search** — binary-search-like walk comparing key vs `root.data`, going left/right accordingly. O(h) time; iterative version avoids the O(h) recursion-stack space.


**Delete** — three cases: leaf node (just remove), one child (splice child up), two children (replace value with inorder successor — the min of the right subtree — then delete that successor node):


```java
static Node deleteNode(Node root, int key){
    if (root == null) return root;
    if (key < root.key) root.left = deleteRec(root.left, key);
    else if (key > root.key) root.right = deleteRec(root.right, key);
    else {
        if (root.left == null) return root.right;
        else if (root.right == null) return root.left;
        root.key = minValue(root.right);
        root.right = deleteRec(root.right, root.key);
    }
    return root;
}
```


| Operation                | Best/Avg | Worst              |
| ------------------------ | -------- | ------------------ |
| Search / Insert / Delete | O(log n) | O(n) (skewed tree) |


### Balanced Search Trees


Maintain O(log N) height via a balance condition, preventing the skewed-to-linked-list worst case.


| Tree           | Balancing method                       | Best use case                               |
| -------------- | -------------------------------------- | ------------------------------------------- |
| AVL Tree       | Rotations & height balancing           | Read-heavy apps                             |
| Red-Black Tree | Color-based balancing                  | STL/Java `map`/`set`, write-heavy           |
| B-Tree         | Multi-way branching                    | Databases/file systems (minimizes disk I/O) |
| 2-3 Tree       | Nodes have 2–3 children                | Theoretical model for B-Trees               |
| Splay Tree     | Self-adjusting (move to root)          | Caching / access locality                   |
| Treap          | Randomized balancing via heap priority | Probabilistic guarantees                    |


All balanced trees: O(log N) search/insert/delete, since height stays O(log N).


**Which to pick**: fast lookups → AVL; general write-heavy ordered map → Red-Black; disk-efficient → B-Tree; access-locality → Splay Tree.


### Segment Trees


Used for range queries (sum/min/max/GCD) with updates — divides the array into segments and stores aggregate info per segment in a tree structure, giving O(log N) range query + update.


---


## Heaps


Complete binary tree satisfying the heap property (Max Heap: parent ≥ children; Min Heap: parent ≤ children), stored **implicitly as an array** — no child/parent pointers needed:

- Left child of index `i` → `2*i + 1`
- Right child of index `i` → `2*i + 2`
- Parent of index `i` → `(i-1)/2`

**Heapify-Up** (after insert at the end): compare with parent, swap if it violates heap order, repeat until root or heap property holds.


**Heapify-Down** (after removing root, replacing with last element): compare with children, swap with the child that violates heap order (larger child for max-heap, smaller for min-heap), repeat until in place.


**Insert**: append at the end → heapify-up. O(log n) (bounded by tree height since it's balanced/complete).


**Delete** (typically the root): replace root with the last element → heapify-down. O(log n).


**Search**: O(n) — no ordering guarantee beyond the heap property.


**Build heap from an unordered array**: heapify-down from the last non-leaf node up to the root (bottom-up) — this is **O(n)**, not O(n log n), because most nodes are near the bottom and need very few swaps (this is provably tighter than doing n individual O(log n) inserts).


| Operation                                | Time     |
| ---------------------------------------- | -------- |
| Heapify-Up / Heapify-Down                | O(log n) |
| Build Heap (heapify all nodes bottom-up) | O(n)     |


**MinHeap sketch:**


```java
class MinHeap {
    int[] heapArr; int size; int capacity;
    private int getParentIndex(int i){ return (i-1)/2; }
    private int getLeftChildIndex(int i){ return 2*i+1; }
    private int getRightChildIndex(int i){ return 2*i+2; }
    public void insert(int value){
        heapArr[size] = value;
        int curr = size++;
        heapifyUp(curr);
    }
    private void heapifyUp(int current){
        while (current > 0 && heapArr[current] < heapArr[getParentIndex(current)]) {
            swap(current, getParentIndex(current));
            current = getParentIndex(current);
        }
    }
    public int extractMin(){
        int min = heapArr[0];
        heapArr[0] = heapArr[--size];
        heapifyDown(0);
        return min;
    }
    private void heapifyDown(int index){
        int smallest = index, left = getLeftChildIndex(index), right = getRightChildIndex(index);
        if (left < size && heapArr[left] < heapArr[smallest]) smallest = left;
        if (right < size && heapArr[right] < heapArr[smallest]) smallest = right;
        if (smallest != index) { swap(index, smallest); heapifyDown(smallest); }
    }
}
```


**Build heap:**


```java
private void buildHeap() {
    for (int i = (size / 2) - 1; i >= 0; i--) heapify(i);
}
```


---


## Graphs


**Directed vs undirected**: edges point one-way vs. simply connect. **Cyclic vs acyclic**: contains a cycle or not. **Weighted vs unweighted**: edges carry a cost/distance or not. **DAG**: directed + acyclic. **Legal coloring**: assigning colors to nodes such that no adjacent nodes share a color.


**Representations:**

- **Edge list** — flat list of all edges, e.g. `{{0,1},{1,2},{1,3},{2,3}}`. Pair with a node list in case some node has no edges (it wouldn't otherwise show up).
- **Adjacency list** — index/key = node, value = list of neighbors. Use a `HashMap<Integer,List<Integer>>` when nodes aren't array-index-friendly (strings, objects).
- **Adjacency matrix** — `graph[x][y] = 1` if x connects to y else 0.
- **Space**: Adjacency Matrix O(n²); Adjacency List O(2·E).

**Strengths**: natural fit for "things that connect to other things" (cities/highways, routers/cables, social graphs).


**Weaknesses**: most graph algorithms are O(n log n) or slower — scaling can be a real concern on large graphs.


---


## Tries


Tree specialized for storing/retrieving strings via shared prefixes. Root = empty string; each edge = one character.


```java
class Trie {
    class TrieNode {
        TrieNode[] children;
        boolean isEndOfWord;
        TrieNode(){ this.children = new TrieNode[26]; this.isEndOfWord = false; }
    }
    TrieNode root;
    Trie(){ this.root = new TrieNode(); }
    int getIndex(char c){ return c - 'a'; }
    public void insert(String word){
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            int i = getIndex(c);
            if (node.children[i] == null) node.children[i] = new TrieNode();
            node = node.children[i];
        }
        node.isEndOfWord = true;
    }
    public boolean search(String word){
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            int i = getIndex(c);
            if (node.children[i] == null) return false;
            node = node.children[i];
        }
        return node.isEndOfWord;
    }
    public boolean startsWith(String prefix){
        TrieNode node = root;
        for (char c : prefix.toCharArray()) {
            int i = getIndex(c);
            if (node.children[i] == null) return false;
            node = node.children[i];
        }
        return true;
    }
}
```


For Unicode support, use `HashMap<Character, TrieNode>` instead of a fixed `TrieNode[26]` array.


---


## Disjoint Set (Union-Find)


Answers "are nodes u and v in the same component?" in near-constant time for **dynamic graphs** (graphs that keep changing) — far better than an O(N+M) traversal per query.


**Two core operations**: `findPar()` (find a node's ultimate/root parent) and `union()` (merge two components), which can use **union by rank** or **union by size**.


**Rank** = distance to the furthest leaf beneath a node. **Ultimate parent** = the topmost/root node (vs. immediate parent = the node directly above).


**Union by Rank + Path Compression:**


```java
public class DisjointSet {
   List<Integer> parent, rank;
   DisjointSet(int size){
       parent = new ArrayList<>(); rank = new ArrayList<>();
       for (int i = 0; i <= size; i++) { parent.add(i); rank.add(0); }
   }
   public int findUParent(int vertex){
       if (parent.get(vertex) == vertex) return vertex;
       int par = findUParent(parent.get(vertex));
       parent.set(vertex, par); // path compression
       return par;
   }
   public void union(int v1, int v2){
       int p1 = findUParent(v1), p2 = findUParent(v2);
       if (p1 == p2) return;
       if (rank.get(p1) > rank.get(p2)) parent.set(p2, p1);
       else if (rank.get(p1) < rank.get(p2)) parent.set(p1, p2);
       else { parent.set(p2, p1); rank.set(p1, rank.get(p1) + 1); }
   }
}
```


**Why attach smaller rank under larger?** Keeps the resulting tree's height smaller, so future `find()` calls traverse fewer hops.


**Union by Size** (same idea, tracks subtree size instead of rank):


```java
public void unionBySize(int v1, int v2){
    int p1 = findUParent(v1), p2 = findUParent(v2);
    if (p1 == p2) return;
    if (size.get(p1) > size.get(p2)) { parent.set(p2, p1); size.set(p1, size.get(p1) + size.get(p2)); }
    else { parent.set(p1, p2); size.set(p2, size.get(p2) + size.get(p1)); }
}
```


**Time complexity**: with both path compression and union by rank/size, `find()` and `union()` are **O(α(n))** — the inverse Ackermann function, which grows so slowly it's effectively constant (≤ 4 for any practical n ≤ 10^9). So Union-Find is effectively **O(1)** per operation in practice.


---


## Bloom Filters & LRU Cache


_(Listed as topics in the original notes but no further detail was recorded under them — flagged here as a gap to fill in later. LRU Cache design/implementation is covered in detail in the [[Full Problem Bank]] — it's one of the tracked problems, tagged Implementation/HashMap/DLL.)_


## 04 · Algorithms I — Sorting, Binary Search, Tree Traversals

## Sorting Algorithms


### Selection Sort


Repeatedly select the smallest element from the unsorted portion and swap it into place.


```java
static void selectionSort(int[] arr){
    int n = arr.length;
    for (int i = 0; i < n; i++) {
        int minIndex = i;
        for (int j = i; j < n; j++) if (arr[j] < arr[minIndex]) minIndex = j;
        int temp = arr[minIndex]; arr[minIndex] = arr[i]; arr[i] = temp;
    }
}
```


Time: O(N²) all cases. Space: O(1).


### Bubble Sort


Repeatedly swap adjacent out-of-order elements, pushing the max to the end each pass.


```java
static void bubbleSort(int[] arr){
    int n = arr.length;
    for (int i = n-1; i >= 0; i--) {
        boolean didSwap = false;
        for (int j = 0; j <= i-1; j++) {
            if (arr[j] > arr[j+1]) { int t=arr[j]; arr[j]=arr[j+1]; arr[j+1]=t; didSwap = true; }
        }
        if (!didSwap) break; // already sorted → best case O(n)
    }
}
```


Time: O(N²) worst/avg, **O(N) best case** (with the `didSwap` early-exit optimization). Space: O(1).


### Insertion Sort


Build up a sorted prefix by inserting each new element into its correct position among the already-sorted elements to its left.


```java
static void insertionSort(int[] arr){
    int n = arr.length;
    for (int i = 1; i < n; i++) {
        int j = i;
        while (j > 0 && arr[j-1] > arr[j]) {
            int t = arr[j-1]; arr[j-1] = arr[j]; arr[j] = t; j--;
        }
    }
}
```


Time: O(N²) worst/avg, **O(N) best case** (already sorted → inner loop never runs). Space: O(1).


### Merge Sort


Divide-and-conquer: split into halves, recursively sort, then merge two sorted halves.

- `mergeSort(arr, low, high)`: splits into `[low, mid]` and `[mid+1, high]`.
- `merge(arr, low, mid, high)`: merges the two sorted halves using a temp array, two pointers `i, j` walking each half and picking the smaller front each time, then flushing any remainder.

Time: **O(n log n)** all cases (merge is O(n), depth is O(log n)). Space: **O(n)** for the temp arrays.


### Quick Sort


Divide-and-conquer, in-place (no extra array, but O(n) auxiliary recursion stack in the worst case).

1. Choose a pivot (first / last / median / random element).
2. `partition()`: shift smaller elements left of pivot, larger right — returns the pivot's final index.
3. Recurse on `[low, pivotIndex-1]` and `[pivotIndex+1, high]`.

```java
public static void quickSort(int[] arr, int left, int right) {
    if (left < right) {
        int pivotIndex = partition(arr, left, right);
        quickSort(arr, left, pivotIndex - 1);
        quickSort(arr, pivotIndex + 1, right);
    }
}
private static int partition(int[] arr, int left, int right) {
    int pivot = arr[right]; // last element as pivot
    int i = left;
    for (int j = left; j < right; j++) {
        if (arr[j] < pivot) { swap(arr, i, j); i++; }
    }
    swap(arr, i, right);
    return i;
}
```


**Worst case** O(n²) — pivot is always the min/max (already sorted / reverse sorted input with a naive pivot choice). **Best/avg case** O(n log n) — pivot near the middle each time. Space: O(1) + O(n) auxiliary stack space.


### Complexity Summary


| Algorithm      | Worst      | Average    | Best       | Space             |
| -------------- | ---------- | ---------- | ---------- | ----------------- |
| Selection sort | O(n²)      | O(n²)      | O(n²)      | O(1)              |
| Bubble sort    | O(n²)      | O(n²)      | O(n)       | O(1)              |
| Insertion sort | O(n²)      | O(n²)      | O(n)       | O(1)              |
| Merge sort     | O(n log n) | O(n log n) | O(n log n) | O(n)              |
| Quick sort     | O(n²)      | O(n log n) | O(n log n) | O(1) + O(n) stack |


---


## Binary Search


Consider binary search whenever you need to search for an **index or element** in a collection — it isn't always a plain "find this value" search; sometimes you apply a custom condition to decide which half to search next.


**3 parts of a binary search**: (1) pre-processing — sort if unsorted, (2) the search loop/recursion halving the space each step, (3) post-processing — validate the remaining candidate(s).


### The 3 Templates


**Template 1** — classic, most basic form. Search condition determined purely by the element at `mid` (no need to look at neighbors). No post-processing needed.


```java
int binarySearch(int[] nums, int target){
    int left = 0, right = nums.length - 1;
    while (left <= right){
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1; // left > right
}
```


Initial: `left=0, right=length-1`. Terminate: `left > right`. Go left: `right=mid-1`. Go right: `left=mid+1`.


Use for: search for a value, search in rotated array, sqrt(x), ceil/floor.


**Template 2** — advanced; uses the right neighbor to decide direction; search space is always ≥ 2. **Needs post-processing** (assess the single remaining element).


```java
int binarySearch(int[] nums, int target){
    int left = 0, right = nums.length - 1;
    while (left < right){
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) left = mid + 1;
        else right = mid;
    }
    if (nums[left] == target) return left;
    return -1;
}
```


Initial: `left=0, right=length-1`. Terminate: `left == right`. Go left: `right=mid`. Go right: `left=mid+1`.


Use for: first bad version, find peak element, find min in rotated array.


**Template 3** — uses both neighbors; search space always ≥ 3. **Needs post-processing** (assess the 2 remaining elements).


```java
int binarySearch(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left + 1 < right){
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) left = mid;
        else right = mid;
    }
    if (nums[left] == target) return left;
    if (nums[right] == target) return right;
    return -1;
}
```


Initial: `left=0, right=length-1`. Terminate: `left+1 == right`. Go left: `right=mid`. Go right: `left=mid`.


Use for: k closest elements to x, find min in a sorted array.


### Simple binary search (is element present)


```java
int binarySearch(int[] arr, int key){
    int l = 0, h = arr.length - 1;
    while (l <= h) {
        int mid = l + (h - l + 1) / 2;
        if (arr[mid] == key) return mid;
        if (arr[mid] < key) l = mid + 1; else h = mid - 1;
    }
    return -1;
}
```


### Variants

- **First occurrence of key**: on match, record `res = mid` and keep searching left (`h = mid - 1`).
- **Last occurrence of key**: on match, record `res = mid` and keep searching right (`l = mid + 1`).
- **Least element greater than key** ("upper bound" by value): on `arr[mid] > key`, record `res = mid` and search left (`h = mid-1`); else `l = mid+1`.
- **Greatest element less than key**: on `arr[mid] < key`, record `res = mid` and search right (`l = mid+1`); else `h = mid-1`.
- **Binary search closest** (minimize `|value - target|`): track a running `closest`, update whenever the current `mid` beats it, then narrow normally by comparison to target.

Complexity: Best O(1), Average/Worst O(log N). Auxiliary space O(1) iterative, O(log N) if recursive (call stack).


### Upper Bound / Lower Bound / Floor / Ceil

- **Upper Bound**: smallest index `i` where `arr[i] > target` (excludes target itself).
- **Ceiling**: smallest index `i` where `arr[i] >= target` (includes target).
- **Lower Bound**: smallest index `i` where `arr[i] >= target` (same idea as ceiling).
- **Floor**: largest index `i` where `arr[i] <= target`.

For sorted `{1,2,3,4,5,6,7,8}`: target=4 → Upper Bound=5, Ceiling=4, Lower Bound=4, Floor=4. target=0 → Upper Bound/Ceiling/Lower Bound=1 (index of 1), Floor=-1 (nothing ≤ 0). target=9 → Upper/Ceiling/Lower=-1 (nothing greater), Floor=8 (last element).


```java
// Upper bound: first index with arr[i] > target
int low = 0, high = arr.length;
while (low < high) {
    int mid = low + (high - low) / 2;
    if (arr[mid] > target) high = mid; else low = mid + 1;
}
return low;

// Lower bound / Ceil: first index with arr[i] >= target
int low = 0, high = arr.length;
while (low < high) {
    int mid = low + (high - low) / 2;
    if (arr[mid] >= target) high = mid; else low = mid + 1;
}
return low; // for Ceil value: low < arr.length ? arr[low] : -1

// Floor: last index with arr[i] <= target
int low = 0, high = arr.length;
while (low < high) {
    int mid = low + (high - low) / 2;
    if (arr[mid] <= target) low = mid; else high = mid - 1;
}
return arr[low] <= target ? arr[low] : -1;
```


### Binary Search on Answers


**Key principle**: if a decision is monotonic (the answer to "does mid work?" flips from no→yes, or yes→no, exactly once as you scan the range), you can binary search over the _answer space_, not the array.


Examples: increasing `maxSumAllowed` makes it easier to split into k parts (monotonic) → binary-searchable; increasing distance `d` grows the count of valid pairs (monotonic) → binary-searchable.


**Steps**:

1. **Identify the search space** — the range of possible answers (e.g., Split Array: `max(nums) → sum(nums)`; Kth pair distance: `0 → max difference`).
2. **Write a** **`can(mid)`** **check** — "if I fix the answer to `mid`, can I satisfy the constraints?" Must return true/false and be monotonic.
3. **Apply the framework**:

```java
while (low < high) {
    int mid = low + (high - low) / 2;
    if (can(mid)) high = mid; else low = mid + 1;
}
return low;
```


Use `low < high` (not `<=`) — with `<=`, `low == high` can loop forever since `mid` keeps landing on `low`. `low < high` guarantees `mid < high` so the space always shrinks.


**Use when**: searching for the _minimum_ value satisfying a monotonic condition — e.g., minimize the largest sum when splitting into k parts, minimum ship capacity to deliver in D days, smallest distance between k pairs.


**Dry run** — smallest `x` where `x*x >= 30`: starting `low=0, high=30`, the loop narrows `(0,30)→(0,15)→(0,7)→(4,7)→(6,7)→(6,6)`, returning **6**. At the end `low == high` is the first value that passes `can()`.


---


## Tree Traversals


### Depth-First Search (3 variants)


**Inorder** (left, root, right — gives sorted order for a BST):


```java
void inOrder(Node node){
    if (node == null) return;
    inOrder(node.left);
    System.out.println(node.data);
    inOrder(node.right);
}
```


**Preorder** (root, left, right — useful for copying/serializing a tree):


```java
void preOrder(Node node){
    if (node == null) return;
    System.out.println(node.data);
    preOrder(node.left);
    preOrder(node.right);
}
```


**Postorder** (left, right, root — useful for deleting a tree / evaluating expression trees):


```java
void postOrder(Node node){
    if (node == null) return;
    postOrder(node.left);
    postOrder(node.right);
    System.out.println(node.data);
}
```


### Breadth-First Search / Level-Order Traversal


Queue-based: enqueue root, then repeatedly dequeue a node, visit it, enqueue its children.


```java
public void levelOrder(Node node) {
    if (node == null) return;
    Queue queue = new LinkedList();
    queue.add(node);
    while (!queue.isEmpty()) {
        Node n = (Node) queue.poll();
        System.out.print(n.value + " ");
        if (n.left != null) queue.add(n.left);
        if (n.right != null) queue.add(n.right);
    }
}
```


### Constructing a Unique Binary Tree

- Pre-order + post-order alone → **not unique** (multiple trees can match).
- Need **inorder + preorder** OR **inorder + postorder** to reconstruct a tree uniquely.

## 05 · Algorithms II — DP Theory, Bit Manipulation, Greedy, String Algorithms

## Dynamic Programming Theory


### Memoization (Top-Down) vs Tabulation (Bottom-Up)


**Why is recursion slower than iteration?**

1. **Function call overhead** — every call pauses the current function, pushes a new stack frame (args + locals), jumps to the new call; every return pops that frame and resumes the caller. This bookkeeping costs real CPU/memory.
2. **Stack memory usage** — recursion needs a new frame per call (O(depth) memory); iteration runs in one frame (fixed memory).
3. **CPU pipeline & caching** — loops are friendly to instruction pipelining; recursive jumps around memory hurt cache locality.

| Factor              | Recursion (Memoization)                     | Iteration (Tabulation) |
| ------------------- | ------------------------------------------- | ---------------------- |
| Readability         | ✅ more intuitive, matches problem structure | ❌ less intuitive       |
| Performance         | ❌ slower (call overhead)                    | ✅ faster               |
| Space               | ❌ O(n) stack depth                          | ✅ O(1) when optimized  |
| Stack overflow risk | ❌ high for large n                          | ✅ none                 |


**Rule of thumb**: use memoization when the recursive structure is natural and you're not optimizing for space (e.g., tree problems); use tabulation when you need performance/lower memory or n is too large for the recursion depth. For most DP problems, **bottom-up is more efficient**, but top-down is usually easier to _write first_, then convert.


**Where recursive calls live in memory**: the **call stack** (LIFO) stores each frame's local variables, return address, and parameters; dynamically allocated objects (`new`/`malloc`) live on the **heap** instead. Program memory overall: Stack (function calls/locals), Heap (dynamic objects), Code/Text (compiled instructions, read-only), Data (globals/statics).


### DP Problem Recognition


**DP on 1D** — recognize when the problem asks for the Nth term of a sequence that breaks into smaller overlapping subproblems (Fibonacci, Climbing Stairs, Tribonacci).


_(The original notes also listed Palindrome DP, Longest Common Subsequence, Unbounded Knapsack, and 0/1 Knapsack as headers to fill in — the actual worked templates and code for these live in the [[07 · Topic Playbook]] page, which has the fuller DP pattern write-up with identification templates.)_


---


## Bit Manipulation


**Negative numbers**: stored via **2's complement**; the leftmost bit is the sign bit (0 = positive, 1 = negative). E.g. the 31st bit of a 32-bit int stores the sign, so the largest positive `int` is **2³¹ − 1**.


**Bitwise operators**:

- **AND** — result bit is 1 only if _all_ input bits are 1.
- **OR** — result bit is 1 if _any_ input bit is 1.
- **NOT** — flips every bit; if the sign bit becomes negative, the value is stored as its 2's complement.
- **XOR** — 1 if an _odd_ number of input bits are 1, 0 if _even_.

**Shifts**:

- **Right shift** (`x >> k`) ≡ `x / 2^k` (floor/lower-bound division for odd numbers).
- **Left shift** (`x << k`) ≡ `x * 2^k`.

---


## Greedy Algorithms


Makes the **locally optimal choice** at each step, hoping (and, when correct, proving) it yields a globally optimal solution — no backtracking.


**Key properties needed**:

1. **Greedy choice property** — a global optimum can be reached by choosing local optima at each step.
2. **Optimal substructure** — an optimal solution to the problem is built from optimal solutions to its subproblems.

**Classic examples**: Activity Selection (max non-overlapping activities), Huffman Coding (optimal prefix codes), Dijkstra's (shortest path, non-negative weights), Prim's / Kruskal's (MST).


### ⭐ Greedy vs DP — how to decide


**Use Greedy when:**

- ✅ A locally optimal choice at each step provably leads to the global optimum.
- ✅ The problem has optimal substructure but doesn't require storing previous states.
- ✅ Decisions are independent of each other (e.g., Fractional Knapsack).
- Signs: "sort and pick the best option" works; "minimize steps" / "maximize profit" framing.
- Examples: **Jump Game II** (always jump to the farthest reachable index → minimal jumps), **Activity Selection** (pick the earliest-ending activity), **Dijkstra's** (always expand the shortest known path).

**Use DP when:**

- ✅ The problem has overlapping subproblems (the same value gets computed repeatedly).
- ✅ Optimal substructure exists, but a greedy choice **can** lead to a suboptimal result.
- ✅ The solution depends on previously computed results that must be stored/reused.
- Examples: **0/1 Knapsack** (can't take partial items, unlike Fractional Knapsack — must explore possibilities), **Longest Increasing Subsequence** (greedily picking the next-greater element can miss the true best), **Edit Distance** (each choice depends on prior computed states — memoization required).

**The one question to ask**: _"Can I make a single choice at each step that's guaranteed to lead to the best result?"_ Yes → try Greedy. No (multiple choices affect future steps) → use DP.


---


## String Algorithms


### KMP (Knuth-Morris-Pratt)


Finds a pattern within text in **O(N+M)** instead of brute-force **O(N×M)**, by precomputing an **LPS array** (Longest Prefix that is also a Suffix) for the pattern, so mismatches let you skip ahead instead of restarting from scratch.


`LPS[i]` = length of the longest _proper_ prefix of the pattern (up to index i) that's also a proper suffix. Example, pattern `"ABABCABAB"`:


| i    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| ---- | - | - | - | - | - | - | - | - | - |
| char | A | B | A | B | C | A | B | A | B |
| LPS  | 0 | 0 | 1 | 2 | 0 | 1 | 2 | 3 | 4 |


On a mismatch at pattern index `j`, instead of resetting `j=0`, jump to `LPS[j-1]` — reusing the fact that we already know that prefix matched.


```java
static int[] computeLPS(String pattern) {
    int m = pattern.length();
    int[] lps = new int[m];
    int len = 0, i = 1;
    while (i < m) {
        if (pattern.charAt(i) == pattern.charAt(len)) { lps[i++] = ++len; }
        else if (len != 0) { len = lps[len - 1]; }
        else { lps[i++] = 0; }
    }
    return lps;
}

static void KMPSearch(String text, String pattern) {
    int n = text.length(), m = pattern.length();
    int[] lps = computeLPS(pattern);
    int i = 0, j = 0;
    while (i < n) {
        if (text.charAt(i) == pattern.charAt(j)) { i++; j++; }
        if (j == m) { System.out.println("Found at " + (i - j)); j = lps[j - 1]; }
        else if (i < n && text.charAt(i) != pattern.charAt(j)) {
            if (j != 0) j = lps[j - 1]; else i++;
        }
    }
}
```


### Z-Algorithm


Computes a **Z-array** in O(N): `Z[i]` = length of the longest substring starting at `i` that matches a prefix of the string. `Z[0]` is conventionally ignored (it's just N). Example: `s="abcxabcd"` → `Z = [8,0,0,0,3,0,0,0]` (`Z[4]=3` because `"abc"` starting at index 4 matches the prefix `"abc"`).


Useful for pattern search (`pattern + "$" + text`, look for `Z[i] == pattern.length()`) and detecting periodic/repeated structure, in O(N).


Construction keeps a window `[L, R]` of the rightmost known prefix-match:

- If `i > R`: brute-force expand from `i`.
- If `i ≤ R`: reuse `Z[i-L]` when it doesn't overrun the window, else brute-force-extend past `R`.

```java
public void search(String text, String pattern){
    String concat = pattern + "$" + text;
    int[] z = calculateZ(concat);
    for (int i = 0; i < z.length; i++)
        if (z[i] == pattern.length())
            System.out.println("Pattern found at index " + (i - pattern.length() - 1));
}

public int[] calculateZ(String text){
    int left = 0, right = 0, n = text.length();
    int[] z = new int[n];
    for (int k = 1; k < n; k++) {
        if (k > right) {
            int matchCount = 0;
            while (k + matchCount < n && text.charAt(matchCount) == text.charAt(k + matchCount)) matchCount++;
            z[k] = matchCount;
            if (matchCount > 0) { left = k; right = k + matchCount - 1; }
        } else {
            int p = k - left, rightPartLength = right - k + 1;
            if (z[p] < rightPartLength) { z[k] = z[p]; }
            else {
                int i = right + 1;
                while (i < n && text.charAt(i) == text.charAt(i - k)) i++;
                z[k] = i - k;
                left = k; right = i - 1;
            }
        }
    }
    return z;
}
```


### Rabin-Karp


_(Listed as a topic in the original notes — rolling-hash based pattern search — but no detailed write-up was captured under it. Flagging as a gap; the general idea: hash the pattern and each window of text, compare hashes first and only do a full character check on a hash match, updating the rolling hash in O(1) per shift.)_


### Combinatorics, Probabilities & Other Math


_(Listed as a topic heading in the original notes with no content recorded underneath — flagged as a gap to fill in later.)_


## 06 · Algorithms III — Graph Algorithms (Traversal, SCC, Shortest Path, MST)

## Graph Traversal (DFS / BFS)


### DFS


Start at node `v`, mark visited, recurse into unvisited neighbors (backtrack when a branch is exhausted).


```java
void DFSRecursive(int node){
    visited[node] = true;
    for (int neighbor : adjList[node]) if (!visited[neighbor]) DFSRecursive(neighbor);
}
// Iterative, using an explicit stack:
void DFSIterative(int start){
    Stack<Integer> stack = new Stack<>();
    stack.push(start);
    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (!visited[node]) {
            visited[node] = true;
            for (int neighbor : adjList[node]) if (!visited[neighbor]) stack.push(neighbor);
        }
    }
}
```


Time O(V+E), Space O(V).


### BFS


Queue-based, level by level, using a visited array.


```java
public void bfs(int start){
    Queue<Integer> queue = new LinkedList<>();
    visited[start] = true;
    queue.add(start);
    while (!queue.isEmpty()) {
        int node = queue.poll();
        for (int neighbour : adjList[node]) {
            if (!visited[neighbour]) { visited[neighbour] = true; queue.add(neighbour); }
        }
    }
}
```


**BFS on a disconnected graph**: loop over every vertex, call BFS on each unvisited one. Time O(V+E), Space O(V).


### Connected Components (classic DFS/BFS application)


**Count connected components**: run DFS/BFS from every unvisited vertex, incrementing a counter each time.


```java
public int countConnectedComponents(){
    int count = 0;
    for (int vertex : adjList.keySet()) {
        if (!visited.contains(vertex)) { count++; dfs(vertex); }
    }
    return count;
}
```


**Largest component size**: same traversal pattern, but accumulate a size counter per component and track the max. Time O(E), Space O(V).


### Grid-based Graphs


Each cell is a node `(row, col)`. Neighbors: Up `(row-1,col)`, Right `(row,col+1)`, Down `(row+1,col)`, Left `(row,col-1)`. Boundary check: `0 <= row < grid.length && 0 <= col < grid[0].length`.


---


## Strongly Connected Components, Bridges & Articulation Points


### Strongly Connected Components (SCC)


A directed-graph component where **every node can reach every other node in the same component** (only applies to directed graphs). A single vertex with no cycle partner is trivially its own SCC.


### Bridges (cut-edges)


An edge that, if removed, disconnects the graph (increases the number of connected components).


### Articulation Points (cut vertices)


A node that, if removed, breaks the graph into 2+ disconnected parts.


### Tarjan's Algorithm — finding Bridges


DFS while tracking, per node: **discovery time** `timeStamp[]` (when first visited) and **low-link value** `lowStamp[]` (earliest-discovered node reachable via back edges).


**Bridge rule** ⭐: edge `(u,v)` (where `v` is a DFS child of `u`) is a bridge **iff** **`lowStamp[v] > timeStamp[u]`** — meaning `v`'s subtree has no back-edge to `u` or an ancestor of `u`.


```java
void dfs(int node, int parent){
    visited.add(node);
    timeStamp.put(node, timer); lowStamp.put(node, timer); timer++;
    for (int neighbour : adjList.get(node)) {
        if (neighbour == parent) continue;
        if (!visited.contains(neighbour)) {
            dfs(neighbour, node);
            lowStamp.put(node, Math.min(lowStamp.get(node), lowStamp.get(neighbour)));
            if (lowStamp.get(neighbour) > timeStamp.get(node)) bridge.add(Arrays.asList(node, neighbour));
        } else {
            lowStamp.put(node, Math.min(lowStamp.get(node), timeStamp.get(neighbour))); // back edge
        }
    }
}
```


Time O(V+E), Space O(V+E).


### Tarjan's Algorithm — finding Articulation Points


Same `timeStamp`/`lowStamp` DFS, with two rules:

1. **Non-root**: node `u` is an articulation point if some DFS-child `v` has `lowStamp[v] >= timeStamp[u]` (the child's subtree cannot reach back above `u`, so removing `u` disconnects it).
2. **Root special case**: the DFS root is an articulation point iff it has **2 or more DFS-tree children**.

```java
void dfs(int node, int parent) {
    visited.add(node);
    timeStamp.put(node, timer); lowStamp.put(node, timer); timer++;
    int children = 0;
    for (int neighbor : adjList.get(node)) {
        if (neighbor == parent) continue;
        if (!visited.contains(neighbor)) {
            dfs(neighbor, node);
            lowStamp.put(node, Math.min(lowStamp.get(node), lowStamp.get(neighbor)));
            if (parent != -1 && lowStamp.get(neighbor) >= timeStamp.get(node)) articulationPoints.add(node);
            children++;
        } else {
            lowStamp.put(node, Math.min(lowStamp.get(node), timeStamp.get(neighbor)));
        }
    }
    if (parent == -1 && children > 1) articulationPoints.add(node);
}
```


Time & Space: O(V+E).


### Kosaraju's Algorithm — finding SCCs


**Insight**: reversing the edges that connect different SCCs makes those SCCs mutually unreachable from each other, while an SCC's internal reachability is unaffected by reversal (since every node can already reach every other node inside it either way). So: reverse _all_ edges, then do DFS in the right starting order and each DFS call will explore exactly one SCC.


**Steps**:

1. Run DFS from any unvisited node; push nodes onto a stack **on backtrack** (i.e., by finishing time). This orders nodes so the "last-finishing" SCC ends up on top.
2. Reverse every edge in the graph.
3. Pop the stack; for each unvisited node, run DFS on the reversed graph — each DFS call visits exactly one SCC. Count of DFS calls = number of SCCs.

```java
void dfsStack(int v){ // pass 1: order by finish time
    visited.add(v);
    for (int dest : adjList.get(v)) if (!visited.contains(dest)) dfsStack(dest);
    stack.push(v);
}
void reverseEdges(){ /* build revAdjList by flipping every src->dest to dest->src */ }
int kosaraju(){
    int noOfComp = 0;
    for (int n : adjList.keySet()) if (!visited.contains(n)) dfsStack(n);
    reverseEdges(); visited.clear();
    while (!stack.isEmpty()) {
        int v = stack.pop();
        if (!visited.contains(v)) { noOfComp++; dfs(v); } // dfs on the reversed graph
    }
    return noOfComp;
}
```


Time O(V+E), Space O(V+E).


---


## Topological Sort


An ordering of a **DAG** (no cycles) such that for every edge A→B, A comes before B. Not unique. Only valid on acyclic directed graphs.


**DFS-based** (only valid if no cycle exists): run DFS, push each node onto a stack on backtrack/finish; popping the stack gives the topological order.


```java
void dfs(int vertex, Stack<Integer> stack){
    visited.add(vertex);
    for (int neighbour : adjList.get(vertex)) if (!visited.contains(neighbour)) dfs(neighbour, stack);
    stack.push(vertex);
}
```


**Kahn's Algorithm** (BFS-based, using in-degrees):

1. Compute in-degree for every node.
2. Push all 0-in-degree nodes onto a queue.
3. Pop a node, add to result, decrement in-degree of its neighbors; push any neighbor whose in-degree hits 0.
4. Repeat until the queue is empty.

```java
void topologicalSortBFS(){
    Queue<Integer> queue = new LinkedList<>();
    Map<Integer, Integer> indegree = new HashMap<>();
    for (int vertex : adjList.keySet()) indegree.put(vertex, 0);
    for (int vertex : adjList.keySet())
        for (int neighbour : adjList.get(vertex)) indegree.put(neighbour, indegree.get(neighbour) + 1);
    for (int vertex : indegree.keySet()) if (indegree.get(vertex) == 0) queue.add(vertex);
    List<Integer> sortedList = new ArrayList<>();
    while (!queue.isEmpty()) {
        int vertex = queue.poll();
        sortedList.add(vertex);
        for (int neighbour : adjList.get(vertex)) {
            indegree.put(neighbour, indegree.get(neighbour) - 1);
            if (indegree.get(neighbour) == 0) queue.add(neighbour);
        }
    }
}
```


**Cycle detection**:

- Modified DFS: maintain two visited sets, one path-specific (recursion stack). Revisiting a node already in the _current path_ means there's a cycle.
- DFS-based topo sort: fails / infinite recursion on a cyclic graph (or detect explicitly with the path-visited trick above).
- Kahn's: fails to process all nodes — if the final `sortedList.size() != V`, there's a cycle.

---


## Shortest Path Algorithms


### Unweighted Graph → BFS


**Why BFS over DFS?** DFS can go down a long wrong path first and give a non-shortest path to the destination; BFS explores level-by-level so the first time you reach the destination, it's via the shortest number of edges.


```java
public int shortestPath(int src, int dest){
    Queue<Integer> queue = new LinkedList<>();
    Map<Integer, Integer> distance = new HashMap<>();
    visited.add(src); queue.add(src); distance.put(src, 0);
    while (!queue.isEmpty()) {
        int curr = queue.poll();
        if (curr == dest) return distance.get(curr);
        for (int neighbour : adjList.get(curr)) {
            if (!visited.contains(neighbour)) {
                visited.add(neighbour);
                distance.put(neighbour, distance.get(curr) + 1);
                queue.add(neighbour);
            }
        }
    }
    return -1;
}
```


### Weighted, Acyclic (DAG) → Topological Sort


Single-source shortest path on a DAG works regardless of positive/negative edge weights (unlike Dijkstra). Topologically sort, then relax edges in that order.


```java
public void shortestPathToAllNodes(int src){
    // 1. topo sort into a stack
    // 2. init distance[all] = INF, distance[src] = 0
    while (!stack.isEmpty()) {
        int curr = stack.pop();
        if (distance.get(curr) != Integer.MAX_VALUE) {
            for (Edge edge : adjList.get(curr)) {
                if (distance.get(curr) + edge.weight < distance.get(edge.dest))
                    distance.put(edge.dest, distance.get(curr) + edge.weight);
            }
        }
    }
}
```


**Longest path on a DAG**: NP-hard in general, but on a DAG it's solvable in O(V+E) by negating all edge weights, running the shortest-path-on-DAG algorithm, and negating the result.


### Weighted, Cyclic, Non-negative → Dijkstra's


Single-source shortest path for non-negative weighted graphs (directed or undirected).


**Lazy Dijkstra** (allows duplicate/stale entries in the PQ — "lazy" because it doesn't bother removing outdated entries, it just re-adds a better one and skips stale pops later):


```java
public void singleSourceShortestPath(Graph graph, int src) {
    for (int vertex : graph.adjList.keySet()) distance.put(vertex, Integer.MAX_VALUE);
    distance.put(src, 0);
    pq.add(new Edge(src, 0));
    while (!pq.isEmpty()) {
        Edge curr = pq.poll();
        if (visited.contains(curr.vertex)) continue; // (optimization: skip stale entries)
        visited.add(curr.vertex);
        for (Edge neighbour : graph.adjList.get(curr.vertex)) {
            if (!visited.contains(neighbour.vertex)) {
                int newDistance = distance.get(curr.vertex) + neighbour.weight;
                if (newDistance < distance.get(neighbour.vertex)) {
                    distance.put(neighbour.vertex, newDistance);
                    pq.add(new Edge(neighbour.vertex, newDistance));
                }
            }
        }
    }
}
```


**Reconstructing the actual path**: track a `parent`/`prev` map whenever you relax an edge; at the end, walk backward from destination via `prev` until `-1`, then reverse the list.


**Early exit**: if a specific destination is given, you can stop as soon as it's popped/finalized from the PQ — Dijkstra's greedy nature guarantees no cheaper path will be found later.


**Eager Dijkstra** and **D-ary heap optimization**: noted as topics in the original notes (decrease-key style PQ updates instead of re-inserting; a d-ary heap trades slower removals for faster decrease-key/insert) — flagged as a gap, no worked example was captured.


### Weighted, Negative Edges → Bellman-Ford


Single-source shortest path, handles **negative edge weights** and can **detect negative cycles** — something Dijkstra's greedy approach can't do correctly. Time **O(V·E)**, worse than Dijkstra's O((E+V) log V), so only use it when negative weights are possible.


**Algorithm**: relax **all edges, V-1 times**:


```javascript
for all V: distance(V) = infinity
distance(src) = 0
repeat V-1 times:
    for all edges E: relax(E)   // if dist[E.from] + E.weight < dist[E.to]: update it
```


**Why V-1 iterations?** The longest possible simple shortest-path uses at most V-1 edges, so V-1 rounds of relaxation guarantee convergence if no negative cycle exists.


**Detecting a negative cycle**: run one more (Vth) relaxation pass — if any distance can still be improved, a negative cycle exists. Trace back via the `prev` map to identify which nodes are part of it.


### All-Pairs Shortest Path → Floyd-Warshall


Computes shortest paths between **every pair** of nodes. Time **O(V³)** — only practical for a few hundred nodes at most. Represent the graph as an **adjacency matrix**. Can also detect negative cycles (a negative value on the diagonal `dist[i][i]` after running it).


```java
for (int k = 0; k < V; k++)
    for (int i = 0; i < V; i++)
        for (int j = 0; j < V; j++)
            dist[i][j] = Math.min(dist[i][j], dist[i][k] + dist[k][j]);
```


### A*


_(Listed as a topic — heuristic-guided shortest path, generalization of Dijkstra using an admissible heuristic to prioritize search — but no worked example was captured in the original notes. Flagged as a gap.)_


---


## Minimum Spanning Tree (MST)


A subset of a connected, weighted, **undirected** graph's edges that connects all vertices with no cycles and minimum total weight. (A graph can have more than one valid MST if weights tie.) Directed graphs need a different algorithm (not covered here). Two classic approaches: **Prim's** and **Kruskal's**.


### Prim's Algorithm


Grows the MST from a start node using a priority queue of candidate edges (like a graph-flavored Dijkstra).


```java
public void prim(Graph graph, int start){
    pq.add(new Pair(-1, start, 0));
    while (!pq.isEmpty()) {
        Pair curr = pq.poll();
        if (visited.contains(curr.dest)) continue;
        visited.add(curr.dest);
        mstCost += curr.weight;
        if (curr.src != -1) mstEdges.add(curr);
        for (Edge neighbour : graph.adjList.get(curr.dest))
            if (!visited.contains(neighbour.vertex)) pq.add(new Pair(curr.dest, neighbour.vertex, neighbour.weight));
    }
}
```


Time: **O(E log E)** (each of up to E edges gets inserted into the PQ once). Space: O(E) for the PQ + O(V) for visited (+O(V-1) if storing the MST edges).


### Kruskal's Algorithm


Uses **Disjoint Set (Union-Find)**. Sort all edges by weight; greedily add each edge if its endpoints are in different components (i.e., adding it won't create a cycle).


```java
public void kruskal(int V, List<Edge> edges){
    Collections.sort(edges);
    DisjointSet ds = new DisjointSet(V);
    for (Edge edge : edges) {
        if (ds.findParent(edge.u) != ds.findParent(edge.v)) {
            ds.union(edge.u, edge.v);
            mstCost += edge.w;
            mstEdges.add(edge);
        }
    }
}
```


Time: sorting O(E log E) + E union-find ops at ~O(α(N)) each → effectively O(E log E) overall (plus O(N+E) to build the edge list if starting from an adjacency list).


### Related (flagged, not detailed in original notes)

- **Travelling Salesman Problem**: shortest route visiting all cities exactly once and returning to start. Algorithms noted: Held-Karp, Branch and Bound.
- **Network Flow / Max Flow**: noted algorithm — Ford-Fulkerson. No worked example captured.

## 07 · Problem-Solving Patterns (Reference)

## Sliding Window


For contiguous subarrays/substrings — either fixed-length or finding the min/max length satisfying some condition. Reduces brute-force recalculation by sliding a window instead of recomputing.

> ⚠️ Sliding window relies on "expanding right increases the running value, shrinking left decreases it." It works cleanly on **all-positive** arrays; with a mix of positive and negative numbers this monotonicity breaks and sliding window no longer applies directly.

### Fixed Window Size


Window size `k` is constant — slide by adding one new element and removing one old element each step.


**Template**: init window state (sum/count/freq) → init result tracker → compute the first window → for each subsequent position, update window (+new, -old) and check/update result.


```java
int windowSum = 0, maxSum = Integer.MIN_VALUE;
for (int i = 0; i < k; i++) windowSum += arr[i];
maxSum = Math.max(windowSum, maxSum);
for (int i = k; i < n; i++) {
    windowSum += arr[i];
    windowSum -= arr[i - k];
    maxSum = Math.max(maxSum, windowSum);
}
```


### Variable Window Size


Window expands/shrinks dynamically based on a condition — used for longest/shortest subarray or substring problems.


**Template**: `left = 0`, init window state, init result → for each `right`, update window → while condition holds, update result and shrink from the left.


```java
int left = 0, minLength = Integer.MAX_VALUE, windowSum = 0;
for (int right = 0; right < N; right++) {
    windowSum += arr[right];
    while (windowSum >= target) {
        minLength = Math.min(minLength, right - left + 1);
        windowSum -= arr[left];
        left++;
    }
}
```


---


## Two Pointers


Efficient technique for sorted arrays, linked lists, or pair-searching — turns O(N²) brute force into O(N) or O(log N).


### Opposite Direction (Left-Right)


One pointer at each end, moving inward based on a condition. Common for sorted-array pair-sum problems.


```java
public int[] twoSum(int target, int[] arr) {
    int left = 0, right = arr.length - 1;
    while (left < right) {
        int currSum = arr[left] + arr[right];
        if (currSum == target) return new int[]{left, right};
        else if (currSum < target) left++;
        else right--;
    }
    return new int[]{-1, -1};
}
```


O(N) time. Use case: sorted array pair/sum problems.


### Same Direction (Fast-Slow)


One pointer moves faster than the other — used for cycle detection and finding middle nodes in linked lists.


```java
public boolean containsCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```


O(N) time. Use case: Floyd's cycle detection, circular arrays.


### Bidirectional (Palindrome-style)


Both pointers start at opposite ends, moving toward the center.


```java
public boolean isPalindrome(String s) {
    int left = 0, right = s.length() - 1;
    while (left <= right) {
        if (s.charAt(left) != s.charAt(right)) return false;
        left++; right--;
    }
    return true;
}
```


O(N) time. Use case: palindromes, reversing in place.


---


## In-Place Reversal of a Linked List


Reverse/modify a linked list without extra memory, by flipping `next` pointers directly.


**Use cases**: reverse the entire list; reverse a sublist between positions m and n; reverse in K-groups; check if a list is a palindrome (reverse the second half and compare).


**Core idea**: maintain 3 pointers — `prev` (starts null), `current` (node being processed), `next` (saved before overwriting `current.next`, so the rest of the list isn't lost).


```java
public static ListNode reverse(ListNode head) {
    ListNode prev = null, current = head;
    while (current != null) {
        ListNode next = current.next;
        current.next = prev;
        prev = current;
        current = next;
    }
    return prev; // new head
}
```


O(N) time, O(1) space.


---


## Merge Intervals


For overlapping-interval problems.


| Problem type                                | Example                             |
| ------------------------------------------- | ----------------------------------- |
| Merging overlapping intervals               | Merging meeting times               |
| Finding gaps between intervals              | Finding free time slots             |
| Checking if an interval is free/busy        | Finding schedule conflicts          |
| Finding intersections of two interval lists | Common free time between two people |


**Merging overlapping intervals**: sort by start time → walk through, merging `current` with `next` whenever `current.end >= next.start` (update `current.end = max(current.end, next.end)`), else push `current` and advance.


```java
public List<Interval> mergeInterval(List<Interval> intervals) {
    List<Interval> merged = new ArrayList<>();
    intervals.sort(Comparator.comparingInt(a -> a.start));
    Interval curr = intervals.get(0);
    for (int i = 1; i < intervals.size(); i++) {
        Interval next = intervals.get(i);
        if (curr.end >= next.start) curr = new Interval(curr.start, Math.max(curr.end, next.end));
        else { merged.add(curr); curr = next; }
    }
    merged.add(curr);
    return merged;
}
```


O(N log N) time (sort), O(N) space.


**Find free time (gaps) between intervals**: sort/merge busy intervals, then for each consecutive pair, if `curr.end + 1 < next.start - 1` there's a gap — record it.


**Find intersections of two sorted interval lists**: two pointers `i, j`. Overlap = `[max(A.start,B.start), min(A.end,B.end)]` when `start <= end`. Advance whichever interval ends first.


```java
public static List<Interval> findIntersections(List<Interval> a, List<Interval> b) {
    List<Interval> result = new ArrayList<>();
    int i = 0, j = 0;
    while (i < a.size() && j < b.size()) {
        int start = Math.max(a.get(i).start, b.get(j).start);
        int end = Math.min(a.get(i).end, b.get(j).end);
        if (start <= end) result.add(new Interval(start, end));
        if (a.get(i).end < b.get(j).end) i++; else j++;
    }
    return result;
}
```


O(N) time/space.


---


## Cyclic Sort


For numbers in a **fixed range** (e.g., 1..N) — place each number at its correct index in O(N) without extra space.


**How**: if `nums[i] != i+1`, swap it into its correct index (`nums[i] <-> nums[nums[i]-1]`); repeat until every position holds its correct value.


```java
public void cyclicSort(int[] arr) { // assumes values 1..N
    int N = arr.length;
    for (int i = 0; i < N; i++) {
        if (arr[i] != i + 1) {
            int correctIndex = arr[i] - 1;
            int temp = arr[correctIndex];
            arr[correctIndex] = arr[i];
            arr[i] = temp;
        }
    }
}
```


O(N) time, O(1) space. **Common problems**: find the missing number (0..N), find all missing numbers (1..N with some missing), find the duplicate (N+1 numbers in range 1..N), find the smallest missing positive number.


---


## Two Heaps


For problems needing a dynamic median, balancing two sets, or Kth smallest/largest efficiently.


**Identify by**: "find a running/dynamic median", "balance two partitions", "K closest elements".


**Median of a data stream**: a max-heap for the lower half, min-heap for the upper half, kept balanced within 1 of each other.


```java
minHeap = new PriorityQueue<>();
maxHeap = new PriorityQueue<>(Collections.reverseOrder());

void addNumber(int num) {
    if (maxHeap.isEmpty() || num <= maxHeap.peek()) maxHeap.offer(num);
    else minHeap.offer(num);
    if (maxHeap.size() > minHeap.size() + 1) minHeap.offer(maxHeap.poll());
    else if (minHeap.size() > maxHeap.size()) maxHeap.offer(minHeap.poll());
}

double getMedian() {
    if (maxHeap.isEmpty() && minHeap.isEmpty()) return 0;
    if (maxHeap.size() == minHeap.size()) return (maxHeap.peek() + minHeap.peek()) / 2.0;
    return maxHeap.peek();
}
```


O(log N) per insertion, O(N) space. Other use cases: sliding window median, K closest elements to a number.


---


## Subsets (Power Set Pattern)


Backtracking/BFS to generate all subsets/combinations of a set — "tree of choices": at each element, include it or exclude it, recursively.


```java
public List<List<Integer>> subset(int[] arr) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(0, arr, new ArrayList<>(), result);
    return result;
}
public void backtrack(int index, int[] arr, List<Integer> currentSubset, List<List<Integer>> result) {
    result.add(new ArrayList<>(currentSubset));
    for (int i = index; i < arr.length; i++) {
        currentSubset.add(arr[i]);
        backtrack(i + 1, arr, currentSubset, result);
        currentSubset.remove(currentSubset.size() - 1);
    }
}
```


Time O(N × 2^N), Space O(N). **Common problems**: unique subsets with duplicates in the input, all subsets of size k, string permutations by changing case.


---


## Top K Elements


Any "top/smallest/most-frequent K" problem — best solved with a **Heap**.


**Kth Largest Element in an Array**: maintain a min-heap of size K; the root is always the Kth largest.


```java
public static int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>(k);
    for (int num : nums) {
        minHeap.add(num);
        if (minHeap.size() > k) minHeap.poll();
    }
    return minHeap.peek();
}
```


**Other common problems**: Top K Frequent Elements (HashMap for counts + min-heap of size K), K Closest Points to Origin, Kth Smallest Element in a Sorted Matrix, Kth Largest Element in a Stream.


---


## K-Way Merge


Merge K sorted sequences efficiently using a min-heap.


**Idea**: seed the heap with the first element of each list; repeatedly pop the smallest, append it to the result, and push that element's successor from the same list.


```java
public static ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> minHeap = new PriorityQueue<>((a, b) -> a.val - b.val);
    for (ListNode node : lists) if (node != null) minHeap.add(node);
    ListNode dummy = new ListNode(-1), tail = dummy;
    while (!minHeap.isEmpty()) {
        ListNode smallest = minHeap.poll();
        tail.next = smallest;
        tail = smallest;
        if (smallest.next != null) minHeap.add(smallest.next);
    }
    return dummy.next;
}
```


O(N log K), N = total elements, K = number of lists. **Other problems**: merge K sorted arrays, Kth smallest in a sorted matrix, sort a K-sorted (nearly sorted) array, smallest range covering elements from K lists.


---


## Monotonic Stacks


Maintains elements in increasing or decreasing order to solve Next/Previous Greater/Smaller Element problems in O(n).

- **Increasing stack** → Next Greater Element (pop smaller elements as you go); Previous Smaller Element (pop larger elements).
- **Decreasing stack** → Next Smaller Element (pop larger elements); Previous Greater Element (pop smaller elements).

```java
class MonotonicStack {
    // Next greatest element (values), scanning right-to-left
    public int[] nextGreatestElements(int[] arr){
        int N = arr.length; Stack<Integer> stack = new Stack<>(); int[] nge = new int[N];
        for (int i = N-1; i >= 0; i--) {
            while (!stack.isEmpty() && stack.peek() <= arr[i]) stack.pop();
            nge[i] = stack.isEmpty() ? -1 : stack.peek();
            stack.push(arr[i]);
        }
        return nge;
    }
    // Next greatest element, storing indices instead of values
    public int[] nextGreatestElementsIdx(int[] arr){
        int N = arr.length; Stack<Integer> stack = new Stack<>(); int[] nge = new int[N];
        for (int i = N-1; i >= 0; i--) {
            while (!stack.isEmpty() && arr[stack.peek()] <= arr[i]) stack.pop();
            nge[i] = stack.isEmpty() ? N : arr[stack.peek()];
            stack.push(i);
        }
        return nge;
    }
    // Next smallest element (indices), scanning left-to-right
    public int[] nextSmallestElement(int[] arr){
        int n = arr.length; int[] nse = new int[n]; Stack<Integer> stack = new Stack<>();
        for (int i = n-1; i >= 0; i--) {
            while (!stack.isEmpty() && stack.peek() >= arr[i]) stack.pop();
            nse[i] = stack.isEmpty() ? -1 : stack.peek();
            stack.push(arr[i]);
        }
        return nse;
    }
    // Previous smallest element (indices), scanning left-to-right
    public int[] previousSmallestElement(int[] arr){
        int N = arr.length; Stack<Integer> stack = new Stack<>(); int[] pse = new int[N];
        for (int i = 0; i < N; i++) {
            while (!stack.isEmpty() && stack.peek() > arr[i]) stack.pop();
            pse[i] = stack.isEmpty() ? -1 : stack.peek();
            stack.push(arr[i]);
        }
        return pse;
    }
    // Previous greatest element — same shape, comparison flipped (see topic playbook for the corrected index-based version)
}
```


_(For the fully corrected, index-based monotonic stack implementations — including previous-greatest-element — see [[07 · Topic Playbook]], which has a cleaner rewritten version of this same code.)_


## 08 · Topic Playbook — Patterns, Templates & Code
> This page captures the practical, pattern-tagged material from the "Focused Google Prep" source page — theory blocks, code templates, and identification heuristics, organized by topic. Problem lists that were embedded as filtered database views in the original are consolidated in [[08 · Full Problem Bank]].

## Array / Pointer-Based Problems


Consider this family when: the array is sorted (though not always required); you're searching for a pair/triplet meeting a condition; you need in-place modification with minimal extra space; or the problem involves merging, partitioning, or skipping duplicates efficiently.


### Prefix Sum + HashMap Pattern


A **prefix sum array**: `prefix[i] = arr[0] + arr[1] + ... + arr[i]`. Example: `[3,1,4,2,5] → [3,4,8,10,15]`.


**Count subarrays with sum = k**: HashMap of `{prefixSum: frequency}`. Base case `(0, 1)` — a prefix sum of 0 occurs once (handles subarrays starting at index 0). For each element, add to running prefix sum, check if `(prefixSum - k)` exists in the map (means a valid subarray ends here), then record the current `prefixSum`.


```java
public static int subarraySum(int[] nums, int k) {
    HashMap<Integer, Integer> prefixSumCount = new HashMap<>();
    prefixSumCount.put(0, 1);
    int prefixSum = 0, count = 0;
    for (int num : nums) {
        prefixSum += num;
        if (prefixSumCount.containsKey(prefixSum - k)) count += prefixSumCount.get(prefixSum - k);
        prefixSumCount.put(prefixSum, prefixSumCount.getOrDefault(prefixSum, 0) + 1);
    }
    return count;
}
```


**Longest subarray with sum = k**: HashMap stores the **first occurrence** of each prefix sum (base case `(0, -1)` — sum 0 occurs "at" index -1). For each index `i`, if `prefixSum - k` was seen before, a subarray of sum k exists between that index and `i` — update the max length. Store only first occurrences to maximize length.


### Merge-Sort-Based Counting Problems


Problems solvable with a modified merge sort (counting cross-pairs during the merge step):

- **Count Inversions**: pairs `(i,j)` with `i<j` and `A[i]>A[j]`.
- **Reverse Pairs** (LC 493): pairs with `A[i] > 2*A[j]`.
- **Count of Smaller Numbers After Self** (LC 315): for each element, count smaller elements to its right.
- **Count of Range Sum** (LC 327): count range sums within `[lower, upper]` using prefix sums + merge sort.
- **Number of Pairs Satisfying Inequality** (LC 2426): `nums[i]-nums[j] <= diff` with `i<j`.
- **Smallest Distance Pair** (LC 719): binary search on the outer answer, modified merge sort idea to speed up counting.
- **Count Number of Teams** (LC 1395): per-person count of increasing/decreasing triplets — solvable with BITs or modified merge strategies.

### Two-Pointer / Traversal Decision Table


| Problem type                                | Approach                              |
| ------------------------------------------- | ------------------------------------- |
| Pair sum in sorted array                    | Opposite ends (left & right pointers) |
| Removing duplicates / merging sorted arrays | Same direction (fast & slow)          |
| Longest/smallest subarrays                  | Expanding window                      |
| Triplets / quadruplets                      | Sort + two-pointer                    |
| Palindrome checking                         | Opposite ends                         |


### Edge Cases to Always Check


Empty/single-element array · all elements identical (can cause infinite loops if duplicates mishandled) · negative numbers/zeros (sum problems often assume positive) · already sorted / reverse sorted (may skip needed sort or need reversed logic) · no solution exists (check default-value handling) · very large/small values (overflow risk).


---


## Kth Elements — Heap & QuickSelect


### Java Heap Creation


```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
// custom object, order by a field:
PriorityQueue<Task> maxHeap = new PriorityQueue<>(Comparator.comparingInt((Task t) -> t.priority).reversed());
```


### QuickSelect


A selection algorithm to find the Kth smallest/largest in an **unsorted** array without fully sorting — only partition down to the target pivot position, not the whole array.


**Key concept — rank**: how many elements (including the pivot) are ≥ the pivot, counting from the right.

- If `rank > k` → the answer is further right — recurse right.
- If `rank < k` → the answer is to the left, and since we've ruled out `rank` elements from the right, recurse left searching for the `(k - rank)`th largest.

```java
public class QuickSelect {
    public static int quickSelect(int[] arr, int left, int right, int k) {
        if (left == right) return arr[left];
        int pivotIndex = partition(arr, left, right);
        int rank = right - pivotIndex + 1;
        if (rank == k) return arr[pivotIndex];
        else if (rank > k) return quickSelect(arr, pivotIndex + 1, right, k);
        else return quickSelect(arr, left, pivotIndex - 1, k - rank);
    }
    private static int partition(int[] arr, int left, int right) {
        int pivot = arr[right]; int i = left;
        for (int j = left; j < right; j++) if (arr[j] < pivot) { swap(arr, i, j); i++; }
        swap(arr, i, right);
        return i;
    }
}
```


Time: O(n) average, **O(n²) worst case** (bad pivot choices, e.g. already-sorted input with last-element pivot).


---


## Tries


### Bit Manipulation Basics (brush-up, relevant to Trie-on-bits problems like Max XOR)

- Even number of 1s → XOR = 0; odd number of 1s → XOR = 1.
- Set bit at index i: `num | (1 << i)`.
- Check if bit at index i is set: `1 & (num >> i)`.

### Storing Uppercase/Lowercase/Unicode in a Trie


Use a `HashMap<Character, TrieNode>` instead of a fixed-size array:


```java
public static class TrieNode {
    Map<Character, TrieNode> children; // supports Unicode
    boolean isEndOfWord;
    TrieNode() { this.children = new HashMap<>(); this.isEndOfWord = false; }
}
public void insert(String word) {
    TrieNode curr = root;
    for (char c : word.toCharArray()) {
        curr.children.putIfAbsent(c, new TrieNode());
        curr = curr.children.get(c);
    }
    curr.isEndOfWord = true;
}
```


---


## Recursion & Backtracking


### Two Common Backtracking Patterns


**Pattern 1 — Include/Exclude (two recursive calls)**: for binary "take it or skip it" decisions.

- Classic uses: subsets (power set), 0/1 knapsack, binary decision trees.

```java
backtrack(idx + 1, arr, curr + arr[idx]); // include
backtrack(idx + 1, arr, curr);            // exclude
```


For `arr=[1,2]`: branches into `[]`→`[1]`/`[]` → `[1,2]`/`[1]`/`[2]`/`[]`. Each element: include or exclude → 2^n total paths.


**Pattern 2 — For-loop + backtrack (iterative decision)**: for choosing _any_ remaining candidate, not just the immediate next element.

- Classic uses: combinations, permutations, combination sum, N-Queens, Sudoku.

```java
for (int i = start; i < nums.length; i++) {
    path.add(nums[i]);
    backtrack(i + 1, nums, path); // or i (not i+1) if reuse of the same element is allowed
    path.remove(path.size() - 1);
}
```


### When to Use Which


| Problem type                            | Pattern                     | Intuition                                          |
| --------------------------------------- | --------------------------- | -------------------------------------------------- |
| All subsets (include/exclude each item) | Include/Exclude             | "Should I take this or not?"                       |
| Combinations (pick k of n)              | For-loop                    | "Pick any of the next elements"                    |
| Permutations                            | For-loop + `visited[]`      | "Try placing each element in the current position" |
| Combination Sum / N-Queens              | For-loop                    | Explore all candidate choices at each step         |
| Problem type                            | Use                         | Notes                                              |
| ---                                     | ---                         | ---                                                |
| Subsets (no dupes)                      | Include/Exclude or For-loop | Both work equally well                             |
| Subsets (with dupes)                    | For-loop                    | Easier to skip duplicates cleanly                  |
| Combination Sum                         | For-loop                    | More natural to control reuse of numbers           |
| Permutations                            | For-loop                    | Order matters                                      |
| Include/Exclude decisions per item      | Include/Exclude             | Best when it's a binary decision at each step      |
| Subset Sum                              | Include/Exclude             |                                                    |
| Palindrome Partition                    | For-loop (iterative)        |                                                    |


**General backtracking skeleton**:


```javascript
1. Define the exit condition
2. choose
     explore the chosen path (recurse)
3. revert the choice taken (backtrack)
```


**Grouped problem references** (for practice, from the original notes):

- _For-loop based_: Combination Sum, Combination Sum II, Combination Sum III, Subsets II, Letter Combinations of a Phone Number, Palindrome Partitioning.
- _Choose/no-choose (include/exclude) based_: Generate Parentheses, Subset Sums, Subsets.
- _Grid based_: Word Search, N-Queens.

---


## Bit Manipulation


(See also [[05 · Algorithms II]] for the core operator reference.) Trie-adjacent bit tricks: even/odd 1-count ↔ XOR parity; set-bit and check-bit idioms as above are the two you'll reach for most in interview problems (Max XOR pair/triplet, single-number problems, subset generation via bitmask).


---


## Binary Trees, BST, Graph, Greedy — pointers


The original notes largely pointed to the theory already captured in [[03 · Core Data Structures]] (BST operations) and [[06 · Algorithms III]] (graph algorithms), plus filtered problem-database views now consolidated in [[08 · Full Problem Bank]]. No additional unique theory beyond what's already captured in those pages was present here.


---


## Dynamic Programming — Patterns & Identification Templates


### Rule of Thumb for Memoized Lists

- **If modifying a memoized list** → make a new copy (`new ArrayList<>(...)`).
- **If only reading** a memoized list → no need to copy, safe to reuse the reference.

### Understanding Subset-Sum Tabulation


`dp[i][j]` = can we achieve sum `j` using the first `i` elements of the array? (boolean 2D table)

- Base case, first column: `dp[i][0] = true` for all i (empty subset always achieves sum 0).
- Base case, first row: `dp[0][j] = false` for all j > 0 (no elements can't reach a positive sum).
- Transition: `dp[i][j] = dp[i-1][j] (exclude arr[i-1]) || dp[i-1][j-arr[i-1]] (include arr[i-1])`.

⚠️ **This only works for all-positive arrays.** If negatives are allowed, `j - nums[i-1]` can go negative (out of bounds), and the DP table's range `[0, totalSum]` can't represent negative sums.


**Handling negative numbers — shift the indexing**:

1. Compute `totalSum`, `minSum` (sum of negatives), `maxSum` (sum of positives). Set `offset = -minSum` to shift everything non-negative.
2. Use `dp[i][j]` where `j` is the subset sum **shifted by offset**, over range `dp[n][maxSum - minSum + 1]`.

### The 3 Major DP Patterns & Templates


**1. Subset Sum DP (0/1 Knapsack style)** — covers: Subset Sum, Partition Equal Subset Sum, Count of Subsets with Given Sum, Target Sum Expressions.

- Choice per element: include `nums[i]` or don't.

```java
public boolean subsetSum(int[] nums, int target) {
    int n = nums.length;
    boolean[][] dp = new boolean[n + 1][target + 1];
    for (int i = 0; i <= n; i++) dp[i][0] = true;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= target; j++) {
            if (nums[i - 1] <= j) dp[i][j] = dp[i - 1][j] || dp[i - 1][j - nums[i - 1]];
            else dp[i][j] = dp[i - 1][j];
        }
    }
    return dp[n][target];
}
```

- Partition Equal Subset Sum → `target = sum(nums)/2`. Count of Subsets → swap `boolean[][]` for `int[][]` and sum instead of OR.

**2. Unbounded Knapsack (reuse allowed)** — covers: Unbounded Knapsack, Coin Change (min coins), Coin Change (ways to form amount), Rod Cutting.

- Difference from 0/1: you can take the **same item multiple times**.

```java
public int unboundedKnapsack(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[] dp = new int[capacity + 1];
    for (int i = 0; i < n; i++)
        for (int j = weights[i]; j <= capacity; j++)
            dp[j] = Math.max(dp[j], dp[j - weights[i]] + values[i]);
    return dp[capacity];
}
```

- Rod Cutting → `weights = lengths[]`, `values = prices[]`. Coin Change (ways) → `dp[j] += dp[j-coin]`. Coin Change (min coins) → `dp[j] = min(dp[j], dp[j-coin]+1)`.

**Unoptimized 2D version** (for intuition — `dp[i][j]` = max value using first i items, capacity j):


```java
public int unboundedKnapsack2D(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[][] dp = new int[n + 1][capacity + 1];
    for (int i = 1; i <= n; i++) {
        for (int j = 0; j <= capacity; j++) {
            dp[i][j] = dp[i - 1][j]; // exclude
            if (weights[i - 1] <= j) dp[i][j] = Math.max(dp[i][j], dp[i][j - weights[i - 1]] + values[i - 1]); // include (note: dp[i][...], not dp[i-1][...] — reuse allowed)
        }
    }
    return dp[n][capacity];
}
```


| Approach         | Pros                                         | Cons                          |
| ---------------- | -------------------------------------------- | ----------------------------- |
| 2D (unoptimized) | Easier to understand, classic DP table logic | O(N×W) space                  |
| 1D (optimized)   | O(W) space, same O(N×W) time                 | Harder to visualize initially |


**3. Target Sum DP (subset difference)** — covers: Target Sum Expressions.

- Convert to subset-sum: find subsets where `subsetSum = (sum + target) / 2`, then it's "count subsets with a given sum."

```java
public int countSubsetsWithSum(int[] nums, int target) {
    int n = nums.length;
    int[][] dp = new int[n + 1][target + 1];
    dp[0][0] = 1;
    for (int i = 1; i <= n; i++)
        for (int j = 0; j <= target; j++)
            dp[i][j] = (nums[i-1] <= j) ? dp[i-1][j] + dp[i-1][j-nums[i-1]] : dp[i-1][j];
    return dp[n][target];
}
```


### Identification & Template Cheat Sheet


| Problem type                    | Template                                       | Pattern            |
| ------------------------------- | ---------------------------------------------- | ------------------ |
| Subset Sum Problem              | `subsetSum(nums, target)`                      | 0/1 Knapsack       |
| Partition Equal Subset Sum      | `subsetSum(nums, sum/2)`                       | 0/1 Knapsack       |
| Count of Subsets with Given Sum | `countSubsetsWithSum(nums, target)`            | 0/1 Knapsack       |
| Coin Change (Min Coins)         | `unboundedKnapsack(coins, amount)`             | Unbounded Knapsack |
| Coin Change (Ways)              | `countSubsetsWithSum(coins, amount)`           | Unbounded Knapsack |
| Unbounded Knapsack              | `unboundedKnapsack(weights, values, capacity)` | Unbounded Knapsack |
| Rod Cutting                     | `unboundedKnapsack(lengths, prices, n)`        | Unbounded Knapsack |
| Target Sum Expressions          | `countSubsetsWithSum(nums, (sum+target)/2)`    | Subset Difference  |


**Summary of DP state shapes**:

- Subset Sum DP (problems 1,2,3,8 in the original numbering): `dp[i][j]` = can subset sum `j` be formed using the first `i` elements?
- Knapsack DP (7,9): `dp[i][j]` = max value with capacity `j` using first `i` items.
- Unbounded Knapsack/Coin Change (4,6): `dp[j]` = min coins (or number of ways) to reach sum `j`.

---


## Subset / Subsequence


**Subsequence**: derived by deleting some (or no) elements _without changing relative order_. `[1,2,3,4]` → valid subsequences include `[1,2,3]`, `[1,3,4]`, `[2,4]`, itself, and `[]`. `[2,1,3]` is **not** a subsequence of `[1,2,3,4]` — order changed.


```java
public static void findSubsequence(int[] arr, int index, List<Integer> current, List<List<Integer>> result) {
    if (index == arr.length) { result.add(new ArrayList<>(current)); return; }
    current.add(arr[index]);
    findSubsequence(arr, index + 1, current, result); // include
    current.remove(current.size() - 1);
    findSubsequence(arr, index + 1, current, result); // exclude
}
```


**Subset**: any selection of elements, _order doesn't matter_. `{1,2,3,4}` → subsets include `{1,2,3}`, `{4,1,3}` (same as `{1,3,4}`), itself, `{}`.


```java
public static void findSubsets(int[] arr, int index, List<Integer> current, List<List<Integer>> result) {
    if (index == arr.length) { result.add(new ArrayList<>(current)); return; }
    current.add(arr[index]);
    findSubsets(arr, index + 1, current, result);
    current.remove(current.size() - 1);
    findSubsets(arr, index + 1, current, result);
}
```


**Generate all subsets via bitmask** (iterative, no recursion — each of `2^n` masks represents one subset, bit `i` set means "include `arr[i]`"):


```java
public List<List<Integer>> powerSetGenerator(int[] arr) {
    List<List<Integer>> powerSet = new ArrayList<>();
    int totalSubsets = 1 << arr.length;
    for (int mask = 0; mask < totalSubsets; mask++) {
        List<Integer> subset = new ArrayList<>();
        for (int i = 0; i < arr.length; i++)
            if ((mask & (1 << i)) != 0) subset.add(arr[i]);
        powerSet.add(subset);
    }
    return powerSet;
}
// Same bitmask idea, but summing instead of collecting, gives you every subset SUM directly.
```


**Meet in the Middle**: technique for subset-sum-adjacent problems where 2^n is too large for a single brute force but splitting into two halves (2^(n/2) each) and combining is feasible — relevant problems noted: Closest Subsequence Sum, Partition Array Into Two Arrays to Minimize Sum Difference.


---


## Strings


### Core Techniques

1. **Two pointers on strings** — Longest Substring Without Repeating Characters, Valid Palindrome. Left/right pointers, sliding window, string comparison.
2. **Reversal & manipulation** — Reverse Words in a String, String Compression. In-place reversal, parsing.

### Pattern Matching Algorithms (see also [[05 · Algorithms II]] for full KMP/Z code)

- **KMP** — fast substring search via the LPS array, avoids rechecking known-matched characters.
- **Rabin-Karp** — rolling hash based pattern search; know how to compute the rolling hash and handle collisions. Relevant problems: Substring with Concatenation of All Words (LC 30), Repeated DNA Sequences (LC 187), Longest Duplicate Substring (LC 1044).
- **Z-Algorithm** — Z-array in linear time for pattern matching / prefix analysis; relevant for "find all occurrences of pattern in text" style problems (e.g. via `s = pattern + "$" + text`).

### Advanced String Processing

- **Trie (Prefix Tree)** — fast prefix search/autocomplete; insert/search/delete. Relevant: Implement Trie (LC 208), Replace Words (LC 648), Add and Search Word (LC 211), Word Search II (LC 212), Longest Word in Dictionary (LC 720).
- **Suffix Array + LCP Array** — efficient lexicographic sorting, substring uniqueness. Optional for Google, a plus if comfortable.
- **Aho-Corasick** — multiple pattern matching; Trie + KMP-style failure links. Advanced, worth it if time allows.

### DP on Strings

- **LCS** family — Edit Distance, Minimum Insertions to Make Palindrome.
- **Longest Palindromic Subsequence/Substring** — classic substring DP.
- **Wildcard/Regex Matching** — hard DP with memoization and boundary conditions.

Relevant problems: Wildcard Matching (LC 44), Regular Expression Matching (LC 10), Longest Palindromic Substring (LC 5), Longest Common Subsequence (LC 1143), Edit Distance (LC 72), Palindromic Substrings/Count (LC 647), Minimum Insertions to Make a String Palindrome (LC 1312).


### Misc Techniques

- **Rolling hash** (Rabin-Karp / substring hashing) — fast substring equality checks.
- **Manacher's Algorithm** (optional) — longest palindromic substring in linear time; rare but elegant.

### Intuition for String Problems

1. **Mapping characters**: when transforming string `s → t`, check _both directions_ (`s→t` and `t→s`) to avoid breaking isomorphism (e.g., `a→x` and `b→x` both mapping to the same target is invalid).
2. **Use hash maps** for one-to-one character mapping problems (or fixed-size arrays for ASCII).
3. **Sliding window & frequency arrays** for substrings/anagrams.
4. **Think in patterns, not raw characters**: e.g. `"egg" → "add"` can both be represented as the pattern `"011"` (same relative repeat structure), making isomorphism/pattern-matching checks easier.

---


## Advanced Trees for Range Queries — Fenwick Tree (Binary Indexed Tree)


**Problem it solves**: you need both fast prefix-sum queries _and_ fast point updates. A plain loop is O(N) per query; a prefix-sum array is O(1) query but O(N) update. Fenwick Tree gives **O(log N) for both**.


**Structure**: a 1-indexed array `bit[]` of size N+1. Each index `i` stores the sum of a range determined by `i`'s **lowest set bit** (`i & -i`).


**Finding the last set bit**: `i & -i` (`-i` is the two's complement of `i`). Example: `5 & -5`: `101 & 011 = 001`. **Flipping the last set bit** (moving to the parent): `i - (i & -i)`.


| Index `i` | Binary | `i & -i` | Range it stores |
| --------- | ------ | -------- | --------------- |
| 1         | 0001   | 1        | [1]             |
| 2         | 0010   | 2        | [1,2]           |
| 3         | 0011   | 1        | [3]             |
| 4         | 0100   | 4        | [1,2,3,4]       |
| 5         | 0101   | 1        | [5]             |
| 6         | 0110   | 2        | [5,6]           |
| 7         | 0111   | 1        | [7]             |
| 8         | 1000   | 8        | [1..8]          |


**Prefix sum query** `sum(i)`: add `bit[i]`, move to parent via `i -= i & (-i)`, repeat until `i == 0`.


```java
int sum(int i) {
    int result = 0;
    while (i > 0) { result += bit[i]; i -= (i & -i); }
    return result;
}
```


**Update** `add(i, delta)`: add `delta` to `bit[i]`, move to the next node that _includes_ `i` via `i += i & (-i)`, repeat until `i` exceeds the array bound.


```java
void add(int i, int delta) {
    while (i < bit.length) { bit[i] += delta; i += (i & -i); }
}
```


**Range sum** `[l, r]` = `sum(r) - sum(l-1)`.


| Operation    | Time     | Notes                                     |
| ------------ | -------- | ----------------------------------------- |
| Add to index | O(log N) | via `add(i, delta)`                       |
| Prefix sum   | O(log N) | via `sum(i)`                              |
| Space        | O(N)     | N+1 array, 1-indexed                      |
| Uses         | —        | range sum, counts, inversions, histograms |


**Coordinate compression** is noted as a related technique (map large/sparse values down to a dense 1..N range so they fit a Fenwick/segment tree index space) — flagged as a gap, no worked example was captured in the original notes.


## 09 · Full Problem Bank (Part 1 of 2)
> All 228 problems from the original tracking database, grouped by category and tagged with difficulty and pattern where recorded. ⭐ marks problems flagged as high-priority in the original tracker. Some entries in the source database had no problem title recorded (blank rows) — those are omitted here since they carried no retrievable information.

## Array / Two Pointers (17)


| Problem                                                          | Difficulty | Pattern(s)                     | Approach notes                                                                                                                                 |
| ---------------------------------------------------------------- | ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Find the second largest and second smallest number in an array   | Easy       | Single Traversal               | Sort and traverse from both ends; or single traversal tracking largest/second-largest                                                          |
| Check if the given array is sorted                               | Easy       | Single Traversal               | Traverse checking arr[i] >= arr[i-1]                                                                                                           |
| Remove duplicates from sorted array (non-decreasing)             | Easy       | Two pointers                   | HashSet + repopulate O(2N) space O(N); or two pointers i,j O(N) O(1)                                                                           |
| Move all 0s in the array to the end                              | Easy       | Fast and slow, Two pointers    | Two pointers: i=leftmost 0, j finds next non-zero, swap                                                                                        |
| Left rotate array by one / by K places                           | Easy       | Two pointers                   | By one: store+shift O(N)/O(1). By K: store K, shift, repopulate O(N)/O(N). Reverse trick: reverse first K, reverse rest, reverse all O(N)/O(1) |
| Count maximum consecutive ones in array                          | Easy       | Single Traversal               | Track running count, reset on 0, track max                                                                                                     |
| Union of two sorted arrays                                       | Medium     | Two pointers                   | –                                                                                                                                              |
| Arrange the array into alternative negative and positive numbers | Medium     | Single Traversal, Two pointers | –                                                                                                                                              |
| Leaders in an Array                                              | Easy       | Two pointers                   | –                                                                                                                                              |
| Sort an array of 0s, 1s and 2s                                   | Easy       | Two pointers                   | –                                                                                                                                              |
| ⭐ Stock Buy and Sell                                             | Easy       | Single Traversal               | –                                                                                                                                              |
| Longest sequence of consecutive numbers                          | Medium     | Single Traversal               | –                                                                                                                                              |
| Fruits Into Basket II                                            | –          | Two pointers                   | –                                                                                                                                              |
| Rotate Array                                                     | –          | Single Traversal               | –                                                                                                                                              |
| Check if array is sorted and rotated                             | Easy       | Single Traversal               | –                                                                                                                                              |
| Remove duplicates from sorted array in-place                     | Easy       | Two pointers                   | –                                                                                                                                              |
| Container with Most Water                                        | Medium     | Two pointers                   | –                                                                                                                                              |


## Sliding Window / Prefix Sum (17)


| Problem                                                               | Difficulty | Pattern(s)                | Approach notes                                    |
| --------------------------------------------------------------------- | ---------- | ------------------------- | ------------------------------------------------- |
| Longest subarray with sum=k (array has positive and negative numbers) | Medium     | PrefixSum                 | Single traversal with HashMap of prefix sums      |
| Count subarrays whose sum = k / Return subarrays whose sum = k        | Medium     | PrefixSum                 | Count occurrence of each prefix sum, update count |
| Maximum product subarray                                              | Medium     | Sliding window            | Track running max and min product from both ends  |
| Longest subarray with sum = k (only positive numbers)                 | Medium     | Sliding window, PrefixSum | Sliding window OR single traversal with HashMap   |
| Largest subarray with sum = 0                                         | Medium     | PrefixSum                 | Single traversal with HashMap                     |
| Count the number of subarrays with given XOR                          | Hard       | PrefixSum                 | Count occurrence of each prefix XOR, update count |
| Maximum Sub Array Sum, print maxSum or print the subarray             | Medium     | Sliding window            | Decrease the window when sum becomes negative     |
| Max Consecutive Ones III                                              | Medium     | Sliding window            | –                                                 |
| Longest Substring Without Repeating Characters                        | Medium     | Sliding window            | –                                                 |
| Fruits into Basket                                                    | Medium     | Sliding window            | –                                                 |
| Number of subarrays containing all three characters                   | Medium     | Sliding window            | –                                                 |
| Maximum points you can obtain from cards                              | Medium     | Sliding window            | –                                                 |
| Count the number of nice subarrays                                    | Medium     | Sliding window            | –                                                 |
| Count Binary Subarrays With Sum                                       | Medium     | PrefixSum                 | –                                                 |
| Longest repeating character replacement                               | Medium     | Sliding window            | –                                                 |
| Longest substring with at most K different characters                 | –          | Sliding window            | –                                                 |
| ⭐ Subarrays with exactly K distinct elements                          | Hard       | Sliding window            | –                                                 |


## Merge-Sort-Based Counting (4)


| Problem                             | Difficulty | Pattern(s) | Approach notes |
| ----------------------------------- | ---------- | ---------- | -------------- |
| Count Inversions                    | Hard       | Merge Sort | –              |
| Reverse Pairs                       | Hard       | Merge Sort | –              |
| Count of Smaller Numbers After Self | Hard       | Merge Sort | –              |
| Count of Range Sum                  | Hard       | Merge Sort | –              |


## Monotonic Stack / Queue (10)


| Problem                                  | Difficulty | Pattern(s)                      | Approach notes |
| ---------------------------------------- | ---------- | ------------------------------- | -------------- |
| Next Greater Element in a circular array | Medium     | Monotonic Stack                 | –              |
| Next Greater Element given two arrays    | Medium     | Monotonic Stack                 | –              |
| Sum of Subarray Minimums                 | Hard       | Monotonic Stack                 | –              |
| Asteroid Collision                       | Medium     | Monotonic Stack                 | –              |
| ⭐ Sliding Window Maximum                 | Hard       | Sliding window, Monotonic Queue | –              |
| ⭐ Online Stock Span                      | Medium     | Monotonic Stack                 | –              |
| Trapping Rain Water                      | Hard       | Two pointers, Monotonic Stack   | –              |
| Largest Rectangle in a Histogram         | Hard       | Monotonic Stack                 | –              |
| Sum of Subarray Ranges                   | Medium     | Monotonic Stack                 | –              |
| Maximal Rectangle in a grid              | Hard       | Monotonic Stack                 | –              |


## Stacks (2)


| Problem                 | Difficulty | Pattern(s) | Approach notes |
| ----------------------- | ---------- | ---------- | -------------- |
| ⭐ Implement A Min Stack | Medium     | –          | –              |
| Valid Parenthesis       | Easy       | –          | –              |


## Heap / Kth Elements (10)


| Problem                                  | Difficulty | Pattern(s)           | Approach notes                                       |
| ---------------------------------------- | ---------- | -------------------- | ---------------------------------------------------- |
| Find the largest element in an array     | Easy       | Single Traversal     | Single traversal O(N); sort O(N log N); or heap peek |
| Find the Kth largest element in an array | Medium     | Heapify, QuickSelect | –                                                    |
| Find Median from data stream             | Hard       | –                    | –                                                    |
| Kth largest element in a stream          | Medium     | –                    | –                                                    |
| Top K frequent numbers                   | –          | QuickSelect          | –                                                    |
| Task Scheduler                           | –          | –                    | –                                                    |
| Maximum Sum Combinations                 | Medium     | –                    | –                                                    |
| Merge K sorted Lists                     | Hard       | –                    | –                                                    |
| Sort K sorted arrays                     | Easy       | –                    | –                                                    |
| Sort Characters By Frequency             | Medium     | –                    | –                                                    |


## Tries (6)


| Problem                                                | Difficulty | Pattern(s) | Approach notes |
| ------------------------------------------------------ | ---------- | ---------- | -------------- |
| Max XOR with an element in an array                    | Hard       | –          | –              |
| Tries implementation II                                | Medium     | –          | –              |
| Max XOR of two numbers in an array                     | Medium     | –          | –              |
| Longest Word with all valid prefixes (complete string) | Medium     | –          | –              |
| Count distinct substrings of a string                  | Medium     | –          | –              |
| Longest Common Prefix                                  | Easy       | –          | –              |


## Recursion & Backtracking (4)


| Problem              | Difficulty | Pattern(s)                 | Approach notes |
| -------------------- | ---------- | -------------------------- | -------------- |
| Generate all subsets | Medium     | Recursion and Backtracking | –              |
| Combination Sum      | Medium     | Recursion and Backtracking | –              |
| Combination Sum II   | Medium     | Recursion and Backtracking | –              |
| Generate Parentheses | Medium     | Recursion and Backtracking | –              |


## Binary Trees (20)


| Problem                                          | Difficulty | Pattern(s) | Approach notes |
| ------------------------------------------------ | ---------- | ---------- | -------------- |
| Height of a Tree / Max depth                     | Easy       | DFS        | –              |
| Top View of a Binary Tree                        | Medium     | –          | –              |
| Binary Tree Max Path Sum                         | Hard       | DFS        | –              |
| Construct binary tree from inorder and preorder  | Medium     | DFS        | –              |
| Boundary of Binary Tree                          | –          | –          | –              |
| Diameter of a Binary Tree                        | Easy       | DFS        | –              |
| Is Same Tree                                     | Easy       | DFS        | –              |
| All Nodes Distance K in Binary Tree              | Medium     | BFS        | –              |
| Construct binary tree from postorder and inorder | Medium     | DFS        | –              |
| Serialize and Deserialize Binary Tree            | Hard       | –          | –              |
| Count Complete Tree Nodes                        | Easy       | DFS        | –              |
| Root to Node Path                                | Medium     | DFS        | –              |
| Minimum time to burn all nodes                   | –          | BFS        | –              |
| ⭐ Zig zag traversal of a binary tree             | Medium     | BFS        | –              |
| Maximum Width of a Binary Tree                   | Medium     | BFS        | –              |
| Flatten Binary Tree Into Linked List             | Medium     | DFS        | –              |
| Morris Traversal                                 | Medium     | DFS        | –              |
| Lowest Common Ancestor of a Binary Tree          | Medium     | DFS        | –              |
| Vertical Order of a Binary Tree                  | Hard       | DFS        | –              |
| Check If Balanced Binary Tree                    | Easy       | DFS        | –              |


## Binary Search Trees (13)


| Problem                                | Difficulty | Pattern(s) | Approach notes |
| -------------------------------------- | ---------- | ---------- | -------------- |
| Largest BST in a binary tree           | –          | BST        | –              |
| Construct a Binary Tree from preorder  | Medium     | –          | –              |
| ⭐ Validate BST                         | Medium     | –          | –              |
| Two Sum in BST                         | Medium     | –          | –              |
| Delete in a Binary Search Tree         | Medium     | –          | –              |
| Closest in a Binary Search Tree        | Easy       | –          | –              |
| Lowest common ancestor of a BST        | Medium     | –          | –              |
| Recover a BST                          | Medium     | BST        | –              |
| Inorder successor in BST               | Medium     | –          | –              |
| BST Iterator                           | Medium     | –          | –              |
| Ceil and Floor in a Binary Search Tree | Easy       | –          | –              |
| ⭐ Kth smallest element in a BST        | Medium     | –          | –              |
| Insert Into a Binary Search Tree       | Medium     | –          | –              |


## Advanced Trees (1)


| Problem                | Difficulty | Pattern(s)   | Approach notes |
| ---------------------- | ---------- | ------------ | -------------- |
| Fruits into Basket III | –          | Segment Tree | –              |


## 09 · Full Problem Bank (Part 2 of 2)

_(Continued from Part 1 — Array/Two Pointers, Sliding Window/Prefix Sum, Merge-Sort Counting, Monotonic Stack/Queue, Stacks, Heap/Kth Elements, Tries, Recursion & Backtracking, Binary Trees, Binary Search Trees, Advanced Trees.)_


## Graphs (26)


| Problem                                                                     | Difficulty | Pattern(s)                    | Approach notes |
| --------------------------------------------------------------------------- | ---------- | ----------------------------- | -------------- |
| Find the Celebrity                                                          | Medium     | –                             | –              |
| Number of Provinces                                                         | Medium     | Connected Components, DFS     | –              |
| Rotting Oranges                                                             | Medium     | BFS                           | –              |
| Bipartite Graphs                                                            | Medium     | BFS, DFS, GraphColoring       | –              |
| Cycle Detection - Undirected Graph                                          | Medium     | –                             | –              |
| 0/1 Matrix                                                                  | Medium     | –                             | –              |
| Surrounded Regions                                                          | Medium     | –                             | –              |
| Number of Enclaves                                                          | Medium     | –                             | –              |
| Flood Fill                                                                  | Medium     | BFS                           | –              |
| Map of Highest Peak                                                         | Medium     | –                             | –              |
| ⭐ Word Ladder I and II                                                      | Hard       | –                             | –              |
| Find the City With the Smallest Number of Neighbors at a Threshold Distance | Medium     | Floyd Warshall, Shortest Path | –              |
| ⭐ Path with Minimum Effort                                                  | Medium     | Dijkstra, Shortest Path       | –              |
| Course Schedule II                                                          | Medium     | BFS, TopologicalSort          | –              |
| Course Schedule I                                                           | Medium     | BFS, TopologicalSort          | –              |
| Find Eventual Safe States                                                   | Medium     | DFS, TopologicalSort          | –              |
| Alien Dictionary                                                            | Hard       | TopologicalSort               | –              |
| Network Delay Time                                                          | Medium     | Dijkstra, Shortest Path       | –              |
| Number of ways to arrive at destination                                     | Hard       | Dijkstra, Shortest Path       | –              |
| Cheapest Flight with K stops                                                | Medium     | BellmanFord, Shortest Path    | –              |
| Cycle detection in a directed graph                                         | Medium     | BFS, DFS, TopologicalSort     | –              |
| Shortest Path in a Binary Matrix                                            | Medium     | BFS, Shortest Path            | –              |
| Most Stones Removed with Same Row or Column                                 | Medium     | UnionFind                     | –              |
| Number of operations to make a network connected                            | Medium     | UnionFind                     | –              |
| Accounts Merge                                                              | Medium     | UnionFind                     | –              |
| Number of Islands II                                                        | Hard       | –                             | –              |


## Greedy (14)


| Problem                                         | Difficulty | Pattern(s)              | Approach notes |
| ----------------------------------------------- | ---------- | ----------------------- | -------------- |
| Minimum platforms at railway station            | Medium     | Greedy, Sorting         | –              |
| ⭐ Candies                                       | Hard       | Greedy                  | –              |
| ⭐ Make Change - Minimum number of coins         | Easy       | Greedy, Sorting         | –              |
| Lemonade Change                                 | Easy       | Greedy                  | –              |
| Shortest Job First                              | Medium     | Greedy                  | –              |
| Fractional Knapsack                             | Easy       | Greedy, Sorting         | –              |
| Remove K Digits to get the smallest number      | Medium     | Greedy, Monotonic Stack | –              |
| Jump Game I                                     | Medium     | Greedy                  | –              |
| Valid Parenthesis Checker                       | Medium     | Greedy                  | –              |
| ⭐ N Meetings in One Room                        | Medium     | Greedy, Sorting         | –              |
| ⭐ Jump Game II - Min jumps                      | Medium     | Greedy                  | –              |
| Minimum intervals to remove for non-overlapping | Medium     | Greedy, Sorting         | –              |
| Assign Cookies                                  | Easy       | Greedy, Sorting         | –              |
| Stock Buy and Sell II                           | Medium     | Greedy                  | –              |


## Dynamic Programming (41)


| Problem                                              | Difficulty | Pattern(s)          | Approach notes |
| ---------------------------------------------------- | ---------- | ------------------- | -------------- |
| Ninja's Training                                     | Medium     | Dynamic Programming | –              |
| Cherry Pickup II                                     | Hard       | Dynamic Programming | –              |
| Minimum Path Sum in grid                             | Medium     | Dynamic Programming | –              |
| Climbing Stairs                                      | Easy       | Dynamic Programming | –              |
| Frog Jump                                            | Easy       | Dynamic Programming | –              |
| Minimum Falling Path Sum                             | Medium     | Dynamic Programming | –              |
| Cherry Pickup I                                      | Hard       | Dynamic Programming | –              |
| Minimum Path Sum in triangle                         | Medium     | Dynamic Programming | –              |
| Subset Sum Equals K                                  | Medium     | Dynamic Programming | –              |
| Unique Paths II                                      | Medium     | Dynamic Programming | –              |
| Frog Jump with K distances                           | Medium     | Dynamic Programming | –              |
| House Robber II                                      | Medium     | Dynamic Programming | –              |
| Unique Paths                                         | Medium     | Dynamic Programming | –              |
| Partition Equal Subset Sum                           | Medium     | Dynamic Programming | –              |
| House Robber                                         | Medium     | Dynamic Programming | –              |
| Shortest Common Supersequence                        | Hard       | Dynamic Programming | –              |
| Print LCS                                            | Hard       | Dynamic Programming | –              |
| Delete operations for two strings                    | Medium     | Dynamic Programming | –              |
| Count Subset with Sum Equals K                       | Medium     | Dynamic Programming | –              |
| Longest Common Subsequence                           | Medium     | Dynamic Programming | –              |
| Minimum insertions to make a string a palindrome     | Hard       | Dynamic Programming | –              |
| Longest Common Substring                             | Medium     | Dynamic Programming | –              |
| Unbound Knapsack                                     | Medium     | Dynamic Programming | –              |
| Coin Change                                          | Medium     | Dynamic Programming | –              |
| Rod Cutting                                          | Medium     | Dynamic Programming | –              |
| Longest Palindromic Subsequence                      | Medium     | Dynamic Programming | –              |
| Target Sum                                           | Medium     | Dynamic Programming | –              |
| Coin Change II                                       | Hard       | Dynamic Programming | –              |
| Wildcard Matching                                    | Hard       | Dynamic Programming | –              |
| Edit Distance                                        | Hard       | Dynamic Programming | –              |
| Best Time to Buy and Sell Stock with Transaction Fee | Medium     | Dynamic Programming | –              |
| Distinct Subsequences                                | Hard       | Dynamic Programming | –              |
| Best Time to Buy and Sell Stock III                  | Hard       | Dynamic Programming | –              |
| Best Time to Buy and Sell Stock with Cooldown        | Medium     | Dynamic Programming | –              |
| Longest Increasing Subsequence                       | –          | Dynamic Programming | –              |
| Best Time to Buy and Sell Stocks IV                  | Hard       | Dynamic Programming | –              |
| Longest Divisible Subset                             | –          | Dynamic Programming | –              |
| Matrix Chain Multiplication (MCM)                    | –          | Dynamic Programming | –              |
| Count number of squares in a matrix                  | Medium     | Dynamic Programming | –              |
| Palindrome Partitioning I and II                     | Hard       | Dynamic Programming | –              |
| Word Break                                           | Medium     | Dynamic Programming | –              |


## Meet in the Middle (2)


| Problem                                                    | Difficulty | Pattern(s)         | Approach notes |
| ---------------------------------------------------------- | ---------- | ------------------ | -------------- |
| Partition Array Into Two Arrays to Minimize Sum Difference | Hard       | Meet in the middle | –              |
| Closest Subsequence Sum                                    | Hard       | Meet in the middle | –              |


## Strings (14)


| Problem                               | Difficulty | Pattern(s) | Approach notes |
| ------------------------------------- | ---------- | ---------- | -------------- |
| Largest odd number string             | Easy       | –          | –              |
| Remove Outermost Parentheses          | Easy       | –          | –              |
| Reverse words in a string             | Medium     | –          | –              |
| Roman to Integer                      | Easy       | –          | –              |
| Minimum Add to make parentheses valid | Medium     | –          | –              |
| Maximum depth of parentheses          | Easy       | –          | –              |
| Isomorphic String                     | Easy       | –          | –              |
| Count and Say                         | Medium     | –          | –              |
| Anagrams                              | Easy       | –          | –              |
| Beauty Sum of a String                | Medium     | –          | –              |
| Rotate String                         | Medium     | –          | –              |
| String to Integer (atoi)              | Medium     | –          | –              |
| Repeated String Match                 | Medium     | –          | –              |
| Needle in a Haystack                  | Medium     | –          | –              |


## Misc / Implementation (19)


| Problem                                                      | Difficulty     | Pattern(s)             | Approach notes                                                     |
| ------------------------------------------------------------ | -------------- | ---------------------- | ------------------------------------------------------------------ |
| Every element appears twice except one - find the single one | Easy           | Bit Manipulation       | XOR all elements; duplicates cancel out                            |
| Find the missing number (1 to N)                             | Easy           | Math, Bit Manipulation | Sum formula S1=N(N-1)/2 minus actual sum; or XOR of 1..N XOR array |
| Three sum closest                                            | Hard           | –                      | –                                                                  |
| Three Sum                                                    | Medium         | –                      | –                                                                  |
| Container with Most Water                                    | –              | –                      | –                                                                  |
| Merge two sorted arrays without extra space                  | –              | –                      | –                                                                  |
| Set matrix zeroes                                            | Medium         | –                      | –                                                                  |
| Find the repeating and missing number                        | Hard           | –                      | –                                                                  |
| Two Sum                                                      | Easy           | –                      | –                                                                  |
| Four Sum                                                     | Hard           | –                      | –                                                                  |
| LFU Cache                                                    | Hard           | –                      | –                                                                  |
| Trapping Rain Water II                                       | Extremely Hard | PriorityQueue          | –                                                                  |
| Maximum Value of an Ordered Triplet II                       | –              | –                      | –                                                                  |
| LRU Cache                                                    | Hard           | –                      | –                                                                  |
| Hand of Straights                                            | Medium         | Sorting                | –                                                                  |
| Design Twitter                                               | Medium         | –                      | –                                                                  |
| Search Insert Position                                       | Easy           | –                      | –                                                                  |
| Pascal's Triangle                                            | Easy           | –                      | –                                                                  |


---


**Note on completeness**: the original tracker had 228 rows; 220 had a problem title (the rest were blank placeholder rows in the database and carried no content to preserve). Every titled problem is included above across both parts, with whatever difficulty/pattern/approach metadata was recorded against it in the original — many entries only had a title and difficulty tagged, with no approach notes written yet.


## 10 · Revision Checklist

A simple revision-tracking checklist from the original notes — topics to cycle back through, with the date each was last revised (where recorded).


| Topic                 | Last revised    |
| --------------------- | --------------- |
| Heap                  | 2025-03-27      |
| Tries                 | 2025-03-27      |
| Quick Select          | 2025-03-27      |
| Greedy                | – not yet dated |
| Monotonic Stack       | – not yet dated |
| Binary Tree Traversal | – not yet dated |
| Merge Intervals       | – not yet dated |
| Bit Manipulation      | – not yet dated |
| Binary Search Tree    | – not yet dated |

