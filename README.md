# Trippzy

Drop in your tickets and booking confirmations; Trippzy reads them with AI and builds your trip.
An Android app (React Native / Expo) with a FastAPI backend. It is a from-scratch rebuild of the
Trippy web app: same product and the same look, new stack.

| Layer | Choice |
| --- | --- |
| App | React Native, Expo SDK 58, TypeScript, Expo Router, NativeWind v4 |
| Auth | Clerk (Google, Apple, email + code) |
| API | Python 3.12, FastAPI, Pydantic v2 |
| Database | MongoDB Atlas (PyMongo async) |
| Files | Cloudflare R2, presigned URLs |
| AI | OpenRouter (default `qwen/qwen3.7-flash`), called only from the backend |

## Layout

```
backend/      FastAPI app, job worker, tests          (uv)
mobile/       Expo app                                (npm)
docs/         privacy policy, account-deletion page, Play Store checklist (docs/play-store.md)
tools/        make_icons.py — regenerates the app icons from the logo
openapi.json  generated from the backend; the app's API types are generated from it
```

## What the app does

Home (next trip, weather, local news, tickets in order) · Trips · Trip detail with expandable ticket cards
(flight boarding passes, hotels, trains, buses, activities, documents), a day-by-day itinerary, search / filter / sort,
live processing progress · an in-app viewer for the original PDF or photo with zoom and download/share · edit any
detail (your edits survive a re-read) · Profile and Settings (theme, notifications, storage, delete account).
Tickets and files for **upcoming trips are cached on the phone**, so a boarding pass opens with no signal;
the cache is wiped on sign-out and never shared between accounts.

## How a ticket becomes a trip

```
app ── POST /v1/trips/{id}/uploads ──► API   creates ticket + document, returns a presigned PUT URL
app ── PUT file ───────────────────► R2     (the file never passes through our servers)
app ── POST /v1/tickets/{id}/upload-complete ► API   verifies size + magic bytes, queues a job
                                       worker  reads PDF/photo → classify → extract → ground → logos/photos
                                               → ticket + trip (destination, dates, cover, places)
app ◄─ polls the ticket ─────────────  real stages: reading → identifying → extracting → building → finishing
```

Processing runs on the server, so closing the app mid-way never strands a ticket. A user's own edits
are remembered (`user_edits`) and survive a re-read.

## Security model

* The app is an untrusted client. Secrets (Clerk secret, OpenRouter key, Mongo URI, R2 keys) exist only on the backend.
* Every route verifies the Clerk JWT (JWKS, issuer, expiry, `azp`). Every database call is scoped by `user_id` in one
  place (`repositories/base.py`); another user's id looks like a missing document (404).
* Uploads: type is decided by the file's bytes, not the client's claim; size is checked after upload; URLs are short-lived.
* AI requests opt out of provider data retention; logs never contain tokens or document text.
* `DELETE /v1/me` erases R2 objects, all database records, then the Clerk account.

## Run it locally

### Backend
```bash
cd backend
cp .env.example .env        # fill in the values — .env is git-ignored, never commit it
uv sync
uv run uvicorn app.main:app_factory --factory --reload      # http://localhost:8000/docs
uv run pytest                                               # 72 tests
```

### App
```bash
cd mobile
cp .env.example .env        # EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_API_URL
npm install
npm run typecheck && npm test
npx expo run:android        # a development build — Google sign-in is native, so Expo Go can't run it
```

### Changing the API
```bash
cd backend && uv run python scripts/export_openapi.py   # rewrites ../openapi.json
cd ../mobile && npm run api:types                       # regenerates src/types/api.d.ts
```
CI fails if either file is stale.

## Deploying

* **API:** Railway, from `backend/Dockerfile` (health check `/healthz`). Use separate `dev` / `prod` environments.
* **MongoDB Atlas:** use a least-privilege user (readWrite on one database), never Atlas Admin.
* **App:** EAS Build (`eas build -p android`), then EAS Submit to Google Play.
