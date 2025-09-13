# Database Directory

This directory is reserved for future database-related files and configurations.

## Future Plans

### Database Schema
- User profiles and authentication data
- Email classification history
- User preferences and settings
- Email processing analytics

### Potential Database Options
- **MongoDB**: For flexible document storage of emails and user data
- **PostgreSQL**: For structured data and complex queries
- **Redis**: For caching frequently accessed emails and session data

### Migration Files
Future database migration files will be stored here to track schema changes over time.

### Seed Data
Sample data files for development and testing environments.

## Current Status
Currently, the application operates without persistent storage:
- User authentication is handled client-side with Google OAuth
- Email data is fetched directly from Gmail API
- Mock mode uses in-memory sample data from the backend

## Setup Instructions (Future)
When database integration is added, setup instructions will include:
1. Database installation and configuration
2. Running migrations
3. Seeding development data
4. Backup and restore procedures