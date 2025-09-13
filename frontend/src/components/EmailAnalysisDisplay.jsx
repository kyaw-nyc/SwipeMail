import { useCerebrasAnalysis } from '../hooks/useCerebrasAnalysis'

/**
 * Component to display Cerebras AI analysis for an email
 * Shows sentiment, importance, category, urgency, and summary
 */
function EmailAnalysisDisplay({ email, showDetailed = false }) {
  const { getAnalysis, isAnalyzing, analyzeEmail } = useCerebrasAnalysis()

  const analysis = getAnalysis(email.id)

  // No longer auto-analyze - only show analysis if it exists

  if (!analysis && isAnalyzing) {
    return (
      <div className="email-analysis analyzing">
        <div className="analysis-loading">🧠 Analyzing...</div>
      </div>
    )
  }

  if (!analysis) {
    return null
  }

  const getSentimentIcon = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return '😊'
      case 'negative': return '😞'
      case 'neutral': return '😐'
      default: return '❓'
    }
  }

  const getImportanceIcon = (importance) => {
    switch (importance?.toLowerCase()) {
      case 'high': return '🔴'
      case 'medium': return '🟡'
      case 'low': return '🟢'
      default: return '⚪'
    }
  }

  const getUrgencyIcon = (urgency) => {
    switch (urgency?.toLowerCase()) {
      case 'urgent': return '⚡'
      case 'normal': return '📝'
      case 'low': return '📋'
      default: return '❓'
    }
  }

  const getSenderTypeIcon = (senderType) => {
    switch (senderType?.toLowerCase()) {
      case 'organization': return '🏢'
      case 'company': return '🏢'
      case 'service': return '⚙️'
      case 'individual': return '👤'
      case 'person': return '👤'
      default: return '❓'
    }
  }

  const getSenderCategoryIcon = (category) => {
    const cat = category?.toLowerCase() || ''
    if (cat.includes('tech')) return '💻'
    if (cat.includes('bank') || cat.includes('finance')) return '🏦'
    if (cat.includes('health')) return '🏥'
    if (cat.includes('retail') || cat.includes('shop')) return '🛍️'
    if (cat.includes('social')) return '👥'
    if (cat.includes('newsletter') || cat.includes('news')) return '📰'
    if (cat.includes('government')) return '🏛️'
    if (cat.includes('friend')) return '👋'
    if (cat.includes('coworker') || cat.includes('work')) return '💼'
    return '📁'
  }

  const getActionableIcon = (actionable) => {
    return actionable?.toLowerCase() === 'yes' ? '✋' : '👀'
  }

  if (!showDetailed) {
    // Compact display for card overlay
    return (
      <div className="email-analysis compact">
        <div className="analysis-badges">
          <span className="analysis-badge sender-type" title={`From: ${analysis.senderType} (${analysis.senderCategory})`}>
            {getSenderTypeIcon(analysis.senderType)}
          </span>
          <span className="analysis-badge sender-category" title={`Category: ${analysis.senderCategory}`}>
            {getSenderCategoryIcon(analysis.senderCategory)}
          </span>
          <span className="analysis-badge importance" title={`Importance: ${analysis.importance}`}>
            {getImportanceIcon(analysis.importance)}
          </span>
          {analysis.actionable === 'yes' && (
            <span className="analysis-badge actionable" title="Action Required">
              {getActionableIcon(analysis.actionable)}
            </span>
          )}
          {analysis.urgency === 'urgent' && (
            <span className="analysis-badge urgency urgent" title="Urgent">
              {getUrgencyIcon(analysis.urgency)}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Detailed display
  return (
    <div className="email-analysis detailed">
      <div className="analysis-header">
        <h4>🧠 AI Analysis</h4>
      </div>

      <div className="analysis-grid">
        <div className="analysis-item">
          <label>Sender Type</label>
          <div className="analysis-value">
            {getSenderTypeIcon(analysis.senderType)} {analysis.senderType}
          </div>
        </div>

        <div className="analysis-item">
          <label>Sender Category</label>
          <div className="analysis-value">
            {getSenderCategoryIcon(analysis.senderCategory)} {analysis.senderCategory}
          </div>
        </div>

        <div className="analysis-item">
          <label>Email Purpose</label>
          <div className="analysis-value">
            📝 {analysis.emailPurpose}
          </div>
        </div>

        <div className="analysis-item">
          <label>Importance</label>
          <div className="analysis-value">
            {getImportanceIcon(analysis.importance)} {analysis.importance}
          </div>
        </div>

        <div className="analysis-item">
          <label>Urgency</label>
          <div className="analysis-value">
            {getUrgencyIcon(analysis.urgency)} {analysis.urgency}
          </div>
        </div>

        <div className="analysis-item">
          <label>Sentiment</label>
          <div className="analysis-value">
            {getSentimentIcon(analysis.sentiment)} {analysis.sentiment}
          </div>
        </div>

        <div className="analysis-item">
          <label>Action Required</label>
          <div className="analysis-value">
            {getActionableIcon(analysis.actionable)} {analysis.actionable}
          </div>
        </div>
      </div>

      {analysis.summary && (
        <div className="analysis-summary">
          <label>Summary</label>
          <p>{analysis.summary}</p>
        </div>
      )}
    </div>
  )
}

export default EmailAnalysisDisplay