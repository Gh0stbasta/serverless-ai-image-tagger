# ADR 006: Use DynamoDB Scan for Image Retrieval

## Status
Accepted

## Context
The system needs to provide a list of all analyzed images to the frontend via the `GetImages` Lambda function. The current data volume is low (MVP stage), and the requirement is to return all items without specific filtering or sorting.

## Decision
We will use the DynamoDB `Scan` operation to retrieve items from the `ImageMetadataTable`. 

## Rationale
* **Simplicity:** A `Scan` is the easiest way to retrieve all items without defining complex Global Secondary Indexes (GSIs).
* **Speed of Implementation:** It meets the current requirements with minimal configuration.
* **Cost:** At low data volumes (under 1MB), the cost and performance impact are negligible.

## Consequences
* **Performance Degradation:** As the table grows, a `Scan` will become increasingly slow because it reads every item in the table.
* **Cost Increase:** DynamoDB charges for the amount of data read. Scanning a large table is significantly more expensive than a targeted `Query`.
* **Scalability Limit:** Once the result set exceeds 1MB, DynamoDB will paginate the results, requiring the Lambda to implement recursive scanning or return incomplete data.

## Future Mitigation
When the table size increases or specific search/filter requirements arise (e.g., "Show only dogs"), we will implement:
1. **Global Secondary Indexes (GSI)** for targeted queries.
2. **Pagination** (Limit/LastEvaluatedKey) in the API response.
