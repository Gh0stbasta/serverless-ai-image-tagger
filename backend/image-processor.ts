import { S3Event, Context } from 'aws-lambda';
import { RekognitionClient, DetectLabelsCommand, DetectLabelsCommandInput } from '@aws-sdk/client-rekognition';

/**
 * Rekognition Client
 * 
 * Architectural Decision: Initialize the RekognitionClient outside the handler function
 * to take advantage of Lambda execution context reuse. This follows AWS best practices
 * for Lambda optimization:
 * - The client is created once and reused across multiple invocations (warm starts)
 * - Reduces latency by avoiding repeated SDK initialization overhead
 * - Connection pooling is maintained between invocations
 * 
 * The client automatically uses the Lambda execution role's credentials via the
 * AWS SDK's default credential provider chain.
 */
const rekognitionClient = new RekognitionClient({});

/**
 * ImageProcessor Lambda Function Handler
 * 
 * Architectural Decision: This Lambda function serves as the entry point for processing
 * S3 image upload events in the serverless event-driven architecture. It receives events
 * when images are uploaded to the S3 bucket and triggers AI analysis via AWS Rekognition.
 * 
 * Implementation:
 * - Extracts S3 bucket and object key from the S3 event
 * - Calls AWS Rekognition DetectLabels API to identify objects/scenes in the image
 * - Parses and logs recognized labels with confidence scores to CloudWatch
 * - Implements error handling for Rekognition API failures
 * 
 * Future Enhancements:
 * - Store results in DynamoDB
 * - Filter labels by minimum confidence threshold
 * - Implement retry logic for transient failures
 * 
 * @param event - S3Event containing details about the uploaded image
 * @param context - Lambda execution context with runtime information
 */
export const handler = async (event: S3Event, context: Context): Promise<void> => {
  console.log('Event received', JSON.stringify(event, null, 2));
  console.log('Lambda Context', JSON.stringify(context, null, 2));

  // Process each S3 record in the event
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing image: s3://${bucket}/${key}`);

    try {
      /**
       * DetectLabels API Call
       * 
       * Architectural Decision: Using DetectLabelsCommand from AWS SDK v3 for modular imports.
       * This reduces Lambda bundle size compared to SDK v2's monolithic approach, improving
       * cold start performance.
       * 
       * Parameters:
       * - Image.S3Object: Specifies the S3 location of the image to analyze
       * - MaxLabels: Limits the number of labels returned (10 is sufficient for most use cases)
       * - MinConfidence: Only returns labels with confidence >= 70% to reduce false positives
       * 
       * Cost Optimization:
       * - Each DetectLabels call costs $1 per 1,000 images
       * - Free tier includes 5,000 images/month for first 12 months
       * - MinConfidence filter reduces noise without additional cost
       */
      const input: DetectLabelsCommandInput = {
        Image: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        MaxLabels: 10,
        MinConfidence: 70,
      };

      const command = new DetectLabelsCommand(input);
      const response = await rekognitionClient.send(command);

      /**
       * Parse and Log Labels
       * 
       * Architectural Decision: Log structured data to CloudWatch for easy querying
       * and monitoring. Each label includes:
       * - Name: Human-readable label (e.g., "Dog", "Outdoor", "Person")
       * - Confidence: Percentage confidence score (0-100)
       * 
       * CloudWatch Logs Insights can query these logs using JSON filtering for
       * analytics and monitoring purposes.
       */
      if (response.Labels && response.Labels.length > 0) {
        console.log(`Detected ${response.Labels.length} labels for image: ${key}`);
        
        response.Labels.forEach((label) => {
          console.log(
            JSON.stringify({
              image: key,
              label: label.Name,
              confidence: label.Confidence?.toFixed(2),
            })
          );
        });
      } else {
        console.log(`No labels detected for image: ${key}`);
      }
    } catch (error) {
      /**
       * Error Handling
       * 
       * Architectural Decision: Log errors to CloudWatch for monitoring and alerting.
       * The Lambda does not throw errors to avoid marking the invocation as failed,
       * which would trigger retries that may not be necessary for permanent failures
       * (e.g., unsupported image format, invalid S3 object).
       * 
       * Future Enhancement: Implement DLQ (Dead Letter Queue) for failed invocations
       * and CloudWatch Alarms for error rate monitoring.
       */
      console.error(`Error processing image ${key}:`, error);
      console.error('Error details:', {
        bucket,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
