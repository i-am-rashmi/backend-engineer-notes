---
title: "CI / CD"
---


# CI/CD — Senior Backend Engineer Notes


## 1. The Two Phases, Conceptually


CI/CD is the automated bridge between a developer’s `git push` and code actually running safely in production, removing the need to ever manually SSH into a server to deploy.

- **Continuous Integration (CI)** — the factory assembly line. Takes raw code, verifies it, and packages it into a finished, versioned artifact (a Docker image).
- **Continuous Deployment/Delivery (CD)** — the delivery truck. Takes that finished artifact and safely rolls it into the running cluster, without dropping user traffic in the process.

---


## 2. The CI Pipeline — In Order


When code is pushed, a CI server (GitHub Actions, GitLab CI, Jenkins) runs a fixed sequence of automated checks, each gating the next:

1. **Linting** — scans the raw source for syntax errors, missing variables, and formatting violations, before ever attempting to run anything. Cheapest and fastest check, so it runs first — no point spending compute on tests for code that doesn’t even parse correctly.
2. **Testing** — runs the automated unit test suite. A broken test fails the entire pipeline immediately and blocks the deployment from proceeding any further.
3. **Building** — once tests pass, the application and its dependencies are packaged into a Docker container image.
4. **Pushing** — the finished image is uploaded to a **Container Registry** (AWS ECR, Docker Hub), where it’s stored, versioned, and ready to be pulled by the deployment mechanism.

Once an image is sitting safely in the registry, CI’s job is complete — the pipeline has produced a verified, reproducible artifact, and CD takes over from there.


**Worth adding as a standard senior-level refinement to the Building step:** production Dockerfiles commonly use **multi-stage builds** — one build stage containing the full compiler/build toolchain and source code, and a separate, much smaller final stage that copies over only the compiled output. This keeps the final production image lean and avoids shipping build tools, source code, or intermediate artifacts into a running container, which matters both for image size (faster pulls, faster deploys) and for security surface area (nothing in the final image that isn’t strictly needed to run).


**Also worth naming: immutable image tags.** Tagging every build as `latest` and always deploying “whatever `latest` currently points to” is a common anti-pattern — it makes deployments non-reproducible (you can’t reliably redeploy “the exact version that was running last Tuesday”) and makes rollback ambiguous (rolling back to `latest` doesn’t mean anything once a newer build has been pushed). The standard senior practice is tagging each image immutably and uniquely — a semantic version, or the Git commit SHA — so every deployed artifact can be traced back to an exact, unambiguous build.


---


## 3. CD — Push vs. Pull (GitOps)


Once an image exists in the registry, how does it actually get into the live cluster? Two fundamentally different models exist, and the difference between them is one of the clearer dividing lines between junior and senior infrastructure thinking.


### The Push Model (older)


The CI server itself holds administrative credentials to the Kubernetes cluster and runs `kubectl apply` directly, reaching across the network to force the update into the cluster from outside.


### The Pull Model — GitOps (modern standard)


An agent (**ArgoCD** or **Flux**) runs _inside_ the cluster and continuously watches a Git repository containing the cluster’s desired-state YAML manifests. The CI server never touches the cluster at all — it only updates a line of text in that Git repo (`image: my-app:v2.0`). The in-cluster agent notices the change, pulls the new manifest, and updates the running Pods itself, from the inside.


**Analogy:** in the Push model, a Manager (CI server) sitting in a remote office has to unlock the Factory’s doors from outside and physically walk in to install a new machine. In the Pull model, the Manager only pins a new blueprint to a public bulletin board (the Git repo); a worker who already lives inside the Factory (the ArgoCD/Flux agent) notices the blueprint changed and brings the new machine in himself.


**The security payoff, stated precisely:** in the Push model, the CI server must hold “god mode” admin credentials to production — if a hacker compromises the CI server, they instantly own the entire cluster. In the Pull model, the CI server’s only permission is to edit text in a Git repository; the cluster’s actual admin credentials never leave the cluster at all, held only by the in-cluster agent. A compromised CI server in this model can, at worst, alter what text sits in a Git repo — it has no direct path to attacking the cluster itself.


