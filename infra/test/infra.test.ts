import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
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
