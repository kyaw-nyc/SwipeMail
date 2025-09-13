# SwipeMail

A hackathon-ready email management web app that connects to Gmail and provides a card-based interface for managing emails. Built with React + Vite frontend and Node.js + Express backend.

## 🚀 Features

### Current Features
- **Google OAuth Authentication**: Sign in with your Google account
- **Gmail API Integration**: Fetch unread emails from your Gmail inbox
- **Card-based UI**: Clean, modern interface for viewing emails
- **Email Actions**: Mark emails as read or apply labels (like starring)
- **Mock Mode**: Test the interface with sample data without Gmail API
- **Responsive Design**: Works on desktop and mobile devices

### Future Features (Ready for Extension)
- 🤖 AI-powered email classification
- 📱 Swipe gestures for mobile
- 🏷️ Smart labeling and organization
- 📊 Email analytics and insights
- 🔍 Advanced search and filtering

## 📁 Project Structure

```
SwipeMail/
├── frontend/          # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthButton.jsx
│   │   │   ├── EmailCard.jsx
│   │   │   ├── EmailList.jsx
│   │   │   └── FolderBar.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── .env.example
├── backend/           # Node.js + Express backend
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── db/               # Future database files
│   └── README.md
└── README.md
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Console account (for OAuth setup)

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd SwipeMail
```

### 2. Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Select "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:5173` (for frontend development)
   - Add authorized JavaScript origins:
     - `http://localhost:5173`
5. Copy the Client ID for use in your environment variables

### 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Google OAuth credentials
npm run dev
```

The backend will start on `http://localhost:3001`

#### Backend Environment Variables
```env
PORT=3001
NODE_ENV=development
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret_here
```

### 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your Google OAuth Client ID
npm run dev
```

The frontend will start on `http://localhost:5173`

#### Frontend Environment Variables
```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
VITE_API_URL=http://localhost:3001
```

### 5. Testing

1. Open `http://localhost:5173` in your browser
2. **Mock Mode**: Toggle "Mock Mode" to test with sample emails
3. **Gmail Mode**: Sign in with Google to access your real Gmail

## 🔧 Development

### Running Both Services
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### API Endpoints

#### Backend Endpoints
- `GET /health` - Health check
- `GET /api/mock` - Get sample emails for testing
- `GET /api/config` - Get app configuration

#### Gmail API Integration
The frontend directly calls Gmail API endpoints:
- `GET https://gmail.googleapis.com/gmail/v1/users/me/messages` - List messages
- `GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}` - Get message details
- `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/modify` - Modify message labels

## 🎯 Hackathon Tips

### Quick Start for Demo
1. Use Mock Mode to demonstrate the UI without Gmail setup
2. The sample emails show different types of content
3. All UI interactions work in mock mode

### Adding AI Features
The codebase includes TODO comments marking where AI/ML features should be integrated:

```javascript
// TODO: Add AI-powered email classification results here
// TODO: Add smart reply suggestions
// TODO: Add email insights and analytics
```

### Extending the Backend
Ready-to-implement endpoints are documented in `backend/index.js`:
- Authentication management
- Server-side Gmail integration
- AI/ML processing endpoints
- User analytics

## 🛡️ Security Notes

- OAuth tokens are handled client-side for simplicity
- For production, implement server-side token management
- Never commit real OAuth credentials to version control
- Use environment variables for all sensitive configuration

## 📱 Gmail API Scopes

The app requests these OAuth scopes:
- `openid` - Basic authentication
- `profile` - User profile information
- `email` - User email address
- `https://www.googleapis.com/auth/gmail.modify` - Read and modify Gmail

## 🚦 Troubleshooting

### Common Issues

1. **OAuth Error**: Ensure your Google Cloud project has Gmail API enabled
2. **CORS Issues**: Make sure backend is running on port 3001
3. **Mock Mode Not Working**: Check that backend is running and accessible
4. **Gmail Not Loading**: Verify OAuth client ID is correct in frontend .env

### Development Tools
- Use browser dev tools to inspect Gmail API requests
- Check network tab for API call details
- Console logs show authentication and API errors

## 🔮 Future Enhancements

The codebase is structured to easily add:

### AI/ML Features
- Email classification (work, personal, promotions, etc.)
- Smart reply suggestions
- Automated labeling
- Priority inbox

### Mobile Features
- Swipe gestures for email actions
- Progressive Web App (PWA) support
- Touch-optimized interface

### Advanced Gmail Integration
- Multiple account support
- Folder/label management
- Email composition
- Search functionality

### Analytics
- Email reading patterns
- Response time analytics
- Productivity insights

---

**Ready to hack!** 🎉 This boilerplate provides a solid foundation for building email management tools with modern web technologies and Gmail integration.