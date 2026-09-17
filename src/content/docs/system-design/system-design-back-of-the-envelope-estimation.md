---
title: "System Design : Back of the Envelope Estimation"
---


Before designing any system, engineers perform **back-of-the-envelope calculations**—quick, rough estimates of traffic, storage, and bandwidth. These numbers dictate your architecture. A system handling 10 requests per second looks completely different from one handling 100,000 requests per second.


To build our estimation toolkit, we first need intuition about how fast computers access different types of storage.


To quantify this for back-of-the-envelope estimations, engineers use a few crucial benchmark latency numbers:


🧠 **RAM Access**


💽 **SSD Read**


🌐 **Network (Same Data Center)**


🌎 **Network (Cross-Country):**


~100 nanoseconds ($10^{-7}$ seconds)


 ~100 microseconds ($10^{-4}$ seconds) — _1,000x slower than RAM!_


~0.5 milliseconds ($5 \times 10^{-4}$ seconds)


~100 milliseconds ($0.1$ seconds)


Because RAM is so fast, we often use **caching** (storing hot data in memory) so requests don't have to hit the slower disk every time.


### Step 1: Calculating Queries Per Second (QPS)


Now, let's practice calculating **QPS (Queries Per Second)**, which tells us how much traffic a system must process.


Imagine we are designing a feature for an app that has **8.64 million** **Daily Active Users (DAU)**, and on average, each user sends **10 requests per day**.


```java
Total requests = DAU * Requests per user  = 8.64 million * 10 = 86.4 million requests per day
```


Now, to convert this to **Queries Per Second (QPS)**, we need to divide that daily total by the number of seconds in a day.
There are **`86,400 seconds`** in a single day `(24 hours * 60 minutes * 60 seconds)`
Using this number, what is our average **QPS**?


```java
Average QPS = 86,400,000/ 86,400 = 1000 QPS
```


### Step 2: Accounting for Peak Traffic 📈


In the real world, traffic is never spread evenly across all 24 hours. People use apps much more during the day than at 3:00 AM.


To make sure our system doesn't crash during busy hours, engineers estimate **Peak QPS**. A standard industry rule of thumb is assuming peak traffic is **`2× to 5×`** `higher than the average.`


If we assume a **2× peak factor** for our system, what is the **Peak QPS** we need to design our infrastructure to handle?


```java
Peak QPS = 2000 QPS
```


Designing for peak capacity ensures our servers don't crash when traffic spikes.



### Step 3: Estimating Storage Growth 💾


Next, let's calculate how much **database storage** we need.


Assume every request writes a small record to our database (like a tweet or a log entry) with an average payload size of **500 bytes**.


To find the daily storage requirement, we multiply total daily requests by record size:


```java
Daily storage = 86,400,000 * 500 = 43.2GB
```

> (Hint: $1 \text{ GB} \approx 1,000,000,000 \text{ bytes}$, or $10^9$ bytes)

### Step 4: Multi-Year Storage & Replication Growth 📈


In system design, we rarely budget storage for just a single day. Databases must store data over months or years, and they often keep **replicas** (copies) for backup and safety.


Let's estimate our storage needs for **1 year** (~365 days):


```java
Raw Data per year = 43.2GB * 365 = 15,768GB ~= 15.8TB
```

> ( Hint : 1 TB = 1000 GB) 

**Database Overhead & Replication:** Database indexes and metadata typically add **20% extra overhead**. Additionally, production systems usually keep **3 copies** (1 primary + 2 replicas) to prevent data loss.


If our raw data is roughly **15.8 TB per year**, and we need **3 total copies** (a 3x replication factor), roughly how many **Terabytes (TB)** of total storage should we budget for **Year 1**?


```java
Total storage = ( Index & metadata overhead + Raw data per year )* 3 = ( 3.16 + 15.8 ) * 3 = 56.88TB
```


### Step 5: Estimating Network Bandwidth 🌐


The final piece of back-of-the-envelope sizing is **Bandwidth** (the rate of data transferred over the network per second).


We look at bandwidth in two directions:

