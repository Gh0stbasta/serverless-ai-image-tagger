import { useState } from 'react'
import './App.css'

/**
 * Image metadata interface for DynamoDB items
 */
interface ImageMetadata {
  id: string;
  fileName: string;
  uploadedAt: string;
  tags?: string[];
  s3Key?: string;
}

function App() {
  const [images] = useState<ImageMetadata[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleUploadClick = () => {
    setIsUploading(true)
    // TODO: Implement actual upload logic in future issue
    setTimeout(() => setIsUploading(false), 1000)
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI Image Tagger</h1>
        <p className="app-subtitle">Serverless Image Analysis with AWS Rekognition</p>
      </header>

      <main className="app-main">
        <section className="upload-section">
          <button 
            className="upload-button"
            disabled={isUploading}
            onClick={handleUploadClick}
          >
            {isUploading ? 'Uploading...' : 'Upload Image'}
          </button>
        </section>

        <section className="images-section">
          <h2>Your Images ({images.length})</h2>
          {images.length === 0 ? (
            <p className="empty-state">No images yet. Upload one to get started!</p>
          ) : (
            <div className="images-grid">
              {images.map((image) => (
                <div key={image.id} className="image-card">
                  <p className="image-name">{image.fileName}</p>
                  <p className="image-date">{new Date(image.uploadedAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
