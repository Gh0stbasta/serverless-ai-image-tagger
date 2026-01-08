# Deployment Guide: Production Hosting & Notifications

This guide explains how to deploy the Serverless AI Image Tagger with production hosting (CloudFront + S3) and deployment notifications.

## Prerequisites

1. AWS account with appropriate permissions
2. AWS CLI configured with credentials
3. Node.js 20.x or later
4. Email address for deployment notifications

## Architecture Overview

### Production Hosting Stack

The application is deployed with the following components:

```
┌─────────────┐     HTTPS      ┌──────────────┐      OAC       ┌────────────┐
│   Browser   │ ────────────> │  CloudFront  │ ───────────> │  S3 Bucket  │
│   (User)    │                │ Distribution │               │  (Private)  │
└─────────────┘                └──────────────┘               └────────────┘
                                       │
                                       │ Cache Invalidation
                                       ▼
                                ┌──────────────┐
                                │ Bucket       │
                                │ Deployment   │
                                └──────────────┘
                                       │
                                       │ Triggers after completion
                                       ▼
                                ┌──────────────┐      ┌─────────┐
                                │   Custom     │ ───> │   SNS   │ ──> 📧 Email
                                │  Resource    │      │  Topic  │
                                └──────────────┘      └─────────┘
```

### Key Security Features

- **Private S3 Bucket**: All public access blocked
- **Origin Access Control (OAC)**: CloudFront uses signed requests to access S3
- **HTTPS Only**: All HTTP requests redirected to HTTPS
- **SPA Support**: 404/403 errors redirect to index.html for client-side routing

## Deployment Steps

### 1. Configure Notification Email

You can configure the notification email in three ways:

#### Option A: Using CDK Context (Recommended)

```bash
cd infra
npx cdk deploy --context notificationEmail=your-email@example.com
```

#### Option B: Using Environment Variable

```bash
export NOTIFICATION_EMAIL=your-email@example.com
cd infra
npx cdk deploy
```

#### Option C: Update cdk.json

Add to `infra/cdk.json`:

```json
{
  "context": {
    "notificationEmail": "your-email@example.com"
  }
}
```

### 2. Build the Frontend

Before deploying, you must build the React frontend:

```bash
cd frontend
npm install
npm run build
```

This creates the `frontend/dist` directory with optimized production assets.

### 3. Deploy the Infrastructure

```bash
cd infra
npm install
npx cdk deploy
```

**What happens during deployment:**

1. CDK synthesizes CloudFormation template
2. CloudFormation creates/updates resources:
   - S3 bucket for hosting (private)
   - CloudFront distribution with OAC
   - SNS topic for notifications
   - Custom resource for notification
3. BucketDeployment syncs `frontend/dist` to S3
4. CloudFront cache is invalidated (`/*`)
5. Custom resource publishes notification to SNS
6. You receive an email with the CloudFront URL

### 4. Confirm SNS Subscription

**Important:** After the first deployment, you will receive a subscription confirmation email from AWS SNS.

1. Check your email inbox (and spam folder)
2. Look for email from AWS Notifications
3. Click "Confirm subscription" link
4. Future deployment notifications will be delivered automatically

### 5. Access Your Application

After deployment completes, check the CloudFormation outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name InfraStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text
```

Or check your email notification for the clickable URL.

## CloudFormation Outputs

The deployment creates the following outputs:

| Output Name | Description | Example Value |
|------------|-------------|---------------|
| `CloudFrontUrl` | HTTPS URL for the application | `https://d111111abcdef8.cloudfront.net` |
| `CloudFrontDistributionId` | Distribution ID for manual invalidations | `E1YEMEXAMPLEID` |
| `HostingBucketName` | S3 bucket name for static assets | `infrastack-hostinghostingbucket-abc123` |
| `DeploymentTopicArn` | SNS topic ARN for notifications | `arn:aws:sns:us-east-1:123456789012:DeploymentNotifications` |

## Troubleshooting

### Email Notification Not Received

**Problem:** Deployed successfully but no email received.

**Solutions:**

