import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as sns from 'aws-cdk-lib/aws-sns';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { StorageConstruct, DatabaseConstruct, ProcessingConstruct, ApiConstruct, HostingConstruct, NotificationConstruct } from './constructs';

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
     * Storage Layer: S3 Bucket for image uploads.
     * Architectural Decision: Using StorageConstruct to encapsulate all S3 bucket
     * configuration following ADR-005. This promotes separation of concerns and
     * makes the storage layer independently testable and reusable.
     * 
     * Note: Using 'Upload' as the construct ID with 'Bucket' as the resource ID
     * to preserve the CloudFormation Logical ID 'UploadBucket' and avoid resource
     * replacement during the refactoring.
     */
    const storage = new StorageConstruct(this, 'Upload');
    this.uploadBucket = storage.uploadBucket;

    /**
     * Database Layer: DynamoDB Table for image metadata.
     * Architectural Decision: Using DatabaseConstruct to encapsulate all DynamoDB
     * configuration following ADR-005. This promotes separation of concerns and
     * makes the database layer independently testable and reusable.
     * 
     * Note: Using 'ImageMetadata' as the construct ID with 'Table' as the resource ID
     * to preserve the CloudFormation Logical ID 'ImageMetadataTable' and avoid resource
     * replacement during the refactoring.
     */
    const database = new DatabaseConstruct(this, 'ImageMetadata');
    this.imageMetadataTable = database.table;

    /**
     * Processing Layer: Lambda Function for image processing.
     * Architectural Decision: Using ProcessingConstruct to encapsulate all Lambda
     * configuration following ADR-005. Dependencies are injected through props,
     * enabling loose coupling and testability.
     * 
     * The ProcessingConstruct now handles all processing-related concerns including:
     * - Lambda function configuration
     * - IAM permissions for S3 read and DynamoDB write
     * - S3 event notification to trigger the Lambda on image uploads
     * 
     * This follows the Single Responsibility Principle by keeping all processing
     * logic encapsulated within the ProcessingConstruct.
     * 
     * Note: Using 'ImageProcessor' as the construct ID with 'Function' as the resource ID
     * to preserve the CloudFormation Logical ID 'ImageProcessorFunction' and avoid resource
     * replacement during the refactoring.
     */
    const processing = new ProcessingConstruct(this, 'ImageProcessor', {
      bucket: storage.uploadBucket,
      table: database.table,
      executionRole: lambdaExecutionRole,
    });
    this.imageProcessorFunction = processing.imageProcessorFunction;

    /**
     * API Layer: HTTP API Gateway and Read Lambda Functions.
     * Architectural Decision: Using ApiConstruct to encapsulate all API Gateway
     * configuration following ADR-005. This promotes separation of concerns and
     * makes the API layer independently testable and reusable.
     * 
     * The ApiConstruct manages:
     * - HTTP API Gateway (API Gateway v2) for cost-effective API hosting
     * - GetImages Lambda function for retrieving all image metadata
     * - CORS configuration for frontend access
     * - IAM permissions for DynamoDB read access
     * 
     * Using HTTP API instead of REST API provides ~70% cost savings while
     * maintaining the required functionality for this read-only endpoint.
     * 
     * Note: Using 'Api' as the construct ID with logical resource IDs following
     * the pattern '{ResourceType}{Purpose}' (e.g., HttpApi, GetImagesFunction).
     */
    const api = new ApiConstruct(this, 'Api', {
      table: database.table,
      bucket: storage.uploadBucket,
      executionRole: lambdaExecutionRole,
    });
    this.httpApi = api.httpApi;
    this.getImagesFunction = api.getImagesFunction;
    this.generatePresignedUrlFunction = api.generatePresignedUrlFunction;

    // CloudFormation Outputs - created at stack level to preserve exact Output IDs
    
    // S3 Bucket Outputs
    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: storage.uploadBucket.bucketName,
      description: 'Name of the S3 bucket for image uploads',
      exportName: 'ImageUploadBucketName',
    });

    new cdk.CfnOutput(this, 'UploadBucketArn', {
      value: storage.uploadBucket.bucketArn,
      description: 'ARN of the S3 bucket for image uploads',
      exportName: 'ImageUploadBucketArn',
    });

    // DynamoDB Table Outputs
    new cdk.CfnOutput(this, 'ImageMetadataTableName', {
      value: database.table.tableName,
      description: 'Name of the DynamoDB table storing image metadata and AI labels',
      exportName: 'ImageMetadataTableName',
    });

    new cdk.CfnOutput(this, 'ImageMetadataTableArn', {
      value: database.table.tableArn,
      description: 'ARN of the DynamoDB table storing image metadata and AI labels',
      exportName: 'ImageMetadataTableArn',
    });

    // Lambda Function Outputs
    new cdk.CfnOutput(this, 'ImageProcessorFunctionName', {
      value: processing.imageProcessorFunction.functionName,
      description: 'Name of the ImageProcessor Lambda function',
      exportName: 'ImageProcessorFunctionName',
    });

    new cdk.CfnOutput(this, 'ImageProcessorFunctionArn', {
      value: processing.imageProcessorFunction.functionArn,
      description: 'ARN of the ImageProcessor Lambda function',
      exportName: 'ImageProcessorFunctionArn',
    });

    // API Gateway Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: api.httpApi.url || 'N/A',
      description: 'URL of the HTTP API Gateway for accessing image metadata',
      exportName: 'HttpApiUrl',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: api.httpApi.httpApiId,
      description: 'ID of the HTTP API Gateway',
      exportName: 'HttpApiId',
    });

    new cdk.CfnOutput(this, 'GetImagesFunctionName', {
      value: api.getImagesFunction.functionName,
      description: 'Name of the GetImages Lambda function',
      exportName: 'GetImagesFunctionName',
    });

    new cdk.CfnOutput(this, 'GetImagesFunctionArn', {
      value: api.getImagesFunction.functionArn,
      description: 'ARN of the GetImages Lambda function',
      exportName: 'GetImagesFunctionArn',
    });

    new cdk.CfnOutput(this, 'GeneratePresignedUrlFunctionName', {
      value: api.generatePresignedUrlFunction.functionName,
      description: 'Name of the GeneratePresignedUrl Lambda function',
      exportName: 'GeneratePresignedUrlFunctionName',
    });

    new cdk.CfnOutput(this, 'GeneratePresignedUrlFunctionArn', {
      value: api.generatePresignedUrlFunction.functionArn,
      description: 'ARN of the GeneratePresignedUrl Lambda function',
      exportName: 'GeneratePresignedUrlFunctionArn',
    });

    /**
     * Hosting Layer: CloudFront and S3 for production frontend hosting.
     * Architectural Decision: Using HostingConstruct to encapsulate all hosting
     * resources following ADR-005. This provides:
     * - Private S3 bucket for static assets
     * - CloudFront distribution with Origin Access Control (OAC)
     * - Automatic deployment and cache invalidation
     * 
     * The hosting construct ensures that:
     * - All traffic is served over HTTPS
     * - S3 bucket is not directly accessible (403 Forbidden)
     * - CloudFront cache is invalidated on every deployment
     * - SPA routing works correctly with 404 -> index.html handling
     */
    const hosting = new HostingConstruct(this, 'Hosting');
    this.distribution = hosting.distribution;
    this.hostingBucket = hosting.hostingBucket;

    /**
     * Notification Layer: SNS and Custom Resource for deployment notifications.
     * Architectural Decision: Using NotificationConstruct to send email notifications
     * after successful deployments. This improves DX by providing immediate feedback.
     * 
     * The notification email is retrieved from CDK context or environment variable.
     * If not provided, a default is used (though operators should configure this).
     * 
     * The custom resource depends on the bucket deployment to ensure notifications
     * are sent only after the entire deployment completes successfully.
     */
    const notificationEmail = this.node.tryGetContext('notificationEmail') 
      || process.env.NOTIFICATION_EMAIL 
      || 'devops@example.com'; // Default - should be overridden

    const notification = new NotificationConstruct(this, 'Notification', {
      notificationEmail,
      cloudfrontDomainName: hosting.distribution.distributionDomainName,
      deploymentDependencies: [hosting.bucketDeployment],
    });
    this.deploymentTopic = notification.topic;

    // CloudFormation Outputs for Hosting Resources
    
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${hosting.distribution.distributionDomainName}`,
      description: 'URL of the CloudFront distribution for accessing the frontend application',
      exportName: 'CloudFrontUrl',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: hosting.distribution.distributionId,
      description: 'ID of the CloudFront distribution',
      exportName: 'CloudFrontDistributionId',
    });

    new cdk.CfnOutput(this, 'HostingBucketName', {
      value: hosting.hostingBucket.bucketName,
      description: 'Name of the S3 bucket for frontend static assets',
      exportName: 'HostingBucketName',
    });

    new cdk.CfnOutput(this, 'DeploymentTopicArn', {
      value: notification.topic.topicArn,
      description: 'ARN of the SNS topic for deployment notifications',
      exportName: 'DeploymentTopicArn',
    });
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

  /**
   * Public property to expose the GeneratePresignedUrl Lambda function.
   * This enables other constructs to:
   * - Configure additional API routes
   * - Grant additional IAM permissions as needed
   * - Set up monitoring and alarms
   */
  public readonly generatePresignedUrlFunction: NodejsFunction;

  /**
   * Public property to expose the CloudFront distribution.
   * This enables other constructs to:
   * - Reference the distribution for invalidations
   * - Configure custom domains
   * - Set up monitoring and alarms
   */
  public readonly distribution: cloudfront.Distribution;

  /**
   * Public property to expose the hosting S3 bucket.
   * This enables other constructs to:
   * - Reference the bucket for deployments
   * - Grant IAM permissions
   * - Configure additional bucket settings
   */
  public readonly hostingBucket: s3.Bucket;

  /**
   * Public property to expose the deployment SNS topic.
   * This enables other constructs to:
   * - Subscribe additional endpoints
   * - Publish custom notifications
   * - Reference the topic ARN
   */
  public readonly deploymentTopic: sns.Topic;
}
