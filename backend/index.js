const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Sample email data for mock mode
const mockEmails = [
  {
    id: 'mock-1',
    subject: 'Welcome to SwipeMail!',
    from: 'SwipeMail Team <team@swipemail.com>',
    snippet: 'Thank you for trying SwipeMail! This is a sample email to help you test the interface. You can mark this as read or apply labels using the buttons below.',
    labelIds: ['INBOX', 'UNREAD']
  },
  {
    id: 'mock-2',
    subject: 'Your GitHub notification digest',
    from: 'GitHub <notifications@github.com>',
    snippet: 'You have 3 new pull requests awaiting your review. Check out the latest updates from your repositories.',
    labelIds: ['INBOX', 'UNREAD']
  },
  {
    id: 'mock-3',
    subject: 'Weekly Newsletter - AI & Machine Learning',
    from: 'AI Weekly <newsletter@aiweekly.co>',
    snippet: 'This week: OpenAI announces GPT-5, new computer vision breakthroughs, and the latest in autonomous vehicles. Plus 10 more stories.',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES']
  },
  {
    id: 'mock-4',
    subject: 'Your package has been delivered!',
    from: 'Amazon <shipment-tracking@amazon.com>',
    snippet: 'Great news! Your package has been delivered and is waiting for you. Was this delivery as expected?',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PURCHASES']
  },
  {
    id: 'mock-5',
    subject: 'Meeting reminder: Team Standup',
    from: 'Calendar <calendar-notification@google.com>',
    snippet: 'This is a reminder that Team Standup is starting in 15 minutes. Join the meeting or let your team know if you cannot attend.',
    labelIds: ['INBOX', 'UNREAD', 'IMPORTANT']
  },
  {
    id: 'mock-6',
    subject: 'Invoice from DigitalOcean',
    from: 'DigitalOcean <billing@digitalocean.com>',
    snippet: 'Your DigitalOcean invoice for December 2024 is now available. Total amount due: $47.32. View and download your invoice.',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PURCHASES']
  }
]

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SwipeMail Backend API'
  })
})

// Mock email endpoint for testing without Gmail API
app.get('/api/mock', (req, res) => {
  res.json(mockEmails)
})

// TODO: Add authentication endpoints
// POST /auth/google - Handle Google OAuth token exchange
// POST /auth/refresh - Refresh access tokens
// POST /auth/logout - Handle logout

// TODO: Add Gmail proxy endpoints (for future server-side implementation)
// GET /api/emails - Fetch emails from Gmail API server-side
// POST /api/emails/:id/read - Mark email as read
// POST /api/emails/:id/label - Apply label to email
// GET /api/labels - Get available Gmail labels

// TODO: Add user management endpoints
// GET /api/user/profile - Get user profile
// PUT /api/user/settings - Update user settings
// GET /api/user/stats - Get email statistics

// TODO: Add AI/ML endpoints for future features
// POST /api/emails/classify - Classify email content
// GET /api/emails/insights - Get email insights and analytics
// POST /api/emails/smart-reply - Generate smart reply suggestions

// Config endpoint to provide frontend with necessary configuration
app.get('/api/config', (req, res) => {
  res.json({
    features: {
      mockMode: true,
      gmailIntegration: false, // Will be true when server-side Gmail integration is added
      aiClassification: false, // Will be true when AI features are added
    },
    limits: {
      maxEmailsPerRequest: 50,
      maxFileSize: '10MB'
    }
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SwipeMail backend server running on http://localhost:${PORT}`)
  console.log(`📧 Mock emails available at http://localhost:${PORT}/api/mock`)
  console.log(`❤️  Health check at http://localhost:${PORT}/health`)
})