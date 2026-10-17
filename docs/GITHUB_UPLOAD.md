# Push SkySentinel to GitHub — Windows PowerShell

From inside the extracted `SkySentinel_ATC` folder in VS Code:

```powershell
git init
git add .
git commit -m "Build SkySentinel air traffic monitoring dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/skysentinel-atc.git
git push -u origin main
```

Create an **empty public repository** named `skysentinel-atc` on GitHub *before running the push*, and replace `YOUR_USERNAME`. If the `origin` remote already exists use `git remote set-url origin ...` rather than `git remote add origin ...`.

**Never upload your `.env` file.** It is ignored by `.gitignore`. Confirm `git status` doesn't show `.env`. Use a screenshot from `preview_selected.png` in the GitHub README if desired.

## Suggested submission text

**Project:** SkySentinel ATC — Airspace Intelligence

**Domain:** Frontend Development

**Task:** Air Traffic Control

**Tech:** Browser-native JavaScript, HTML Canvas, CSS, Python FastAPI, OpenSky Network REST API, OAuth2, Docker, GitHub Actions

**Highlights:** Live aircraft monitoring, offline demo and cached fallback, flight tracking, estimated positions, local replay, flight confidence states, proximity/geofence/altitude/speed watch rules and automated tests.

**Note:** Check real API access and update any deployment information before submission. If using `DECISIONS.md` or suggested text here, rewrite it to reflect your actual understanding and choices.
