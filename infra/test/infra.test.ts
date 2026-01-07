import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as Infra from '../lib/infra-stack';

/**
 * Test to verify global FinOps tags are applied to all resources.
 * This test creates a simple S3 bucket in the stack and verifies
 * that the global tags are propagated to it.
 */
test('Global FinOps tags are applied to resources', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Create a test resource (S3 bucket) to verify tags are applied
  new s3.Bucket(stack, 'TestBucket', {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify that the S3 bucket has the required tags
  template.hasResourceProperties('AWS::S3::Bucket', {
    Tags: [
      { Key: 'Owner', Value: 'Gh0stbasta' },
      { Key: 'Project', Value: 'Serverless-AI-Tagger' },
    ],
  });
});

/**
 * Test to verify GitHub OIDC Provider is created with correct configuration.
 * This ensures secure deployment from GitHub Actions without long-lived credentials.
 * 
 * Note: CDK creates OIDC providers using a custom resource (Custom::AWSCDKOpenIdConnectProvider)
 * which then provisions the actual AWS::IAM::OIDCProvider in the account.
 */
test('GitHub OIDC Provider is created with correct configuration', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify OIDC Provider custom resource exists with correct properties
  template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
    Url: 'https://token.actions.githubusercontent.com',
    ClientIDList: ['sts.amazonaws.com'],
    ThumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
  });
});

/**
 * Test to verify GitHub Deploy Role is created with correct trust policy.
 * This ensures that only the specific GitHub repository can assume the role.
 */
test('GitHub Deploy Role is created with correct trust policy', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify IAM Role exists with correct assume role policy
  template.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'GitHubActionsDeployRole',
    Description: 'IAM Role for GitHub Actions to deploy the serverless-ai-image-tagger CDK stack',
    AssumeRolePolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringLike: {
              'token.actions.githubusercontent.com:sub': 'repo:Gh0stbasta/serverless-ai-image-tagger:*',
            },
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            },
          },
          Effect: 'Allow',
        }),
      ]),
    },
    ManagedPolicyArns: Match.arrayWith([
      Match.objectLike({
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp('.*AdministratorAccess'),
          ]),
        ]),
      }),
    ]),
  });
});

/**
 * Test to verify the CloudFormation output for the GitHub Deploy Role ARN.
 * This output is used in GitHub Actions workflows to configure role assumption.
 */
test('GitHub Deploy Role ARN is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('GitHubDeployRoleArn', {
    Description: 'ARN of the IAM role for GitHub Actions deployment',
    Export: {
      Name: 'GitHubActionsDeployRoleArn',
    },
  });
});

/**
 * Test to verify Lambda Execution Role is created with correct configuration.
 * This ensures Lambda functions have minimal permissions (CloudWatch Logs only)
 * following the principle of least privilege.
 */
test('Lambda Execution Role is created with CloudWatch Logs permissions only', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify IAM Role exists with correct configuration
  template.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'ServerlessAITagger-LambdaExecutionRole',
    Description: 'Base execution role for Lambda functions with CloudWatch Logs permissions only',
    AssumeRolePolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
        }),
      ]),
    },
    ManagedPolicyArns: Match.arrayWith([
      Match.objectLike({
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp('.*AWSLambdaBasicExecutionRole'),
          ]),
        ]),
      }),
    ]),
  });
});

/**
 * Test to verify Lambda Execution Role does not have wildcard permissions.
 * This test ensures the role follows least privilege principles and does not
 * grant broad administrative or wildcard permissions.
 */
test('Lambda Execution Role has no wildcard or administrative permissions', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify the role has ONLY AWSLambdaBasicExecutionRole and no admin policies
  // We check that the role doesn't have AdministratorAccess or PowerUserAccess
  const roles = template.findResources('AWS::IAM::Role');
  
  let foundLambdaRole = false;
  for (const [logicalId, resource] of Object.entries(roles)) {
    if (resource.Properties.RoleName === 'ServerlessAITagger-LambdaExecutionRole') {
      foundLambdaRole = true;
      const managedPolicies = JSON.stringify(resource.Properties.ManagedPolicyArns || []);
      
      // Verify no wildcard admin permissions
      expect(managedPolicies).not.toContain('AdministratorAccess');
      expect(managedPolicies).not.toContain('PowerUserAccess');
      
      // Verify only AWSLambdaBasicExecutionRole is attached
      expect(managedPolicies).toContain('AWSLambdaBasicExecutionRole');
    }
  }
  
  expect(foundLambdaRole).toBe(true);
});

