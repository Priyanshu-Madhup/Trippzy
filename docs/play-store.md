# Google Play release checklist

Everything the app and backend do is reflected in the answers below. Re-check them if the app changes.

## 1. Before you can publish
- [ ] **Google Play developer account** ($25 one-time, identity verification). Personal accounts created after Nov 2023 must run a
      **closed test with at least 12 testers for 14 days** before production access — verify the current rule in Play Console and start early.
- [ ] **Host the legal pages** ([privacy](legal/privacy.html), [account deletion](legal/delete-account.html)) at public URLs
      (GitHub Pages, Vercel…). Fill in `[YOUR NAME OR COMPANY]`, `[YOUR CONTACT EMAIL]`, `[DATE]` first.
- [ ] **Android package name** is `com.trippzy.app` (in `mobile/app.json`). It cannot be changed after the first upload.
- [ ] **Production backend (Railway)**: deploy `backend/` (Dockerfile + `railway.json` are ready), set every variable from `backend/.env.example`
      as Railway variables — including `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (needed for Delete account), `TOMTOM_API_KEY`,
      `OPENROUTER_API_KEY`, the R2 keys and `MONGODB_URI`.
- [ ] **MongoDB Atlas**: a *least-privilege* user (readWrite on one DB — not Atlas Admin). Railway has no fixed outbound IP, so Network
      Access must allow `0.0.0.0/0` (the database is still protected by its username + password) or use Railway's static-IP add-on.
- [ ] **Clerk production instance** (`pk_live_…`, needs a domain you own): enable Email + Google, set up your own Google OAuth
      credentials, add the `trippzy://sso-callback` redirect, and create a new secret key.
- [ ] **Rotate every key that appeared in development chats** (Atlas, R2, OpenRouter, Clerk, TomTom, logo.dev).
- [ ] Set the User-Agent contact URL in `backend/app/core/config.py` (`USER_AGENT`) to your real site.
- [ ] Point the app at the live API: in `mobile/eas.json` → `build.production.env` add `EXPO_PUBLIC_API_URL` (https://…) and
      `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (the `pk_live_…` key). Nothing secret goes in the app.

## 2. Build and ship
```
cd mobile
eas build --profile production --platform android      # produces an .aab, signed with an EAS-managed upload key
eas submit --platform android                          # to the Play "internal testing" track first
```
Release path: internal → closed testing (12 testers, 14 days) → production (use a staged rollout).
`versionCode` increments automatically (`autoIncrement` + remote app version source).

## 3. Store listing
- **Name:** Trippzy · **Short description:** Drop in your tickets. We organise your trip.
- **Full description:** Upload flight, hotel, train, bus and activity bookings (PDF or photo) — or share them straight from Gmail or
  Files. Trippzy reads them with AI and builds your itinerary, with destination photos, provider logos and weather. Its travel note
  tells you when to leave for your next flight or train using live traffic, can add reminders to your phone's calendar, and keeps tickets
  available offline for upcoming trips.
- **Category:** Travel & Local. **Icon:** `mobile/assets/icon.png` (512×512 export). **Screenshots:** capture Home (with the travel
  note), Trips, a trip with tickets, a flight card, the itinerary, and the Home-widgets screen (phone, min 2).
- **Feature graphic (1024×500):** still to create.

## 4. Data safety form (answers)
| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Collects: **yes**. Shares with third parties for their own purposes: **no** (service providers only) |
| Is all data encrypted in transit? | **Yes** (HTTPS) |
| Can users request data deletion? | **Yes** — in-app (Settings → Delete account) and web page |

Data types collected (all: *required for app functionality*, *not* used for advertising or analytics, processed by service providers):

| Data type | Collected | Notes |
| --- | --- | --- |
| Name, Email address, User IDs | Yes | Account profile (Clerk user id) |
| Other personal info (gender, age, country) | Yes — **optional** | Entered by the user on the Edit-profile screen; only stored on the account |
| Photos (user-provided) | Yes | Ticket photos the user uploads; an optional profile picture (stored by Clerk) |
| Files and docs | Yes | Uploaded PDFs/images; may contain passport/visa details — disclose as personal info |
| Other user-generated content | Yes | Trips, notes, edits |
| **Precise location** | **Yes — optional, foreground only** | Read while the app is open to compute the travel note (distance + traffic to the airport/station). Sent to our server and TomTom for that one request; **not stored or logged**. Declare it as collected, purpose *App functionality*, *not shared*, and mark it *optional* |
| Calendar | **No (stays on device)** | Reminders are written to a "Trippzy" calendar on the phone; nothing is sent to us |
| App activity / diagnostics (crash logs) | Only if Sentry is added | Declare it if you add crash reporting |
| Contacts, financial info, health, messages, audio, video, web history | **No** | The `Price` extracted from a ticket is booking text, not payment data; the app takes no payments |

Data processors to name in the policy: Clerk, MongoDB Atlas, Cloudflare, OpenRouter (and its model provider), TomTom, Railway.

## 5. Permissions (declared in `mobile/app.json`)
- `CAMERA` — only to photograph a ticket.
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — **foreground only** (no background location, no foreground service), for the Home travel note. The app asks first and works without it.
- `READ_CALENDAR` / `WRITE_CALENDAR` — optional "Calendar reminders" switch; used to create and update events in the app's own calendar.
- Storage and microphone permissions are explicitly **blocked**. Files are chosen with the system document picker and photo picker
  (no storage permission needed). Android's Share sheet can send PDFs/images to Trippzy (an intent filter, no permission). Internet access is implicit.
- Play Console asks you to justify location and calendar permissions: use the wording above.

## 6. App content declarations
- **Target audience:** 18+ (general audience; not directed at children). **Ads:** none. **News app:** no.
- **Account deletion:** provide both URLs above in the *Data deletion* section of the Data safety form.
- **Content rating:** complete the questionnaire (no violence, user-generated content shared with others: no).
- **Credits:** profile avatars are DiceBear (Lorelei, Notionists, Thumbs — CC0), already credited in the picker.

## 7. Pre-launch testing
- [ ] Sign up with email code and with Google on a real device (production Clerk keys).
- [ ] Upload: PDF, photo from the camera, a scanned (image-only) PDF, a round-trip ticket (two cards), a bad file (clear error).
- [ ] Share a PDF from Gmail/Files into Trippzy, choose a trip, and watch it upload.
- [ ] Travel note: allow location, check leave-by time against a map app; deny location and confirm the app still works.
- [ ] Calendar reminders: turn on, add a ticket, see the event + alert; delete the ticket and confirm the event goes.
- [ ] Airplane mode: open an upcoming trip's ticket from the cache.
- [ ] Delete a ticket, a trip, then the whole account; confirm data is gone in Atlas and R2.
- [ ] Dark mode, large font sizes, TalkBack on the main flows.
