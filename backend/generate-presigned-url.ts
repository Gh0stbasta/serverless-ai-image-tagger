import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3 Client
 * 
 * Architectural Decision: Initialize the S3Client outside the handler function
 * to take advantage of Lambda execution context reuse. This follows AWS best practices
 * for Lambda optimization:
 * - The client is created once and reused across multiple invocations (warm starts)
 * - Reduces latency by avoiding repeated SDK initialization overhead
 * - Connection pooling is maintained between invocations
 */
const s3Client = new S3Client({});

/**
 * PresignedUrlResponse Interface
 * 
 * Architectural Decision: Defining a strict TypeScript interface for the API response
 * ensures type safety and makes the expected response structure explicit for consumers.
 */
interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * GeneratePresignedUrl Lambda Function Handler
 * 
 * Architectural Decision: This Lambda function generates presigned URLs for secure S3 uploads
 * without embedding AWS credentials in the browser. This follows AWS security best practices
 * by allowing direct browser-to-S3 uploads while maintaining access control.
 * 
 * Implementation:
 * - Generates a unique S3 key with timestamp to prevent naming collisions
 * - Creates a presigned PUT URL valid for 5 minutes (300 seconds)
 * - Returns the URL and key to the frontend for upload
 * - Uses AWS SDK v3's getSignedUrl from @aws-sdk/s3-request-presigner
 * 
 * Security Considerations:
 * - Presigned URLs are time-limited (5 minutes) to minimize exposure window
 * - No AWS credentials are exposed to the browser
 * - Future enhancement: Add authentication to prevent unauthorized URL generation
 * - Future enhancement: Validate file type and size limits
 * 
 * Cost Optimization:
 * - Direct S3 uploads bypass Lambda data transfer, reducing Lambda invocations
 * - Reduces API Gateway data transfer costs
 * - S3 PUT requests are $0.005 per 1,000 requests
 * 
 * Future Enhancements:
 * - Add authentication using API Gateway authorizers
 * - Validate requested file type/size in request body
 * - Add content-type enforcement in presigned URL
 * - Implement rate limiting to prevent abuse
 * - Add metadata tags to S3 objects for better organization
 * 
 * @param event - API Gateway HTTP API event
 * @param context - Lambda execution context with runtime information
 * @returns API Gateway HTTP API response with presigned URL
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
    const bucketName = process.env.BUCKET_NAME;
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

    /**
     * Generate unique S3 key with timestamp
     * 
     * Architectural Decision: Use timestamp-based key generation to prevent naming collisions
     * and maintain chronological ordering of uploads. This simple approach works well for MVP.
     * 
     * Format: uploads/{timestamp}-{random}.jpg
     * Example: uploads/1704067200000-abc123.jpg
     * 
     * Future enhancement: Parse filename from request body or use UUID for better randomness
     */
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const key = `uploads/${timestamp}-${randomSuffix}.jpg`;

    console.log(`Generating presigned URL for bucket: ${bucketName}, key: ${key}`);

    /**
     * Create PutObjectCommand for presigned URL
     * 
     * Architectural Decision: Using PutObjectCommand to generate a presigned URL that allows
     * HTTP PUT operations. This enables direct browser-to-S3 uploads without proxying through Lambda.
     * 
     * The command specifies:
     * - Bucket: Target S3 bucket for uploads
     * - Key: Unique object key (filename) for the upload
     * 
     * Future enhancements:
     * - Add ContentType parameter to enforce file type restrictions
     * - Add ContentLength limits to prevent large uploads
     * - Add ServerSideEncryption parameter to enforce encryption
     * - Add Metadata for tracking upload source, user, etc.
     */
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    /**
     * Generate presigned URL with 5-minute expiration
     * 
     * Architectural Decision: Set expiration to 300 seconds (5 minutes) as required.
     * This provides enough time for users to complete uploads while minimizing the
     * window for potential misuse if the URL is intercepted.
     * 
     * The getSignedUrl function from @aws-sdk/s3-request-presigner:
     * - Signs the request with temporary credentials
     * - Embeds expiration time in the URL query parameters
     * - Returns a fully-qualified HTTPS URL that can be used for PUT operations
     * 
     * Security: The URL includes signature parameters that AWS validates on upload.
     * If the URL is modified or used after expiration, S3 will reject the request.
     */
    const expiresIn = 300; // 5 minutes in seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    console.log(`Successfully generated presigned URL with ${expiresIn}s expiration`);

    /**
     * Response Format
     * 
     * Architectural Decision: Return both the presigned URL and the object key.
     * - uploadUrl: Used by frontend to PUT the file to S3
     * - key: Used by frontend to reference the uploaded object
     * - expiresIn: Informs frontend of the time limit for upload
     * 
     * This allows the frontend to:
     * 1. Display the key/filename to the user
     * 2. Upload the file using the presigned URL
     * 3. Poll the API for processing results using the key
     */
    const response: PresignedUrlResponse = {
      uploadUrl,
      key,
      expiresIn,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        /**
         * CORS Headers
         * 
         * Architectural Decision: Allow cross-origin requests from any origin (*).
         * This is acceptable for a presigned URL generation endpoint.
         * 
         * For production, consider:
         * - Restricting to specific origins: 'https://yourdomain.com'
         * - Adding authentication to prevent unauthorized URL generation
         */
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
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
    console.error('Error generating presigned URL:', error);
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
        message: 'Failed to generate upload URL',
      }),
    };
  }
};
