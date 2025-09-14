import { useEffect, useRef } from 'react'

function IsolatedEmailContent({ emailHTML }) {
  const containerRef = useRef(null)
  const shadowRootRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !emailHTML) return

    // Create shadow DOM for complete style isolation
    if (!shadowRootRef.current) {
      shadowRootRef.current = containerRef.current.attachShadow({ mode: 'closed' })
    }

    const shadowRoot = shadowRootRef.current

    // Define safe base styles for email content
    const baseStyles = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #333333;
          background: transparent;
          overflow: auto;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        /* Reset all elements to safe defaults */
        * {
          box-sizing: border-box;
          max-width: 100%;
        }

        /* Safe typography styles */
        p {
          margin: 0 0 1em 0;
          color: #333333;
        }

        h1, h2, h3, h4, h5, h6 {
          color: #333333;
          margin: 1em 0 0.5em 0;
          font-weight: 600;
        }

        a {
          color: #0066cc;
          text-decoration: underline;
        }

        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0.5em 0;
        }

        table {
          width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          margin: 0.5em 0;
        }

        td, th {
          padding: 0.25em 0.5em;
          border: 1px solid #dddddd;
          text-align: left;
        }

        ul, ol {
          margin: 0.5em 0;
          padding-left: 2em;
        }

        li {
          margin: 0.25em 0;
          color: #333333;
        }

        blockquote {
          margin: 0.5em 0;
          padding-left: 1em;
          border-left: 3px solid #cccccc;
          color: #666666;
          font-style: italic;
        }

        /* Prevent any positioning escapes */
        * {
          position: static !important;
          z-index: auto !important;
          top: auto !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
        }

        /* Block potentially problematic properties */
        * {
          transform: none !important;
          animation: none !important;
          transition: none !important;
        }
      </style>
    `

    // Sanitize and render email content in shadow DOM
    const safeHTML = sanitizeHTML(emailHTML)
    shadowRoot.innerHTML = baseStyles + `<div class="email-content">${safeHTML}</div>`

  }, [emailHTML])

  // Basic HTML sanitization to prevent XSS
  const sanitizeHTML = (html) => {
    if (!html) return 'No content available'

    // Remove script tags and event handlers
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '')
  }

  return (
    <div
      ref={containerRef}
      className="isolated-email-container"
      style={{
        width: '100%',
        minHeight: '100px',
        background: 'transparent'
      }}
    />
  )
}

export default IsolatedEmailContent