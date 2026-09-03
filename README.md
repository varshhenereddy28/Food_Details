# Food Expiry & Alert System

Low-complexity MVP using React/Vite, Node/Express, PostgreSQL, Redis and BullMQ.

## Run locally

```powershell
npm run install:all
docker compose up -d postgres redis
# Apply backend/migrations/001_init.sql to the database (requires pgcrypto)
npm run dev --prefix backend
npm run dev --prefix frontend
```

Open `http://localhost:5173`. Use an E.164 phone number such as `+919876543210`. In local development the OTP is displayed in the page. After login, **Open camera** requests browser camera permission, captures the product label, and Tesseract.js reads the label locally before the dates are shown for confirmation.

## Complexity

The parser is linear in OCR text size, `O(t)`, with a constant-size prioritized pattern set. The indexed alert query is `O(log n + k)` where `k` is matching products; the worker processes only those matches in `O(k)` time and bounded queue memory.

## Production switches

Set `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` to send expiry SMS messages to each user's registered phone number. Without Twilio credentials, the worker logs the exact local SMS message instead. Twilio failures are stored in `notification_log`; configure an email provider for production fallback. Use signed S3 URLs for image storage and a managed scheduler at 08:00 in each user's timezone. Browser camera access requires `localhost` or HTTPS.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and select `render.yaml`.
3. Set `VITE_API_URL` on `food-expiry-frontend` to the deployed API URL, for example `https://food-expiry-api.onrender.com`.
4. Set the Twilio values on both `food-expiry-api` and `food-expiry-worker`. Keep `TWILIO_AUTH_TOKEN` secret.
5. Deploy. The API applies both SQL migrations before starting; the worker handles queued alerts.

The generated frontend URL is the user-facing website. Camera access requires HTTPS, which Render provides. For Indian numbers, configure the required Twilio DLT sender and message template before expecting SMS delivery.

Deployment files:

- `render.yaml` provisions the API, worker, static frontend, Postgres, and Redis.
- `backend/.env.example` lists backend secrets.
- `frontend/.env.example` lists the API URL.
- `frontend/Dockerfile` and `frontend/nginx.conf` support container-based hosting outside Render.
