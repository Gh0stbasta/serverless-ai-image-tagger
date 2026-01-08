import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/infra-stack';

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
 * Test to verify Lambda has precise S3 read permissions via CDK grant.
 * This ensures the Lambda can read from the S3 bucket without wildcard permissions.
 */
test('Lambda has S3 read permissions granted via bucket.grantRead()', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify S3 read policy is attached to Lambda role
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith(['s3:GetObject*', 's3:GetBucket*', 's3:List*']),
          Effect: 'Allow',
          Resource: Match.arrayWith([
            Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('Upload.*'),
                'Arn',
              ]),
            }),
          ]),
        }),
      ]),
    },
  });
});

/**
 * Test to verify Lambda has precise DynamoDB write permissions via CDK grant.
 * This ensures the Lambda can write to the DynamoDB table without wildcard permissions.
 */
test('Lambda has DynamoDB write permissions granted via table.grantWriteData()', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify DynamoDB write policy is attached to Lambda role
  // Note: grantWriteData also includes DescribeTable for the Lambda to verify table status
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith([
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ]),
          Effect: 'Allow',
          Resource: Match.objectLike({
            'Fn::GetAtt': Match.arrayWith([
              Match.stringLikeRegexp('ImageMetadata.*'),
              'Arn',
            ]),
          }),
        }),
      ]),
    },
  });
});

/**
 * Test to verify Lambda has Rekognition DetectLabels permission via inline policy.
 * This ensures the Lambda can perform AI image analysis without excessive permissions.
 */
test('Lambda has rekognition:DetectLabels permission via inline policy', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Rekognition DetectLabels policy is attached to Lambda role
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'rekognition:DetectLabels',
          Effect: 'Allow',
          Resource: '*',
        }),
      ]),
    },
  });
});

/**
 * Helper function to verify no wildcard permissions in policies.
 * Checks all IAM policies in the template for forbidden wildcard patterns.
 */
function assertNoWildcardPermissions(
  template: Template,
  forbiddenPatterns: string[],
  allowedContains?: string[]
): void {
  const policies = template.findResources('AWS::IAM::Policy');
  
  for (const [logicalId, resource] of Object.entries(policies)) {
    const policyDoc = JSON.stringify(resource.Properties.PolicyDocument);
    
    // Check for forbidden patterns
    for (const pattern of forbiddenPatterns) {
      expect(policyDoc).not.toContain(pattern);
    }
    
    // If allowed patterns are specified, verify they exist when relevant
    if (allowedContains) {
      for (const allowed of allowedContains) {
        // Only check if the service is mentioned in the policy
        const serviceName = allowed.split(':')[0];
        if (policyDoc.includes(serviceName)) {
          expect(policyDoc).toContain(allowed);
        }
      }
    }
  }
}

/**
 * Test to verify Lambda does NOT have wildcard Rekognition permissions.
 * This ensures we're following least privilege by granting only DetectLabels.
 */
test('Lambda does NOT have wildcard Rekognition permissions', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify no policy contains rekognition:* or wildcard actions
  assertNoWildcardPermissions(
    template,
    ['rekognition:*'],
    ['rekognition:DetectLabels']
  );
});

/**
 * Test to verify Lambda does NOT have wildcard S3 or DynamoDB permissions.
 * This ensures we're using precise CDK grants, not wildcard permissions.
 */
test('Lambda does NOT have wildcard S3 or DynamoDB permissions', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify no policy contains s3:* or dynamodb:* actions
  assertNoWildcardPermissions(
    template,
    ['"s3:*"', '"dynamodb:*"', '"Action":"*"']
  );
});

/**
 * Test to verify DeleteImage Lambda has S3 delete permissions.
 * This ensures the Lambda can delete objects from S3 when users delete images.
 * 
 * Architectural Decision: Using bucket.grantDelete() to grant only s3:DeleteObject
 * permission, following the principle of least privilege. The Lambda should not
 * have wildcard (*) permissions on S3.
 */
test('DeleteImage Lambda has S3 delete permissions granted via bucket.grantDelete()', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify S3 delete policy is attached to DeleteImage Lambda role
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 's3:DeleteObject*',
          Effect: 'Allow',
          Resource: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([
                Match.objectLike({
                  'Fn::GetAtt': Match.arrayWith([
                    Match.stringLikeRegexp('Upload.*'),
                    'Arn',
                  ]),
                }),
                '/*',
              ]),
            ]),
          }),
        }),
      ]),
    },
  });
});

/**
 * Test to verify DeleteImage Lambda has DynamoDB delete permissions.
 * This ensures the Lambda can delete items from DynamoDB when users delete images.
 * 
 * Architectural Decision: Using table.grantWriteData() to grant DynamoDB write
 * permissions (including DeleteItem), following the principle of least privilege.
 * The Lambda should not have wildcard (*) permissions on DynamoDB.
 */
test('DeleteImage Lambda has DynamoDB delete permissions granted via table.grantWriteData()', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify DynamoDB write policy (includes DeleteItem) is attached
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith([
            'dynamodb:BatchWriteItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
          ]),
          Effect: 'Allow',
          Resource: Match.objectLike({
            'Fn::GetAtt': Match.arrayWith([
              Match.stringLikeRegexp('ImageMetadata.*'),
              'Arn',
            ]),
          }),
        }),
      ]),
    },
  });
});

/**
 * Test to verify DeleteImage Lambda function is created with correct configuration.
 * This ensures the Lambda has the necessary environment variables and configuration.
 */
test('DeleteImage Lambda function is created with correct environment variables', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda function exists with correct configuration
  template.hasResourceProperties('AWS::Lambda::Function', {
    Description: 'Deletes images from S3 and DynamoDB when user removes them from the gallery',
    Runtime: 'nodejs20.x',
    Timeout: 30,
    MemorySize: 256,
    Environment: {
      Variables: {
        BUCKET_NAME: Match.objectLike({
          Ref: Match.stringLikeRegexp('Upload.*'),
        }),
        TABLE_NAME: Match.objectLike({
          Ref: Match.stringLikeRegexp('ImageMetadata.*'),
        }),
      },
    },
  });
});
