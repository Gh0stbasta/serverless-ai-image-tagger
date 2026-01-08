/**
 * useImages Custom Hook
 * 
 * Architectural Decision: Extract state management logic into a custom hook
 * to keep components clean and focused on rendering. This hook encapsulates:
 * - Data fetching logic
 * - Loading state management
 * - Error handling
 * - Automatic refresh capability
 * 
 * Benefits:
 * - Reusable across multiple components
 * - Easier to test in isolation
 * - Separates business logic from UI concerns
 * - Provides a consistent interface for image data access
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchImages } from '../services/apiService';
import type { ImageItem } from '../types';

/**
 * Hook state interface
 */
export interface UseImagesResult {
  /** Array of image items from the API */
  data: ImageItem[];
  /** Loading state indicator */
  loading: boolean;
  /** Error message if fetch fails, null otherwise */
  error: string | null;
  /** Function to manually trigger a refresh */
  refresh: () => void;
}

/**
 * Custom hook for managing image data fetching and state
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 * @param refreshKey - Optional key that triggers a refresh when changed
 * @returns Object containing data, loading, error states and refresh function
 * 
 * Usage:
 * ```tsx
 * const { data, loading, error, refresh } = useImages(apiUrl);
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * return <Gallery images={data} />;
 * ```
 * 
 * Architectural Decision: Accept refreshKey as a parameter to enable
 * parent components to trigger refreshes (e.g., after successful upload).
 * This is cleaner than exposing the refresh function through refs or
 * complex callback chains.
 */
export function useImages(apiUrl: string, refreshKey = 0): UseImagesResult {
  const [data, setData] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  /**
   * Manual refresh function
   * 
   * Architectural Decision: Provide an imperative way to refresh data
   * in addition to the declarative refreshKey. This gives consumers
   * flexibility in how they trigger refreshes.
   */
  const refresh = useCallback(() => {
    setLocalRefreshKey(prev => prev + 1);
  }, []);

  /**
   * Fetch images effect
   * 
   * Architectural Decision: Use useEffect with dependencies on apiUrl,
   * refreshKey, and localRefreshKey. This ensures data is refetched when:
   * - The component mounts
   * - The API URL changes
   * - The parent triggers a refresh via refreshKey
   * - The consumer calls the refresh() function
   */
  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      setLoading(true);
      setError(null);

      try {
        const images = await fetchImages(apiUrl);
        
        // Only update state if the request hasn't been cancelled
        // This prevents state updates after component unmount
        if (!cancelled) {
          setData(images);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching images:', err);
          setError(err instanceof Error ? err.message : 'Failed to load images');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadImages();

    // Cleanup function to prevent state updates after unmount
    return () => {
      cancelled = true;
    };
  }, [apiUrl, refreshKey, localRefreshKey]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
