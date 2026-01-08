/**
 * API Service Module
 * 
 * Architectural Decision: Centralize all API calls in a dedicated service module.
 * This follows the separation of concerns principle by:
 * - Isolating network logic from UI components
 * - Making API endpoints easier to test with mocks
 * - Providing a single source of truth for API communication
 * - Enabling easier migration to different backend implementations
 */

import type { ImageItem, PresignedUrlResponse } from '../types';

/**
 * Fetches the list of images from the backend API
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 * @returns Promise resolving to an array of ImageItem objects
 * @throws Error if the API request fails
 * 
 * Architectural Decision: This function strictly validates the response
 * and throws descriptive errors to help with debugging. The calling code
 * is responsible for handling these errors and displaying them to users.
 */
export async function fetchImages(apiUrl: string): Promise<ImageItem[]> {
  const response = await fetch(`${apiUrl}/images`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`);
  }

  const data: ImageItem[] = await response.json();
  return data;
}

/**
 * Requests a presigned URL from the backend for uploading a file to S3
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 * @returns Promise resolving to a PresignedUrlResponse object
 * @throws Error if the API request fails
 * 
 * Architectural Decision: The backend generates unique S3 keys, so the frontend
 * doesn't need to provide a filename. This simplifies the client and centralizes
 * naming logic in the backend where it can be consistently enforced.
 */
export async function getPresignedUrl(apiUrl: string): Promise<PresignedUrlResponse> {
  const response = await fetch(`${apiUrl}/upload-url`);
  
  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
  }

  const data: PresignedUrlResponse = await response.json();
  return data;
}

/**
 * Uploads an image file directly to S3 using a presigned URL
 * 
 * @param url - The presigned URL obtained from getPresignedUrl()
 * @param file - The File object to upload
 * @returns Promise that resolves when upload is complete
 * @throws Error if the upload fails
 * 
 * Architectural Decision: Send the Content-Type header to ensure S3 stores
 * the correct MIME type. This is critical for browser rendering when the
 * file is later retrieved. Default to 'application/octet-stream' if the
 * file type is unknown to ensure the upload doesn't fail.
 * 
 * Security Note: This uploads directly to S3, bypassing API Gateway and Lambda.
 * This reduces costs and latency but requires the presigned URL to have
 * appropriate permissions and expiration time (handled by the backend).
 */
export async function uploadImageToS3(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Deletes an image from the backend (S3 and DynamoDB)
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 * @param imageId - The unique identifier of the image to delete (S3 object key)
 * @returns Promise that resolves when deletion is complete
 * @throws Error if the API request fails
 * 
 * Architectural Decision: This function calls the DELETE /images/{imageId} endpoint
 * to remove both the S3 object and DynamoDB metadata entry. The backend ensures
 * atomic deletion of both resources.
 * 
 * The imageId must be URL-encoded to handle special characters in S3 object keys
 * (e.g., spaces, slashes). The backend will decode it before processing.
 * 
 * Security Note: Currently no authentication. In production, add Authorization header
 * with JWT or session token to prevent unauthorized deletions.
 */
export async function deleteImage(apiUrl: string, imageId: string): Promise<void> {
  const encodedImageId = encodeURIComponent(imageId);
  const response = await fetch(`${apiUrl}/images/${encodedImageId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
  }
}
