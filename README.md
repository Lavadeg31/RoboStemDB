# RobotEvents Firebase Sync System

A GitHub Actions-based data sync system that scrapes RobotEvents API data and stores it in Firebase (Firestore + Realtime Database) to replace direct API calls and avoid rate limits.

## Overview

This system performs a comprehensive scrape of RobotEvents API data and stores it in Firebase, serving as a cache layer for the Flutter app. It runs automatically via GitHub Actions workflows.
