import './InfoBox.css'

/**
 * InfoBox Component
 * 
 * Architectural Decision: Separate component for displaying project features and benefits.
 * This provides users with context about the application's technical capabilities and
 * value proposition.
 * 
 * Features highlighted:
 * - Cloud Native & Serverless architecture
 * - AI-powered image tagging using AWS Rekognition
 * - Zero cost in idle state (pay-per-use pricing)
 * - Fully automated CI/CD deployment
 * 
 * Design: Modern card-based layout with responsive grid for feature items.
 * Icons provide visual cues for each feature category.
 */
function InfoBox() {
  return (
    <section className="info-box">
      <h2 className="info-title">Why This Project?</h2>
      <div className="info-grid">
        <div className="info-item">
          <div className="info-icon">☁️</div>
          <h3>Cloud Native & Serverless</h3>
          <p>Built entirely on AWS serverless services. Scales automatically from zero to millions of requests.</p>
        </div>
        <div className="info-item">
          <div className="info-icon">🤖</div>
          <h3>AI Image Tagging</h3>
          <p>Automatic image analysis powered by AWS Rekognition. Detects objects, scenes, and activities with confidence scores.</p>
        </div>
        <div className="info-item">
          <div className="info-icon">💰</div>
          <h3>Zero Cost in Idle</h3>
          <p>Pay-per-use pricing means $0 when not in use. No servers, no idle costs, only pay for what you use.</p>
        </div>
        <div className="info-item">
          <div className="info-icon">🚀</div>
          <h3>CI/CD Pipeline</h3>
          <p>Fully automated deployment via GitHub Actions. Every commit triggers infrastructure validation and deployment.</p>
        </div>
      </div>
    </section>
  )
}

export default InfoBox
