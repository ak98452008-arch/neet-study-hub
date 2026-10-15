# @Ayush9845 — Owner-only PDF upload system

This add-on is designed for a static GitHub Pages frontend and a Cloudflare Worker backend. It uses a **private Cloudflare R2 bucket** for PDF bytes and a **Cloudflare D1 database** for the catalogue. The Worker also retains the `/api/chat` Groq route so you can use one backend for both features.

## Files

- `pdf-admin.html` — owner login, upload, preview and delete dashboard.
- `pdf-library.html` — student-facing PDF catalogue; students can search and open PDFs in the browser.
- `worker.js` — backend routes for Groq chat, owner login, PDF upload/list/read/delete.
- `schema.sql` — D1 table setup.
- `wrangler.toml` — optional Wrangler CLI config template. If using the Cloudflare dashboard, create bindings there instead.

## Before you begin

1. Revoke the Groq key previously shared in chat and create a replacement. Do not place any key in GitHub.
2. In Cloudflare, use the Worker you already made for Groq if you want one backend. This `worker.js` includes `/api/chat`; replace the old Worker code with this full file, then add the PDF storage bindings below. Alternatively create a separate Worker and update the frontend URLs.
3. Do not upload `worker.js`, `wrangler.toml`, or secrets to a public GitHub Pages repository. Paste `worker.js` into the Cloudflare Worker editor. Only upload the two HTML pages to GitHub Pages.

## Cloudflare setup using the iPad dashboard

### 1. Create a private R2 bucket

- Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**.
- Bucket name: `ayush9845-study-pdfs` (or use your chosen name consistently).
- Do **not** enable a public bucket/domain. The Worker serves each PDF after looking it up in D1.

### 2. Create a D1 database

- Dashboard → **Workers & Pages** → **D1 SQL Database** (or **Storage & databases → D1**) → Create.
- Name: `ayush9845-pdf-catalog`.
- Open its SQL Console and paste all contents of `schema.sql`, then run it.

### 3. Deploy the Worker

- Open your existing Groq Worker (or create `ayush9845-pdf-api`).
- Paste all of `worker.js` into the editor and deploy.
- In Worker **Settings → Bindings**, add:
  - **R2 bucket** binding variable name `PDF_BUCKET`, select your private bucket.
  - **D1 database** binding variable name `DB`, select your D1 database.
- In **Settings → Variables and Secrets**, add these values:
  - `ALLOWED_ORIGIN` — **Text**, exact origin only. Example for a project site `https://USERNAME.github.io/REPOSITORY/`, enter `https://USERNAME.github.io` (no repository path, no trailing slash). If using a custom domain, enter that origin instead.
  - `OWNER_PASSWORD` — **Secret**, a strong unique owner password. Never share it.
  - `SESSION_SECRET` — **Secret**, a long random value (at least 32 random characters). Generate it with a trusted password manager; do not reuse your Groq key.
  - `GROQ_API_KEY` — **Secret**, your newly generated Groq key if you want the AI chat route in this same Worker.
  - Optional `GROQ_MODEL` — **Text**, e.g. `llama-3.3-70b-versatile` if that model is available to your Groq account.
- Save changes and redeploy if prompted.

Your Worker URL should look like `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev`. Test by opening `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/health`; it should return `{"ok":true,...}`. The health route may be blocked in a browser if you have not set the exact origin on a browser request; the API must still have the correct bindings and variable settings.

## GitHub Pages setup

1. Upload `pdf-admin.html` and `pdf-library.html` into the root of the public GitHub Pages repository. Do not upload `worker.js`, `wrangler.toml`, or API secrets.
2. In **both** HTML files, find `API_BASE` near the bottom and replace `https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev` with your actual Worker base URL. Do not append `/api`.
3. Commit the files. GitHub Pages publishes them at:
   - `https://USERNAME.github.io/REPOSITORY/pdf-admin.html` — owner dashboard
   - `https://USERNAME.github.io/REPOSITORY/pdf-library.html` — student library
4. Optional: add links to those two pages in your existing `index.html` navigation:

```html
<a href="pdf-library.html">PDF Library</a>
<a href="pdf-admin.html">Owner Login</a>
```

These links are only navigation. The actual upload permission is enforced by the Worker; hiding the admin link does not provide security.

## How the owner uploads a PDF on iPad

1. Open `pdf-admin.html` on your published site.
2. Sign in with the password stored in the `OWNER_PASSWORD` Worker secret.
3. Enter a display title and choose a subject.
4. Tap the file picker and select a PDF from the iPad Files app. Maximum file size is 25 MB.
5. Tap **Upload and publish**. It appears in the list and student library.
6. Use **Delete** to remove a PDF. The Worker deletes the object and catalogue record.

Students open `pdf-library.html`, search, and tap **Read PDF**. PDF bytes are not hosted in a public bucket, and the viewer response uses `Content-Disposition: inline`.

## Important limitations and security

- “View online only” cannot be guaranteed for PDFs. Browsers may let readers save, print, screenshot, or capture displayed content. Do not upload copyrighted or confidential materials unless you have permission to share them.
- The owner session expires after four hours and is stored in `sessionStorage`, not persistent `localStorage`.
- This starter has no account system for students, and the public library route intentionally lets anyone who knows the page URL read published PDFs.
- Add Cloudflare rate limiting/WAF rules before public launch. Consider file quota limits, audit logging, and backup policy for production.
- `ALLOWED_ORIGIN` is an origin/CORS boundary, not authentication. Owner operations are protected by a signed expiring token plus the server-side password secret.
- Keep your Worker code and secrets out of public GitHub. If a key was exposed, revoke it and replace it.
