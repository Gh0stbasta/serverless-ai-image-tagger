# 3. DynamoDB Point-in-Time Recovery (Backup Strategy)

Date: 2026-01-07
Status: Accepted

## Context
DynamoDB offers "Point-in-Time Recovery" (PITR), which allows restoring the table to any second in the last 35 days.
- **Cost:** ~$0.20 per GB/month + Restore costs.
- **Current State:** The project is in MVP/Development phase. Data is transient (`RemovalPolicy.DESTROY`).

## Decision
1. **Development/MVP:** We will **DISABLE** PITR to minimize costs. Data loss in dev is acceptable and handled by infrastructure recreation.
2. **Production:** We will **ENABLE** PITR explicitly before the "Go Live". This is mandatory for disaster recovery compliance.

## Consequences
* **Positive:**
    * Saves costs during the initial development phase.
    * Ensures data safety once the application holds real user data.
* **Negative:**
    * Accidental deletion of data in the Development environment cannot be undone (Developers must rely on seed scripts).
* **Compliance:**
    * A specific deployment stage check (or context variable) must be implemented to distinguish between Dev and Prod configurations.
