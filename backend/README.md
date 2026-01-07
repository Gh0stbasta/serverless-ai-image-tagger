# Backend Lambda Functions

This directory contains AWS Lambda function handlers for the Serverless AI Image Tagger application.

## ImageProcessor Lambda Function

**File:** `image-processor.ts`

### Purpose
Entry point for processing S3 image upload events. This Lambda function is triggered when images are uploaded to the S3 bucket and will eventually perform AI analysis using AWS Rekognition.

### Current Implementation (Skeleton)
- Logs incoming S3 events to CloudWatch for manual verification
- Logs Lambda execution context
- Provides a foundation for future image processing logic

### Configuration
- **Runtime:** Node.js 20.x
- **Architecture:** ARM64 (Graviton2) for cost optimization
- **Memory:** 256 MB
- **Timeout:** 30 seconds
- **IAM Role:** Base Lambda execution role (CloudWatch Logs permissions only)

### Environment Variables
- `TABLE_NAME`: DynamoDB table name for storing image metadata
- `BUCKET_NAME`: S3 bucket name for reading uploaded images

### Future Enhancements
- Extract image metadata from S3 event
- Call AWS Rekognition for label detection
- Store analysis results in DynamoDB
- Implement error handling and retry logic
- Add image validation (size, format, etc.)

## Development

### Testing Locally
The Lambda functions are automatically bundled using esbuild when deployed via AWS CDK.

### Deployment
Lambda functions are deployed as part of the CDK stack:
```bash
cd infra
npm run build
npx cdk deploy
```

### Manual Testing
After deployment, you can test the Lambda function using the AWS CLI:
```bash
aws lambda invoke \
  --function-name ServerlessAITagger-ImageProcessor \
  --payload '{"Records":[{"s3":{"bucket":{"name":"test-bucket"},"object":{"key":"test-image.jpg"}}}]}' \
  response.json
```

View logs in CloudWatch:
```bash
aws logs tail /aws/lambda/ServerlessAITagger-ImageProcessor --follow
```
