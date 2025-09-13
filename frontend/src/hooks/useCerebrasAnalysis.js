import { useState, useEffect, useCallback } from 'react'
import cerebrasApi from '../services/cerebrasApi'

/**
 * React hook for Cerebras AI email analysis
 * Provides functions and state for analyzing emails with semantic understanding
 */
export function useCerebrasAnalysis() {
  const [analyses, setAnalyses] = useState({}) // emailId -> analysis mapping
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

  /**
   * Analyze a single email
   * @param {Object} email - Email object to analyze
   * @returns {Promise<Object>} Analysis result
   */
  const analyzeEmail = useCallback(async (email) => {
    if (!email || !email.id) return null

    // Return cached analysis if available
    if (analyses[email.id]) {
      return analyses[email.id]
    }

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const analysis = await cerebrasApi.analyzeEmail(email)

      // Cache the analysis
      setAnalyses(prev => ({
        ...prev,
        [email.id]: analysis
      }))

      return analysis
    } catch (error) {
      setAnalysisError(error.message)
      console.error('Email analysis failed:', error)
      return null
    } finally {
      setIsAnalyzing(false)
    }
  }, [analyses])

  /**
   * Analyze multiple emails in batch
   * @param {Array} emails - Array of email objects
   */
  const batchAnalyzeEmails = useCallback(async (emails) => {
    if (!emails || emails.length === 0) return

    // Filter out emails that are already analyzed
    const unanalyzedEmails = emails.filter(email => !analyses[email.id])

    if (unanalyzedEmails.length === 0) return

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const batchResults = await cerebrasApi.batchAnalyzeEmails(unanalyzedEmails)

      // Update analyses state with batch results
      const newAnalyses = {}
      batchResults.forEach(result => {
        if (result.emailId) {
          newAnalyses[result.emailId] = {
            sentiment: result.sentiment,
            importance: result.importance,
            category: result.category,
            urgency: result.urgency,
            summary: result.summary
          }
        }
      })

      setAnalyses(prev => ({ ...prev, ...newAnalyses }))
    } catch (error) {
      setAnalysisError(error.message)
      console.error('Batch email analysis failed:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [analyses])

  /**
   * Get analysis for a specific email
   * @param {string} emailId - Email ID
   * @returns {Object|null} Analysis object or null if not available
   */
  const getAnalysis = useCallback((emailId) => {
    return analyses[emailId] || null
  }, [analyses])

  /**
   * Check if an email has been analyzed
   * @param {string} emailId - Email ID
   * @returns {boolean} True if analysis exists
   */
  const hasAnalysis = useCallback((emailId) => {
    return !!analyses[emailId]
  }, [analyses])

  /**
   * Clear all analyses (useful for refresh/reset)
   */
  const clearAnalyses = useCallback(() => {
    setAnalyses({})
    setAnalysisError(null)
  }, [])

  /**
   * Get analysis statistics
   * @returns {Object} Stats about analyzed emails
   */
  const getAnalysisStats = useCallback(() => {
    const analysisValues = Object.values(analyses)

    if (analysisValues.length === 0) {
      return {
        total: 0,
        sentimentBreakdown: {},
        importanceBreakdown: {},
        categoryBreakdown: {},
        urgencyBreakdown: {}
      }
    }

    const stats = {
      total: analysisValues.length,
      sentimentBreakdown: {},
      importanceBreakdown: {},
      categoryBreakdown: {},
      urgencyBreakdown: {}
    }

    analysisValues.forEach(analysis => {
      // Count sentiments
      const sentiment = analysis.sentiment || 'unknown'
      stats.sentimentBreakdown[sentiment] = (stats.sentimentBreakdown[sentiment] || 0) + 1

      // Count importance levels
      const importance = analysis.importance || 'unknown'
      stats.importanceBreakdown[importance] = (stats.importanceBreakdown[importance] || 0) + 1

      // Count categories
      const category = analysis.category || 'unknown'
      stats.categoryBreakdown[category] = (stats.categoryBreakdown[category] || 0) + 1

      // Count urgency levels
      const urgency = analysis.urgency || 'unknown'
      stats.urgencyBreakdown[urgency] = (stats.urgencyBreakdown[urgency] || 0) + 1
    })

    return stats
  }, [analyses])

  return {
    // State
    analyses,
    isAnalyzing,
    analysisError,

    // Functions
    analyzeEmail,
    batchAnalyzeEmails,
    getAnalysis,
    hasAnalysis,
    clearAnalyses,
    getAnalysisStats
  }
}