**GitOps as a broader principle, worth extending beyond just application manifests:** the same “Git repo as the single source of truth, an in-cluster/in-environment agent reconciling to match it” pattern extends naturally to infrastructure itself — provisioning the underlying cloud resources (VPCs, load balancers, IAM roles) via Infrastructure-as-Code tools like **Terraform**, with changes reviewed and merged through the same pull-request workflow as application code, rather than made manually through a cloud console. The unifying idea across both is the same: **the Git repository is the one place a human is trusted to make a change; every actual system change flows from what’s committed there, never from a person or pipeline directly touching a live environment.**


---


## 4. Deployment Strategies — How the Actual Cutover Happens


Neither the session’s CI walkthrough nor its CD/GitOps walkthrough explicitly named the deployment strategy governing how old Pods are replaced with new ones — worth covering explicitly, since “get code out safely without dropping traffic” is the whole point of CD and the specific strategy chosen directly determines how that safety is achieved.

- **Rolling Update** — Kubernetes’ default strategy for a Deployment. Old Pods are terminated and new ones created gradually, a few at a time, so some capacity of both old and new versions is running simultaneously throughout the rollout. This is the strategy the graceful-shutdown and probe mechanics from the Kubernetes notes are directly built to support — Readiness Probes ensure new Pods aren’t sent traffic until they’re actually ready, and the SIGTERM/load-balancer-delay dance ensures old Pods being terminated don’t drop in-flight requests.
- **Blue-Green Deployment** — run two complete, independent environments (“Blue” = current production, “Green” = the new version), fully deployed and tested in isolation, then switch all traffic over to Green at once (typically via a load balancer or router change). Rollback is instant — just switch traffic back to Blue — at the cost of running two full production-sized environments simultaneously during the transition.
- **Canary Deployment** — release the new version to a small percentage of real traffic first (say, 5%), monitor error rates and latency closely, and only gradually increase that percentage toward 100% if the metrics stay healthy. This catches a bad deploy while it’s only affecting a small fraction of users, rather than everyone at once — the trade-off is added complexity in traffic-splitting and needing solid, real-time monitoring to actually make the “is this canary healthy” judgment call meaningfully.

**Rollback, tied back to GitOps specifically:** because the Pull model treats the Git repository as the literal source of truth for what should be running, rolling back a bad deployment is conceptually just reverting the Git commit that changed the image tag — the in-cluster agent notices the reverted state and reconciles the cluster back to the previous version automatically, the same mechanism that deployed the change in the first place, just running in reverse. This is a genuinely clean property of GitOps worth naming explicitly: rollback isn’t a special, separate operation — it’s the exact same reconciliation loop responding to the exact same kind of Git change.


---


## 5. Secrets in the Pipeline


A practical concern worth naming since it wasn’t covered but comes up in every real pipeline: CI/CD systems routinely need credentials — a container registry password, cloud provider credentials, database passwords for integration tests — and hardcoding these directly into pipeline YAML or environment variables checked into a repository is a common, serious real-world security incident source. Standard practice is a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, or the CI platform’s own encrypted secrets store) that the pipeline references at runtime rather than storing credentials in plaintext anywhere in version control — a direct extension of the same “credentials shouldn’t sit somewhere they can leak” principle behind why GitOps keeps cluster admin credentials inside the cluster rather than inside the CI server.


---


## 6. Summary


CI is a strict, ordered pipeline — lint, test, build, push — where each stage gates the next and a failure at any point blocks the deployment from proceeding, producing a versioned, immutable Docker image as its final output. CD then gets that image into production via one of two models: the older Push model, where the CI server holds direct admin access to the cluster (a real, concentrated security risk if that server is ever compromised), or the modern GitOps Pull model, where an in-cluster agent (ArgoCD/Flux) watches a Git repository and reconciles the cluster to match it, keeping admin credentials inside the cluster at all times and reducing a compromised CI server’s blast radius to “can edit text in a repo” rather than “can directly attack production.” The actual cutover between old and new versions is governed by a deployment strategy — Rolling Update (Kubernetes’ default, gradual replacement), Blue-Green (instant, all-at-once switch with easy rollback but doubled infrastructure), or Canary (small-percentage exposure with gradual rollout, catching bad deploys early at the cost of monitoring complexity) — and GitOps makes rollback itself trivial, since it’s just the same reconciliation loop responding to a reverted Git commit. Multi-stage Docker builds, immutable image tags, and externalized secrets management round out the practices that separate a working pipeline from a genuinely production-grade one.

