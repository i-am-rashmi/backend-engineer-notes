---
title: "AWS"
---


# AWS Architecture — Senior Backend Engineer Notes


## 1. Regions and Availability Zones


A **Region** (e.g., `us-east-1`, N. Virginia) is a large geographic area, but running an entire application inside a single physical data center within it creates a dangerous single point of failure — a severed fiber cable or a power grid outage at that one building takes the whole application offline.


AWS solves this by splitting every Region into multiple **Availability Zones (AZs)** — `us-east-1a`, `us-east-1b`, `us-east-1c` — each a genuinely distinct, physically separate location with:

- **Independent infrastructure** — its own power, cooling, and physical security, isolated from the other AZs in the same region.
- **Meaningful physical distance** — far enough apart to protect against a localized disaster (flood, regional power outage) affecting more than one AZ, but close enough to connect via ultra-low-latency dedicated fiber, so cross-AZ communication stays fast.

**This is the foundation of cloud high availability** — and it’s why the Kubernetes scheduling story (Pod Anti-Affinity, Topology Spread Constraints, covered fully in the Kubernetes notes) matters so much: running 3 replicas of a service provides zero real protection if all 3 happen to land in the same AZ, since a single AZ failure would then take out every replica simultaneously. **Redundancy in count means nothing without redundancy in placement across genuinely independent failure domains** — the core idea a senior engineer needs to internalize about blast radius.


**Multi-AZ vs. Multi-Region — a distinction worth being precise about, since the two solve different problems:** deploying across multiple AZs within one Region protects against a data-center-level failure and is the standard, expected baseline for any serious production workload — the latency cost is negligible given the low-latency fiber between AZs. Deploying across multiple _Regions_ protects against a far rarer, much larger-scale failure (an entire region going down, which does happen, rarely) or serves a genuine need to reduce latency for geographically distant users — but it’s a significantly heavier lift (data replication across regions, routing/failover logic, often duplicated infrastructure) and isn’t the default answer to “how do I get high availability.” Most systems need robust Multi-AZ; comparatively few genuinely need Multi-Region.


---


## 2. Load Balancers — The Piece Behind the Graceful Shutdown Story


The Elastic Load Balancer sits directly behind the SIGTERM/graceful-shutdown race condition covered in the Kubernetes notes — worth being precise about what it actually is and its own propagation delay, since that delay is exactly what the application-level shutdown delay is compensating for.


AWS offers a few distinct load balancer types worth distinguishing:

- **Application Load Balancer (ALB)** — operates at Layer 7 (HTTP/HTTPS), supports host- and path-based routing, and is the standard choice in front of a Kubernetes cluster’s Ingress layer for typical web/API traffic.
- **Network Load Balancer (NLB)** — operates at Layer 4 (raw TCP/UDP), used when extreme throughput/low latency matters more than HTTP-aware routing, or for non-HTTP protocols.
- **Classic Load Balancer (CLB)** — the legacy generation, largely superseded by ALB/NLB in modern architectures; mostly relevant to recognize in older systems rather than to choose for new ones.

**The propagation delay covered in the Kubernetes notes is a property of how these load balancers update their internal routing tables** — removing a target (a Pod’s IP) from an ALB’s target group isn’t instantaneous across the load balancer’s own distributed infrastructure, which is exactly why a Pod that stops accepting connections the instant it receives SIGTERM can still receive a handful of requests routed to it during that 1–2 second window. This is a genuine, physical distributed-systems propagation delay, not a design flaw in the load balancer — and the reason it’s the application (or its `preStop` hook) that has to compensate for it, not something AWS can simply make instantaneous.


---


## 3. EKS — Kubernetes on AWS


Since Kubernetes and AWS are typically discussed together, worth being explicit about where they meet: **Amazon EKS (Elastic Kubernetes Service)** is AWS’s managed Kubernetes offering — AWS operates the Control Plane (the API Server, `etcd`, Scheduler, and Controller Manager from the Kubernetes notes) as a managed service, while you provision and manage the Worker Nodes (either as EC2 instances you control directly, or via **Fargate**, AWS’s serverless compute option that removes node management entirely).


