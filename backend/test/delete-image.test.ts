import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { handler } from '../delete-image';

/**
 * Unit Tests for DeleteImage Lambda Function
 * 
 * These tests validate the Lambda handler's ability to:
 * 1. Delete objects from S3 successfully
 * 2. Delete items from DynamoDB successfully
 * 3. Return proper HTTP 204 No Content responses
 * 4. Handle missing imageId parameter with 400 Bad Request
 * 5. Handle missing environment variables with 500 Internal Server Error
 * 6. Handle S3 and DynamoDB errors gracefully
 * 7. Properly decode URL-encoded imageIds
 * 
 * Mocking Strategy: Using aws-sdk-client-mock to mock AWS SDK v3 commands
 */

// Create mocks for AWS SDK clients
const dynamoDbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Mock console methods to capture logs
let consoleLogSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

/**
 * Helper function to create a mock API Gateway HTTP API event for DELETE requests
 * @param imageId - The imageId path parameter (optional)
 * @returns Mock APIGatewayProxyEventV2 object
 */
const createDeleteApiEvent = (imageId?: string): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: 'DELETE /images/{imageId}',
  rawPath: imageId ? `/images/${imageId}` : '/images/',
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
      method: 'DELETE',
      path: imageId ? `/images/${imageId}` : '/images/',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent',
    },
    requestId: 'test-request-id',
    routeKey: 'DELETE /images/{imageId}',
    stage: '$default',
    time: '01/Jan/2024:00:00:00 +0000',
    timeEpoch: 1704067200000,
  },
  pathParameters: imageId ? { imageId } : undefined,
  isBase64Encoded: false,
});

/**
 * Helper function to create a mock Lambda Context
 * @returns Mock Context object
 */
const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-delete-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-delete-function',
  memoryLimitInMB: '256',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-delete-function',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

