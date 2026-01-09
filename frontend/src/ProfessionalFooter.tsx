import './ProfessionalFooter.css'

/**
 * ProfessionalFooter Component
 * 
 * Architectural Decision: Professional credibility and social proof.
 * This component displays the developer's professional credentials and provides
 * a direct link to their LinkedIn profile for networking and recruitment purposes.
 * 
 * Features:
 * - LinkedIn profile link
 * - AWS Certified Solutions Architect (SAA) credential
 * - Professional Scrum Master I (PSM 1) credential
 * 
 * Design: Modern footer with glassmorphism effect and certification badges.
 */
function ProfessionalFooter() {
  return (
    <footer className="professional-footer">
      <div className="footer-content">
        <div className="credentials-section">
          <h3 className="credentials-title">Developed by Stefan Schmidpeter</h3>
          <div className="certifications">
            <span className="cert-badge aws">
              <span className="cert-icon">☁️</span>
              AWS Certified Solutions Architect (SAA)
            </span>
            <span className="cert-badge psm">
              <span className="cert-icon">⚡</span>
              Professional Scrum Master I (PSM 1)
            </span>
          </div>
        </div>
        <div className="social-section">
          <a
            href="https://www.linkedin.com/in/stefan-schmidpeter-16354b296"
            target="_blank"
            rel="noopener noreferrer"
            className="linkedin-link"
          >
            <span className="linkedin-icon">💼</span>
            Connect on LinkedIn
          </a>
        </div>
      </div>
    </footer>
  )
}

export default ProfessionalFooter
