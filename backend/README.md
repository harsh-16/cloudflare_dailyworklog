# Daily Work Log Cloudflare Backend

This folder is the no-cost cloud replacement for the ServiceNow PDI backend.
It keeps the existing Daily Work Log RPC contract, including `X-DWL-Key`,
topics, updates, notes, users, one-active-API-key-per-user, and assistant
capture/lookup actions.

## Setup

1. Create or use a free Cloudflare account.
2. From this folder, install Wrangler:

   ```powershell
   npm install
   ```

3. Log in to Cloudflare:

   ```powershell
   npx wrangler login
   ```

4. Create the D1 database:

   ```powershell
   npx wrangler d1 create daily-work-log
   ```

5. Copy the `database_id` returned by Cloudflare into `wrangler.toml`.

6. Review the non-secret variables in `wrangler.toml`:

   - `DWL_ADMIN_EMAILS`: comma-separated admin emails.
   - `DWL_ALLOWED_REGISTRATION_DOMAINS`: use `*` for open self-registration, or values like `corpay.com,hexaware.com`.
   - `DWL_ALLOWED_ORIGINS`: use `*` while testing, or restrict to your hosted app URL.
   - `DWL_TIME_ZONE`: defaults to `America/New_York`.

7. Optional: require a registration code without putting it in source control:

   ```powershell
   npx wrangler secret put DWL_REGISTRATION_CODE
   ```

8. Apply the database migration:

   ```powershell
   npx wrangler d1 migrations apply daily-work-log --remote
   ```

9. Deploy the Worker:

   ```powershell
   npm run deploy
   ```

## Connecting the Existing UI

Cloudflare Pages frontend:

```text
https://worklog.harsh16.workers.dev/
```

Cloudflare Worker backend:

```text
https://dailyworklog-api.harsh16.workers.dev
```

In the Daily Work Log Connection page, use:

- Instance URL: `https://dailyworklog-api.harsh16.workers.dev`
- API path: `/rpc`
- API key: leave blank, then use self-registration to create your personal key

The Worker accepts POST requests on any path, but `/rpc` keeps the current app
configuration clear.

## Deploying the Frontend

The Cloudflare Pages static files are staged in:

```text
..\cloudflare-pages
```

Deploy them with:

```powershell
npm run pages:deploy
```

## Notes

- API keys are shown only once and stored as SHA-256 hashes.
- Creating a new API key deletes older keys for that same profile.
- Each user's topics, updates, notes, and to-dos are isolated by profile.
- Admin features are controlled by `DWL_ADMIN_EMAILS`.
