---
title: "9 · Observability & Delivery"
description: The three pillars of observability (logs, metrics, traces), SLI/SLO/SLA error budgets, and safe deployment strategies like canary releases and feature flags.
---

You can't operate what you can't see. Observability is the difference between "the system is slow" and "the p99 of the payments service spiked because the inventory DB's connection pool is exhausted."

## The three pillars

- **Logs:** discrete, timestamped events. Detailed, great for debugging; expensive at volume (sample/aggregate). Use structured logging.
- **Metrics:** numeric time-series aggregates (request rate, error rate, latency percentiles, CPU). Cheap, ideal for dashboards and alerts.
- **Traces:** the path of a single request across all services, with timing per hop. **Distributed tracing** (trace IDs + span IDs; tools like Jaeger, Zipkin, OpenTelemetry) is how you debug latency in a microservices system.

## SLI / SLO / SLA and error budgets

- **SLI (Indicator):** a measured signal — e.g., "% of requests under 200ms."
- **SLO (Objective):** your internal target for that SLI — e.g., "99.9% under 200ms."
- **SLA (Agreement):** the external contract with consequences (refunds/penalties) if missed. Your SLO should be stricter than your SLA.
- **Error budget:** the allowed unreliability (100% − SLO). It turns reliability into a currency: if you've got budget left, ship features faster; if you've burned it, slow down and stabilize.

## Safe deployment

- **Rolling:** update instances in batches.
- **Blue-green:** run two identical environments; switch traffic from old (blue) to new (green) instantly, roll back by switching back.
- **Canary:** release to a small % of users first, watch metrics, then ramp up.
- **Feature flags:** decouple *deploy* from *release* — ship code dark, turn it on gradually, kill it instantly without a redeploy.
