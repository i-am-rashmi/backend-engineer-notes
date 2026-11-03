---
title: "System Design : Idempotency and communication semantics"
---


Idempotency : Means if an operation is applied multiple times , it will still result in the same end state of the system as if it was the first time that operation has been applied. 
Non idempotent means every time the operation is performed it gives a new or different state to the system . 

While communicating between components in a distributed system, network reliability is not guranteed, application reliability is also not guranteed , so we have retries in place. 
When such retries occur there is a chance of duplication of events or operations there by causing a disastrous effect if idempotency of the operation is not handled. 

Now such event or task communication between components happen via event or message systems or apis 
Trying to ensure that an event is sent and processed exactly once is the challenge. 

To acheive this , especially sending only once is difficult to manage 
so we usually follow something called atlleast once semantic where it is guaranteed that the message or operation is processed atleast once - here we keep retrying till an ack is received - this is the standard in kafka - this is the delivery aspect of the task . And we attach a unique identifier and send it along with the request.

The processing aspect is where the challenge lies : 
Incase the event is not an dempotent task, we maintain an idempotency key and that key is checked in the consumer side and if the key is duplicate , the task is ignored but ack is sent 

