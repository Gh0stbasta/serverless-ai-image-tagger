# ADR 007: Manual Bootstrapping of OIDC Infrastructure

## Status
Accepted

## Date
2026-01-08

## Context
The project uses GitHub Actions with OIDC for authentication. A `cdk destroy` operation removed the IAM OIDC Provider and the deployment role, creating a "circular dependency" where the pipeline cannot deploy the permissions it needs to run.

## Decision
We will perform a one-time manual deployment from a local developer machine using administrative credentials. 

**Strategic Justification:**
This approach is accepted for the **MVP (Minimum Viable Product)** phase to increase **Time-to-Market**. Instead of engineering a complex automated recovery now, we prioritize restoring the feature-delivery pipeline immediately.

## Consequences
- **Positive:** Restores the CI/CD pipeline immediately; allows focus on frontend/backend features.
- **Negative:** Manual step required after any full stack destruction.
- **Future Work:** Transition to a decoupled CI/CD infrastructure stack to prevent this in the production phase.