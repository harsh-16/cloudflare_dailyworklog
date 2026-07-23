# Daily Work Log Cloudflare Deployment

This repository separates the Daily Work Log frontend and backend so both can be deployed from Git.

## Folders

- `pages/` - Static frontend for Cloudflare Pages.
- `backend/` - Cloudflare Worker API and D1 database migration.

## Cloudflare Pages Setup

Create or update a Cloudflare Pages project connected to this repository.

Use these build settings:

```text
Root directory: pages
Framework preset: None
Build command: leave blank
Build output directory: /
Production branch: main
```

The app default API endpoint is configured in:

```text
pages/app.js
```

Expected values:

```js
var DEFAULT_INSTANCE = 'https://cloudflare-dailyworklog.harshpratapranausa.workers.dev';
var DEFAULT_API_PATH = '/rpc';
```

## Cloudflare Worker Backend Setup

Create or update the existing `cloudflare-dailyworklog` Cloudflare Worker Git deployment connected to this repository.

Recommended build settings from the repository root:

```text
Root directory: leave blank
Build command: npm install
Deploy command: npm run deploy
Production branch: main
```

Alternative build settings from the backend folder:

```text
Root directory: backend
Build command: npm install
Deploy command: npm run deploy
Production branch: main
```

The backend config is:

```text
backend/wrangler.toml
```

The Worker should expose:

```text
https://cloudflare-dailyworklog.harshpratapranausa.workers.dev/rpc
```

A healthy unauthenticated API check should return an API-key-required error, not `404`.

## D1 Migration

Run this once after connecting the D1 database:

```powershell
cd backend
npm install
npx wrangler d1 migrations apply daily-work-log --remote
```

## Secrets

Set the registration code as a Worker secret:

```powershell
cd backend
npx wrangler secret put DWL_REGISTRATION_CODE
```

Do not commit secrets to this repository.
