# App Store Submission Guide — My Digital Garden

## Overview

You do **not** need a Mac to build and submit this app.
The full pipeline uses **Codemagic** (cloud iOS builds) to build the `.ipa` and upload it to Apple.

---

## Step 1 — Deploy Your API Server

Before anything else, deploy the API server so the mobile app has a stable URL to call.

1. In Replit, publish the **API Server** artifact (click Publish in the preview dropdown)
2. Note the public URL, e.g. `https://my-digital-closet.replit.app/api-server`
3. This becomes your `VITE_API_BASE_URL` in Step 5

---

## Step 2 — Create an Apple Developer Account

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs)
2. Enroll in the **Apple Developer Program** ($99/year)
3. Wait for approval (usually a few hours to 1 business day)

---

## Step 3 — Create the App in App Store Connect

1. Log in to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **+** → **New App**
3. Fill in:
   - Platform: iOS
   - Name: **My Digital Garden**
   - Primary Language: English (U.S.)
   - Bundle ID: **com.mydigitalgarden.app** *(you'll need to register this in your Developer account first)*
   - SKU: **MYDIGITALGARDEN001**
4. Complete the listing using `app-store/metadata.md` in this repository

### Register the Bundle ID
1. [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles → Identifiers → +
2. Select **App IDs** → **App**
3. Bundle ID: `com.mydigitalgarden.app`
4. Enable capabilities: **In-App Purchase**

---

## Step 4 — Push This Repo to GitHub

Codemagic connects to GitHub (or GitLab/Bitbucket).

```bash
# From your local terminal or Replit Shell
git remote add origin https://github.com/afterglow18/my-digital-garden.git
git push -u origin main
```

If you don't have git configured locally, use [github.com/new](https://github.com/new) and import from Replit.

---

## Step 5 — Set Up Codemagic

1. Sign up at [codemagic.io](https://codemagic.io) (free tier available)
2. Click **Add application** → connect your GitHub account → select this repo
3. Codemagic will detect `codemagic.yaml` automatically

### Add Secrets in Codemagic

Go to **Team → Global variables & secrets** and add:

| Variable name | Where to get it |
|---|---|
| `VITE_API_BASE_URL` | Your deployed API URL from Step 1 |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect → Users & Access → Integrations → Keys |
| `APP_STORE_CONNECT_ISSUER_ID` | Same page as above |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Download the `.p8` file, paste its full contents |
| `CERTIFICATE_PRIVATE_KEY` | Your iOS Distribution certificate private key |
| `PROVISIONING_PROFILE` | Base64-encoded `.mobileprovision` from your Developer account |

### Create an App Store Connect API Key

1. App Store Connect → Users & Access → Integrations → App Store Connect API
2. Click **+** → Name: "Codemagic" → Access: **Developer**
3. Download the `.p8` file (you can only download once!)
4. Note the **Key ID** and **Issuer ID** on the same page

### Code Signing (iOS Distribution Certificate)

The easiest path is to let Codemagic manage signing automatically:
1. In your Codemagic app settings → **Code signing** tab
2. Select **Automatic** and log in with your Apple Developer account
3. Codemagic creates and manages the certificate and provisioning profile

Or follow [Codemagic's manual signing guide](https://docs.codemagic.io/yaml-code-signing/signing-ios/).

---

## Step 6 — Update ExportOptions.plist

Open `app-store/ExportOptions.plist` and replace `YOUR_TEAM_ID` with your actual
Apple Team ID (10-character string, visible in developer.apple.com → Membership).

---

## Step 7 — Trigger the First Build

1. In Codemagic, open your app → **Start new build**
2. Select branch: `main`
3. Select workflow: `ios-app-store`
4. Click **Start build**

The first build takes ~20 minutes. Codemagic will:
- Install dependencies
- Build the Vite web bundle
- Sync into the iOS Xcode project
- Archive and export an `.ipa`
- Upload to TestFlight automatically

---

## Step 8 — Test on TestFlight

1. Once the build uploads, open App Store Connect → **TestFlight**
2. Add yourself as an Internal Tester
3. Install TestFlight on your iPhone → install the build
4. Test all flows: add items, generate outfits, purchase premium

---

## Step 9 — Submit for App Store Review

1. App Store Connect → your app → **Distribution** tab
2. Click **+** next to iOS App
3. Select the TestFlight build you tested
4. Complete all required fields (screenshots, description from `metadata.md`)
5. Add your In-App Purchase (see `metadata.md` for details)
6. Click **Submit for Review**

Apple's review takes **1–3 business days** for a first submission.

---

## Checklist Before Submitting

- [ ] API server is deployed and the URL is set as `VITE_API_BASE_URL`
- [ ] App icon (1024×1024 PNG) committed to `app-store/AppIcon-1024.png`
- [ ] Screenshots captured for iPhone 6.9" and 6.5"
- [ ] Privacy Policy URL added to App Store Connect: https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4
- [ ] `app-store/ExportOptions.plist` updated with your Team ID
- [ ] In-App Purchase created in App Store Connect (Product ID: `com.mydigitalgarden.app.premium`)
- [ ] Stripe webhook is configured for your deployed API URL
- [ ] TestFlight build installed and tested on a real iPhone
- [ ] App Review notes filled in (including test account if login is required)

---

## Files in This Directory

| File | Purpose |
|---|---|
| `metadata.md` | Complete App Store Connect listing copy, keywords, IAP details |
| `icon-specs.md` | App icon requirements and design guidance |
| `ExportOptions.plist` | Xcode archive export settings (used by Codemagic) |
| `SUBMISSION_GUIDE.md` | This file |

---

## Troubleshooting

**Build fails at `cap sync ios`**
→ Make sure `artifacts/outfit-generator/dist/public/index.html` exists (the Vite build must succeed first)

**"No profiles for bundle ID"**
→ Register `com.mydigitalgarden.app` in your Apple Developer account (Step 3)

**App crashes on launch on device**
→ Check that `VITE_API_BASE_URL` points to a live, reachable API server

**IAP not working in TestFlight**
→ Create a Sandbox Tester account in App Store Connect and use it to test purchases
