---
title: "Kubernetes"
---


# Kubernetes — Senior Backend Engineer Notes


## 1. What a Cluster Actually Is


A Kubernetes **cluster** is a group of machines (physical or virtual) pooled together into a single system you manage as one entity, rather than administering each server individually. It splits into two fundamentally different halves:

- **The Control Plane** — the brain. It makes every global decision: where a given workload should run, whether something has crashed and needs replacing, and how the cluster’s actual state compares to the state you’ve declared you want.
- **The Worker Nodes** — the muscle. These are the machines that actually run your application code inside containers, reporting their health and capacity back to the Control Plane continuously.

### Inside the Control Plane

- **API Server** — the single front door to the entire cluster. Every command (`kubectl apply`, a CI/CD pipeline’s deployment, another control-plane component reading state) goes through it; nothing talks to the cluster’s internals directly.
- **etcd** — a distributed key-value store holding the cluster’s entire desired and observed state (what should be running, what’s actually running). It’s the cluster’s single source of truth — if `etcd` is lost or corrupted, the cluster loses its memory of everything.
- **Scheduler** — decides which Worker Node a newly-created Pod should run on, based on resource availability, scheduling rules (like the Anti-Affinity rules covered below), and constraints.
- **Controller Manager** — runs a set of continuous reconciliation loops, each responsible for one type of resource (e.g., the ReplicaSet controller constantly checks “do I have as many Pod replicas as declared? If not, create more”). This reconciliation-loop model — constantly comparing desired state to actual state and correcting the difference — is the core mechanical idea underlying almost everything Kubernetes does.

### Inside a Worker Node

- **kubelet** — the agent running on every node that talks to the Control Plane, receives instructions about which Pods should run on this node, and makes sure containers are actually running and healthy (this is the component that actually calls your Readiness/Liveness/Startup probe endpoints).
- **kube-proxy** — handles network routing so traffic reaches the correct Pod, even as Pods are created, destroyed, and rescheduled with changing IPs.
- **Container Runtime** — the actual software (containerd is the modern standard) that pulls container images and runs them.

---


## 2. Lifecycle Probes


Kubernetes needs a way to know whether a container is actually healthy and ready to serve traffic, since a running process isn’t the same thing as a working one. Three distinct probes answer three distinct questions.


### Readiness Probe — “Can I do my job right now?”


Checks whether the application’s _dependencies_ are actually ready — is the database connected, is a startup cache fully loaded. In a Spring Boot app, this is commonly exposed as `/health/readiness`, returning `503 Service Unavailable` while still warming up. **If it fails, Kubernetes stops routing new traffic to that Pod but leaves the container running** — it’s treated as “not ready yet,” not “broken.”


### Liveness Probe — “Am I still conscious?”


Checks basic internal health — is the JVM responsive, is the process free of a thread deadlock — usually _without_ checking downstream dependencies at all. Exposed as something like `/health/liveness`, and as long as the basic web server can return `200 OK`, it passes. **If it fails, Kubernetes concludes the container is unrecoverably broken and physically restarts it.**


The clean mental split: **Readiness is a bouncer controlling traffic; Liveness is a paramedic deciding whether to restart.**


### Startup Probe — the fix for a dangerous interaction between the two


A Java or C# backend that takes a genuine 60 seconds to download a startup cache creates a trap: if the Liveness Probe starts checking immediately on boot with a 10-second timeout, Kubernetes concludes the app is dead before it’s even finished starting, restarts it, and the new instance hits the exact same 60-second cache download — repeating forever. This is **CrashLoopBackOff**, and it’s a genuinely common, entirely self-inflicted way to take down a service through probe misconfiguration alone.


The **Startup Probe** exists specifically to prevent this: it runs first, on boot, and _completely disables_ the Liveness and Readiness probes until it passes even once — effectively saying “give this app up to 3 minutes to turn on, however long it needs.” Once it passes a single time, it disappears entirely, and normal Liveness/Readiness checking takes over from then on.


**A senior-level operational habit worth naming explicitly:** if a service’s boot time or dependency-check behavior ever changes (a bigger cache, a new blocking startup dependency), the Startup Probe’s timeout needs to be revisited — it’s not a “set once and forget” value, and a service that grows its own startup time without anyone updating this probe will eventually reintroduce the exact CrashLoopBackOff trap it was built to prevent.


---


## 3. Graceful Shutdown & the Load Balancer Race Condition


### The basic mechanism


