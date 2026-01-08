import { useState, useRef } from 'react'
import Gallery from './Gallery'
import InfoBox from './InfoBox'
import { getPresignedUrl, uploadImageToS3 } from './services/apiService'
import './App.css'

function App() {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [galleryKey, setGalleryKey] = useState(0)
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
      const data = await getPresignedUrl(apiUrl)

      // Step 2: Upload file to S3 using presigned URL
      await uploadImageToS3(data.uploadUrl, file)

      console.log(`Successfully uploaded file to S3 with key: ${data.key}`)
      
      // Show success message to user
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 3000)
      
      // Trigger gallery refresh by updating the key
      // This will cause the Gallery component to remount and fetch fresh data
      setGalleryKey(prev => prev + 1)
      
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
        <InfoBox />
        
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

        <Gallery key={galleryKey} apiUrl={apiUrl} />
      </main>
    </div>
  )
}

export default App
