import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../get-images';

/**
 * Unit Tests for GetImages Lambda Function
 * 
 * These tests validate the Lambda handler's ability to:
 * 1. Perform DynamoDB Scan operations successfully
 * 2. Return properly formatted JSON responses with CORS headers
 * 3. Handle empty result sets gracefully
 * 4. Handle DynamoDB errors with appropriate status codes
 * 5. Validate environment variable configuration
 * 
 * Mocking Strategy: Using aws-sdk-client-mock to mock AWS SDK v3 commands
 */

// Create mock for AWS SDK client
const dynamoDbMock = mockClient(DynamoDBDocumentClient);

// Mock console methods to capture logs
let consoleLogSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

/**
 * Helper function to create a mock API Gateway HTTP API event
 * @returns Mock APIGatewayProxyEventV2 object
 */
const createApiEvent = (): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: 'GET /images',
  rawPath: '/images',
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
      path: '/images',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent',
    },
    requestId: 'test-request-id',
    routeKey: 'GET /images',
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

describe('GetImages Lambda Handler', () => {
  beforeEach(() => {
    // Reset mocks before each test
    dynamoDbMock.reset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set default environment variables
    process.env.TABLE_NAME = 'test-table';
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    
    // Clean up environment variables
    delete process.env.TABLE_NAME;
  });

  /**
   * Test: Successful Scan - Multiple Items
   * Validates that the handler returns all items from DynamoDB with correct response format
   */
  test('should return all images from DynamoDB', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    const mockItems = [
      {
        imageId: 'image1.jpg',
        s3Url: 'https://bucket.s3.amazonaws.com/image1.jpg',
        labels: [
          { name: 'Dog', confidence: 95.5 },
          { name: 'Outdoor', confidence: 88.2 },
        ],
        timestamp: '2024-01-01T00:00:00.000Z',
      },
      {
        imageId: 'image2.jpg',
        s3Url: 'https://bucket.s3.amazonaws.com/image2.jpg',
        labels: [
          { name: 'Cat', confidence: 92.3 },
          { name: 'Indoor', confidence: 85.7 },
        ],
        timestamp: '2024-01-02T00:00:00.000Z',
      },
    ];
    
    dynamoDbMock.on(ScanCommand).resolves({
      Items: mockItems,
      Count: 2,
      ScannedCount: 2,
    });

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    
    const body = JSON.parse(response.body as string);
    expect(body).toEqual(mockItems);
    expect(body).toHaveLength(2);
    
    expect(consoleLogSpy).toHaveBeenCalledWith('Scanning DynamoDB table: test-table');
    expect(consoleLogSpy).toHaveBeenCalledWith('Successfully retrieved 2 images from DynamoDB');
  });

  /**
   * Test: Successful Scan - Empty Results
   * Validates that the handler returns an empty array when no items exist
   */
  test('should return empty array when no images exist', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    dynamoDbMock.on(ScanCommand).resolves({
      Items: [],
      Count: 0,
      ScannedCount: 0,
    });

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    
    const body = JSON.parse(response.body as string);
    expect(body).toEqual([]);
    expect(body).toHaveLength(0);
    
    expect(consoleLogSpy).toHaveBeenCalledWith('Successfully retrieved 0 images from DynamoDB');
  });

  /**
   * Test: Successful Scan - Undefined Items
   * Validates that the handler handles undefined Items property gracefully
   */
  test('should handle undefined Items property gracefully', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    dynamoDbMock.on(ScanCommand).resolves({
      Count: 0,
      ScannedCount: 0,
    });

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual([]);
  });

  /**
   * Test: DynamoDB Scan Parameters
   * Validates that the handler sends correct parameters to DynamoDB Scan
   */
  test('should call DynamoDB Scan with correct parameters', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    dynamoDbMock.on(ScanCommand).resolves({
      Items: [],
      Count: 0,
      ScannedCount: 0,
    });

    // WHEN
    await handler(event, context);

    // THEN
    expect(dynamoDbMock.calls()).toHaveLength(1);
    const scanCall = dynamoDbMock.call(0);
    const scanInput = scanCall.args[0].input;
    
    expect(scanInput).toEqual({
      TableName: 'test-table',
    });
  });

  /**
   * Test: Error Handling - Missing TABLE_NAME Environment Variable
   * Validates that the handler returns 500 error when TABLE_NAME is not set
   */
  test('should return 500 error when TABLE_NAME environment variable is not set', async () => {
    // GIVEN
    delete process.env.TABLE_NAME;
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
      message: 'TABLE_NAME environment variable is not set',
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('TABLE_NAME environment variable is not set');
    expect(dynamoDbMock.calls()).toHaveLength(0);
  });

  /**
   * Test: Error Handling - DynamoDB Scan Error
   * Validates that the handler handles DynamoDB errors gracefully
   */
  test('should handle DynamoDB Scan errors gracefully', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    const error = new Error('ProvisionedThroughputExceededException: Request rate limit exceeded');
    dynamoDbMock.on(ScanCommand).rejects(error);

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
      message: 'Failed to retrieve images from database',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to retrieve images from database:', error);
  });

  /**
   * Test: Error Handling - Service Unavailable Error
   * Validates that the handler handles AWS service errors gracefully
   */
  test('should handle service unavailable errors gracefully', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    const error = new Error('ServiceUnavailableException: Service is temporarily unavailable');
    dynamoDbMock.on(ScanCommand).rejects(error);

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(500);
    
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('Failed to retrieve images from database');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to retrieve images from database:', error);
  });

  /**
   * Test: Response Structure - Valid JSON
   * Validates that the response body is valid JSON
   */
  test('should return valid JSON in response body', async () => {
    // GIVEN
    const event = createApiEvent();
    const context = createMockContext();
    
    dynamoDbMock.on(ScanCommand).resolves({
      Items: [
        {
          imageId: 'test.jpg',
          s3Url: 'https://example.com/test.jpg',
          labels: [],
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ],
    });

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
    
    dynamoDbMock.on(ScanCommand).resolves({ Items: [] });

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
    const event = createApiEvent();
    const context = createMockContext();
    
    const error = new Error('Test error');
    dynamoDbMock.on(ScanCommand).rejects(error);

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    expect(response.headers).toHaveProperty('Content-Type', 'application/json');
  });
});
