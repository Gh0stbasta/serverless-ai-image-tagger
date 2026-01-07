# 1. Use Shared IAM Role for MVP

Date: 2026-01-07
Status: Accepted (Technical Debt)

## Context
We need to iterate fast for the MVP. Writing individual least-privilege policies for every function takes time.

## Decision
We will use a single shared IAM role for all Lambda functions initially.

## Consequences
* **Positive:** Faster development, less boilerplate code.
* **Negative:** Violates least privilege. If one function is compromised, all are compromised.
* **Mitigation:** Must be refactored before Production Release V1.0.
