# UR Freight 365 Unified Site Deployment

This folder is the deployment-ready static site for UR Freight 365 LLC.

## Folder to deploy

Deploy this folder as the project root:

`ur-freight-365-unified/`

There is no build step. The site is plain HTML, CSS, JavaScript, and images.

## What is included

- `index.html` — gateway landing page with links to `/steel/`, `/produce/`, and `/logistics/`
- `steel/index.html` — steel and pipe division page
- `produce/index.html` — produce and reefer division page
- `logistics/index.html` — logistics, port, warehouse, cross-border, and last-mile page
- `privacy-policy.html` — shared privacy policy
- `terms.html` — shared terms and conditions
- `unsubscribe.html` — shared unsubscribe page
- `about.html`, `contact.html`, `quote.html`, `services.html` — shared supporting pages
- `vercel.json` — clean URL and HTML cache-header configuration

## Push to GitHub

1. Open Terminal in the `ur-freight-365-unified/` folder.
2. Initialize Git if needed:
   ```bash
   git init
   git add .
   git commit -m "Consolidate UR Freight 365 unified site"
   ```
3. Create a new GitHub repository, for example `ur-freight-365-unified`.
4. Connect the local folder to GitHub:
   ```bash
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

## Connect to Vercel

1. In Vercel, choose Add New Project.
2. Import the GitHub repository.
3. Use these settings:
   - Framework Preset: Other
   - Root Directory: `.`
   - Build Command: leave blank
   - Output Directory: leave blank
4. Deploy.

## URL checks after deploy

Confirm these pages load:

- `/`
- `/steel`
- `/produce`
- `/logistics`
- `/privacy-policy`
- `/terms`
- `/unsubscribe`
- `/about`
- `/contact`
- `/quote`
- `/services`
