import './ProjectDepth.css'

/**
 * ProjectDepth Component
 * 
 * Architectural Decision: Highlight technical depth and professional development practices.
 * This component communicates the project's technical sophistication to visitors, particularly
 * recruiters and technical stakeholders.
 * 
 * Features highlighted:
 * - TypeScript for type safety and maintainability
 * - Extensive test coverage (200+ tests)
 * - Infrastructure as Code via AWS CDK
 * - Fully automated CI/CD pipeline
 * 
 * Design: Modern card with glassmorphism effect and prominent GitHub link.
 */
function ProjectDepth() {
  return (
    <section className="project-depth">
      <div className="depth-header">
        <h2 className="depth-title">🔧 Technical Depth</h2>
        <a
          href="https://github.com/Gh0stbasta/serverless-ai-image-tagger"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          <span className="github-icon">⭐</span> View on GitHub
        </a>
      </div>
      <div className="depth-content">
        <div className="depth-item">
          <span className="depth-badge">TypeScript</span>
          <p>Powered by <strong>TypeScript</strong> for type-safe development across frontend, backend, and infrastructure.</p>
        </div>
        <div className="depth-item">
          <span className="depth-badge">200+ Tests</span>
          <p>Featuring <strong>200+ automated tests</strong> for comprehensive code quality and reliability.</p>
        </div>
        <div className="depth-item">
          <span className="depth-badge">AWS CDK</span>
          <p>Infrastructure as Code via <strong>AWS CDK</strong> for reproducible and version-controlled deployments.</p>
        </div>
        <div className="depth-item">
          <span className="depth-badge">CI/CD</span>
          <p>Fully automated <strong>CI/CD pipeline</strong> with GitHub Actions for continuous deployment.</p>
        </div>
      </div>
    </section>
  )
}

export default ProjectDepth
