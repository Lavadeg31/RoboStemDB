# Setup Guide

## Quick Start

### 1. Extract API Keys

get your api key from robotevents
Convert to:
```env
ROBOTEVENTS_API_KEYS=key1,key2,key3,...
```

### 2. Get Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create project: **robostemdb**
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file
6. Extract:
   - `private_key` → `FIREBASE_PRIVATE_KEY`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

**Important**: The private key needs to be formatted with `\n` for newlines when used in GitHub Secrets.

### 3. Configure GitHub Secrets

Go to your repository Settings > Secrets and variables > Actions, and add:

| Secret Name | Value | Example |
|------------|-------|---------|
| `ROBOTEVENTS_API_KEYS` | Comma-separated API keys | `key1,key2,key3,...` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `robostemdb` |
| `FIREBASE_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` |
| `FIREBASE_CLIENT_EMAIL` | Service account email | `firebase-adminsdk-xxxxx@robostemdb.iam.gserviceaccount.com` |
| `TARGET_SEASON_ID` | Season ID to sync | `196` |

### 4. Local Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   ROBOTEVENTS_API_KEYS=your_keys_here
   FIREBASE_PROJECT_ID=robostemdb
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@robostemdb.iam.gserviceaccount.com
   TARGET_SEASON_ID=196
   ```

3. Run sync:
   ```bash
   npm run sync
   ```

## Testing

To test locally before running in GitHub Actions:

1. Ensure all environment variables are set in `.env`
2. Run `npm run sync`
3. Check Firestore console to verify data was written
4. Check `/sync/progress` in Firestore for sync status

## Troubleshooting

### API Keys Not Working

- Verify keys are valid and not expired
- Check that keys are comma-separated without spaces (or with spaces trimmed)
- Ensure keys are from the `robotEventsApiKeys` array in the Dart file

### Firebase Authentication Errors

- Verify service account has proper permissions
- Check that private key includes `\n` for newlines
- Ensure project ID matches exactly: `robostemdb`

### Rate Limiting

- Add more API keys to distribute load
- The system automatically rotates keys and implements exponential backoff

