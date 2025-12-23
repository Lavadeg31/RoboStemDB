# RobotEvents Firebase Sync System

A GitHub Actions-based data sync system that scrapes RobotEvents API data and stores it in Firebase (Firestore + Realtime Database) to replace direct API calls and avoid rate limits.

## Overview

This system performs a comprehensive scrape of RobotEvents API data and stores it in Firebase, serving as a cache layer for the Flutter app. It runs automatically via GitHub Actions workflows.

## Architecture

```
GitHub Actions Workflow
    ↓
Data Scraper Scripts
    ↓
RobotEvents API (with rate limiting & key rotation)
    ↓
Firebase Admin SDK
    ↓
Firestore + Realtime Database
```

## Project Structure

```
robotevents-firebase-sync/
├── .github/
│   └── workflows/
│       └── sync-robotevents.yml          # GitHub Actions workflow
├── scripts/
│   ├── sync.js                           # Main sync script
│   ├── config.js                         # Configuration and Firebase setup
│   ├── scrapers/
│   │   ├── events-scraper.js            # Scrape events
│   │   ├── event-details-scraper.js     # Scrape event details, divisions
│   │   ├── event-teams-scraper.js       # Scrape event teams
│   │   ├── event-matches-scraper.js     # Scrape event matches
│   │   ├── event-rankings-scraper.js    # Scrape regular rankings
│   │   ├── event-finalist-rankings-scraper.js  # Scrape finalist rankings
│   │   ├── event-skills-scraper.js      # Scrape skills results
│   │   └── season-events-scraper.js     # Scrape season events
│   └── utils/
│       ├── rate-limiter.js               # Rate limiting helper
│       ├── pagination.js                 # Pagination handler
│       └── firebase-helpers.js           # Firebase write helpers
├── package.json                          # Node.js dependencies
├── firebase.json                         # Firebase config
├── .firebaserc                           # Firebase project config
└── README.md                             # This file
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file (or configure GitHub Secrets for CI/CD):

```env
ROBOTEVENTS_API_KEYS=key1,key2,key3
FIREBASE_PROJECT_ID=robostemdb
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@robostemdb.iam.gserviceaccount.com
TARGET_SEASON_ID=196
```

### 3. Get Firebase Service Account Credentials

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Extract the values for `FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL`

### 4. Configure GitHub Secrets

For GitHub Actions, add these secrets in your repository settings:

- `ROBOTEVENTS_API_KEYS` - Comma-separated list of API keys
- `FIREBASE_PROJECT_ID` - Firebase project ID (robostemdb)
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `TARGET_SEASON_ID` - Season ID to sync (e.g., 196)

## Usage

### Local Development

```bash
npm run sync
```

### GitHub Actions

The workflow runs automatically:
- **Manual trigger**: Go to Actions > Sync RobotEvents to Firebase > Run workflow
- **Scheduled**: Daily at 2 AM UTC

## Data Structure

### Firestore Collections

- `/events/{eventId}` - Event data
- `/events/{eventId}/divisions/{divisionId}` - Division data
- `/events/{eventId}/divisions/{divisionId}/rankings/{rankingId}` - Regular rankings
- `/events/{eventId}/divisions/{divisionId}/finalistRankings/{rankingId}` - Finalist rankings
- `/events/{eventId}/divisions/{divisionId}/matches/{matchId}` - Match data
- `/events/{eventId}/teams/{teamId}` - Team data
- `/events/{eventId}/skills/{skillId}` - Skills results
- `/seasons/{seasonId}/events/{eventId}` - Season-event references
- `/sync/progress` - Sync progress tracking

### Realtime Database

- `/events/{eventId}/divisions/{divisionId}/rankings` - Rankings (for quick access)
- `/events/{eventId}/divisions/{divisionId}/matches` - Matches (for quick access)
- `/events/{eventId}/skills` - Skills results (for quick access)

## Features

- ✅ **Rate Limiting**: Exponential backoff for 429 errors
- ✅ **API Key Rotation**: Distributes load across multiple API keys
- ✅ **Pagination**: Handles paginated API responses automatically
- ✅ **Batch Writes**: Efficient Firebase writes using batch operations
- ✅ **Progress Tracking**: Tracks sync progress in Firestore
- ✅ **Error Handling**: Continues processing on individual errors
- ✅ **Resumable**: Can resume from last checkpoint (future enhancement)

## Rate Limiting

The system implements:
- Exponential backoff for rate limit errors (429)
- API key rotation to distribute load
- Configurable delays between requests

## Monitoring

Check sync progress in Firestore at `/sync/progress`:
- `currentSeason` - Currently processing season
- `totalEvents` - Total events to process
- `eventsProcessed` - Events completed
- `currentEvent` - Currently processing event
- `startTime` - Sync start timestamp
- `endTime` - Sync completion timestamp
- `completed` - Whether sync completed successfully
- `error` - Error message if sync failed

## Troubleshooting

### Rate Limit Errors

If you encounter rate limit errors:
1. Add more API keys to `ROBOTEVENTS_API_KEYS`
2. Increase delays between requests in the code
3. Run sync less frequently

### Firebase Permission Errors

Ensure your Firebase service account has:
- Firestore: Editor role
- Realtime Database: Editor role

### Missing Data

If data is missing:
1. Check sync progress in Firestore
2. Review error logs in GitHub Actions
3. Verify API keys are valid
4. Check RobotEvents API status

## Future Enhancements

- [ ] Incremental updates (only fetch changed data)
- [ ] Resume from last checkpoint
- [ ] Webhook triggers for real-time updates
- [ ] Data validation and cleanup
- [ ] Monitoring and alerting
- [ ] Support for multiple seasons
- [ ] Parallel processing of events

## License

ISC

