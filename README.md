# RobotEvents Firebase Sync System

A multi-layered GitHub Actions-based data sync system that scrapes RobotEvents API data and stores it in Firebase. This system provides ultra-fast data access for the Flutter app while avoiding RobotEvents API rate limits.

## Architecture

The system is split into three specialized workflows to optimize performance and cost:

1.  **LIVE Sync (Every 2 Minutes)**:
    *   **Target**: Events happening *today*.
    *   **Data**: Matches and Rankings only.
    *   **Storage**: Pushes to **Firestore** and **Realtime Database** (RTDB) for ultra-low latency updates in the app.
    *   **Goal**: Live scoring updates during tournaments.

2.  **NEW Events Sync (Every 6 Hours)**:
    *   **Target**: Entire season.
    *   *Data**: Identifies and syncs metadata, teams, and skills for events not yet in the database.
    *   **Goal**: Quickly detect newly added events or changes to upcoming events.

3.  **DAILY Full Sync (Every 24 Hours)**:
    *   **Target**: Entire season.
    *   **Data**: Comprehensive sync of all data points (details, divisions, teams, rankings, finalist rankings, matches, skills).
    *   **Goal**: Ensures data integrity and repairs any missing or outdated information.

4.  **WEEKLY Master Team Sync (Every Sunday)**:
    *   **Source**: Private GitHub repository `Lavadeg31/TeamList`.
    *   **Data**: Imports the `master_team_list.json` containing details for ~27,000+ teams.
    *   **Storage**: Pushes to the `master_teams` collection in Firestore.
    *   **Goal**: Provides a global lookup for team details (name, organization, location, grade) without needing to scrape them individually.

## Project Structure

*   `scripts/sync.js`: The main orchestrator (supports `--live`, `--new`, `--full` modes).
*   `scripts/sync-teams.js`: Specialized script for importing the Master Team List.
*   `scripts/scrapers/`: Individual modules for different API endpoints.
*   `scripts/utils/api-client.js`: Centralized API client with rotation and rate-limit handling.
*   `scripts/utils/firebase-helpers.js`: Optimized database write operations.
*   `.github/workflows/`: Automated GitHub Actions workflows.

## Setup

See [SETUP.md](./SETUP.md) for detailed instructions on configuring API keys and Firebase credentials.

## Scripts

```bash
# Run a full sync manually
npm run sync

# Run a live sync (today's events only)
npm run sync:live

# Sync only new/updated events
npm run sync:new
```