/**
 * Test to verify Lambda Execution Role ARN is exported as CloudFormation output.
 * This allows the role to be referenced by other stacks or constructs.
 */
test('Lambda Execution Role ARN is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('LambdaExecutionRoleArn', {
    Description: 'ARN of the base Lambda execution role (CloudWatch Logs only)',
    Export: {
      Name: 'LambdaExecutionRoleArn',
    },
  });
});

/**
 * Test to verify Lambda Execution Role is publicly accessible from the stack.
 * This ensures other constructs can reference and extend the role as needed.
 */
test('Lambda Execution Role is exposed as a public property', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN & THEN - Verify the role is accessible as a public property
  expect(stack.lambdaExecutionRole).toBeDefined();
  // Note: roleName is a CDK token at synthesis time, so we verify the role exists
  // and has the correct type rather than checking the literal string value
  expect(stack.lambdaExecutionRole.roleArn).toBeDefined();
});

/**
 * Test to verify S3 Upload Bucket is created with S3_MANAGED encryption.
 * This ensures data at rest is encrypted using AWS-managed keys without
 * additional KMS costs, which is appropriate for the MVP phase.
 */
test('S3 Upload Bucket is created with S3_MANAGED encryption', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify bucket has S3-managed encryption
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256', // S3_MANAGED uses AES256
          },
        },
      ],
    },
  });
});

/**
 * Test to verify S3 Upload Bucket has correct CORS configuration.
 * This enables browser-based direct uploads to S3, which reduces backend load
 * and Lambda invocations (cost optimization).
 */
test('S3 Upload Bucket has correct CORS configuration', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CORS configuration allows PUT and GET from any origin
  template.hasResourceProperties('AWS::S3::Bucket', {
    CorsConfiguration: {
      CorsRules: [
        {
          AllowedMethods: ['GET', 'PUT'],
          AllowedOrigins: ['*'],
          AllowedHeaders: ['*'],
          ExposedHeaders: ['ETag'],
          MaxAge: 3000,
        },
      ],
    },
  });
});

/**
 * Test to verify S3 Upload Bucket has DESTROY removal policy.
 * This ensures the bucket and all objects are deleted when the stack is destroyed,
 * which is essential for development environments to avoid orphaned resources.
 */
test('S3 Upload Bucket has DESTROY removal policy with autoDeleteObjects', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify bucket has both encryption and CORS (our upload bucket) with deletion policy
  template.hasResource('AWS::S3::Bucket', {
    Properties: {
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          }),
        ]),
      }),
      CorsConfiguration: Match.objectLike({
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: ['GET', 'PUT'],
          }),
        ]),
      }),
    },
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

/**
 * Test to verify S3 Upload Bucket blocks all public access.
 * This is a security best practice - even with CORS enabled, the bucket
 * should remain private and only accessible via presigned URLs.
 */
test('S3 Upload Bucket blocks all public access', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify public access is blocked
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

/**
 * Test to verify S3 Upload Bucket has versioning disabled.
 * For MVP, versioning is disabled to reduce storage costs.
 * This should be enabled in production for data protection.
 */
test('S3 Upload Bucket has versioning disabled for MVP', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify versioning is not enabled (property should be absent or disabled)
  const buckets = template.findResources('AWS::S3::Bucket');
  
  for (const [logicalId, resource] of Object.entries(buckets)) {
    // Check our upload bucket (has CORS config)
    if (resource.Properties.CorsConfiguration) {
      // Versioning should either be absent or explicitly disabled
      const versioningConfig = resource.Properties.VersioningConfiguration;
      if (versioningConfig) {
        expect(versioningConfig.Status).not.toBe('Enabled');
      }
      // If absent, versioning is disabled by default (which is what we want)
    }
  }
});

/**
 * Test to verify S3 Upload Bucket name is exported as CloudFormation output.
 * This output is used by the frontend to construct presigned URL requests
 * and by Lambda functions to reference the bucket.
 */
test('S3 Upload Bucket name is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('UploadBucketName', {
    Description: 'Name of the S3 bucket for image uploads',
    Export: {
      Name: 'ImageUploadBucketName',
    },
  });
});

/**
 * Test to verify S3 Upload Bucket ARN is exported as CloudFormation output.
 * This output is used for IAM policy references and cross-stack dependencies.
 */
