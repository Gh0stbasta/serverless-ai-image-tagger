import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

/**
 * Properties for ApiConstruct.
 * 
 * Architectural Decision: Using an interface to pass dependencies between constructs
 * following the dependency injection pattern. This enables loose coupling and makes
 * the construct testable in isolation by allowing mock dependencies to be injected
 * during testing.
 */
export interface ApiProps {
  /**
   * The DynamoDB table where image metadata and AI labels are stored.
   * The Lambda function needs read access to this table to retrieve images.
   */
  readonly table: dynamodb.ITable;

  /**
   * The IAM role for Lambda execution.
   * This should be the base execution role with CloudWatch Logs permissions.
   */
  readonly executionRole: iam.IRole;
}

/**
 * ApiConstruct
 * 
 * Architectural Decision: Encapsulates API Gateway and read Lambda resources following
 * ADR-005 (Separation of Concerns). This construct manages the HTTP API for reading
 * image metadata, isolating all API configuration details from the main stack.
 * 
 * This follows the Single Responsibility Principle and makes the API layer
 * independently testable and reusable.
 * 
 * Responsibilities:
 * - Creates and configures the HTTP API Gateway (API Gateway v2)
 * - Creates the GetImages Lambda function for reading all image metadata
 * - Grants IAM permissions for DynamoDB read access
 * - Wires the Lambda to API Gateway routes with proper CORS configuration
 * 
 * Cost Optimization:
 * - Uses HTTP API (API Gateway v2) instead of REST API for ~70% cost savings
 * - Pay-per-request pricing with no minimum fees
 * - Free tier includes 1M API calls per month for first 12 months
 */
