import './ProfessionalFooter.css'

/**
 * ProfessionalFooter Component
 * 
 * Architectural Decision: Professional credibility and social proof.
 * This component displays the developer's professional credentials and provides
 * a direct link to their LinkedIn profile for networking and recruitment purposes.
 * 
 * Features:
 * - Developer profile picture
 * - LinkedIn profile link
 * - AWS Certified Solutions Architect (SAA) credential badge
 * - Professional Scrum Master I (PSM 1) credential badge
 * 
 * Design: Clean, business-like footer with professional certification badges.
 */
function ProfessionalFooter() {
  return (
    <footer className="professional-footer">
      <div className="footer-content">
        <div className="profile-section">
          <img 
            src="https://github.com/user-attachments/assets/6b0ea771-1daa-4a4b-b2cc-1ef83d9bdb83" 
            alt="Stefan Schmidpeter"
            className="profile-picture"
          />
          <div className="profile-info">
            <h3 className="credentials-title">Stefan Schmidpeter</h3>
            <p className="profile-role">AWS Solutions Architect & Cloud Developer</p>
          </div>
        </div>
        <div className="credentials-section">
          <div className="certifications">
            <div className="cert-badge aws">
              <img 
                src="https://d1.awsstatic.com/training-and-certification/certification-badges/AWS-Certified-Solutions-Architect-Associate_badge.3419559c682629072f1eb968d59dea0741772c0f.png"
                alt="AWS SAA Badge"
                className="cert-badge-img"
              />
              <span className="cert-text">AWS Certified Solutions Architect (SAA)</span>
            </div>
            <div className="cert-badge psm">
              <img 
                src="https://static.scrum.org/web/badges/badge-psmi.svg"
                alt="PSM I Badge"
                className="cert-badge-img"
              />
              <span className="cert-text">Professional Scrum Master I (PSM 1)</span>
            </div>
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