1. Check spam/junk folder
2. Verify email address is correct:
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn $(aws cloudformation describe-stacks \
       --stack-name InfraStack \
       --query 'Stacks[0].Outputs[?OutputKey==`DeploymentTopicArn`].OutputValue' \
       --output text)
   ```
3. Check if subscription is confirmed (Status should be "Confirmed")
4. Redeploy to trigger another notification

### CloudFront Returns 403 Forbidden

**Problem:** CloudFront URL returns 403 error.

**Solutions:**

1. Verify S3 bucket deployment completed successfully
2. Check CloudFront distribution status (must be "Deployed"):
   ```bash
   aws cloudfront get-distribution \
     --id $(aws cloudformation describe-stacks \
       --stack-name InfraStack \
       --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
       --output text) \
     --query 'Distribution.Status'
   ```
3. Wait 5-10 minutes for CloudFront distribution to fully deploy
4. Verify frontend was built before deployment:
   ```bash
   ls -la frontend/dist
   ```

### Frontend Assets Not Loading After Update

**Problem:** Deployed new version but seeing old content.

**Solutions:**

1. Cache invalidation should happen automatically via BucketDeployment
2. Verify invalidation was created:
   ```bash
   aws cloudfront list-invalidations \
     --distribution-id $(aws cloudformation describe-stacks \
       --stack-name InfraStack \
       --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
       --output text)
   ```
3. Manually invalidate cache if needed:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id $(aws cloudformation describe-stacks \
       --stack-name InfraStack \
       --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
       --output text) \
     --paths '/*'
   ```
4. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)

### S3 Bucket Accessible Directly

**Problem:** Can access S3 bucket directly without going through CloudFront.

**This should NOT be possible** if configured correctly. All direct S3 access should return 403 Forbidden.

**Verify Security:**

```bash
# Get bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name InfraStack \
  --query 'Stacks[0].Outputs[?OutputKey==`HostingBucketName`].OutputValue' \
  --output text)

# Try to access directly (should fail with 403)
curl https://$BUCKET_NAME.s3.amazonaws.com/index.html
```

If you can access the bucket directly, check:
1. Bucket policy allows only CloudFront access
2. Origin Access Control is properly configured
3. Bucket has public access blocked

## Cost Optimization

### CloudFront Free Tier

- **1 TB** of data transfer out per month
- **10 million** HTTP/HTTPS requests per month
- **2 million** CloudFront Function invocations per month

### Cache Invalidation Costs

- **First 1,000 paths** per month: FREE
- **Additional paths**: $0.005 per path

Our setup uses `/*` for invalidation, which counts as **1 path** per deployment.

### SNS Costs

- **First 1,000 email notifications** per month: FREE
- **Additional emails**: $2 per 100,000 notifications

For deployment notifications (typically 1-10 per day), costs are negligible.

## Updating the Application

### Frontend Updates Only

If you only changed frontend code:

```bash
cd frontend
npm run build
cd ../infra
npx cdk deploy
```

The deployment will:
1. Upload new assets to S3
2. Invalidate CloudFront cache
3. Send notification email

### Infrastructure Updates

If you changed CDK infrastructure:

```bash
cd infra
npm run build
npx cdk diff  # Preview changes
npx cdk deploy
```

## Monitoring & Metrics

### CloudFront Metrics (Free)

Access CloudFront metrics in AWS Console:
- Requests
- Bytes Downloaded
- 4xx/5xx Error Rates
- Cache Hit Ratio

### Setting Up Alarms

Create a CloudWatch alarm for 5xx errors:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name cloudfront-5xx-errors \
  --alarm-description "Alert on CloudFront 5xx errors" \
  --metric-name 5xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=$(aws cloudformation describe-stacks \
    --stack-name InfraStack \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text)
```

## Clean Up

To destroy all resources:

```bash
cd infra
npx cdk destroy
```

**Note:** The S3 hosting bucket is configured with `autoDeleteObjects: true`, so all files will be automatically deleted when the stack is destroyed.

## Security Best Practices

### Production Recommendations

For production deployments, consider:

1. **Custom Domain**: Use AWS Certificate Manager for custom domain with HTTPS
2. **WAF**: Add AWS WAF to protect against common web exploits
3. **Logging**: Enable CloudFront access logs and S3 server access logs
4. **Monitoring**: Set up CloudWatch alarms for errors and unusual traffic
5. **Backup**: Enable S3 versioning and cross-region replication

### Changing Notification Email

To change the notification email:

1. Update the email in context/environment variable
2. Redeploy: `npx cdk deploy`
3. Confirm new subscription email
4. Old subscription will remain active (you can delete it in AWS Console)

## Additional Resources

- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [AWS CDK S3 Deployment](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment-readme.html)
- [Origin Access Control (OAC)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [AWS SNS Email Notifications](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html)
