import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/infra-stack';

/**
 * Test to verify S3 Hosting Bucket has PublicAccessBlock enabled.
 * This ensures the hosting bucket is private and cannot be accessed directly,
 * only through CloudFront with Origin Access Control.
 */
test('S3 Hosting Bucket has PublicAccessBlock enabled', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify hosting bucket has public access blocked
  // Note: There are multiple S3 buckets in the stack (upload bucket, hosting bucket, deployment bucket)
  // We need to find the one that doesn't have CORS (that's the hosting bucket)
  const buckets = template.findResources('AWS::S3::Bucket');
  
  let foundHostingBucket = false;
  for (const [logicalId, resource] of Object.entries(buckets)) {
    // The hosting bucket is the one without CORS configuration and has public access blocked
    if (!resource.Properties.CorsConfiguration) {
      const publicAccessConfig = resource.Properties.PublicAccessBlockConfiguration;
      if (publicAccessConfig && 
          publicAccessConfig.BlockPublicAcls === true &&
          publicAccessConfig.BlockPublicPolicy === true &&
          publicAccessConfig.IgnorePublicAcls === true &&
          publicAccessConfig.RestrictPublicBuckets === true) {
        foundHostingBucket = true;
        break;
      }
    }
  }
  
  expect(foundHostingBucket).toBe(true);
});

/**
 * Test to verify CloudFront Distribution is created with S3 origin.
 * This ensures the distribution exists and is configured to serve content from S3.
 */
test('CloudFront Distribution is created with S3 origin', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFront distribution exists with S3 origin
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Enabled: true,
      DefaultRootObject: 'index.html',
      Origins: Match.arrayWith([
        Match.objectLike({
          S3OriginConfig: Match.objectLike({}),
        }),
      ]),
    },
  });
});

/**
 * Test to verify CloudFront Distribution has Origin Access Control configured.
 * OAC is the modern replacement for OAI and provides better security.
 */
test('CloudFront Distribution has Origin Access Control configured', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify OAC resource exists
  template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: {
      Name: Match.anyValue(),
      OriginAccessControlOriginType: 's3',
      SigningBehavior: 'always',
      SigningProtocol: 'sigv4',
    },
  });
  
  // THEN - Verify distribution references OAC
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      Origins: Match.arrayWith([
        Match.objectLike({
          OriginAccessControlId: Match.anyValue(),
        }),
      ]),
    },
  });
});

/**
 * Test to verify CloudFront Distribution forces HTTPS.
 * This ensures all traffic is encrypted in transit.
 */
test('CloudFront Distribution forces HTTPS', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify HTTPS is enforced
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultCacheBehavior: {
        ViewerProtocolPolicy: 'redirect-to-https',
      },
    },
  });
});

/**
 * Test to verify BucketDeployment is linked to CloudFront for cache invalidation.
 * This ensures users get fresh content after deployments.
 */
test('BucketDeployment is configured with CloudFront invalidation', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Custom::CDKBucketDeployment exists (created by BucketDeployment construct)
  // The BucketDeployment construct creates a custom resource that handles the deployment
  const customResources = template.findResources('Custom::CDKBucketDeployment');
  expect(Object.keys(customResources).length).toBeGreaterThan(0);
  
  // Verify the custom resource has distribution and paths for invalidation
  let foundDeploymentWithInvalidation = false;
  for (const [logicalId, resource] of Object.entries(customResources)) {
    if (resource.Properties.DistributionId && resource.Properties.DistributionPaths) {
      foundDeploymentWithInvalidation = true;
      expect(resource.Properties.DistributionPaths).toContain('/*');
      break;
    }
  }
  
  expect(foundDeploymentWithInvalidation).toBe(true);
});

/**
 * Test to verify SNS Topic exists for deployment notifications.
 * This ensures operators can receive notifications after deployments.
 */
test('SNS Topic exists for deployment notifications', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify SNS topic exists with correct name
  template.hasResourceProperties('AWS::SNS::Topic', {
    DisplayName: 'Serverless AI Image Tagger Deployment Notifications',
    TopicName: 'DeploymentNotifications',
  });
});

/**
 * Test to verify SNS Topic has an email subscription.
 * This ensures notifications will be delivered to the configured email.
 */
test('SNS Topic has email subscription', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify email subscription exists
  template.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: Match.anyValue(), // Email address from context or env var
  });
});

/**
 * Test to verify Custom Resource exists for deployment notification.
 * This custom resource publishes to SNS after deployment completes.
 */
test('Custom Resource exists for deployment notification', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify AwsCustomResource exists
  // The AwsCustomResource creates a Custom::AWS resource
  const customResources = template.findResources('Custom::AWS');
  
  let foundNotificationResource = false;
  for (const [logicalId, resource] of Object.entries(customResources)) {
    // Check if this custom resource is for SNS publish
    const serviceToken = resource.Properties?.ServiceToken;
    const createParams = resource.Properties?.Create;
    
    if (createParams && typeof createParams === 'object') {
      const paramsStr = JSON.stringify(createParams);
      if (paramsStr.includes('SNS') && paramsStr.includes('publish')) {
        foundNotificationResource = true;
        break;
      }
    }
  }
  
  expect(foundNotificationResource).toBe(true);
});

/**
 * Test to verify CloudFront URL is exported as CloudFormation output.
 * This output provides the URL operators can use to access the deployed application.
 */
test('CloudFront URL is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('CloudFrontUrl', {
    Description: 'URL of the CloudFront distribution for accessing the frontend application',
    Export: {
      Name: 'CloudFrontUrl',
    },
  });
});

/**
 * Test to verify CloudFront Distribution ID is exported.
 * This is useful for manual cache invalidations and monitoring.
 */
test('CloudFront Distribution ID is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('CloudFrontDistributionId', {
    Description: 'ID of the CloudFront distribution',
    Export: {
      Name: 'CloudFrontDistributionId',
    },
  });
});

/**
 * Test to verify CloudFront Distribution has SPA error handling.
 * This ensures React Router works correctly with direct URL access.
 */
test('CloudFront Distribution has SPA error handling configured', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify error responses redirect to index.html
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      CustomErrorResponses: Match.arrayWith([
        {
          ErrorCode: 404,
          ResponseCode: 200,
          ResponsePagePath: '/index.html',
        },
        {
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: '/index.html',
        },
      ]),
    },
  });
});

/**
 * Test to verify hosting resources have FinOps tags applied.
 * This ensures cost tracking and allocation is possible through AWS Cost Explorer.
 */
test('Hosting resources have FinOps tags applied', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFront distribution has tags
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    Tags: Match.arrayWith([
      { Key: 'Owner', Value: 'Gh0stbasta' },
      { Key: 'Project', Value: 'Serverless-AI-Tagger' },
    ]),
  });
});
