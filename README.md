# NEET Study Hub — Starter PWA

A responsive, static starter website for a NEET study library, sample quiz and local progress tracker. It is intentionally backend-free so a beginner can launch it first.

## What's included

- Responsive dashboard and subject filters
- Demo resource cards with search
- Three-question sample quiz with explanations
- Progress stored in the current browser using `localStorage`
- PWA manifest and service worker for install/offline shell
- No API keys, paid content, or credentials required

## Run locally

### Option A: VS Code + Live Server
1. Install Visual Studio Code.
2. Open this folder in VS Code.
3. Install the "Live Server" extension.
4. Right-click `index.html` and choose **Open with Live Server**.

### Option B: Python local server
Install Python, open a terminal in this folder, and run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

Do not open `index.html` directly as a `file://` URL if you want the service worker/PWA features; they require localhost or HTTPS.

## Publish on Cloudflare Pages

1. Create a GitHub repository and upload the files in this folder.
2. In Cloudflare, open **Workers & Pages** and create a Pages project connected to that repository.
3. Choose **Framework preset: None**.
4. Set the build command to blank (or no build command).
5. Set the output directory to `/` or the repository root, depending on the dashboard field.
6. Deploy. Test the resulting HTTPS URL on your phone.

Cloudflare's UI can change; follow its current Pages setup flow if labels differ.

## Customize the content

Open `app.js` and edit the `resources` array near the top. Example:

```js
{
  id: "bio-new-topic",
  subject: "Biology",
  title: "Your chapter title",
  kind: "PDF notes",
  detail: "Short description",
  icon: "▤",
  link: "https://your-authorized-file-url.example/notes.pdf"
}
```

Replace the example URL with a real HTTPS URL for a file you own or have permission to distribute. For a video, link to a source you are allowed to embed or share. Never add private session tokens or credentials to frontend code.

Quiz questions are in the `questions` array in `app.js`.

## Current limitations

- No real login or admin upload yet.
- Local progress is only stored in the current browser/device and can be cleared.
- Resource links are not a secure content-protection system.
- The demo questions are illustrative and not an official NEET paper.
- Service-worker caching is a basic offline shell, not full offline media storage.

## Recommended next version

1. Connect Supabase Auth for accounts.
2. Create a `resources` table and restrict uploads/changes to verified admins.
3. Store files in Supabase Storage or Cloudflare R2.
4. Add server-side authorization and row-level security before allowing uploads.
5. Save quiz attempts and student progress to the database.
6. Add an admin upload form with file type/size validation.

Only distribute materials you created, own, or are licensed/authorized to share.
