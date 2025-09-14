import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react'

function AuthButtonImpl({ user, onLoginSuccess, onLogout }, ref) {
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState(null)
  const googleButtonRef = useRef(null)

  useEffect(() => {
    initializeGoogleIdentity()
  }, [])

  const initializeGoogleIdentity = async () => {
    try {
      // Check if Google Client ID is configured
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (!clientId || clientId === 'your-google-client-id-here.apps.googleusercontent.com') {
        throw new Error('Google OAuth Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.')
      }

      // Wait for Google Identity Services to load
      await waitForGoogleIdentity()

      // Initialize Google Identity Services for sign-in
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      setAuthReady(true)
      console.log('✅ Google Identity Services initialized successfully')

      // Render the Google sign-in button
      renderGoogleButton()

    } catch (error) {
      console.error('❌ Failed to initialize Google Identity Services:', error)
      setAuthError(error.message)
      setAuthReady(true) // Still show error message
    }
  }

  // Imperative sign-in trigger for external buttons
  useImperativeHandle(ref, () => ({
    async signIn() {
      try {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        if (!clientId) throw new Error('Google OAuth Client ID not configured')
        await waitForGoogleIdentity()

        if (!window.google?.accounts?.oauth2) throw new Error('Google OAuth2 client unavailable')

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          // Request basic profile + Gmail modify so we can fetch user info and access Gmail
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.modify',
          prompt: 'consent',
          callback: async (tokenResponse) => {
            try {
              if (!tokenResponse?.access_token) throw new Error('No access token received')
              // Fetch basic user profile
              const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              })
              if (!resp.ok) throw new Error('Failed to fetch user profile')
              const profile = await resp.json()

              onLoginSuccess({
                user: {
                  name: profile.name || profile.given_name || 'User',
                  email: profile.email,
                  picture: profile.picture,
                },
                access_token: tokenResponse.access_token,
              })
            } catch (e) {
              console.error('Sign-in callback error:', e)
              alert('Failed to complete sign-in. Please try again.')
            }
          },
          error_callback: (error) => {
            console.error('OAuth error:', error)
            alert('Sign-in was cancelled or failed. Please try again.')
          },
        })

        client.requestAccessToken()
      } catch (e) {
        console.error('signIn() failed:', e)
        alert('Google sign-in is unavailable. Please refresh and try again.')
      }
    },
  }))

  const waitForGoogleIdentity = () => {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve()
        return
      }

      let attempts = 0
      const maxAttempts = 50 // 5 seconds

      const checkGoogle = setInterval(() => {
        attempts++
        if (window.google?.accounts?.id) {
          clearInterval(checkGoogle)
          resolve()
        } else if (attempts >= maxAttempts) {
          clearInterval(checkGoogle)
          reject(new Error('Google Identity Services failed to load'))
        }
      }, 100)
    })
  }

  const renderGoogleButton = () => {
    if (googleButtonRef.current && !user && window.google?.accounts?.id) {
      try {
        // Clear existing content
        googleButtonRef.current.innerHTML = ''

        // Render the official Google sign-in button
        window.google.accounts.id.renderButton(
          googleButtonRef.current,
          {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            shape: 'rectangular',
            width: 240,
            text: 'signin_with'
          }
        )

        console.log('✅ Google sign-in button rendered')
      } catch (error) {
        console.error('❌ Failed to render Google button:', error)
      }
    }
  }

  const handleCredentialResponse = async (response) => {
    try {
      // Decode the JWT credential to get basic user info
      const payload = JSON.parse(atob(response.credential.split('.')[1]))

      console.log('✅ Google sign-in successful!')
      console.log('📧 Email:', payload.email)

      // Now request Gmail access using OAuth2 flow
      await requestGmailAccess(payload)

    } catch (error) {
      console.error('❌ Error processing credential:', error)
      handleSignInFailure(error)
    }
  }

  const requestGmailAccess = async (userPayload) => {
    try {
      // Use Google's OAuth2 popup flow to get Gmail access
      if (window.google?.accounts?.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/gmail.modify',
          prompt: 'consent', // Always show consent screen
          callback: (tokenResponse) => {
            if (tokenResponse.access_token) {
              console.log('✅ Gmail access token received!')
              console.log('🔑 Access token length:', tokenResponse.access_token.length)

              onLoginSuccess({
                user: {
                  name: userPayload.name,
                  email: userPayload.email,
                  picture: userPayload.picture
                },
                access_token: tokenResponse.access_token
              })
            } else {
              console.error('❌ No access token received - Gmail access is required')
              alert('Gmail access is required for SwipeMail to work. Please try signing in again and grant permissions.')
            }
          },
          error_callback: (error) => {
            console.error('❌ Gmail access denied or failed:', error)
            alert('Gmail access is required for SwipeMail to work. Please try signing in again and grant permissions.')
          }
        })

        // Request the access token
        client.requestAccessToken()
      } else {
        console.error('❌ OAuth2 client not available')
        alert('Google OAuth2 is not available. Please refresh the page and try again.')
      }

    } catch (error) {
      console.error('❌ Error requesting Gmail access:', error)
      alert('Error requesting Gmail access. Please try signing in again.')
    }
  }




  const handleSignInFailure = (error) => {
    console.error('❌ Sign-in failed:', error)
    alert('Sign-in failed. Please check your Google OAuth configuration.')
  }

  const handleSignOut = async () => {
    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect()
        console.log('✅ Signed out successfully')
      }
    } catch (error) {
      console.error('❌ Sign-out error:', error)
    }

    onLogout()
  }

  // Re-render Google button when component updates
  useEffect(() => {
    if (authReady && !user) {
      setTimeout(renderGoogleButton, 200)
    }
  }, [user, authReady])

  return (
    <div className="auth-button">
      {user ? (
        <div className="user-info">
          <img src={user.picture} alt={user.name} className="user-avatar" />
          <span className="user-name">{user.name}</span>
          <button onClick={handleSignOut} className="sign-out-btn">
            Sign Out
          </button>
        </div>
      ) : (
        <div className="sign-in-container">
          {authError ? (
            <div className="auth-error">
              <h3>⚠️ Configuration Required</h3>
              <p>{authError}</p>
              <small>
                Please follow the setup instructions to configure Google OAuth.
              </small>
            </div>
          ) : (
            <>
              {/* Official Google sign-in button */}
              <div ref={googleButtonRef} className="google-signin-button"></div>

              {!authReady && (
                <div className="loading-state">
                  <small>Loading Google services...</small>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default forwardRef(AuthButtonImpl)