test('S3 Upload Bucket ARN is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('UploadBucketArn', {
    Description: 'ARN of the S3 bucket for image uploads',
    Export: {
      Name: 'ImageUploadBucketArn',
    },
  });
});

/**
 * Test to verify S3 Upload Bucket is exposed as a public property.
 * This ensures other constructs can reference the bucket for generating
 * presigned URLs, setting up event notifications, or granting IAM permissions.
 */
test('S3 Upload Bucket is exposed as a public property', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN & THEN - Verify the bucket is accessible as a public property
  expect(stack.uploadBucket).toBeDefined();
  expect(stack.uploadBucket.bucketArn).toBeDefined();
  expect(stack.uploadBucket.bucketName).toBeDefined();
});

/**
 * Test to verify S3 Upload Bucket has FinOps tags applied.
 * This ensures cost tracking and allocation is possible through AWS Cost Explorer.
 */
test('S3 Upload Bucket has FinOps tags applied', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify the S3 bucket has the required tags
  template.hasResourceProperties('AWS::S3::Bucket', {
    Tags: Match.arrayWith([
      { Key: 'Owner', Value: 'Gh0stbasta' },
      { Key: 'Project', Value: 'Serverless-AI-Tagger' },
    ]),
  });
});

/**
 * Test to verify DynamoDB Table is created with correct partition key.
 * The partition key must be 'imageId' with String type for unique image identification.
 */
test('DynamoDB Table is created with imageId as partition key', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify table has correct partition key
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    KeySchema: [
      {
        AttributeName: 'imageId',
        KeyType: 'HASH', // HASH = Partition Key
      },
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'imageId',
        AttributeType: 'S', // S = String
      },
    ],
  });
});

/**
 * Test to verify DynamoDB Table uses PAY_PER_REQUEST billing mode.
 * This ensures serverless pricing and automatic scaling without capacity planning.
 */
test('DynamoDB Table uses PAY_PER_REQUEST billing mode', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify billing mode is PAY_PER_REQUEST
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
  });
});

/**
 * Test to verify DynamoDB Table does NOT have provisioned throughput.
 * When using PAY_PER_REQUEST, provisioned throughput should be absent.
 */
test('DynamoDB Table does not have provisioned throughput in PAY_PER_REQUEST mode', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify no provisioned throughput is set
  const tables = template.findResources('AWS::DynamoDB::Table');
  
  for (const [logicalId, resource] of Object.entries(tables)) {
    // For PAY_PER_REQUEST mode, these properties should be absent
    expect(resource.Properties.ProvisionedThroughput).toBeUndefined();
  }
});

/**
 * Test to verify DynamoDB Table has DESTROY removal policy.
 * This ensures the table is deleted when the stack is destroyed,
 * which is essential for development environments to avoid orphaned resources.
 */
test('DynamoDB Table has DESTROY removal policy', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify table has deletion policy
  template.hasResource('AWS::DynamoDB::Table', {
    DeletionPolicy: 'Delete',
    UpdateReplacePolicy: 'Delete',
  });
});

/**
 * Test to verify DynamoDB Table name is exported as CloudFormation output.
 * This output is used by Lambda functions to reference the table at runtime.
 */
test('DynamoDB Table name is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('ImageMetadataTableName', {
    Description: 'Name of the DynamoDB table storing image metadata and AI labels',
    Export: {
      Name: 'ImageMetadataTableName',
    },
  });
});

/**
 * Test to verify DynamoDB Table ARN is exported as CloudFormation output.
 * This output is used for IAM policy references and cross-stack dependencies.
 */
test('DynamoDB Table ARN is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('ImageMetadataTableArn', {
    Description: 'ARN of the DynamoDB table storing image metadata and AI labels',
    Export: {
      Name: 'ImageMetadataTableArn',
    },
  });
});

/**
 * Test to verify DynamoDB Table is exposed as a public property.
 * This ensures other constructs can reference the table for IAM permissions
 * and data access operations.
 */
test('DynamoDB Table is exposed as a public property', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN & THEN - Verify the table is accessible as a public property
  expect(stack.imageMetadataTable).toBeDefined();
  expect(stack.imageMetadataTable.tableArn).toBeDefined();
  expect(stack.imageMetadataTable.tableName).toBeDefined();
});

/**
 * Test to verify DynamoDB Table has FinOps tags applied.
 * This ensures cost tracking and allocation is possible through AWS Cost Explorer.
 */
