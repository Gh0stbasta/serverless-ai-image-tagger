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
