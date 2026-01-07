import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * OpenID Connect Provider for GitHub Actions.
     * Architectural Decision: Using OIDC instead of long-lived AWS Access Keys
     * improves security by providing temporary credentials that are automatically
     * rotated and scoped to specific GitHub repositories/branches.
     * 
     * The thumbprint is GitHub's OIDC provider certificate thumbprint.
     * This allows GitHub Actions workflows to assume AWS IAM roles without
     * storing static credentials, following AWS security best practices.
     */
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      /**
       * Thumbprint for GitHub's OIDC provider.
       * This is a well-known, stable value provided by GitHub.
       * Verified: 2024-01-04
       * See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
       * Note: GitHub maintains this thumbprint and notifies of changes. Periodic verification recommended.
       */
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    /**
     * IAM Role for GitHub Actions to deploy CDK stack.
     * Architectural Decision: The role uses a trust policy that restricts access
     * to only this specific GitHub repository using OIDC federation.
     * This ensures that only workflows from 'Gh0stbasta/serverless-ai-image-tagger'
     * can assume this role, following the principle of least privilege.
     * 
     * The StringLike condition with wildcard allows any branch/tag in the repo
     * while still preventing access from other repositories or GitHub accounts.
     */
    const githubDeployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'GitHubActionsDeployRole',
      description: 'IAM Role for GitHub Actions to deploy the serverless-ai-image-tagger CDK stack',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': 'repo:Gh0stbasta/serverless-ai-image-tagger:*',
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        }
      ),
      /**
       * Using AdministratorAccess for initial setup.
       * TODO: In production, replace with granular CDK deployment permissions:
       * - cloudformation:*
       * - iam:PassRole (scoped to CDK execution role)
       * - s3:* (scoped to CDK staging bucket)
       * - lambda:*, dynamodb:*, rekognition:*, etc. (based on stack resources)
       * 
       * Rationale: AdministratorAccess allows rapid prototyping and ensures
       * CDK can create/modify any resource during development phase.
       * This should be refined before production deployment.
       */
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // Output the role ARN for use in GitHub Actions workflow configuration
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions deployment',
      exportName: 'GitHubActionsDeployRoleArn',
    });

    /**
     * Base IAM Role for Lambda function execution.
     * Architectural Decision: This role provides the minimum permissions required
     * for Lambda functions to write logs to CloudWatch. Additional permissions
     * should be granted on a per-function basis using role.addToPolicy() or
     * role.attachInlinePolicy() rather than adding them here.
     * 
     * The role uses AWSLambdaBasicExecutionRole managed policy which grants:
     * - logs:CreateLogGroup
     * - logs:CreateLogStream
     * - logs:PutLogEvents
     * 
     * This follows the principle of least privilege by starting with minimal
     * permissions and allowing specific functions to add only what they need.
     * No wildcard (*) permissions are granted at this base level.
     */
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: 'ServerlessAITagger-LambdaExecutionRole',
      description: 'Base execution role for Lambda functions with CloudWatch Logs permissions only',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Output the Lambda execution role ARN for reference and reuse
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: lambdaExecutionRole.roleArn,
      description: 'ARN of the base Lambda execution role (CloudWatch Logs only)',
      exportName: 'LambdaExecutionRoleArn',
    });

    /**
     * Export the Lambda execution role for use in other constructs.
     * This allows Lambda functions defined elsewhere in the stack or in
     * nested stacks to reference and use this role.
     */
    this.lambdaExecutionRole = lambdaExecutionRole;

    /**
     * S3 Bucket for image uploads.
     * Architectural Decision: This bucket is the entry point for the event-driven
     * architecture. Users upload images directly to S3 (via presigned URLs from
     * API Gateway), which then triggers Lambda processing via S3 event notifications.
     * 
     * Key Design Choices:
     * - S3_MANAGED encryption: AWS-managed keys for data at rest encryption without
     *   additional KMS costs. This is sufficient for MVP and provides automatic
     *   key rotation and compliance with many security standards.
     * - CORS: Allows browser-based uploads directly to S3, offloading traffic from
     *   the backend and reducing Lambda invocations (cost optimization).
     * - removalPolicy.DESTROY: Enables full cleanup during development. This MUST
     *   be changed to RETAIN for production to prevent accidental data loss.
     * - autoDeleteObjects: Works with removalPolicy.DESTROY to delete all objects
     *   when the stack is destroyed. This prevents "bucket not empty" errors during
     *   `cdk destroy` in development environments.
     * 
     * Security Consideration: Direct browser uploads are secured through presigned
     * URLs generated by the Auth Lambda, which enforces authentication and limits
     * file size/type. The bucket itself has no public access.
     */
    const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          /**
           * CORS Configuration for browser-based uploads.
           * Architectural Decision: Allow PUT for uploads and GET for downloads.
           * AllowedOrigins is set to ['*'] for MVP to simplify development across
           * different environments (localhost, DevContainer, Cloud9, etc.).
           * 
           * Production TODO: Replace with specific allowed origins:
           * - CloudFront distribution URL
           * - Custom domain (if configured)
           * This prevents CSRF attacks and unauthorized access from malicious sites.
           * 
           * AllowedHeaders ['*'] permits any header, which is necessary for presigned
           * URL uploads that include authorization headers and content-type.
           */
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'], // TODO: Restrict to specific origins in production
          allowedHeaders: ['*'],
          /**
           * ExposeHeaders allows the browser to read these headers from the response.
           * ETag is useful for verifying upload integrity and implementing conditional
           * requests in the frontend (e.g., "only download if changed").
           */
          exposedHeaders: ['ETag'],
          /**
           * maxAge: How long (in seconds) the browser can cache the CORS preflight
           * response. 3000 seconds = 50 minutes. This reduces the number of OPTIONS
           * requests, improving performance and reducing S3 request costs.
           */
          maxAge: 3000,
        },
      ],
      /**
       * Block all public access by default.
       * Even though CORS is enabled, the bucket remains private and requires
       * presigned URLs for access. This is a defense-in-depth measure.
       */
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      /**
       * Versioning is disabled for MVP to reduce storage costs.
       * Production consideration: Enable versioning to:
       * - Protect against accidental deletions
       * - Comply with audit/compliance requirements
       * - Enable rollback capabilities
       */
      versioned: false,
    });

    // Output the bucket name for use in frontend configuration and Lambda functions
    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: uploadBucket.bucketName,
      description: 'Name of the S3 bucket for image uploads',
      exportName: 'ImageUploadBucketName',
    });

    // Output the bucket ARN for IAM policy references
    new cdk.CfnOutput(this, 'UploadBucketArn', {
      value: uploadBucket.bucketArn,
      description: 'ARN of the S3 bucket for image uploads',
      exportName: 'ImageUploadBucketArn',
    });

    /**
     * Export the upload bucket for use in other constructs.
     * This allows Lambda functions and API Gateway to reference the bucket
     * when generating presigned URLs or processing S3 events.
     */
    this.uploadBucket = uploadBucket;

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
    const imageMetadataTable = new dynamodb.Table(this, 'ImageMetadataTable', {
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

    // Output the table name for use in Lambda functions and frontend configuration
    new cdk.CfnOutput(this, 'ImageMetadataTableName', {
      value: imageMetadataTable.tableName,
      description: 'Name of the DynamoDB table storing image metadata and AI labels',
      exportName: 'ImageMetadataTableName',
    });

    // Output the table ARN for IAM policy references
    new cdk.CfnOutput(this, 'ImageMetadataTableArn', {
      value: imageMetadataTable.tableArn,
      description: 'ARN of the DynamoDB table storing image metadata and AI labels',
      exportName: 'ImageMetadataTableArn',
    });

    /**
     * Export the metadata table for use in other constructs.
     * This allows Lambda functions to:
     * - Write image metadata and AI labels after Rekognition analysis
     * - Query metadata for API responses
     * - Implement the table's grantReadWriteData() method for least-privilege IAM
     */
    this.imageMetadataTable = imageMetadataTable;

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
    const imageProcessorFunction = new NodejsFunction(this, 'ImageProcessorFunction', {
      functionName: 'ServerlessAITagger-ImageProcessor',
      description: 'Processes uploaded images and generates AI labels using AWS Rekognition',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(__dirname, '..', '..', 'backend', 'image-processor.ts'),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: imageMetadataTable.tableName,
        BUCKET_NAME: uploadBucket.bucketName,
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

    // Output the Lambda function name for manual testing and monitoring
    new cdk.CfnOutput(this, 'ImageProcessorFunctionName', {
      value: imageProcessorFunction.functionName,
      description: 'Name of the ImageProcessor Lambda function',
      exportName: 'ImageProcessorFunctionName',
    });

    // Output the Lambda function ARN for reference in other stacks or workflows
    new cdk.CfnOutput(this, 'ImageProcessorFunctionArn', {
      value: imageProcessorFunction.functionArn,
      description: 'ARN of the ImageProcessor Lambda function',
      exportName: 'ImageProcessorFunctionArn',
    });

    /**
     * Export the ImageProcessor function for use in other constructs.
     * This allows:
     * - S3 bucket to set up event notifications
     * - API Gateway to invoke the function
     * - Other constructs to grant additional IAM permissions
     */
    this.imageProcessorFunction = imageProcessorFunction;
  }

  /**
   * Public property to expose the Lambda execution role.
   * This enables other constructs to reference the role and add
   * function-specific permissions as needed.
   */
  public readonly lambdaExecutionRole: iam.Role;

  /**
   * Public property to expose the S3 upload bucket.
   * This enables other constructs to reference the bucket for:
   * - Generating presigned URLs
   * - Setting up S3 event notifications
   * - Granting IAM permissions to Lambda functions
   */
  public readonly uploadBucket: s3.Bucket;

  /**
   * Public property to expose the DynamoDB table for image metadata.
   * This enables other constructs to reference the table for:
   * - Writing image metadata and AI-generated labels
   * - Querying metadata for API responses
   * - Granting IAM permissions to Lambda functions
   */
  public readonly imageMetadataTable: dynamodb.Table;

  /**
   * Public property to expose the ImageProcessor Lambda function.
   * This enables other constructs to:
   * - Set up S3 event notifications to trigger the function
   * - Configure API Gateway to invoke the function
   * - Grant additional IAM permissions as needed
   */
  public readonly imageProcessorFunction: NodejsFunction;
}
