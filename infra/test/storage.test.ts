import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/infra-stack';

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