When a deployment replaces an old Pod, Kubernetes stops routing new traffic to it and sends a polite **SIGTERM** signal (as opposed to the aggressive, un-catchable `SIGKILL`/`kill -9`). A well-behaved application catches SIGTERM and performs a **Graceful Shutdown**: stop accepting new work, finish any in-flight requests (a credit card charge already underway shouldn’t be abandoned mid-transaction), cleanly close database connections, then exit on its own terms.


**`terminationGracePeriodSeconds`** is the actual Kubernetes setting governing this — it defines how long the cluster waits after sending SIGTERM before giving up and forcibly sending SIGKILL (30 seconds by default). If your graceful shutdown logic (draining in-flight work, the delay covered below) can genuinely take longer than this, the setting needs to be raised explicitly, or Kubernetes will kill the process mid-cleanup regardless of how well-behaved your shutdown code is.


### The race condition graceful shutdown alone doesn’t solve


Two things happen at the _same millisecond_ on deployment: Kubernetes sends SIGTERM to the old Pod, **and** it tells the cloud Load Balancer to remove that Pod’s IP from its routing table. Updating a cloud Load Balancer across the network isn’t instant — it typically takes 1–2 seconds. During that window, the Load Balancer doesn’t yet know the Pod is shutting down and keeps routing brand-new users to it. **If the app stops accepting connections the instant it receives SIGTERM, those users hit a locked door** — a `502 Bad Gateway` or `500 Internal Server Error`, even though the application itself behaved perfectly correctly.


**The fix:** on receiving SIGTERM, the app deliberately **delays** locking its doors for 5–10 seconds — during which it stays fully open, accepting and normally processing any new requests that slip through — before actually stopping new connections, finishing existing work, and exiting. This “sleep” is not the app doing nothing; it’s the app intentionally staying available a little longer specifically to give the Load Balancer time to catch up and stop sending it traffic. Once that delay window passes, the Load Balancer has finished updating, no new traffic is arriving anyway, and the app can safely finish shutting down with zero dropped requests.


**A cleaner, more idiomatic way to implement this same delay, worth knowing as an alternative to hand-coding a sleep inside the application:** Kubernetes supports a **`preStop`** **lifecycle hook** — a command or HTTP call that Kubernetes runs automatically _before_ it even sends SIGTERM. A `preStop` hook that simply sleeps for the needed delay achieves the identical outcome without requiring the delay logic to live inside the application’s own signal-handling code — many production setups prefer this because it keeps the “wait for the load balancer” concern as infrastructure configuration rather than application logic, and it works uniformly across services written in different languages without each one needing to reimplement the same delay pattern.


---


## 4. Scheduling for High Availability


### The blast-radius problem


Running 3 replicas of a Pod provides no real redundancy if Kubernetes happens to schedule all 3 onto worker nodes inside the same AWS Availability Zone — a single zone’s power failure takes down every replica simultaneously, a total outage despite “having redundancy” on paper. Redundancy in _count_ means nothing without redundancy in _placement_ across independent failure domains.


### Pod Anti-Affinity & Topology Spread Constraints


Kubernetes can be given explicit rules for where Pods should (or shouldn’t) be scheduled relative to each other, using labels AWS automatically attaches to every worker node (like `topology.kubernetes.io/zone`, identifying its physical AZ).

- **Affinity** — attraction: e.g., placing a cache Pod on the same node as the web Pod that uses it, for lower network latency.
- **Anti-Affinity** (or the more modern, flexible **Topology Spread Constraints**) — repulsion: telling the scheduler “never place this Pod on a node/zone where another replica of this same application already runs,” which is exactly what guarantees the 3 replicas above end up spread across 3 separate physical data centers.

**Hard rules vs. soft rules — a genuinely important operational trade-off:**

- A **hard (required)** anti-affinity rule is absolute — if you scale to 4 Pods but only have 3 AZs available, Kubernetes will not violate the rule to make room. The 4th Pod sits in a **`Pending`** state indefinitely; Kubernetes explicitly prioritizes your safety rule over actually running the workload.
- A **soft (preferred)** rule tries its best to spread Pods out, but when it genuinely runs out of room to do so perfectly, it makes an exception and schedules the Pod anyway (doubling up in an existing zone) rather than leaving it stuck. This is why senior engineers often default to soft rules in practice — a Pod that’s imperfectly distributed but running usually beats one that’s correctly distributed but not running at all.

---


## 5. Resource Management (Requests, Limits & QoS)


This is core, standard senior-level Kubernetes knowledge worth having explicit even though the specific walkthrough of it wasn’t in this transcript:

