# 4. Modular Test Structure for Infrastructure

Date: 2026-01-07
Status: Accepted

## Context
The infrastructure test suite (`infra.test.ts`) has grown to over 800 lines. It currently tests disparate resources (S3, DynamoDB, Lambda, IAM) in a single monolithic file.
This "God Object" anti-pattern leads to:
- **Poor Readability:** Hard to find specific test cases.
- **Merge Conflicts:** Multiple developers working on different features clash in the same file.
- **Cognitive Load:** High effort to understand the test setup.

## Decision
We will split the monolithic test file into **domain-specific test files** located in the `infra/test/` directory.
Tests will be grouped by AWS service or logical domain (e.g., Storage, Compute, Database).

**Proposed Structure:**
- `infra/test/storage.test.ts` (S3)
- `infra/test/database.test.ts` (DynamoDB)
- `infra/test/compute.test.ts` (Lambda)
- `infra/test/security.test.ts` (IAM, Roles)

## Consequences
* **Positive:**
    * **Maintainability:** Smaller, focused files are easier to read and modify.
    * **Developer Experience:** Can run targeted tests (e.g., only database tests) faster.
    * **Scalability:** New features get their own test files without bloating existing ones.
* **Negative:**
    * Slight increase in file management overhead.
    * Requires ensuring the test runner (Jest) picks up all `*.test.ts` files (standard behavior).
