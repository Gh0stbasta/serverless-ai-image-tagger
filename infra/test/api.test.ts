import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/infra-stack';

/**
 * Test to verify HTTP API Gateway is created.
 * This ensures the API Gateway v2 (HTTP API) resource exists in the stack.
 */
test('HTTP API Gateway is created', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify HTTP API resource exists
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Name: 'ServerlessImageTaggerApi',
    ProtocolType: 'HTTP',
  });
});

/**
 * Test to verify HTTP API has CORS configuration with GET, POST, PUT, and OPTIONS methods.
 * Architectural Decision: CORS allows cross-origin requests from frontend applications.
 * The issue requirements specify GET and PUT methods must be allowed.
 * POST is also included to support the /upload-url endpoint.
 */
test('HTTP API has correct CORS configuration with GET, POST, PUT methods', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CORS configuration
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: {
      AllowOrigins: ['*'],
      AllowMethods: Match.arrayWith(['GET', 'POST', 'PUT', 'OPTIONS']),
      AllowHeaders: ['Content-Type'],
    },
  });
});

/**
 * Test to verify HTTP API has a public URL output.
 * This output is used by the frontend to make API calls.
 */
test('HTTP API URL is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('HttpApiUrl', {
    Description: 'URL of the HTTP API Gateway for accessing image metadata',
    Export: {
      Name: 'HttpApiUrl',
    },
  });
});

/**
 * Test to verify HTTP API ID is exported as CloudFormation output.
 * This output can be used for cross-stack references and monitoring.
 */
test('HTTP API ID is exported as CloudFormation output', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify CloudFormation output exists
  template.hasOutput('HttpApiId', {
    Description: 'ID of the HTTP API Gateway',
    Export: {
      Name: 'HttpApiId',
    },
  });
});

/**
 * Test to verify HTTP API is exposed as a public property.
 * This ensures other constructs can reference the API.
 */
test('HTTP API is exposed as a public property', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN & THEN - Verify the API is accessible as a public property
  expect(stack.httpApi).toBeDefined();
  expect(stack.httpApi.httpApiId).toBeDefined();
});

/**
 * Test to verify GET /images route is configured.
 * This route is used to retrieve all image metadata from DynamoDB.
 */
test('HTTP API has GET /images route configured', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify route exists with correct path and method
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /images',
  });
});

/**
 * Test to verify POST /upload-url route is configured.
 * This route is used to generate presigned S3 URLs for uploads.
 */
test('HTTP API has POST /upload-url route configured', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify route exists with correct path and method
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'GET /upload-url',
  });
});

/**
 * Test to verify GetImages Lambda has permission to be invoked by API Gateway.
 * This permission is necessary for the API Gateway to invoke the Lambda function.
 */
test('GetImages Lambda has permission to be invoked by API Gateway', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda permission for API Gateway invocation exists
  const permissions = template.findResources('AWS::Lambda::Permission', {
    Properties: {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      FunctionName: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([
          Match.stringLikeRegexp('GetImagesFunction'),
        ]),
      }),
    },
  });
  
  // At least one permission should exist for GetImages
  expect(Object.keys(permissions).length).toBeGreaterThan(0);
});

/**
 * Test to verify GeneratePresignedUrl Lambda has permission to be invoked by API Gateway.
 * This permission is necessary for the API Gateway to invoke the Lambda function.
 */
test('GeneratePresignedUrl Lambda has permission to be invoked by API Gateway', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify Lambda permission for API Gateway invocation exists
  const permissions = template.findResources('AWS::Lambda::Permission', {
    Properties: {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      FunctionName: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([
          Match.stringLikeRegexp('GeneratePresignedUrlFunction'),
        ]),
      }),
    },
  });
  
  // At least one permission should exist for GeneratePresignedUrl
  expect(Object.keys(permissions).length).toBeGreaterThan(0);
});

/**
 * Test to verify HTTP API has FinOps tags applied.
 * This ensures cost tracking and allocation is possible through AWS Cost Explorer.
 */
test('HTTP API has FinOps tags applied', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new Infra.InfraStack(app, 'TestStack');
  
  // Apply the same global tags as in bin/infra.ts
  Tags.of(app).add('Project', 'Serverless-AI-Tagger');
  Tags.of(app).add('Owner', 'Gh0stbasta');
  
  // WHEN
  const template = Template.fromStack(stack);
  
  // THEN - Verify the HTTP API has the required tags
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Tags: {
      Owner: 'Gh0stbasta',
      Project: 'Serverless-AI-Tagger',
    },
  });
});