- **Requests** — the amount of CPU/memory a container is guaranteed; the scheduler uses this number to decide which node has room for a Pod.
- **Limits** — the hard ceiling a container is not allowed to exceed. Exceeding the **memory** limit gets a container’s process killed outright by the kernel’s OOM (Out-Of-Memory) killer — visible in `kubectl describe pod` as **`OOMKilled`**. Exceeding the **CPU** limit doesn’t kill the process; instead, the kernel’s `cgroups`based throttling mechanism simply slows the container down, letting it use less CPU time than it’s asking for, which shows up as increased latency rather than a crash — a subtle and easy-to-misdiagnose difference between the two resource types.
- **Quality of Service (QoS) classes** — Kubernetes derives a QoS tier automatically from how requests/limits are set: **Guaranteed** (requests exactly equal limits for both CPU and memory — highest priority, least likely to be evicted under node pressure), **Burstable** (requests set below limits — normal, flexible default for most workloads), and **BestEffort** (no requests/limits set at all — first to be evicted if the node runs low on resources). Setting resource requests/limits thoughtfully isn’t just a performance tuning knob — it directly determines which Pods survive first when a node comes under memory pressure.

---


## 6. Core Building Blocks Worth Knowing (Not Covered in This Transcript, Standard Senior Baseline)


A few foundational pieces that any senior Kubernetes conversation assumes, even though this particular session moved past them into more advanced territory:

- **Deployments & ReplicaSets** — a Deployment declares the desired state (which image, how many replicas) and manages ReplicaSets underneath to reconcile actual Pods to that declared state, including rolling updates when the image changes.
- **Services** — a stable network identity/IP in front of a changing set of Pods. `ClusterIP` (internal-only), `NodePort` (exposes a port on every node), and `LoadBalancer` (provisions a cloud load balancer, e.g., an AWS ELB) are the three standard types, each opening the workload to progressively wider traffic.
- **Ingress** — an additional layer in front of Services that handles HTTP-level routing (host/path-based rules, TLS termination) across multiple Services, avoiding the need for a separate cloud Load Balancer per Service.
- **ConfigMaps & Secrets** — externalizing configuration and sensitive values from the container image itself, so the same image can be promoted across environments (dev/staging/prod) with different configuration injected at deploy time rather than baked into the build.
- **StatefulSets** — the alternative to a Deployment for workloads that need stable network identities and stable, per-replica persistent storage across restarts (databases, message queue brokers) — a plain Deployment’s Pods are treated as fully interchangeable, which breaks for anything genuinely stateful.
- **Horizontal Pod Autoscaler (HPA) and Cluster Autoscaler** — HPA adds/removes Pod replicas based on observed metrics (CPU, memory, or custom metrics); the Cluster Autoscaler operates one layer below that, adding or removing entire worker _nodes_ when existing nodes can’t fit the Pods HPA wants to schedule. The two operate independently but are meant to work together — HPA scaling out is only actually effective if the Cluster Autoscaler can provide the underlying node capacity for the new Pods to land on.
- **RBAC (Role-Based Access Control)** — governs which users/service accounts can perform which actions against the API Server; a foundational security control, since the API Server is the single front door to everything in the cluster.

---


## 7. Summary


A Kubernetes cluster splits into a Control Plane (API Server as the single front door, `etcd` as the source of truth, the Scheduler placing Pods, and the Controller Manager continuously reconciling desired vs. actual state) and Worker Nodes (running `kubelet`, `kube-proxy`, and the container runtime). Three lifecycle probes answer three distinct questions — Readiness (“can I serve traffic right now”) controls traffic flow without restarting anything, Liveness (“am I fundamentally broken”) triggers a restart, and Startup shields both during a slow boot to prevent CrashLoopBackOff. Safe shutdown requires more than catching SIGTERM cleanly — it requires deliberately delaying the shutdown (via application logic or a `preStop` hook) to cover the Load Balancer’s own 1–2 second propagation delay, governed by `terminationGracePeriodSeconds`. High availability requires spreading replicas across genuine failure domains (Availability Zones) using Anti-Affinity or Topology Spread Constraints, with a real trade-off between hard rules (safety over availability, risking `Pending` Pods) and soft rules (availability over perfect distribution). Resource requests/limits and the QoS tiers they produce determine both scheduling and eviction priority, with memory limit violations killing a Pod (`OOMKilled`) and CPU limit violations merely throttling it — a meaningfully different failure mode worth being able to diagnose on sight.

