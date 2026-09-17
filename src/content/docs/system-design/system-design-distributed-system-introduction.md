---
title: "System Design : Distributed System Introduction"
---


Distributed systems are multiple nodes/machines that interact with eachother giving the effect of a single unit to the end user. 

But why do we need to have multiple machines or distribute the application instead of having a single machine do the work ?


There are various reasons why you might want to distribute a database across multi‐ple machines:

1. Scalability : If your data volume, read load or write load grows bigger than a single machine can handle, you can potentially spread the load across multiple machines.
2. Fault tolerance/high availability : If your application needs to continue working, even if one machine (or several
machines, or the network, or an entire datacenter) goes down, you can use multiple machines to give you redundancy. When one fails, another one can take over.
3. Latency : If you have users around the world, you might want to have have servers at various locations worldwide, so that users can be served from a datacenter that is geographically close to them. That avoids the user having to wait for network packets to travel halfway around the world

There are two ways data is distributed across mltiple nodes: 

1. Replication : Keeping a copy of the same data on several different nodes, potentially at different locations. Replication privdes redundancy : if some nodes are unavailable, the data can still be served from the remaining nodes. Replication caan also help improve performance.
2. Paritioning: Splitting a big database into smaller subsets called partitions so that different partitioncs can be assigned to different nodes (also known as sharding).

Note this is different from partition failures or partitioning → which is network failures between multiple nodes that need to communicate with each other 


;l.xzhbg 

