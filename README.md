# NEET Study Hub by @Ayush9845 — Cloudflare Pages

A responsive, dark premium study hub starter designed to be managed from an iPad. It includes a polished dashboard, study planner and analytics, resource filters, sample quiz, announcements UI, PWA shell, and a single-file Cloudflare Pages advanced-mode backend (`_worker.js`).

## Important: what is real today?

### Works immediately in demo mode
- Responsive dashboard with navy/blue glow styling and `@Ayush9845` branding.
- Sample library entries and subject/type filters.
- A 5-question illustrative quiz with scoring and explanations.
- Local planner tasks, daily goal, and study-minute logs (stored in the current browser/device).
- Sample notices.
- Installable PWA shell and basic offline shell caching.

### Requires Cloudflare backend setup before real use
- Secure student/owner sessions and accounts.
- Owner-only cloud resource uploads.
- Cloud-synced library and notices.
- Uploaded file delivery from R2.
- Signed-in study progress, planner tasks and daily goal sync to D1; guests still use device-local storage.
- A full NEET-sized question bank, configurable exam durations, marking rules and admin question management. The current five questions are only a sample demonstration.

Never publish paid course content unless you have permission. Use materials you own or are authorized to distribute.

## Deploy frontend from iPad
1. Extract the ZIP in the iPad Files app.
2. In your GitHub repository, upload/replace the files at the repository root. `index.html` must be at the root.
3. Commit the changes.
4. In Cloudflare Pages, connect the GitHub repo. Framework preset: **None**; build command: leave blank; build output directory: `/` or `.` (repository root).
5. After deployment, open the `*.pages.dev` URL in Safari.

## Backend setup (Cloudflare Dashboard)
This project uses Cloudflare Pages Functions, D1 and R2. Configure these before enabling real accounts and uploads.

### 1. Create D1 database
- Cloudflare Dashboard → Workers & Pages → D1 → Create database.
- Name it `neet-study-hub-db`.
- Open the database Console and execute the full contents of `schema.sql`.
- Pages project → Settings → Bindings → D1 database bindings: variable name `DB`, select `neet-study-hub-db`.

### 2. Create R2 bucket
- Cloudflare Dashboard → R2 → Create bucket, e.g. `neet-study-hub-files`.
- Pages project → Settings → Bindings → R2 bucket bindings: variable name `FILES`, select the bucket.

### 3. Add secrets
Pages project → Settings → Variables and Secrets (or Functions variables/secrets):
- `OWNER_SETUP_SECRET`: a long random secret used only once to bootstrap the owner. Keep it private; never put it in frontend code or GitHub.
- `SESSION_DAYS`: optional, defaults to 7.
Redeploy after setting bindings/secrets. Do not send the secret to anyone.

### 4. Bootstrap owner
- Open the deployed website and tap **Sign in → Owner setup**.
- Enter your email, a strong password (at least 10 characters), and the exact `OWNER_SETUP_SECRET` configured in Cloudflare.
- Owner setup is intended to succeed only once; remove the `OWNER_SETUP_SECRET` variable after the owner is created.
- After setup, sign in with the owner email/password. The server returns an HttpOnly session cookie.

### 5. Student accounts
- Tap Sign in → Create student account. Accounts require the backend to be configured.
- Signed-in users sync the study-minute log, planner tasks and daily goal to D1. Guest data remains on the current device. Library bookmarks and full test answer-by-answer history are not yet cloud-synced.

### 6. Cloudflare Pages deploy behavior
- `_worker.js` enables Cloudflare Pages advanced mode and routes `/api/*` requests to the backend while serving other files through `env.ASSETS`.
- `schema.sql` is for manual execution in D1; it is not automatically run by Pages.
- If a deployment error appears, open Cloudflare Pages → deployment → Build log and check the exact message.

## Files
- `index.html`, `styles.css`, `app.js`: frontend
- `_worker.js`: API endpoints, password/session utilities, owner-only uploads, notices and saved-state API
- `schema.sql`: D1 schema
- `wrangler.toml.example`: binding reference

## Security notes
- Passwords are PBKDF2-hashed using Web Crypto, never stored in plaintext.
- Session IDs are random, stored hashed in D1, and delivered as HttpOnly/Secure/SameSite cookies.
- Upload routes require an owner session, restrict file type and size, and store content in R2.
- This is a starter implementation; perform security review and test on a staging project before inviting students.
