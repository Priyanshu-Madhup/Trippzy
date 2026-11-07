# Deploy: Railway backend + GitHub-release app updates

## 1. Push the code (once)
Create a **private** GitHub repo, then from `X:\Trippzy`:
```
git add -A && git commit -m "Trippzy" && git branch -M main
git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main
```
`.env` files are git-ignored. Nothing secret is pushed.

## 2. Railway (backend)
1. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
2. Service **Settings → Source → Root Directory = `backend`** (it then uses the Dockerfile + `railway.json`, healthcheck `/healthz`).
3. **Variables → Raw Editor** → paste `backend/.env.railway` (made on your PC, git-ignored). Then fill in:
   - `GITHUB_REPO=<you>/<repo>`
   - `PUBLIC_BASE_URL=https://<your-service>.up.railway.app` (after step 4)
   - `GITHUB_TOKEN` (private repo only): fine-grained token, this repo, **Contents: read-only**
   - `CLERK_SECRET_KEY` (needed for “Delete account”)
4. **Settings → Networking → Generate Domain.** Open `<domain>/healthz` → `{"ok":true}`.
5. MongoDB Atlas → Network Access → allow `0.0.0.0/0` (Railway has no fixed IP).
6. Every push to `main` redeploys automatically (turn on “Wait for CI” so a red build never ships).

## 3. GitHub (builds the APK)
Repo → Settings → Secrets and variables → Actions:
- Secret `EXPO_TOKEN` (expo.dev → Account → Access tokens)
- Variable `API_URL` = your Railway https URL
- Variable `CLERK_PUBLISHABLE_KEY` = the `pk_…` key

## 4. Ship a version
GitHub → Releases → **Draft a new release** → tag `v1.1.0` → write what changed as bullet points in the description → **Publish**.
The `release-apk` workflow builds `trippzy-1.1.0.apk` and attaches it (~20 min). Phones on an older version then see
**Update available** with your notes when they open the app; “Update now” downloads the APK and Android asks to install.
Tags must go up each time (v1.0.1, v1.1.0…); the first standalone install can be tag `v1.0.0`.