test('DynamoDB Table has FinOps tags applied', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify the DynamoDB table has the required tags
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    Tags: Match.arrayWith([
      { Key: 'Owner', Value: 'Gh0stbasta' },
      { Key: 'Project', Value: 'Serverless-AI-Tagger' },
    ]),
  });
});

/**
 * Test to verify DynamoDB Table uses STANDARD table class.
 * This ensures consistent performance for the MVP phase.
 */
test('DynamoDB Table uses STANDARD table class', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify table class is STANDARD
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableClass: 'STANDARD',
  });
});

/**
 * Test to verify ImageProcessor Lambda Function is created with correct runtime.
 * This ensures the Lambda uses Node.js 20.x for latest features and performance.
 */
test('ImageProcessor Lambda Function is created with Node.js 20.x runtime', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda function has correct runtime
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'ServerlessAITagger-ImageProcessor',
    Runtime: 'nodejs20.x',
    Handler: 'index.handler',
  });
});

/**
 * Test to verify ImageProcessor Lambda Function uses ARM64 architecture.
 * This ensures cost optimization through Graviton2 processors.
 */
test('ImageProcessor Lambda Function uses ARM64 architecture for cost optimization', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda uses ARM64 (Graviton2)
  template.hasResourceProperties('AWS::Lambda::Function', {
    Architectures: ['arm64'],
  });
});

/**
 * Test to verify ImageProcessor Lambda Function has correct timeout and memory.
 * This ensures adequate resources for image processing while minimizing costs.
 */
test('ImageProcessor Lambda Function has correct timeout and memory configuration', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify timeout and memory settings
  template.hasResourceProperties('AWS::Lambda::Function', {
    Timeout: 30,
    MemorySize: 256,
  });
});

/**
 * Test to verify ImageProcessor Lambda Function has environment variables.
 * This ensures the function can access DynamoDB table and S3 bucket at runtime.
 */
test('ImageProcessor Lambda Function has correct environment variables', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify environment variables are set
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        TABLE_NAME: Match.anyValue(),
        BUCKET_NAME: Match.anyValue(),
      },
    },
  });
});

/**
 * Test to verify ImageProcessor Lambda Function uses the base execution role.
 * This ensures the function starts with minimal CloudWatch Logs permissions.
 */
test('ImageProcessor Lambda Function uses the base Lambda execution role', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda uses the correct role
  // The role should be a reference to the LambdaExecutionRole created earlier
  template.hasResourceProperties('AWS::Lambda::Function', {
    Role: Match.objectLike({
      'Fn::GetAtt': Match.arrayWith([
        Match.stringLikeRegexp('LambdaExecutionRole'),
      ]),
    }),
  });
});

/**
 * Test to verify ImageProcessor Lambda Function name is exported as CloudFormation output.
 * This output is used for manual testing and monitoring.
 */
test('ImageProcessor Lambda Function name is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('ImageProcessorFunctionName', {
    Description: 'Name of the ImageProcessor Lambda function',
    Export: {
      Name: 'ImageProcessorFunctionName',
    },
  });
});

/**
 * Test to verify ImageProcessor Lambda Function ARN is exported as CloudFormation output.
 * This output is used for cross-stack references and IAM policies.
 */
test('ImageProcessor Lambda Function ARN is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('ImageProcessorFunctionArn', {
    Description: 'ARN of the ImageProcessor Lambda function',
    Export: {
      Name: 'ImageProcessorFunctionArn',
    },
  });
});

/**
 * Test to verify ImageProcessor Lambda Function is exposed as a public property.
 * This ensures other constructs can reference the function.
 */
test('ImageProcessor Lambda Function is exposed as a public property', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN & THEN - Verify the function is accessible as a public property
  expect(stack.imageProcessorFunction).toBeDefined();
  expect(stack.imageProcessorFunction.functionArn).toBeDefined();
  expect(stack.imageProcessorFunction.functionName).toBeDefined();
});

/**
 * Test to verify ImageProcessor Lambda Function has FinOps tags applied.
 * This ensures cost tracking and allocation is possible through AWS Cost Explorer.
 */
test('ImageProcessor Lambda Function has FinOps tags applied', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify the Lambda function has the required tags
  template.hasResourceProperties('AWS::Lambda::Function', {
    Tags: Match.arrayWith([
      { Key: 'Owner', Value: 'Gh0stbasta' },
      { Key: 'Project', Value: 'Serverless-AI-Tagger' },
    ]),
  });
});