export class ApiConstruct extends Construct {
  /**
   * Public property to expose the HTTP API Gateway.
   * This enables other constructs to reference the API for:
   * - Adding additional routes and integrations
   * - Configuring custom domains
   * - Setting up API Gateway stages
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  /**
   * Public property to expose the GetImages Lambda function.
   * This enables other constructs to:
   * - Configure additional API routes
   * - Grant additional IAM permissions as needed
   * - Set up monitoring and alarms
   */
  public readonly getImagesFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    /**
     * GetImages Lambda Function
     * 
     * Architectural Decision: Using NodejsFunction construct for TypeScript Lambda development.
     * This provides automatic bundling with esbuild, which is faster and produces smaller
     * bundles compared to webpack. The construct handles TypeScript compilation, dependency
     * bundling, and tree-shaking automatically.
     * 
     * Key Design Choices:
     * - Runtime Node.js 20.x: Latest LTS version with improved performance and native ESM support.
     * - Architecture ARM64 (Graviton2): Provides up to 34% better price-performance compared to x86_64.
     *   This is a FinOps optimization that reduces Lambda costs while improving performance.
     * - Memory 256 MB: Minimal allocation for simple DynamoDB Scan operations. This can be
     *   adjusted based on actual memory usage patterns observed in CloudWatch metrics.
     * - Timeout 30 seconds: Sufficient for scanning DynamoDB table and returning results.
     *   Can be reduced for production based on actual performance metrics.
     * - Bundling: esbuild with minification and source maps for efficient cold starts and debugging.
     * 
     * Security:
     * - Uses the base executionRole which provides CloudWatch Logs permissions.
     * - DynamoDB read permissions are granted after function creation using CDK's grant methods
     *   to implement least-privilege IAM policies.
     * 
     * Environment Variables:
     * - TABLE_NAME: DynamoDB table name for reading image metadata. Using table.tableName
     *   instead of hardcoding ensures the Lambda always references the correct table, even
     *   if the physical table name changes (e.g., during stack updates).
     * 
     * Cost Optimization:
     * - ARM64 architecture reduces costs by ~20% compared to x86_64.
     * - Minimal memory allocation (256 MB) keeps per-invocation costs low.
     * - esbuild bundling reduces bundle size, improving cold start times and reducing billable duration.
     */
    this.getImagesFunction = new NodejsFunction(this, 'GetImagesFunction', {
      description: 'Retrieves all analyzed images from DynamoDB for frontend display',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(__dirname, '..', '..', '..', 'backend', 'get-images.ts'),
      role: props.executionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: props.table.tableName,
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
         */
        forceDockerBundling: false,
      },
    });

    /**
     * IAM Permissions: Grant Lambda read access to DynamoDB.
     * 
     * Architectural Decision: Using CDK's grantReadData method to implement least-privilege access.
     * This method automatically creates a scoped IAM policy that grants only the necessary
     * read permissions for the Lambda function to operate.
     * 
     * grantReadData allows:
     * - dynamodb:BatchGetItem
     * - dynamodb:GetItem
     * - dynamodb:Query
     * - dynamodb:Scan
     * - dynamodb:DescribeTable
     * 
     * This is more restrictive than grantReadWriteData as it excludes write operations
     * (PutItem, UpdateItem, DeleteItem), following the principle of least privilege.
     * 
     * Cost Impact: No additional costs for IAM permissions. These are necessary for the Lambda
     * to function and follow AWS security best practices.
     */
    props.table.grantReadData(this.getImagesFunction);

    /**
     * HTTP API Gateway (API Gateway v2)
     * 
     * Architectural Decision: Using HTTP API (API Gateway v2) instead of REST API for:
     * - ~70% cost savings ($1.00 per million requests vs $3.50 for REST API)
     * - Lower latency and improved performance
     * - Simpler configuration with automatic CORS support
     * - Native JWT authorizer support for future authentication
     * 
     * CORS Configuration:
     * - allowOrigins: ['*'] - Allows requests from any origin for public API access
     * - allowMethods: [GET, OPTIONS] - Supports GET for data retrieval and OPTIONS for preflight
     * - allowHeaders: ['Content-Type'] - Standard headers for JSON API
     * 
     * For production, consider:
     * - Restricting allowOrigins to specific frontend domains
     * - Adding authentication using JWT authorizers or Lambda authorizers
     * - Enabling throttling and rate limiting to prevent abuse
     * - Setting up custom domains with Route 53
     * 
     * Cost Optimization:
     * - HTTP API is serverless with pay-per-request pricing
     * - No minimum fees or idle costs
     * - Free tier includes 1M API calls per month (first 12 months)
     * - Beyond free tier: $1.00 per million requests ($0.000001 per request)
     */
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'ServerlessImageTaggerApi',
      description: 'HTTP API for Serverless AI Image Tagger - read operations for image metadata',
      /**
       * CORS Configuration for Frontend Access
       * 
       * Architectural Decision: Enable CORS to allow frontend applications to call this API
       * from different origins. This is essential for modern single-page applications (SPAs)
       * hosted on different domains or during local development.
       * 
       * allowOrigins: ['*'] is used for simplicity in development. For production:
       * - Restrict to specific origins: ['https://yourdomain.com', 'https://www.yourdomain.com']
       * - Consider environment-based configuration (dev vs prod origins)
       * 
       * allowMethods: Only GET and OPTIONS are enabled as this is a read-only API endpoint.
       * OPTIONS is required for CORS preflight requests.
       * 
       * allowHeaders: Specifies which headers the client can send. Content-Type is required
       * for JSON API requests. Add Authorization if implementing authentication.
       */
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type'],
      },
    });

    /**
     * Lambda Integration for GetImages
     * 
     * Architectural Decision: Using HttpLambdaIntegration from aws-apigatewayv2-integrations
     * to wire the Lambda function to the API Gateway route. This integration:
     * - Automatically configures the necessary permissions for API Gateway to invoke Lambda
     * - Handles request/response transformations between HTTP and Lambda event formats
     * - Supports payload format version 2.0 by default (simpler event structure)
     * 
     * The integration is created separately from the route to allow reuse if needed
     * and to follow the single responsibility principle.
     */
    const getImagesIntegration = new HttpLambdaIntegration(
      'GetImagesIntegration',
      this.getImagesFunction
    );

    /**
     * API Gateway Route: GET /images
     * 
     * Architectural Decision: Creating a simple REST-style route for retrieving all images.
     * The path '/images' follows RESTful conventions where:
     * - GET /images - Retrieves a collection of all images
     * - Future: POST /images - Could create a new image (upload)
     * - Future: GET /images/{id} - Could retrieve a specific image
     * - Future: DELETE /images/{id} - Could delete a specific image
     * 
     * Using the $default stage means the API is immediately available without additional
     * stage configuration. The URL format will be:
     * https://{api-id}.execute-api.{region}.amazonaws.com/images
     * 
     * For production, consider:
     * - Adding path parameters for filtering: /images?tag=dog&minConfidence=90
     * - Implementing pagination: /images?limit=50&offset=100
     * - Adding sorting: /images?sort=timestamp&order=desc
     */
    this.httpApi.addRoutes({
      path: '/images',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: getImagesIntegration,
    });
  }
}
