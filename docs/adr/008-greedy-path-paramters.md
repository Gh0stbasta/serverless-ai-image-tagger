# ADR 008: Use of Greedy Path Parameters for Image Deletion

## Status
Accepted

## Context
Our images are stored in S3 using a hierarchical key structure (e.g., `uploads/image-123.jpg`). 
The initial API Gateway route was defined as `DELETE /images/{imageId}`. 
This caused a **404 Not Found** error when the frontend sent a request for an image ID containing a slash, because the API Gateway interpreted the slash as a new path segment rather than part of the variable.

## Decision
We decided to change the path parameter from a standard variable `{imageId}` to a **Greedy Path Parameter** `{imageId+}` in the AWS CDK infrastructure.

## Consequences
### Positive:
- The API Gateway now correctly captures the entire string after `/images/`, including slashes, and passes it to the Lambda function.
- We have a robust way to handle S3 keys without needing to complexly encode/decode or strip prefixes in the frontend.
### Negative:
- On the same hierarchical level, no other specific routes can be defined (e.g., `DELETE /images/all` would now conflict with the greedy parameter).
- The backend Lambda must ensure it properly handles the incoming string (e.g., `decodeURIComponent`).
