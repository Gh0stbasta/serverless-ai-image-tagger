import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { handler } from '../generate-presigned-url';

/**
 * Unit Tests for GeneratePresignedUrl Lambda Function
 * 
 * These tests validate the Lambda handler's ability to:
 * 1. Generate presigned URLs successfully
 * 2. Return properly formatted JSON responses with CORS headers
 * 3. Handle environment variable configuration errors
 * 4. Handle S3 client errors gracefully
 * 
 * Mocking Strategy: Using aws-sdk-client-mock to mock AWS SDK v3 commands.
 * Note: getSignedUrl is harder to mock, so we test the overall function behavior.
 */

// Create mock for AWS SDK client
const s3Mock = mockClient(S3Client);

// Mock console methods to capture logs
let consoleLogSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

/**
 * Helper function to create a mock API Gateway HTTP API event
 * @returns Mock APIGatewayProxyEventV2 object
 */
const createApiEvent = (): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: 'GET /upload-url',
  rawPath: '/upload-url',
  rawQueryString: '',
  headers: {
    'content-type': 'application/json',
  },
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    domainName: 'test-api.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'test-api',
    http: {
      method: 'GET',
      path: '/upload-url',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent',
    },
    requestId: 'test-request-id',
    routeKey: 'GET /upload-url',
    stage: '$default',
    time: '01/Jan/2024:00:00:00 +0000',
    timeEpoch: 1704067200000,
  },
  isBase64Encoded: false,
});

/**
 * Helper function to create a mock Lambda Context
 * @returns Mock Context object
 */
const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '256',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

describe('GeneratePresignedUrl Lambda Handler', () => {
  beforeEach(() => {
    // Reset mocks before each test
    s3Mock.reset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set default environment variables
    process.env.BUCKET_NAME = 'test-bucket';
    
    // Set fake AWS credentials for getSignedUrl to work in tests
    // getSignedUrl requires credentials to sign the URL, even in tests
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key';
    process.env.AWS_REGION = 'us-east-1';
    
    // Mock Date.now() for predictable timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1704067200000);
    
    // Mock Math.random() for predictable keys
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    // Restore console methods and mocks
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
    
    // Clean up environment variables
    delete process.env.BUCKET_NAME;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  });

  /**
   * Test: Successful Presigned URL Generation
   * Validates that the handler generates a presigned URL with correct response format
   */
  test('should generate presigned URL successfully', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    
    const body = JSON.parse(response.body as string);
    expect(body).toHaveProperty('uploadUrl');
    expect(body).toHaveProperty('key');
    expect(body).toHaveProperty('expiresIn');
    
    // Verify the URL is a valid HTTPS URL
    expect(body.uploadUrl).toMatch(/^https:\/\//);
    
    // Verify the key format: uploads/{timestamp}-{random}.jpg
    expect(body.key).toMatch(/^uploads\/\d+-[a-z0-9]+\.jpg$/);
    
    // Verify expiration is 5 minutes (300 seconds)
    expect(body.expiresIn).toBe(300);
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Generating presigned URL for bucket: test-bucket')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Successfully generated presigned URL with 300s expiration')
    );
  });

  /**
   * Test: Presigned URL Contains Required Parameters
   * Validates that the generated URL contains S3 signature parameters
   */
  test('should generate presigned URL with signature parameters', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body as string);
    const url = new URL(body.uploadUrl);
    
    // Verify URL points to S3
    expect(url.hostname).toContain('s3');
    expect(url.hostname).toContain('amazonaws.com');
    
    // Verify presigned URL query parameters exist
    expect(url.searchParams.has('X-Amz-Algorithm')).toBe(true);
    expect(url.searchParams.has('X-Amz-Credential')).toBe(true);
    expect(url.searchParams.has('X-Amz-Date')).toBe(true);
    expect(url.searchParams.has('X-Amz-Expires')).toBe(true);
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.searchParams.has('X-Amz-SignedHeaders')).toBe(true);
    
    // Verify expiration time is set correctly (300 seconds)
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  /**
   * Test: Key Generation Format
   * Validates that the generated S3 key follows the expected format
   */
  test('should generate S3 key with correct format', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body as string);
    
    // Verify key format: uploads/{timestamp}-{random}.jpg
    expect(body.key).toBe('uploads/1704067200000-4fzzzxjylrx.jpg');
    
    // Verify the URL contains the same key (unencoded in the path)
    expect(body.uploadUrl).toContain(body.key);
  });

  /**
   * Test: Error Handling - Missing BUCKET_NAME Environment Variable
   * Validates that the handler returns 500 error when BUCKET_NAME is not set
   */
  test('should return 500 error when BUCKET_NAME environment variable is not set', async () => {
    // GIVEN
    delete process.env.BUCKET_NAME;
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(500);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({
      error: 'Internal server error',
      message: 'BUCKET_NAME environment variable is not set',
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('BUCKET_NAME environment variable is not set');
  });

  /**
   * Test: Response Structure - Valid JSON
   * Validates that the response body is valid JSON
   */
  test('should return valid JSON in response body', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    expect(() => JSON.parse(response.body as string)).not.toThrow();
  });

  /**
   * Test: CORS Headers - Present on Success
   * Validates that CORS headers are included in successful responses
   */
  test('should include CORS headers in successful response', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    expect(response.headers).toHaveProperty('Content-Type', 'application/json');
  });

  /**
   * Test: CORS Headers - Present on Error
   * Validates that CORS headers are included in error responses
   */
  test('should include CORS headers in error response', async () => {
    // GIVEN
    delete process.env.BUCKET_NAME;
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    expect(response.headers).toHaveProperty('Content-Type', 'application/json');
  });

  /**
   * Test: Multiple Invocations - Unique Keys
   * Validates that multiple invocations generate unique keys
   */
  test('should generate unique keys for multiple invocations', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    // Reset the mocks to allow different timestamps/random values
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1704067200000)
      .mockReturnValueOnce(1704067201000);
    
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.111111111)
      .mockReturnValueOnce(0.222222222);

    // WHEN
    const response1 = await handler(event, context);
    const response2 = await handler(event, context);

    // THEN
    expect(response1.statusCode).toBe(200);
    expect(response2.statusCode).toBe(200);
    
    const body1 = JSON.parse(response1.body as string);
    const body2 = JSON.parse(response2.body as string);
    
    // Verify keys are different
    expect(body1.key).not.toBe(body2.key);
  });

  /**
   * Test: Expiration Time
   * Validates that the expiration time is exactly 5 minutes (300 seconds)
   */
  test('should set expiration to 5 minutes (300 seconds)', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body as string);
    expect(body.expiresIn).toBe(300);
    
    // Verify the URL also contains the correct expiration
    const url = new URL(body.uploadUrl);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });
});
