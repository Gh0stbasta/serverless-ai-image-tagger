import { S3Event, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { RekognitionClient, DetectLabelsCommand, DetectLabelsCommandInput } from '@aws-sdk/client-rekognition';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../image-processor';

/**
 * Unit Tests for ImageProcessor Lambda Function
 * 
 * These tests validate the Lambda handler's ability to:
 * 1. Parse S3 events correctly (including URL-encoded keys)
 * 2. Call AWS Rekognition DetectLabels API
 * 3. Process and log recognized labels in structured JSON format
 * 4. Store results in DynamoDB with correct schema
 * 5. Handle errors gracefully without throwing exceptions
 * 
 * Mocking Strategy: Using aws-sdk-client-mock to mock AWS SDK v3 commands
 */

// Create mocks for AWS SDK clients
const rekognitionMock = mockClient(RekognitionClient);
const dynamoDbMock = mockClient(DynamoDBDocumentClient);

// Mock console methods to capture logs
let consoleLogSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

/**
 * Helper function to create a mock S3Event
 * @param bucket - S3 bucket name
 * @param key - S3 object key (can include special characters)
 * @returns Mock S3Event object
 */
const createS3Event = (bucket: string, key: string): S3Event => ({
  Records: [
    {
      eventVersion: '2.1',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-1',
      eventTime: '2024-01-01T00:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'test-principal',
      },
      requestParameters: {
        sourceIPAddress: '127.0.0.1',
      },
      responseElements: {
        'x-amz-request-id': 'test-request-id',
        'x-amz-id-2': 'test-id-2',
      },
      s3: {
        s3SchemaVersion: '1.0',
        configurationId: 'test-config',
        bucket: {
          name: bucket,
          ownerIdentity: { principalId: 'test-principal' },
          arn: `arn:aws:s3:::${bucket}`,
        },
        object: {
          key,
          size: 1024,
          eTag: 'test-etag',
          sequencer: 'test-sequencer',
        },
      },
    },
  ],
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

describe('ImageProcessor Lambda Handler', () => {
  beforeEach(() => {
    // Reset mocks before each test
    rekognitionMock.reset();
    dynamoDbMock.reset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set default environment variables
    process.env.REKOGNITION_MAX_LABELS = '10';
    process.env.REKOGNITION_MIN_CONFIDENCE = '70';
    process.env.TABLE_NAME = 'test-table';
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    
    // Clean up environment variables
    delete process.env.REKOGNITION_MAX_LABELS;
    delete process.env.REKOGNITION_MIN_CONFIDENCE;
    delete process.env.TABLE_NAME;
  });

  /**
   * Test: S3 Event Parsing - Standard File Name
   * Validates that the handler correctly extracts bucket and key from S3 event
   */
  test('should parse S3 event with standard filename', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'images/photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [
        { Name: 'Dog', Confidence: 95.5 },
        { Name: 'Outdoor', Confidence: 88.2 },
      ],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith('Processing image: s3://test-bucket/images/photo.jpg');
    expect(rekognitionMock.calls()).toHaveLength(1);
    
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input).toEqual({
      Image: {
        S3Object: {
          Bucket: 'test-bucket',
          Name: 'images/photo.jpg',
        },
      },
      MaxLabels: 10,
      MinConfidence: 70,
    });
  });

  /**
   * Test: S3 Event Parsing - URL-Encoded Filename with Spaces
   * Validates that the handler correctly decodes URL-encoded filenames
   */
  test('should correctly decode URL-encoded filename with spaces', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'my+test+image.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith('Processing image: s3://test-bucket/my test image.jpg');
    
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input.Image?.S3Object?.Name).toBe('my test image.jpg');
  });

  /**
   * Test: S3 Event Parsing - URL-Encoded Filename with Special Characters
   * Validates that the handler correctly decodes complex URL-encoded filenames
   */
  test('should correctly decode URL-encoded filename with special characters', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'folder%2Fimage%20%28copy%29.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input.Image?.S3Object?.Name).toBe('folder/image (copy).jpg');
  });

  /**
   * Test: Successful Recognition - Multiple Labels
   * Validates that the handler correctly processes and logs detected labels
   */
  test('should process and log detected labels in JSON format', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [
        { Name: 'Dog', Confidence: 95.5234 },
        { Name: 'Outdoor', Confidence: 88.1567 },
        { Name: 'Animal', Confidence: 92.7891 },
      ],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith('Detected 3 labels for image: photo.jpg');
    
    // Verify each label is logged in the correct JSON format
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({
        image: 'photo.jpg',
        label: 'Dog',
        confidence: 95.52,
      })
    );
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({
        image: 'photo.jpg',
        label: 'Outdoor',
        confidence: 88.16,
      })
    );
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({
        image: 'photo.jpg',
        label: 'Animal',
        confidence: 92.79,
      })
    );
  });

  /**
   * Test: Successful Recognition - No Labels Detected
   * Validates that the handler correctly handles empty label responses
   */
  test('should handle empty labels response gracefully', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith('No labels detected for image: photo.jpg');
  });

  /**
   * Test: Successful Recognition - Undefined Labels
   * Validates that the handler correctly handles undefined labels in response
   */
  test('should handle undefined labels in response', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({});
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith('No labels detected for image: photo.jpg');
  });

  /**
   * Test: Error Handling - Rekognition API Error
   * Validates that the handler logs errors but does not throw exceptions
   */
  test('should handle Rekognition API errors gracefully', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    const error = new Error('ProvisionedThroughputExceededException: Request rate limit exceeded');
    rekognitionMock.on(DetectLabelsCommand).rejects(error);

    // WHEN & THEN - Should not throw
    await expect(handler(event, context)).resolves.not.toThrow();
    
    // Verify error is logged
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing image photo.jpg:', error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      bucket: 'test-bucket',
      key: 'photo.jpg',
      error: 'ProvisionedThroughputExceededException: Request rate limit exceeded',
    });
  });

  /**
   * Test: Error Handling - Service Unavailable Error
   * Validates that the handler handles AWS service errors gracefully
   */
  test('should handle service unavailable errors gracefully', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'image.png');
    const context = createMockContext();
    
    const error = new Error('ServiceUnavailableException: Service is temporarily unavailable');
    rekognitionMock.on(DetectLabelsCommand).rejects(error);

    // WHEN
    await handler(event, context);

    // THEN - Should log error but not throw
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing image image.png:', error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      bucket: 'test-bucket',
      key: 'image.png',
      error: 'ServiceUnavailableException: Service is temporarily unavailable',
    });
  });

  /**
   * Test: Error Handling - Non-Error Exception
   * Validates that the handler handles non-Error exceptions (e.g., strings, objects)
   */
  test('should handle non-Error exceptions gracefully', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    // Note: aws-sdk-client-mock wraps string rejections in Error objects
    const error = new Error('String error message');
    rekognitionMock.on(DetectLabelsCommand).rejects(error);

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing image photo.jpg:', error);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      bucket: 'test-bucket',
      key: 'photo.jpg',
      error: 'String error message',
    });
  });

  /**
   * Test: Multiple S3 Records
   * Validates that the handler processes multiple records in a single event
   */
  test('should process multiple S3 records in a single event', async () => {
    // GIVEN
    const event: S3Event = {
      Records: [
        createS3Event('test-bucket', 'image1.jpg').Records[0],
        createS3Event('test-bucket', 'image2.jpg').Records[0],
      ],
    };
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [{ Name: 'Test', Confidence: 90 }],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(rekognitionMock.calls()).toHaveLength(2);
    expect(consoleLogSpy).toHaveBeenCalledWith('Processing image: s3://test-bucket/image1.jpg');
    expect(consoleLogSpy).toHaveBeenCalledWith('Processing image: s3://test-bucket/image2.jpg');
  });

  /**
   * Test: Environment Variables - Custom MaxLabels
   * Validates that the handler respects REKOGNITION_MAX_LABELS environment variable
   */
  test('should use custom REKOGNITION_MAX_LABELS from environment', async () => {
    // GIVEN
    process.env.REKOGNITION_MAX_LABELS = '5';
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input.MaxLabels).toBe(5);
  });

  /**
   * Test: Environment Variables - Custom MinConfidence
   * Validates that the handler respects REKOGNITION_MIN_CONFIDENCE environment variable
   */
  test('should use custom REKOGNITION_MIN_CONFIDENCE from environment', async () => {
    // GIVEN
    process.env.REKOGNITION_MIN_CONFIDENCE = '85.5';
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input.MinConfidence).toBe(85.5);
  });

  /**
   * Test: Environment Variables - Default Values
   * Validates that the handler uses default values when environment variables are not set
   */
  test('should use default values when environment variables are not set', async () => {
    // GIVEN
    delete process.env.REKOGNITION_MAX_LABELS;
    delete process.env.REKOGNITION_MIN_CONFIDENCE;
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    const commandCall = rekognitionMock.call(0);
    const input = commandCall.args[0].input as DetectLabelsCommandInput;
    expect(input.MaxLabels).toBe(10);
    expect(input.MinConfidence).toBe(70);
  });

  /**
   * Test: Label Confidence - Undefined Confidence
   * Validates that the handler handles labels with undefined confidence values
   */
  test('should handle labels with undefined confidence', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [
        { Name: 'Test' }, // No Confidence property
      ],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({
        image: 'photo.jpg',
        label: 'Test',
        confidence: 0,
      })
    );
  });

  /**
   * Test: DynamoDB Write - Successful Storage
   * Validates that the handler correctly stores metadata in DynamoDB
   */
  test('should store image metadata in DynamoDB with correct schema', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'images/photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({
      Labels: [
        { Name: 'Dog', Confidence: 95.5234 },
        { Name: 'Outdoor', Confidence: 88.1567 },
      ],
    });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(dynamoDbMock.calls()).toHaveLength(1);
    const putCall = dynamoDbMock.call(0);
    const putInput = putCall.args[0].input;
    
    expect(putInput.TableName).toBe('test-table');
    expect(putInput.Item).toMatchObject({
      imageId: 'images/photo.jpg',
      s3Url: 'https://test-bucket.s3.amazonaws.com/images%2Fphoto.jpg',
      labels: [
        { name: 'Dog', confidence: 95.52 },
        { name: 'Outdoor', confidence: 88.16 },
      ],
    });
    expect(putInput.Item.timestamp).toBeDefined();
    expect(typeof putInput.Item.timestamp).toBe('string');
  });

  /**
   * Test: DynamoDB Write - Empty Labels Array
   * Validates that the handler stores items with empty labels array when no labels detected
   */
  test('should store DynamoDB item with empty labels array when no labels detected', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    expect(dynamoDbMock.calls()).toHaveLength(1);
    const putCall = dynamoDbMock.call(0);
    const putInput = putCall.args[0].input;
    
    expect(putInput.Item.labels).toEqual([]);
  });

  /**
   * Test: DynamoDB Write - URL Encoding in S3 URL
   * Validates that the handler correctly encodes special characters in S3 URLs
   */
  test('should correctly encode special characters in S3 URL', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'my test image.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    dynamoDbMock.on(PutCommand).resolves({});

    // WHEN
    await handler(event, context);

    // THEN
    const putCall = dynamoDbMock.call(0);
    const putInput = putCall.args[0].input;
    
    expect(putInput.Item.s3Url).toBe('https://test-bucket.s3.amazonaws.com/my%20test%20image.jpg');
  });

  /**
   * Test: Error Handling - Missing TABLE_NAME Environment Variable
   * Validates that the handler throws an error when TABLE_NAME is not set
   */
  test('should throw error when TABLE_NAME environment variable is not set', async () => {
    // GIVEN
    delete process.env.TABLE_NAME;
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });

    // WHEN
    await handler(event, context);

    // THEN - Error should be logged but not thrown (graceful handling)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing image photo.jpg:', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      bucket: 'test-bucket',
      key: 'photo.jpg',
      error: 'TABLE_NAME environment variable is required',
    });
  });

  /**
   * Test: Error Handling - DynamoDB PutCommand Failure
   * Validates that the handler handles DynamoDB errors gracefully
   */
  test('should handle DynamoDB PutCommand errors gracefully', async () => {
    // GIVEN
    const event = createS3Event('test-bucket', 'photo.jpg');
    const context = createMockContext();
    
    rekognitionMock.on(DetectLabelsCommand).resolves({ Labels: [] });
    const dynamoError = new Error('ProvisionedThroughputExceededException: Request rate limit exceeded');
    dynamoDbMock.on(PutCommand).rejects(dynamoError);

    // WHEN
    await handler(event, context);

    // THEN - Should log error but not throw
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing image photo.jpg:', dynamoError);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:', {
      bucket: 'test-bucket',
      key: 'photo.jpg',
      error: 'ProvisionedThroughputExceededException: Request rate limit exceeded',
    });
  });
});
