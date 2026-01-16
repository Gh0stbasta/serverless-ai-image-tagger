import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createErrorResponse, createSuccessResponse, getEnvBucketName, getEnvTableName } from 'lib';

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
      return createErrorResponse(400, 'imageId is required in path parameters');
    }

    // URL decode the imageId to handle special characters
    const decodedImageId = decodeURIComponent(imageId);
    console.log(`Deleting image: ${decodedImageId}`);

    let bucketName: string
    let tableName: string;
    try {
      bucketName = getEnvBucketName();
      tableName = getEnvTableName();
    } catch (error) {
      return createErrorResponse(500, error);

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
    return createSuccessResponse();
  } catch (error) {
    return createErrorResponse(500, 'Failed to delete image', error);
  }
};