A few EKS-specific pieces worth knowing that connect directly back to the Kubernetes notes:

- **The** **`topology.kubernetes.io/zone`** **label** that Pod Anti-Affinity rules key off of is populated automatically by EKS based on which AZ each underlying EC2 worker node actually lives in — this is the concrete mechanism tying the Kubernetes-level scheduling story to the AWS-level AZ story.
- **IAM Roles for Service Accounts (IRSA)** — the standard, secure way for a Pod running in EKS to get AWS permissions (e.g., to read from S3, or write to a specific DynamoDB table) without embedding long-lived AWS credentials inside the container image or environment variables. A Kubernetes ServiceAccount is mapped to an IAM Role, and Pods using that ServiceAccount automatically receive short-lived, automatically-rotated credentials scoped to exactly the permissions that Role grants — directly analogous in spirit to why GitOps keeps cluster admin credentials inside the cluster rather than embedded in a CI server: credentials should live as close as possible to where they’re needed and nowhere else.
- **The Cluster Autoscaler (from the Kubernetes notes) interacts with an EC2 Auto Scaling Group** on AWS specifically — when Kubernetes needs more node capacity than currently exists, the Cluster Autoscaler adjusts the desired size of the underlying ASG, and AWS provisions new EC2 instances to join the cluster as new Worker Nodes.

---


## 4. Container Registry


**Amazon ECR (Elastic Container Registry)** is AWS’s managed Container Registry — the storage location a CI pipeline pushes a finished Docker image to (Section 2 of the CI/CD notes) and that a Kubernetes cluster (or the GitOps agent orchestrating it) pulls the image back down from during deployment. Worth knowing ECR integrates natively with IAM for access control — pulling an image from a private ECR repository requires the pulling principal (an EC2 instance role, or a Pod’s IRSA-mapped role) to have explicit IAM permission to do so, which is the AWS-native equivalent of the credential-scoping principle covered under IRSA above.


---


## 5. Networking Foundations Worth Having


Not covered in this session, but assumed baseline knowledge for anything running production workloads on AWS:

- **VPC (Virtual Private Cloud)** — an isolated virtual network within AWS where your resources live, with its own IP address range, subnets, and routing rules — the fundamental network boundary everything else (EKS nodes, load balancers, databases) is provisioned inside.
- **Public vs. Private Subnets** — a public subnet has a route to an Internet Gateway (reachable from the public internet, or able to reach out to it directly); a private subnet does not, typically reaching the internet (if needed at all) only through a NAT Gateway. Standard architecture keeps worker nodes and databases in private subnets, with only load balancers sitting in public subnets — minimizing what’s actually directly internet-reachable.
- **Security Groups** — act as a stateful firewall attached to individual resources (an EC2 instance, an RDS database), controlling exactly what inbound/outbound traffic is allowed at the resource level, layered on top of the broader VPC/subnet routing structure.

---


## 6. Summary


AWS’s Availability Zone model is the physical foundation the entire Kubernetes high-availability story depends on — genuinely isolated power/cooling/networking per AZ, connected by low-latency fiber, meaning multi-AZ deployment (not just multi-replica) is what actually protects against a real data-center-level failure. Multi-Region is a heavier, rarer tool for a different, larger-scale problem, not the default answer to “how do I get HA.” Load balancers (ALB for HTTP, NLB for raw TCP/UDP) have their own real, physical propagation delay when routing tables update — the exact delay the Kubernetes graceful-shutdown pattern exists to compensate for. EKS is AWS’s managed Kubernetes control plane, with IRSA as the standard mechanism for giving Pods scoped AWS permissions without embedding long-lived credentials, and the Cluster Autoscaler tying directly into EC2 Auto Scaling Groups for node-level capacity. ECR serves as the container registry endpoint connecting the CI/CD pipeline to the running cluster. VPCs, public/private subnets, and Security Groups form the baseline networking and access-control layer everything else in this stack is provisioned inside — worth having as foundational context even where the immediate conversation is about application-level architecture rather than networking specifically.

