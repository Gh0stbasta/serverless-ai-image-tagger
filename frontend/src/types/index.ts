/**
 * Shared Type Definitions for Frontend-Backend Integration
 * 
 * Architectural Decision: Centralize all API-related types in a single file
 * to ensure consistency between components and services. This prevents type
 * drift and makes the API contract explicit.
 */

/**
 * Label detected by AWS Rekognition
 */
export interface Label {
  name: string;
  confidence: number;
}

/**
 * ImageItem interface matching the DynamoDB schema
 * from the get-images Lambda function
 * 
 * This interface strictly defines the structure returned by the /images endpoint
 */
export interface ImageItem {
  imageId: string;
  s3Url: string;
  labels: Label[];
  timestamp: string;
}

/**
 * Response from the presigned URL API endpoint
 * 
 * This interface defines the structure returned by the /upload-url endpoint
 */
export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}