- 📥 **Ingress:** Incoming traffic (data sent from users to our servers)
- 📤 **Egress:** Outgoing traffic (data sent from our servers back to users)

Let's calculate our average **Ingress Bandwidth** using the numbers we already calculated:
• **Average QPS:** 1,000 Requests per second 
• **Payload Size:** 500 bytes per request 


```java
Ingress Bandwidth = 1000 * 500 = 500,000 bytes/ second = 500KB/s = 0.5MB/s
```

> (Hint: $1 \text{ MB} = 1,000 \text{ KB} = 1,000,000 \text{ bytes}$)

### Summary: Your Back-of-the-Envelope Toolkit 🧮


We have built our core estimation formulas:


| **Metric**            | **Formula / Key Benchmark**                                                    | **Our Example Result**  |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------- |
| **Average QPS**       | $\frac{\text{Total Daily Requests}}{86,400 \text{ seconds}}$                   | $1,000 \text{ QPS}$     |
| **Peak QPS**          | $\text{Average QPS} \times 2 \text{ (or up to } 5\text{)}$                     | $2,000 \text{ QPS}$     |
| **Daily Storage**     | $\text{Daily Requests} \times \text{Payload Size}$                             | $43.2 \text{ GB/day}$   |
| **Yearly Storage**    | $(\text{Daily Storage} + \text{Overhead} ) \times 365  \times \text{Replicas}$ | $56.88 \text{ TB/year}$ |
| **Ingress Bandwidth** | $\text{Average QPS} \times \text{Payload Size}$                                | $0.5 \text{ MB/s}$      |


## How these calculations affect design decisions : 


## Bandwidth


    Bandwidth is a critical metric because network capacity is finite, expensive, and often a major bottleneck in distributed systems.


    Calculating bandwidth directly drives several crucial system design decisions:

    - **Why we calculate it:** Measures network interface utilization and data movement across network boundaries.
    - **How it changes the design:**
        - **High Egress Bandwidth:** Forces the use of a **Content Delivery Network (CDN)** at the network edge to serve static assets (images, videos, scripts) closer to users, bypassing origin servers completely.
        - **High Ingress Bandwidth:** Requires dedicated **API Gateways** capable of SSL termination, packet inspection, and traffic shaping before requests reach internal microservices.
        - **Payload Optimization:** High bandwidth costs force protocol choices: switching from text-based **JSON/REST** over HTTP/1.1 to binary-compressed formats like **gRPC / Protocol Buffers** over HTTP/2, reducing wire size by 60–80%.

    ### 1. Network Infrastructure & Hardware Choices 🔌

    - **Network Interface Cards (NICs):** Standard cloud servers or data center instances come with specific network limits (e.g., 1 Gbps, 10 Gbps, 25 Gbps, or 100 Gbps). If your calculated bandwidth requirement exceeds the limit of a single server's network card, you must split traffic across multiple servers—even if your CPU and RAM are barely being used!
    - **Scale Out vs. Scale Up:** Knowing your ingress/egress bandwidth helps you determine how many servers or load balancers you need strictly to prevent network congestion.

    ### 2. Architecture & Delivery Decisions 🚀

    - **Using a CDN (Content Delivery Network):** If your **egress bandwidth** (data sent to users) is huge—for example, streaming video or serving large images—calculating this tells you immediately that serving media directly from your app servers will exhaust your network. This forces you to offload static asset delivery to edge networks like Cloudflare or AWS CloudFront.
    - **Compression & Serialization Formats:** High bandwidth needs force you to choose lightweight data formats. Instead of sending bulky JSON or XML over the wire, high-bandwidth systems adopt compressed formats like **Protocol Buffers (Protobuf)** or **Apache Avro**, and enable compression algorithms like Gzip or Brotli.

    ### 3. Cost & Cloud Budgeting 💰

    - **Cloud Egress Fees:** Cloud providers (like AWS, GCP, Azure) typically do not charge for incoming data (ingress), but charge heavily for outgoing data across network boundaries (egress) or between different cloud regions. Calculating egress bandwidth allows you to estimate monthly cloud networking costs upfront.

    **A Concrete Example**
    Imagine you design a photo-sharing app:
    • **Users view:** 10,000 photos per second.
    • **Average photo size:** 2 Megabytes (MB).
    • **Egress Bandwidth:** $10,000 \times 2 \text{ MB/sec} = 20,000 \text{ MB/s} = \mathbf{20 \text{ GB/s}} = \mathbf{160 \text{ Gbps}}.$


    A typical single server handles ~10 Gbps. This calculation immediately tells you that:

    1. You **cannot** serve photos directly from your backend servers; you **must** use a CDN.
    2. Your primary architecture challenge here isn't CPU or RAM—it's **network throughput**.

