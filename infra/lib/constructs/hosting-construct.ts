import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

/**
 * Properties for HostingConstruct
 */
export interface HostingConstructProps {
  /**
   * Path to the frontend dist directory.
   * @default '../frontend/dist'
   */
  readonly frontendDistPath?: string;
}

/**
 * HostingConstruct
 * 
 * Architectural Decision: Encapsulates production hosting resources following ADR-005.
 * This construct manages the CloudFront distribution and S3 bucket for hosting the
 * React frontend application with Origin Access Control (OAC) for secure access.
 * 
 * Key Design Choices:
 * - S3 bucket is private with blocked public access - CloudFront is the only way to access content
 * - Origin Access Control (OAC) instead of deprecated Origin Access Identity (OAI) for better security
 * - BucketDeployment with automatic CloudFront invalidation to ensure users get fresh content after deploy
 * - HTTPS-only viewer protocol for secure connections
 * 
 * Cost Consideration: CloudFront is pay-per-use with no minimum fees, making it suitable for MVP.
 * Free tier includes 1TB of data transfer out and 10M HTTP/HTTPS requests per month.
 */
export class HostingConstruct extends Construct {
  /**
   * Public property to expose the S3 bucket for static assets.
   * This bucket stores the built React application files.
   */
  public readonly hostingBucket: s3.Bucket;

  /**
   * Public property to expose the CloudFront distribution.
   * This distribution serves content globally with HTTPS and caching.
   */
  public readonly distribution: cloudfront.Distribution;

  /**
   * Public property to expose the bucket deployment.
   * This custom resource syncs local files to S3 and invalidates the CDN cache.
   */
  public readonly bucketDeployment: s3deploy.BucketDeployment;

  constructor(scope: Construct, id: string, props?: HostingConstructProps) {
    super(scope, id);

    /**
     * S3 Bucket for static website hosting.
     * Architectural Decision: This bucket stores the compiled React application.
     * Unlike the upload bucket, this one is optimized for read-heavy workloads and
     * is fronted by CloudFront for global distribution.
     * 
     * Key Security Settings:
     * - blockPublicAccess: BLOCK_ALL - Bucket is completely private
     * - No CORS needed - All access goes through CloudFront
     * - removalPolicy.DESTROY - For MVP; change to RETAIN for production
     * - autoDeleteObjects: true - Enables clean stack deletion during development
     * 
     * The bucket is accessed exclusively via CloudFront using Origin Access Control (OAC),
     * which provides signed requests from CloudFront to S3, ensuring no direct public access.
     */
    this.hostingBucket = new s3.Bucket(this, 'HostingBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false, // Disabled for MVP to reduce storage costs
    });

    /**
     * Origin Access Control (OAC) for CloudFront.
     * Architectural Decision: OAC is the modern replacement for Origin Access Identity (OAI).
     * It provides better security and supports additional features like signing with AWS Signature Version 4.
     * 
     * OAC ensures that:
     * - Only CloudFront can access the S3 bucket
     * - All requests from CloudFront to S3 are signed
     * - Direct S3 bucket access returns 403 Forbidden
     * 
     * This is a critical security measure that prevents users from bypassing CloudFront
     * and accessing S3 directly, which would bypass caching and HTTPS enforcement.
     */
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'Origin Access Control for Frontend Hosting Bucket',
    });

    /**
     * CloudFront Distribution for global content delivery.
     * Architectural Decision: CloudFront provides:
     * - Global edge network for low-latency access from anywhere
     * - Automatic HTTPS with free SSL/TLS certificate (*.cloudfront.net)
     * - DDoS protection via AWS Shield Standard (included at no extra cost)
     * - Reduced S3 costs through caching (fewer S3 requests)
     * 
     * ViewerProtocolPolicy.REDIRECT_TO_HTTPS ensures all HTTP requests are upgraded to HTTPS,
     * meeting modern security standards and protecting user data in transit.
     * 
     * DefaultRootObject: 'index.html' allows users to access the app at the root URL.
     * ErrorResponse configuration handles client-side routing (React Router) by serving
     * index.html for 404 errors, allowing the SPA to handle routing.
     * 
     * Note: S3BucketOrigin.withOriginAccessControl automatically sets up the necessary
     * bucket policy to allow CloudFront to access the bucket using OAC.
     */
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.hostingBucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      /**
       * Error response configuration for Single Page Application (SPA) routing.
       * When a user navigates directly to a route like /images/123, CloudFront
       * will try to fetch that path from S3 and get a 404. We intercept this
       * and serve index.html with a 200 status, allowing React Router to handle
       * the routing on the client side.
       */
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300), // Cache error responses for 5 minutes
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
      ],
    });

    /**
     * BucketDeployment to sync frontend assets to S3.
     * Architectural Decision: The BucketDeployment construct automates:
     * 1. Uploading files from the local dist directory to S3
     * 2. Invalidating CloudFront cache to ensure users get the latest version
     * 
     * The distributionPaths: ['/*'] ensures all cached content is invalidated.
     * This is crucial because CloudFront caches content at edge locations, and without
     * invalidation, users might see stale JavaScript/CSS even after deployment.
     * 
     * Important: The frontend must be built BEFORE running cdk deploy.
     * If the dist directory doesn't exist, deployment will fail.
     * 
     * Cost Consideration: CloudFront invalidation is free for the first 1,000 paths per month.
     * Using '/*' counts as one path. Additional invalidations cost $0.005 per path.
     */
    const frontendPath = props?.frontendDistPath || path.join(__dirname, '../../../frontend/dist');
    this.bucketDeployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(frontendPath)],
      destinationBucket: this.hostingBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      /**
       * Prune: Remove files from S3 that are not present in the source.
       * This keeps the bucket clean and prevents serving old files.
       * Set to false if you need to maintain old versions for rollback.
       */
      prune: true,
    });
  }
}
