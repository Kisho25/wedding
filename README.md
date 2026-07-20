# Wedding Invitation

This project is a small Node.js site that serves a wedding invitation and collects RSVP responses.

## Run locally

```bash
npm start
```

Open:

```text
http://localhost:8000
```

## Generate personalized links

```bash
node scripts/generate_public_links.js data/guest-list.csv https://your-public-host public-links.csv
```

## Deploy to Render

1. Create a new Render Web Service from this repository.
2. Render will use `render.yaml`.
3. Set these environment variables:
   - `GOOGLE_SHEETS_WEBHOOK_URL` if you want RSVP data copied to Google Sheets.
   - `PORT` is set automatically by Render.
4. Deploy.

## Important note about data storage

On cloud hosting, local files like `data/guest-list.csv` and `data/responses.csv` may not persist across restarts unless you add persistent storage.

For a permanent setup, either:

- send RSVP data to Google Sheets using `GOOGLE_SHEETS_WEBHOOK_URL`, or
- attach persistent disk storage on your host.
