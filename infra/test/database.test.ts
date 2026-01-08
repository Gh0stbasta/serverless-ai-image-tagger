import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/infra-stack';

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
