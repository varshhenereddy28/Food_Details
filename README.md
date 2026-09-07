# Food Expiry & Alert System

Low-complexity MVP using React/Vite, Python/FastAPI, PostgreSQL and Redis.

## Run locally

```powershell
npm run install:all
npm run dev
```

For real local SMS, copy `.env.example` to `.env`, enter the rotated Twilio values, and run `npm run dev` again. Never commit `.env` or paste its token into chat. Without those values, the worker records a development log instead of calling Twilio.

Open `http://localhost:5173`. Sign in with an email address and an E.164 phone number such as `+919876543210`. In local development the OTP is displayed in the page. After login, **Open camera** requests browser camera permission, captures the product label, and Tesseract.js reads the label locally before the dates are shown for confirmation.

The backend, migration runner, date parser and SMS worker are Python. The React/Vite frontend remains JavaScript because it runs in the browser.

## Complexity

The parser is linear in OCR text size, `O(t)`, with a constant-size prioritized pattern set. The indexed alert query is `O(log n + k)` where `k` is matching products; the worker processes only those matches in `O(k)` time and bounded queue memory.

## Production switches

Set `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` to send expiry SMS messages to each user's registered phone number. The worker sends one alert per day from 15 days before expiry through the expiry date. Register and buy the sending number in the [Twilio Console](https://console.twilio.com/us1/develop/phone-numbers/manage/search); `TWILIO_FROM_NUMBER` must be that E.164 number. Indian numbers also require Twilio DLT registration and an approved template. Without Twilio credentials, the worker logs the exact local SMS message instead.

The app stores the email entered at login for the user account, but expiry alerts currently use SMS only. There is no email delivery or email fallback configured.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and select `render.yaml`.
3. Set `VITE_API_URL` on `food-expiry-frontend` to the deployed API URL, for example `https://food-expiry-api.onrender.com`.
4. Set the Twilio values on both `food-expiry-api` and `food-expiry-worker`. Keep `TWILIO_AUTH_TOKEN` secret and never commit it to the repository.
5. Deploy. The API applies both SQL migrations before starting; the worker handles queued alerts.

The generated frontend URL is the user-facing website. Camera access requires HTTPS, which Render provides. For Indian numbers, configure the required Twilio DLT sender and message template before expecting SMS delivery.

Deployment files:

- `render.yaml` provisions the API, worker, static frontend, Postgres, and Redis.
- `frontend/.env.example` lists the API URL.
- `frontend/Dockerfile` and `frontend/nginx.conf` support container-based hosting outside Render.
