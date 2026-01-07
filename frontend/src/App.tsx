import { useState, useRef } from 'react'
import Gallery from './Gallery'
import './App.css'

/**
 * Response from the presigned URL API endpoint
 */
interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

function App() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * API URL from environment variable or fallback to localhost for development
   */
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  /**
   * Handles file selection and initiates upload process
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset error state
    setError(null)
    setIsUploading(true)

    try {
      // Step 1: Fetch presigned URL from API
      const response = await fetch(`${apiUrl}/upload-url`)
      if (!response.ok) {
        throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`)
      }

      const data: PresignedUrlResponse = await response.json()

      // Step 2: Upload file to S3 using presigned URL
      const uploadResponse = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
      }

      console.log(`Successfully uploaded file to S3 with key: ${data.key}`)
      
      // Show success message to user
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 3000)
      
      // Reset file input to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Triggers the hidden file input when upload button is clicked
   */
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI Image Tagger</h1>
        <p className="app-subtitle">Serverless Image Analysis with AWS Rekognition</p>
      </header>

      <main className="app-main">
        <section className="upload-section">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="File input"
          />
          <button 
            className="upload-button"
            disabled={isUploading}
            onClick={handleUploadClick}
          >
            {isUploading ? 'Uploading...' : 'Upload Image'}
          </button>
          {error && <p className="error-message">{error}</p>}
          {uploadSuccess && <p className="success-message">Upload successful! Processing image...</p>}
        </section>

        <Gallery apiUrl={apiUrl} />
      </main>
    </div>
  )
}

export default App