## Average & Peak Queries Per Second (QPS)

    - **Why we calculate it:** QPS measures the total throughput demand on your system. It tells you how many incoming requests your application servers and databases must process every single second.
    - **How it changes the design:**
        - **Low QPS (< 1,000 QPS):** A simple architecture with a single application server and a single primary database (e.g., PostgreSQL or MySQL) is sufficient.
        - **High QPS (> 10,000 QPS):** A single server's CPU/RAM will bottleneck. You are forced to:
            - Introduce a **Load Balancer** to distribute requests across a fleet of stateless application servers.
            - Implement an **In-Memory Cache (Redis/Memcached)** to intercept reads so the database isn't overwhelmed.
        - **Peak QPS (e.g., 2×–5× Average):** Forces you to design for auto-scaling policies, queue-based load leveling (using Kafka or RabbitMQ) to absorb sudden traffic spikes, and **rate limiting** to prevent server collapse.

## Daily & Yearly Storage

    - **Why we calculate it:** Data never stays static; it accumulates over time. Storage sizing tells you how quickly your databases will fill up and when hardware limits will be reached.
    - **How it changes the design:**
        - **Low Volume (< 100 GB total):** Standard Relational Database (RDBMS) on a single disk. Easy to back up and query.
        - **Medium Volume (100 GB – 1 TB/year):** Single database server with vertical scaling (upgrading disk size) and read-replicas.
        - **High Volume (> 10 TB/year, like our 56.88 TB calculation):** A single database disk will run out of space or degrade in query performance. You are forced to:
            - **Shard the Database:** Horizontally partition data across multiple physical database nodes (e.g., User IDs 1–1M on Node 1, 1M–2M on Node 2).
            - **Adopt NoSQL / Distributed Storage:** Move unstructured/append-only data to distributed databases like Cassandra, DynamoDB, or Blob Storage (AWS S3).
            - **Data Retention & Tiering:** Implement lifecycle policies to move old "cold" data to cheaper, slower storage (e.g., AWS S3 Glacier) and keep only "hot" data on fast SSDs.

## Replication factor and overhead


    **Why we calculate it:** Raw data isn't the only thing stored. Single disks fail, and databases require indexes, metadata, and write-ahead logs to operate efficiently.**How it changes the design:**
    • **High Availability (HA):** Multiplying storage requirements by $3\times$ (1 Primary + 2 Replicas) ensures that if a hardware failure destroys one server, the system continues running without data loss.
    • **Read Scaling:** Replicas aren't just for backup—they allow you to route read traffic away from the primary node to the read-replicas.
    • **Cost Estimation:** Prevents under-provisioning cloud infrastructure budgets by accounting for index bloat (typically 20%) and multiple physical copi


## Latency Benchmarks

    - **Why we reference it:** Memory and disk have vastly different speed characteristics (RAM ~100ns vs. SSD ~100µs vs. Cross-region Network ~100ms).
    - **How it changes the design:**
        - **Caching Layer:** Because disk reads are ~1,000× slower than RAM, read-heavy workloads _must_ place an in-memory cache in front of the database.
        - **Database Choice:** Low-latency requirements for fast key-value lookups force the choice of in-memory data stores (e.g., Redis) over traditional disk-bound databases.
        - **Geographic Deployment:** Cross-region network latency (~100ms) means a user in Europe querying a database in the US will experience slowness. This forces **Multi-Region deployment** strategies where data is replicated geographically closer to the end user.
