import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Document Client
 * 
 * Architectural Decision: Initialize the DynamoDBDocumentClient outside the handler function
 * to take advantage of Lambda execution context reuse. This follows AWS best practices
 * for Lambda optimization:
 * - The client is created once and reused across multiple invocations (warm starts)
 * - Reduces latency by avoiding repeated SDK initialization overhead
 * - Connection pooling is maintained between invocations
 * 
 * Using DynamoDBDocumentClient provides automatic marshalling/unmarshalling of JavaScript
 * objects to DynamoDB format, simplifying code by handling native JavaScript types.
 */
const ddbClient = new DynamoDBClient({});
const dynamoDbClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * ImageMetadata Interface
 * 
 * Architectural Decision: Defining a strict TypeScript interface for DynamoDB items
 * ensures type safety and makes the expected data structure explicit for consumers.
 * This interface matches the schema defined by the ImageProcessor Lambda.
 */
interface ImageMetadata {
  imageId: string;
  s3Url: string;
  labels: Array<{
    name: string;
    confidence: number;
  }>;
  timestamp: string;
}

/**
 * GetImages Lambda Function Handler
 * 
 * Architectural Decision: This Lambda function serves as a read-only API endpoint
 * for retrieving all analyzed images from DynamoDB. It implements a simple Scan
 * operation to return the complete dataset.
 * 
 * Implementation:
 * - Performs a DynamoDB Scan to retrieve all items from the table
 * - Returns results as a JSON array with CORS headers for frontend consumption
 * - Implements error handling with appropriate HTTP status codes
 * - Uses API Gateway v2 event structure (HTTP API)
 * 
 * Cost Considerations:
 * - DynamoDB Scan operations consume 1 Read Request Unit (RRU) per 4KB of data read
 * - For large tables, Scan can be expensive and slow. Consider pagination for production.
 * - Alternative: Use Query with a GSI if filtering by specific attributes is needed
 * 
 * Security:
 * - This is a public read endpoint. Consider adding authentication/authorization if needed.
 * - CORS headers allow frontend access from any origin (configure based on requirements)
 * 
 * Future Enhancements:
 * - Implement pagination using LastEvaluatedKey for large datasets
 * - Add filtering/sorting capabilities via query parameters
 * - Consider caching results in API Gateway or CloudFront to reduce DynamoDB costs
 * - Add authentication using API Gateway authorizers (Lambda or Cognito)
 * 
 * @param event - API Gateway HTTP API event
 * @param context - Lambda execution context with runtime information
 * @returns API Gateway HTTP API response with JSON array of images
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  console.log('Event received', JSON.stringify(event, null, 2));
  console.log('Lambda Context', JSON.stringify(context, null, 2));

  try {
    /**
     * Environment Variable Validation
     * 
     * Architectural Decision: Fail fast if required environment variables are not set.
     * This prevents unexpected runtime errors and provides clear feedback during deployment.
     */
    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      console.error('TABLE_NAME environment variable is not set');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Internal server error',
          message: 'TABLE_NAME environment variable is not set',
        }),
      };
    }

    console.log(`Scanning DynamoDB table: ${tableName}`);

    /**
     * DynamoDB Scan Operation
     * 
     * Architectural Decision: Using Scan to retrieve all items from the table.
     * Scan reads every item in the table, which is acceptable for small datasets
     * (< 1MB or ~100-500 items depending on item size).
     * 
     * For production with larger datasets, consider:
     * - Implementing pagination with Limit and ExclusiveStartKey
     * - Using Query with a GSI if specific access patterns are known
     * - Caching results to reduce read costs
     * 
     * The Scan operation automatically handles pagination internally if the result
     * set exceeds 1MB, but for this implementation we retrieve all items in a
     * single call (suitable for MVP with limited data).
     */
    const scanCommand = new ScanCommand({
      TableName: tableName,
    });

    const response = await dynamoDbClient.send(scanCommand);

    /**
     * Response Formatting
     * 
     * Architectural Decision: Return items as-is from DynamoDB with minimal transformation.
     * The DynamoDBDocumentClient automatically unmarshalls DynamoDB AttributeValues
     * into native JavaScript objects, so no manual parsing is needed.
     * 
     * Empty array is returned if no items exist (rather than null) to provide
     * consistent data structure for frontend consumers.
     */
    const items = (response.Items || []) as ImageMetadata[];

    console.log(`Successfully retrieved ${items.length} images from DynamoDB`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        /**
         * CORS Headers
         * 
         * Architectural Decision: Allow cross-origin requests from any origin (*).
         * This is acceptable for a public read-only API endpoint.
         * 
         * For production, consider restricting to specific origins:
         * 'Access-Control-Allow-Origin': 'https://yourdomain.com'
         */
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(items),
    };
  } catch (error) {
    /**
     * Error Handling
     * 
     * Architectural Decision: Log errors to CloudWatch for monitoring and return
     * a generic error message to the client to avoid exposing internal details.
     * 
     * The 500 status code indicates a server-side error, prompting the frontend
     * to display an appropriate error message to the user.
     */
    console.error('Error scanning DynamoDB table:', error);
    console.error('Error details:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to retrieve images from database',
      }),
    };
  }
};
