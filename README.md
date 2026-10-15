# @Ayush9845 JEE/NEET AI — Groq + Cloudflare Worker + GitHub Pages

This starter connects the static website to Groq through a Cloudflare Worker. The Groq API key is read only by the Worker from a server-side secret.

## Files
- `index.html`, `style.css`, `app.js`: website frontend
- `worker.js`: secure proxy endpoint (`POST /api/chat`) calling Groq
- `wrangler.toml`: basic Worker project settings

## Important security notes
- NEVER put `GROQ_API_KEY` in `app.js`, HTML, or a public GitHub repository. Add it as a Cloudflare Worker secret.
- `ALLOWED_ORIGIN` should be the exact origin of your published site, with no path and no trailing slash. Example: `https://YOUR-USERNAME.github.io`. For a project page, the browser Origin is still the host origin, not `/repository-name`.
- CORS is not authentication; non-browser clients can call a public endpoint. Before sharing widely, add rate limiting and abuse monitoring. This starter does not include student accounts, saved history, PDF retrieval, a verified PYQ database, or a complete mock-test engine.
- Model availability, rate limits, and pricing can change. The default model is `llama-3.3-70b-versatile`; if Groq's console lists a different supported chat model for your account, set `GROQ_MODEL` in Worker variables.

## Step 1 — create a Groq API key
1. In Safari, open the [Groq Console](https://console.groq.com/).
2. Sign in/create an account and open the API keys area.
3. Create a key and copy it once. Treat it like a password; do not paste it into GitHub or send it in chat.

## Step 2 — publish the frontend on GitHub Pages (if not already published)
1. Open your GitHub repository in Safari.
2. Upload `index.html`, `style.css`, and `app.js` to the repository root.
3. Go to **Settings → Pages** and choose **Deploy from a branch**, branch `main`, folder `/(root)`, then Save.
4. Open the published site and note its origin, for example `https://YOUR-USERNAME.github.io`. Use the origin only, not the full repository path.

## Step 3 — create the Cloudflare Worker on iPad
1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) in Safari and sign in.
2. Open **Workers & Pages** and create a Worker. Name it `ayush9845-ai-api`.
3. Open its code editor and replace the sample code with the full contents of this folder's `worker.js`; save and deploy.
4. In the Worker settings, find **Variables and Secrets** (the label can vary). Add a **Secret** named `GROQ_API_KEY` and paste your Groq key as its value. Do not create this as a public frontend variable.
5. Add a **Text** variable named `ALLOWED_ORIGIN`, with your exact GitHub Pages origin (no trailing slash).
6. Optional: add a **Text** variable named `GROQ_MODEL` with a model ID currently enabled in your Groq Console. If omitted, the code uses `llama-3.3-70b-versatile`.
7. Save changes and deploy/redeploy the Worker.

## Step 4 — connect your website to the Worker
1. Copy your Worker URL, which will look like `https://ayush9845-ai-api.YOUR-SUBDOMAIN.workers.dev`.
2. In GitHub, open `app.js` and tap Edit.
3. At the top, find `AI_API_URL`. Replace its placeholder with your real Worker URL plus `/api/chat`, for example `https://ayush9845-ai-api.YOUR-SUBDOMAIN.workers.dev/api/chat`.
4. Commit the change and wait for GitHub Pages to update.

## Step 5 — test
1. Open the published website in Safari.
2. Open **AI Doubt Solver**, choose a subject, and ask a short question such as: `Explain Newton's second law with one NEET-level example.`
3. If it fails, check the Worker URL, `ALLOWED_ORIGIN`, that `GROQ_API_KEY` is a Worker Secret, model ID availability, Groq usage/rate limits, and Cloudflare Worker logs. A direct browser visit to the Worker URL uses GET and should show a 404/405-style JSON response; the endpoint is designed for POST at `/api/chat`.

## Model endpoint
The Worker calls Groq's OpenAI-compatible endpoint `https://api.groq.com/openai/v1/chat/completions` with a server-side Bearer key. See [Groq API reference](https://console.groq.com/docs/api-reference) and [Groq security guidance](https://console.groq.com/docs/production-readiness/security-onboarding).
