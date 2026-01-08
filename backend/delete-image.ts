import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * AWS SDK Clients
 * 
 * Architectural Decision: Initialize clients outside the handler function
 * to take advantage of Lambda execution context reuse. This follows AWS best practices
 * for Lambda optimization by enabling connection pooling and client reuse across
 * multiple invocations (warm starts).
 */
const ddbClient = new DynamoDBClient({});
const dynamoDbClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

/**
 * DeleteImage Lambda Function Handler
 * 
 * Architectural Decision: This Lambda function handles DELETE requests to remove images
 * from both S3 storage and DynamoDB metadata table. This ensures complete cleanup of
 * resources when users delete images from the gallery.
 * 
 * Implementation:
 * - Extracts imageId from the path parameters
 * - Deletes the object from S3 bucket
 * - Deletes the corresponding entry from DynamoDB table
 * - Returns appropriate HTTP status codes (204 on success, 404 if not found, 500 on error)
 * - Uses API Gateway v2 event structure (HTTP API)
 * 
 * Security:
 * - Lambda requires both s3:DeleteObject and dynamodb:DeleteItem permissions
 * - No authentication is implemented (TODO: Add API Gateway authorizer)
 * - Implements least-privilege IAM policies via CDK grant methods
 * 
 * Cost Considerations:
 * - S3 DeleteObject operations are free
 * - DynamoDB Delete operations consume 1 Write Request Unit (WRU) per item
 * - This operation cannot be undone; consider implementing soft deletes for production
 * 
 * Future Enhancements:
 * - Implement authentication/authorization
 * - Add validation to ensure user owns the image
 * - Implement soft deletes with TTL for recovery window
 * - Add CloudWatch metrics for delete operations
 * 
 * @param event - API Gateway HTTP API event with imageId in path parameters
 * @param context - Lambda execution context with runtime information
 * @returns API Gateway HTTP API response with 204 (No Content) on success
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  console.log('Event received', JSON.stringify(event, null, 2));
  console.log('Lambda Context', JSON.stringify(context, null, 2));

  try {
    /**
     * Extract imageId from path parameters
     * 
     * Architectural Decision: The imageId is the S3 object key, which serves as both
     * the S3 object name and the DynamoDB partition key. This provides a simple
     * mapping between storage and metadata.
     * 
     * The imageId must be URL-decoded as it may contain special characters that
     * were encoded by the frontend (e.g., spaces, slashes).
     */
    const imageId = event.pathParameters?.imageId;
    if (!imageId) {
      console.error('Missing imageId in path parameters');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'imageId is required in path parameters',
        }),
      };
    }

    // URL decode the imageId to handle special characters
    const decodedImageId = decodeURIComponent(imageId);
    console.log(`Deleting image: ${decodedImageId}`);

    /**
     * Environment Variable Validation
     * 
     * Architectural Decision: Fail fast if required environment variables are not set.
     * This prevents unexpected runtime errors and provides clear feedback during deployment.
     */
    const bucketName = process.env.BUCKET_NAME;
    const tableName = process.env.TABLE_NAME;

    if (!bucketName) {
      console.error('BUCKET_NAME environment variable is not set');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Internal server error',
          message: 'BUCKET_NAME environment variable is not set',
        }),
      };
    }

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

    /**
     * Delete from S3
     * 
     * Architectural Decision: Delete from S3 first, then DynamoDB. This ensures that
     * even if the DynamoDB delete fails, the expensive storage resource (S3 object)
     * is already freed. The metadata can be cleaned up later.
     * 
     * S3 DeleteObject is idempotent - deleting a non-existent object succeeds with
     * 204 status. We don't check if the object exists first to save an API call.
     */
    console.log(`Deleting S3 object: s3://${bucketName}/${decodedImageId}`);
    
    const deleteObjectCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: decodedImageId,
    });

    await s3Client.send(deleteObjectCommand);
    console.log(`Successfully deleted S3 object: ${decodedImageId}`);

    /**
     * Delete from DynamoDB
     * 
     * Architectural Decision: Delete metadata after S3 object to ensure consistency.
     * If this fails, the metadata remains but the image is gone. A cleanup job could
     * later remove orphaned metadata entries.
     * 
     * DynamoDB DeleteCommand is also idempotent - deleting a non-existent item succeeds.
     */
    console.log(`Deleting DynamoDB item: ${decodedImageId}`);
    
    const deleteCommand = new DeleteCommand({
      TableName: tableName,
      Key: {
        imageId: decodedImageId,
      },
    });

    await dynamoDbClient.send(deleteCommand);
    console.log(`Successfully deleted DynamoDB item: ${decodedImageId}`);

    /**
     * Response with 204 No Content
     * 
     * Architectural Decision: Return 204 (No Content) to indicate successful deletion.
     * This is the standard HTTP status code for DELETE operations that succeed but
     * have no response body to return.
     * 
     * CORS headers allow frontend access from any origin (configure based on requirements).
     */
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
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
    console.error('Error deleting image:', error);
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
        message: 'Failed to delete image',
      }),
    };
  }
};
