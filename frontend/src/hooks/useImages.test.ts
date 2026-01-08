/**
 * Integration Tests for useImages Hook
 * 
 * These tests verify that the useImages hook correctly transitions through states:
 * loading: true -> data: [...] or error: 'Failed'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useImages } from './useImages';
import type { ImageItem } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('useImages Hook', () => {
  const mockApiUrl = 'https://api.example.com';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State and Loading', () => {
    it('starts with loading state true', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useImages(mockApiUrl));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('transitions from loading to data state on success', async () => {
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

      const { result } = renderHook(() => useImages(mockApiUrl));

      // Initially loading
      expect(result.current.loading).toBe(true);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
    });

    it('transitions from loading to error state on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      // Initially loading
      expect(result.current.loading).toBe(true);

      // Wait for error to occur
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBe('Failed to fetch images: 500 Internal Server Error');
    });
  });

  describe('Data Fetching', () => {
    it('fetches images from the API on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`${mockApiUrl}/images`);
      });
    });

    it('fetches only once on initial mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('returns empty array when no images exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });

    it('returns multiple images when available', async () => {
      const mockData: ImageItem[] = [
        {
          imageId: 'test-1',
          s3Url: 'https://s3.amazonaws.com/bucket/test-1.jpg',
          labels: [{ name: 'Test1', confidence: 95 }],
          timestamp: '2024-01-15T10:30:00.000Z',
        },
        {
          imageId: 'test-2',
          s3Url: 'https://s3.amazonaws.com/bucket/test-2.jpg',
          labels: [{ name: 'Test2', confidence: 88 }],
          timestamp: '2024-01-15T11:30:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.data).toEqual([]);
    });

    it('handles non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch images: 404 Not Found');
    });

    it('logs errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Refresh Functionality', () => {
    it('provides a refresh function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('refetches data when refresh is called', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Setup second response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            imageId: 'new-image',
            s3Url: 'https://s3.amazonaws.com/bucket/new.jpg',
            labels: [],
            timestamp: '2024-01-15T12:30:00.000Z',
          },
        ],
      });

      // Call refresh
      result.current.refresh();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].imageId).toBe('new-image');
    });

    it('sets loading state during refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useImages(mockApiUrl));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Setup slow response for refresh
      mockFetch.mockImplementation(() => new Promise(() => {}));

      result.current.refresh();

      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });
    });

    it('refetches when refreshKey changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result, rerender } = renderHook(
        ({ refreshKey }) => useImages(mockApiUrl, refreshKey),
        { initialProps: { refreshKey: 0 } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Setup second response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            imageId: 'new-image',
            s3Url: 'https://s3.amazonaws.com/bucket/new.jpg',
            labels: [],
            timestamp: '2024-01-15T12:30:00.000Z',
          },
        ],
      });

      // Change refreshKey
      rerender({ refreshKey: 1 });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(1);
      });
    });
  });

  describe('API URL Changes', () => {
    it('refetches when apiUrl changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result, rerender } = renderHook(
        ({ url }) => useImages(url),
        { initialProps: { url: 'https://api1.example.com' } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api1.example.com/images');

      // Setup second response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      // Change URL
      rerender({ url: 'https://api2.example.com' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('https://api2.example.com/images');
      });
    });
  });

  describe('Cleanup', () => {
    it('does not update state after unmount', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          ok: true,
          json: async () => [],
        }), 100);
      }));

      const { unmount } = renderHook(() => useImages(mockApiUrl));

      // Unmount before the promise resolves
      unmount();

      // Wait a bit to ensure the promise resolves
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not have any console errors about state updates
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('state update')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
