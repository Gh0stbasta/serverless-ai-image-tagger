import { useState, useEffect } from 'react'
import { fetchImages as fetchImagesFromAPI, deleteImage as deleteImageFromAPI } from './services/apiService'
import type { ImageItem } from './types'
import './Gallery.css'

/**
 * Gallery Component Props
 */
interface GalleryProps {
  apiUrl: string;
}

/**
 * Gallery Component
 * 
 * Architectural Decision: Separate component for displaying images and their AI-detected tags.
 * This follows the Single Responsibility Principle, making the component reusable and testable.
 * 
 * Features:
 * - Fetches images from the /images API endpoint on mount
 * - Displays images in a responsive grid layout
 * - Shows AI-detected labels as badges with confidence scores
 * - Implements loading and error states for better UX
 * 
 * Note: The component fetches data only on mount. To see newly uploaded images,
 * the page needs to be refreshed or the component needs to be remounted.
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 */
function Gallery({ apiUrl }: GalleryProps) {
  const [images, setImages] = useState<ImageItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingImageIds, setDeletingImageIds] = useState<Set<string>>(new Set())

  /**
   * Fetches images from the backend API
   * 
   * Architectural Decision: Use the centralized apiService for data fetching.
   * This ensures consistent error handling and makes it easier to mock in tests.
   */
  useEffect(() => {
    const loadImages = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await fetchImagesFromAPI(apiUrl)
        setImages(data)
      } catch (err) {
        console.error('Error fetching images:', err)
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        setIsLoading(false)
      }
    }

    loadImages()
  }, [apiUrl])

  /**
   * Formats the timestamp to a readable date string
   */
  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  /**
   * Determines badge color based on confidence level
   * 
   * Architectural Decision: Visual feedback for confidence levels helps users
   * understand the reliability of AI-detected tags.
   * - High confidence (≥90): Green
   * - Medium confidence (70-89): Yellow
   * - Low confidence (<70): Red
   */
  const getBadgeClass = (confidence: number): string => {
    if (confidence >= 90) return 'badge-high'
    if (confidence >= 70) return 'badge-medium'
    return 'badge-low'
  }

  /**
   * Handles image deletion
   * 
   * Architectural Decision: Implements optimistic UI updates for better UX.
   * The image is immediately removed from the UI, and if the deletion fails,
   * we show an error and reload the images from the backend.
   * 
   * This provides instant feedback to the user while maintaining data consistency
   * by re-fetching on error.
   */
  const handleDelete = async (imageId: string) => {
    // Optimistic UI update: mark image as deleting
    setDeletingImageIds(prev => new Set(prev).add(imageId))
    setError(null)

    try {
      // Call the delete API
      await deleteImageFromAPI(apiUrl, imageId)
      
      // Remove from local state on success
      setImages(prevImages => prevImages.filter(img => img.imageId !== imageId))
      setDeletingImageIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(imageId)
        return newSet
      })
    } catch (err) {
      console.error('Error deleting image:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete image')
      
      // Remove from deleting set
      setDeletingImageIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(imageId)
        return newSet
      })
      
      // Reload images to ensure UI is in sync with backend
      try {
        const data = await fetchImagesFromAPI(apiUrl)
        setImages(data)
      } catch (reloadErr) {
        console.error('Error reloading images after delete failure:', reloadErr)
      }
    }
  }

  /**
   * Loading State
   */
  if (isLoading) {
    return (
      <section className="gallery-section">
        <h2>Your Images</h2>
        <p className="loading-state">Loading images...</p>
      </section>
    )
  }

  /**
   * Error State
   */
  if (error) {
    return (
      <section className="gallery-section">
        <h2>Your Images</h2>
        <p className="error-state">{error}</p>
      </section>
    )
  }

  /**
   * Empty State
   */
  if (images.length === 0) {
    return (
      <section className="gallery-section">
        <h2>Your Images (0)</h2>
        <p className="empty-state">No images yet. Upload one to get started!</p>
      </section>
    )
  }

  /**
   * Gallery Grid View
   */
  return (
    <section className="gallery-section">
      <h2>Your Images ({images.length})</h2>
      <div className="gallery-grid">
        {images.map((image) => {
          const isDeleting = deletingImageIds.has(image.imageId)
          return (
            <div 
              key={image.imageId} 
              className={`gallery-card ${isDeleting ? 'deleting' : ''}`}
            >
              <div className="gallery-image-container">
                <img
                  src={image.s3Url}
                  alt={image.imageId}
                  className="gallery-image"
                  loading="lazy"
                />
                <button
                  className="delete-button"
                  onClick={() => handleDelete(image.imageId)}
                  disabled={isDeleting}
                  aria-label="Delete image"
                  title="Delete image"
                >
                  {isDeleting ? '⏳' : '🗑️'}
                </button>
              </div>
              <div className="gallery-info">
                <p className="gallery-filename" title={image.imageId}>
                  {image.imageId.split('/').pop()}
                </p>
                <p className="gallery-date">{formatDate(image.timestamp)}</p>
                {image.labels && image.labels.length > 0 && (
                  <div className="gallery-tags">
                    {image.labels.map((label, index) => (
                      <span
                        key={`${image.imageId}-${label.name}-${index}`}
                        className={`tag-badge ${getBadgeClass(label.confidence)}`}
                        title={`Confidence: ${label.confidence}%`}
                      >
                        {label.name} {Math.round(label.confidence)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default Gallery
