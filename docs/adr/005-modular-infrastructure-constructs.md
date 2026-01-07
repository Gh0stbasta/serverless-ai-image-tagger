# 5. Modular Infrastructure using Custom Constructs

Date: 2026-01-07
Status: Accepted

## Context
The `InfraStack` is growing rapidly. It currently contains definitions for S3, DynamoDB, Lambda, and IAM roles in a single file.
As the application grows (adding API Gateway, more Lambdas, Auth), this file will become unmaintainable ("God Class" anti-pattern).

## Decision
We will refactor the infrastructure into **Custom L3 Constructs** grouped by logical domain.
These constructs will be placed in `infra/lib/constructs/`.

**Proposed Modules:**
- `StorageConstruct`: Encapsulates S3 Bucket and Lifecycle Rules.
- `DatabaseConstruct`: Encapsulates DynamoDB Table and Settings.
- `ProcessingConstruct` (or `Compute`): Encapsulates Lambda Functions and wiring.

## Consequences
* **Positive:**
    * **Encapsulation:** Details (like S3 CORS rules) are hidden inside the construct. The Main Stack stays clean.
    * **Reusability:** Constructs can be reused in other stacks if needed.
    * **Testing:** We can write focused unit tests for each construct (matching ADR-004).
* **Negative:**
    * **Boilerplate:** Requires defining Interfaces to pass data (props) between constructs (e.g., passing the Bucket Object from Storage to Compute).
