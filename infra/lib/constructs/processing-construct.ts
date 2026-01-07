import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

/**
 * Properties for ProcessingConstruct.
 * 
 * Architectural Decision: Using an interface to pass dependencies between constructs
 * following ADR-005. This enables loose coupling and makes the construct testable
 * in isolation by allowing mock dependencies to be injected during testing.
 */
export interface ProcessingProps {
  /**
   * The S3 bucket where images are uploaded.
   * The Lambda function needs read access to this bucket to process images.
   */
  readonly bucket: s3.IBucket;

  /**
   * The DynamoDB table where image metadata and AI labels are stored.
   * The Lambda function needs write access to this table to store results.
   */
  readonly table: dynamodb.ITable;

  /**
   * The IAM role for Lambda execution.
   * This should be the base execution role with CloudWatch Logs permissions.
   */
  readonly executionRole: iam.IRole;
}

/**
 * ProcessingConstruct
 * 
 * Architectural Decision: Encapsulates Lambda compute resources following ADR-005.
 * This construct manages the Lambda function for image processing, isolating all
 * compute configuration details from the main stack. This follows the Single
 * Responsibility Principle and makes the processing layer independently testable
 * and reusable.
 * 
 * The construct accepts bucket and table references as props, enabling dependency
 * injection and loose coupling between infrastructure components.
 */
export class ProcessingConstruct extends Construct {
  /**
   * Public property to expose the ImageProcessor Lambda function.
   * This enables other constructs to:
   * - Set up S3 event notifications to trigger the function
   * - Configure API Gateway to invoke the function
   * - Grant additional IAM permissions as needed
   */
  public readonly imageProcessorFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ProcessingProps) {
    super(scope, id);

    /**
     * ImageProcessor Lambda Function
     * Architectural Decision: Using NodejsFunction construct for TypeScript Lambda development.
     * This provides automatic bundling with esbuild, which is faster and produces smaller
     * bundles compared to webpack. The construct handles TypeScript compilation, dependency
     * bundling, and tree-shaking automatically.
     * 
     * Key Design Choices:
     * - Runtime Node.js 20.x: Latest LTS version with improved performance and native ESM support.
     * - Architecture ARM64 (Graviton2): Provides up to 34% better price-performance compared to x86_64.
     *   This is a FinOps optimization that reduces Lambda costs while improving performance.
     * - Memory 256 MB: Minimum recommended for image processing initialization. This can be
     *   adjusted based on actual memory usage patterns observed in CloudWatch metrics.
     * - Timeout 30 seconds: Sufficient for downloading image from S3, calling Rekognition API,
     *   and storing results in DynamoDB. Can be increased if needed for large images.
     * - Bundling: esbuild with minification and source maps for efficient cold starts and debugging.
     * 
     * Security:
     * - Uses the base lambdaExecutionRole which provides only CloudWatch Logs permissions.
     * - Additional permissions (S3 read, DynamoDB write, Rekognition access) will be added
     *   in future iterations using least-privilege IAM policies.
     * 
     * Environment Variables:
     * - TABLE_NAME: DynamoDB table name for storing image metadata. Using table.tableName
     *   instead of hardcoding ensures the Lambda always references the correct table, even
     *   if the physical table name changes (e.g., during stack updates).
     * - BUCKET_NAME: S3 bucket name for reading uploaded images. Similarly uses bucket.bucketName
     *   for dynamic reference.
     * 
     * Cost Optimization:
     * - ARM64 architecture reduces costs by ~20% compared to x86_64.
     * - Minimal memory allocation (256 MB) keeps per-invocation costs low.
     * - esbuild bundling reduces bundle size, improving cold start times and reducing billable duration.
     */
    this.imageProcessorFunction = new NodejsFunction(this, 'Function', {
      functionName: 'ServerlessAITagger-ImageProcessor',
      description: 'Processes uploaded images and generates AI labels using AWS Rekognition',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(__dirname, '..', '..', '..', 'backend', 'image-processor.ts'),
      role: props.executionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        /**
         * esbuild bundling options for optimal Lambda performance.
         * - minify: Reduces bundle size for faster cold starts
         * - sourceMap: Enables stack traces with original TypeScript line numbers for debugging
         * - target: Ensures compatibility with Node.js 20 runtime
         * - forceDockerBundling: Disabled to allow local bundling with esbuild for faster builds
         *   and to avoid Docker platform issues during testing
         */
        forceDockerBundling: false,
      },
    });
  }
}
