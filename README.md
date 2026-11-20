# Shihabul Islam — Portfolio

Personal portfolio website for Shihabul Islam, presenting web development, UI/UX, AI and automation work.

**Live website:** https://kokushibu74.github.io/

## Project overview

This repository contains the static GitHub Pages website and its supporting frontend assets, content feeds, and Cloudflare Worker source files.

- `index.html` — portfolio homepage.
- `about.html`, `expertise.html`, `projects.html`, `contact.html` — portfolio sections.
- `news.html`, `news.js`, `homepage-news.js` — news interface and feed presentation.
- `chatbot.html`, `chatbot-widget.js`, `chatbot-widget.css` — chatbot interface and shared widget.
- `styles.css`, `shared-shell.css`, `shared-shell.js` — shared site styling and layout.
- `assets/`, `storage/`, `certificates/` — site media and supporting assets.
- `cloudflare/`, `worker/` — Cloudflare Worker source and related configuration.
- `tests/`, `scripts/` — project checks and maintenance utilities.
- `sports-zone.html`, `sports-zone.js` — the separate Sports Zone page included in this site.

## Deployment

The site is designed for GitHub Pages and uses the repository root as its published static content.

1. Keep the production website files on the configured Pages publishing branch.
2. In the repository's **Settings → Pages**, confirm the intended source branch and root folder.
3. Push changes to the configured publishing branch.
4. Check the GitHub Pages deployment workflow and open the live site to verify the result.

There is no Node.js build step required for the static portfolio pages. Cloudflare Workers are separate services: review the corresponding Worker configuration and deploy them through the intended Cloudflare workflow. Do not copy secrets into this repository or frontend files.

## Local preview

Because the main site is static, it can be previewed with any local static HTTP server. For example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

Some features depend on external services, APIs, or Cloudflare Workers and may not operate fully in a local preview.

## Security and privacy

- Keep API tokens, passwords, private keys, and Worker secrets in the relevant provider's secret store.
- Treat public JSON feeds and files in this repository as publicly accessible.
- Review generated news archives and other data files before committing them; avoid publishing private or personal data.
- CORS is not an authentication mechanism. Protect privileged Worker routes with server-side authorization and appropriate rate limits.

## Maintenance

Before changing production files, review the relevant workflow, Worker bindings, and environment configuration. Run the available checks under `tests/` and `scripts/` where applicable, then verify the GitHub Pages deployment and any affected Worker independently.
