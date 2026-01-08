/**
 * Unit Tests for API Service
 * 
 * These tests verify that the API service correctly constructs requests,
 * handles responses, and sets appropriate headers (especially Content-Type for S3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchImages, getPresignedUrl, uploadImageToS3 } from './apiService';
import type { ImageItem, PresignedUrlResponse } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('API Service', () => {
  const mockApiUrl = 'https://api.example.com';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchImages', () => {
    it('calls the correct endpoint', async () => {
      const mockData: ImageItem[] = [
        {
          imageId: 'test-id',
          s3Url: 'https://s3.amazonaws.com/bucket/test.jpg',
          labels: [{ name: 'Test', confidence: 95 }],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      await fetchImages(mockApiUrl);

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiUrl}/images`);
    });

    it('returns parsed image data on success', async () => {
      const mockData: ImageItem[] = [
        {
          imageId: 'test-id',
          s3Url: 'https://s3.amazonaws.com/bucket/test.jpg',
          labels: [{ name: 'Test', confidence: 95 }],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchImages(mockApiUrl);

      expect(result).toEqual(mockData);
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchImages(mockApiUrl)).rejects.toThrow(
        'Failed to fetch images: 500 Internal Server Error'
      );
    });

    it('throws error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchImages(mockApiUrl)).rejects.toThrow('Network error');
    });

    it('returns empty array when no images exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await fetchImages(mockApiUrl);

      expect(result).toEqual([]);
    });
  });

  describe('getPresignedUrl', () => {
    it('calls the correct endpoint', async () => {
      const mockData: PresignedUrlResponse = {
        uploadUrl: 'https://s3.amazonaws.com/bucket/test-key',
        key: 'uploads/test-key.jpg',
        expiresIn: 300,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      await getPresignedUrl(mockApiUrl);

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiUrl}/upload-url`);
    });

    it('returns presigned URL data on success', async () => {
      const mockData: PresignedUrlResponse = {
        uploadUrl: 'https://s3.amazonaws.com/bucket/test-key',
        key: 'uploads/test-key.jpg',
        expiresIn: 300,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await getPresignedUrl(mockApiUrl);

      expect(result).toEqual(mockData);
    });

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(getPresignedUrl(mockApiUrl)).rejects.toThrow(
        'Failed to get upload URL: 403 Forbidden'
      );
    });

    it('throws error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getPresignedUrl(mockApiUrl)).rejects.toThrow('Network error');
    });
  });

  describe('uploadImageToS3', () => {
    const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/test-key?signature=abc123';

    it('sends PUT request to presigned URL', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await uploadImageToS3(mockPresignedUrl, file);

      expect(mockFetch).toHaveBeenCalledWith(
        mockPresignedUrl,
        expect.objectContaining({
          method: 'PUT',
          body: file,
        })
      );
    });

    it('sets correct Content-Type header for JPEG files', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await uploadImageToS3(mockPresignedUrl, file);

      expect(mockFetch).toHaveBeenCalledWith(
        mockPresignedUrl,
        expect.objectContaining({
          headers: {
            'Content-Type': 'image/jpeg',
          },
        })
      );
    });

    it('sets correct Content-Type header for PNG files', async () => {
      const file = new File(['test content'], 'test.png', { type: 'image/png' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await uploadImageToS3(mockPresignedUrl, file);

      expect(mockFetch).toHaveBeenCalledWith(
        mockPresignedUrl,
        expect.objectContaining({
          headers: {
            'Content-Type': 'image/png',
          },
        })
      );
    });

    it('uses default Content-Type for files without type', async () => {
      const file = new File(['test content'], 'test.jpg', { type: '' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await uploadImageToS3(mockPresignedUrl, file);

      expect(mockFetch).toHaveBeenCalledWith(
        mockPresignedUrl,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        })
      );
    });

    it('throws error when upload fails', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(uploadImageToS3(mockPresignedUrl, file)).rejects.toThrow(
        'Upload failed: 403 Forbidden'
      );
    });

    it('throws error when fetch fails', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(uploadImageToS3(mockPresignedUrl, file)).rejects.toThrow('Network error');
    });

    it('resolves without value on successful upload', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await uploadImageToS3(mockPresignedUrl, file);

      expect(result).toBeUndefined();
    });
  });
});
