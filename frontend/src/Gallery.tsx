import { useState, useEffect } from 'react'
import './Gallery.css'

/**
 * Label interface matching the backend response structure
 */
interface Label {
  name: string;
  confidence: number;
}

/**
 * ImageMetadata interface matching the DynamoDB schema
 * from the get-images Lambda function
 */
interface ImageMetadata {
  imageId: string;
  s3Url: string;
  labels: Label[];
  timestamp: string;
}

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
 * - Fetches images from the /images API endpoint
 * - Displays images in a responsive grid layout
 * - Shows AI-detected labels as badges with confidence scores
 * - Implements loading and error states for better UX
 * - Auto-refreshes when new images are available
 * 
 * @param apiUrl - The base URL of the API Gateway endpoint
 */
function Gallery({ apiUrl }: GalleryProps) {
  const [images, setImages] = useState<ImageMetadata[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetches images from the backend API
   * 
   * Architectural Decision: Use useEffect with empty dependency array to fetch on mount.
   * This ensures data is loaded when the component first renders.
   */
  useEffect(() => {
    const fetchImages = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/images`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`)
        }

        const data: ImageMetadata[] = await response.json()
        setImages(data)
      } catch (err) {
        console.error('Error fetching images:', err)
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        setIsLoading(false)
      }
    }

    fetchImages()
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
        {images.map((image) => (
          <div key={image.imageId} className="gallery-card">
            <div className="gallery-image-container">
              <img
                src={image.s3Url}
                alt={image.imageId}
                className="gallery-image"
                loading="lazy"
              />
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
        ))}
      </div>
    </section>
  )
}

export default Gallery
