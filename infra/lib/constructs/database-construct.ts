import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * DatabaseConstruct
 * 
 * Architectural Decision: Encapsulates DynamoDB database resources following ADR-005.
 * This construct manages the DynamoDB table for image metadata and AI-generated labels,
 * isolating all database configuration details from the main stack. This follows the
 * Single Responsibility Principle and makes the database layer independently testable
 * and reusable.
 * 
 * The construct exposes the table as a public property, allowing other constructs
 * to reference it for IAM permissions and data access operations.
 */
export class DatabaseConstruct extends Construct {
  /**
   * Public property to expose the DynamoDB table for image metadata.
   * This enables other constructs to reference the table for:
   * - Writing image metadata and AI labels after Rekognition analysis
   * - Querying metadata for API responses
   * - Implementing the table's grantReadWriteData() method for least-privilege IAM
   */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    /**
     * DynamoDB Table for storing image metadata and AI-generated labels.
     * Architectural Decision: Using DynamoDB for its serverless nature and
     * pay-per-request pricing model, which aligns perfectly with the event-driven
     * architecture and FinOps goals of this project.
     * 
     * Key Design Choices:
     * - Partition Key (imageId): A unique identifier for each uploaded image.
     *   Using a string type allows flexibility (UUID, timestamp-based, or S3 key).
     *   Provides even distribution of data across partitions for scalability.
     * 
     * - PAY_PER_REQUEST Billing: No provisioned capacity means:
     *   - Zero cost when idle (critical for FinOps)
     *   - Automatic scaling for any workload without throttling
     *   - No capacity planning required (NoOps benefit)
     *   - Cost scales linearly with actual usage
     * 
     * - removalPolicy.DESTROY: Enables complete stack cleanup in development.
     *   This MUST be changed to RETAIN for production to prevent accidental data loss.
     *   For MVP/development, this policy allows rapid iteration without orphaned resources.
     * 
     * Future Enhancements:
     * - Add GSI (Global Secondary Index) if querying by upload timestamp is needed
     * - Add point-in-time recovery (PITR) for production environments
     * - Consider DynamoDB Streams for real-time processing or analytics
     */
    this.table = new dynamodb.Table(this, 'Table', {
      partitionKey: {
        name: 'imageId',
        type: dynamodb.AttributeType.STRING,
      },
      /**
       * PAY_PER_REQUEST (On-Demand) billing mode.
       * This is a core FinOps decision that ensures we only pay for actual
       * read/write requests, not reserved capacity. Ideal for:
       * - Unpredictable or spiky workloads
       * - Development/staging environments with intermittent usage
       * - Applications with <1M requests/month (AWS Free Tier eligible)
       */
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      /**
       * DESTROY removal policy for development environments.
       * This allows `cdk destroy` to completely clean up all resources
       * without leaving orphaned DynamoDB tables that continue to incur costs.
       * 
       * IMPORTANT: Change to RemovalPolicy.RETAIN for production to prevent
       * accidental data loss during stack updates or deletion.
       */
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      /**
       * Table class STANDARD is the default and provides consistent performance.
       * For infrequent access patterns, consider STANDARD_INFREQUENT_ACCESS
       * to reduce storage costs by ~50% (but higher per-request costs).
       */
      tableClass: dynamodb.TableClass.STANDARD,
    });
  }
}