describe('DeleteImage Lambda Handler', () => {
  beforeEach(() => {
    // Reset mocks before each test
    dynamoDbMock.reset();
    s3Mock.reset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set default environment variables
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.TABLE_NAME = 'test-table';
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    
    // Clean up environment variables
    delete process.env.BUCKET_NAME;
    delete process.env.TABLE_NAME;
  });

  /**
   * Test: Successful Deletion
   * Validates that the handler deletes from both S3 and DynamoDB and returns 204
   */
  test('should successfully delete image from S3 and DynamoDB', async () => {
    // GIVEN
    const imageId = 'test-image.jpg';
    const event = createDeleteApiEvent(imageId);
    const context = createMockContext();
    
    s3Mock.on(DeleteObjectCommand).resolves({});
    dynamoDbMock.on(DeleteCommand).resolves({});

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(204);
    expect(response.headers).toEqual({
      'Access-Control-Allow-Origin': '*',
    });
    expect(response.body).toBeUndefined();
    
    // Verify S3 delete was called with correct parameters
    expect(s3Mock.calls()).toHaveLength(1);
    const s3Call = s3Mock.call(0);
    expect(s3Call.args[0].input).toEqual({
      Bucket: 'test-bucket',
      Key: 'test-image.jpg',
    });
    
    // Verify DynamoDB delete was called with correct parameters
    expect(dynamoDbMock.calls()).toHaveLength(1);
    const dynamoCall = dynamoDbMock.call(0);
    expect(dynamoCall.args[0].input).toEqual({
      TableName: 'test-table',
      Key: {
        imageId: 'test-image.jpg',
      },
    });
    
    expect(consoleLogSpy).toHaveBeenCalledWith(`Deleting image: ${imageId}`);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully deleted S3 object: ${imageId}`);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully deleted DynamoDB item: ${imageId}`);
  });

  /**
   * Test: URL-Encoded ImageId
   * Validates that the handler properly decodes URL-encoded imageIds
   */
  test('should handle URL-encoded imageId with special characters', async () => {
    // GIVEN
    const encodedImageId = 'test%20image%2Fwith%20spaces.jpg';
    const decodedImageId = 'test image/with spaces.jpg';
    const event = createDeleteApiEvent(encodedImageId);
    const context = createMockContext();
    
    s3Mock.on(DeleteObjectCommand).resolves({});
    dynamoDbMock.on(DeleteCommand).resolves({});

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(204);
    
    // Verify S3 delete was called with decoded imageId
    const s3Call = s3Mock.call(0);
    expect(s3Call.args[0].input.Key).toBe(decodedImageId);
    
    // Verify DynamoDB delete was called with decoded imageId
    const dynamoCall = dynamoDbMock.call(0);
    expect(dynamoCall.args[0].input.Key.imageId).toBe(decodedImageId);
    
    expect(consoleLogSpy).toHaveBeenCalledWith(`Deleting image: ${decodedImageId}`);
  });

  /**
   * Test: Missing ImageId Parameter
   * Validates that the handler returns 400 Bad Request when imageId is missing
   */
  test('should return 400 error when imageId is missing from path parameters', async () => {
    // GIVEN
    const event = createDeleteApiEvent(); // No imageId
    const context = createMockContext();

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(400);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({
      error: 'Bad Request',
      message: 'imageId is required in path parameters',
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Missing imageId in path parameters');
    
    // Verify no AWS SDK calls were made
    expect(s3Mock.calls()).toHaveLength(0);
    expect(dynamoDbMock.calls()).toHaveLength(0);
  });

  /**
   * Test: Missing BUCKET_NAME Environment Variable
   * Validates that the handler returns 500 error when BUCKET_NAME is not set
   */
  test('should return 500 error when BUCKET_NAME environment variable is not set', async () => {
    // GIVEN
    delete process.env.BUCKET_NAME;
    const event = createDeleteApiEvent('test-image.jpg');
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
    
    // Verify no AWS SDK calls were made
    expect(s3Mock.calls()).toHaveLength(0);
    expect(dynamoDbMock.calls()).toHaveLength(0);
  });

  /**
   * Test: Missing TABLE_NAME Environment Variable
   * Validates that the handler returns 500 error when TABLE_NAME is not set
   */
  test('should return 500 error when TABLE_NAME environment variable is not set', async () => {
    // GIVEN
    delete process.env.TABLE_NAME;
    const event = createDeleteApiEvent('test-image.jpg');
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
    
    // Verify no AWS SDK calls were made
    expect(s3Mock.calls()).toHaveLength(0);
    expect(dynamoDbMock.calls()).toHaveLength(0);
  });

  /**
   * Test: S3 Delete Error
   * Validates that the handler handles S3 delete errors gracefully
   */
  test('should handle S3 delete errors gracefully', async () => {
    // GIVEN
    const event = createDeleteApiEvent('test-image.jpg');
    const context = createMockContext();
    
    const error = new Error('AccessDenied: Access Denied');
    s3Mock.on(DeleteObjectCommand).rejects(error);

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
      message: 'Failed to delete image',
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting image:', error);
    
    // Verify S3 delete was called but DynamoDB delete was not (failed before reaching it)
    expect(s3Mock.calls()).toHaveLength(1);
    expect(dynamoDbMock.calls()).toHaveLength(0);
  });

  /**
   * Test: DynamoDB Delete Error
   * Validates that the handler handles DynamoDB delete errors gracefully
   */
  test('should handle DynamoDB delete errors gracefully', async () => {
    // GIVEN
    const event = createDeleteApiEvent('test-image.jpg');
    const context = createMockContext();
    
    s3Mock.on(DeleteObjectCommand).resolves({});
    
    const error = new Error('ResourceNotFoundException: Table not found');
    dynamoDbMock.on(DeleteCommand).rejects(error);

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
      message: 'Failed to delete image',
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting image:', error);
    
    // Verify both S3 and DynamoDB delete were called
    expect(s3Mock.calls()).toHaveLength(1);
    expect(dynamoDbMock.calls()).toHaveLength(1);
  });

  /**
   * Test: CORS Headers - Present on Success
   * Validates that CORS headers are included in successful responses
   */
  test('should include CORS headers in successful response', async () => {
    // GIVEN
    const event = createDeleteApiEvent('test-image.jpg');
    const context = createMockContext();
    
    s3Mock.on(DeleteObjectCommand).resolves({});
    dynamoDbMock.on(DeleteCommand).resolves({});

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
  });

  /**
   * Test: CORS Headers - Present on Error
   * Validates that CORS headers are included in error responses
   */
  test('should include CORS headers in error response', async () => {
    // GIVEN
    const event = createDeleteApiEvent('test-image.jpg');
    const context = createMockContext();
    
    const error = new Error('Test error');
    s3Mock.on(DeleteObjectCommand).rejects(error);

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    expect(response.headers).toHaveProperty('Content-Type', 'application/json');
  });

  /**
   * Test: Delete Order - S3 First, Then DynamoDB
   * Validates that S3 delete happens before DynamoDB delete
   */
  test('should delete from S3 before deleting from DynamoDB', async () => {
    // GIVEN
    const event = createDeleteApiEvent('test-image.jpg');
    const context = createMockContext();
    
    const callOrder: string[] = [];
    
    s3Mock.on(DeleteObjectCommand).callsFake(async () => {
      callOrder.push('s3');
      return {};
    });
    
    dynamoDbMock.on(DeleteCommand).callsFake(async () => {
      callOrder.push('dynamodb');
      return {};
    });

    // WHEN
    await handler(event, context);

    // THEN
    expect(callOrder).toEqual(['s3', 'dynamodb']);
  });

  /**
   * Test: Idempotent Delete
   * Validates that deleting a non-existent image succeeds (S3 and DynamoDB are idempotent)
   */
  test('should succeed when deleting non-existent image (idempotent)', async () => {
    // GIVEN
    const event = createDeleteApiEvent('non-existent-image.jpg');
    const context = createMockContext();
    
    // S3 DeleteObject succeeds even if object doesn't exist
    s3Mock.on(DeleteObjectCommand).resolves({});
    
    // DynamoDB DeleteItem succeeds even if item doesn't exist
    dynamoDbMock.on(DeleteCommand).resolves({});

    // WHEN
    const response = await handler(event, context);

    // THEN
    expect(response.statusCode).toBe(204);
    expect(s3Mock.calls()).toHaveLength(1);
    expect(dynamoDbMock.calls()).toHaveLength(1);
  });
});
