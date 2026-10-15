const MAX_PDF_BYTES = 25 * 1024 * 1024;
const SESSION_TTL_SECONDS = 4 * 60 * 60;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = Boolean(env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded); const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}
async function makeToken(env) {
  const payload = b64url(JSON.stringify({ role: 'owner', exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }));
  return payload + '.' + await sign(payload, env.SESSION_SECRET);
}
async function verifyToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const parts = auth.slice(7).split('.'); if (parts.length !== 2) return false;
  const expected = await sign(parts[0], env.SESSION_SECRET || '');
  if (expected.length !== parts[1].length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  if (diff !== 0) return false;
  try { const payload = JSON.parse(fromB64url(parts[0])); return payload.role === 'owner' && payload.exp > Math.floor(Date.now() / 1000); } catch { return false; }
}
function safeName(name) {
  return String(name || 'study-material.pdf').replace(/[\\/\r\n";]/g, '_').slice(0, 120);
}
function checkOrigin(request, env) {
  return Boolean(env.ALLOWED_ORIGIN && request.headers.get('Origin') === env.ALLOWED_ORIGIN);
}
async function requireOwner(request, env) {
  if (!env.SESSION_SECRET || !env.OWNER_PASSWORD) return false;
  return verifyToken(request, env);
}
export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url); const path = url.pathname;
    const requestOrigin = request.headers.get('Origin') || '';
    if ((requestOrigin && !checkOrigin(request, env)) || (!requestOrigin && request.method !== 'GET')) return json({ error: 'Origin not allowed. Check ALLOWED_ORIGIN.' }, 403, headers);
    if (!env.DB || !env.PDF_BUCKET) return json({ error: 'Backend is not configured. Add D1 binding DB and R2 binding PDF_BUCKET.' }, 500, headers);

    try {
      if (path === '/api/chat' && request.method === 'POST') {
        if (!env.GROQ_API_KEY) return json({ error: 'Groq API key is not configured on the server.' }, 500, headers);
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'Request body must be valid JSON.' }, 400, headers);
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 40) : 'General';
        const exam = typeof body.exam === 'string' ? body.exam.trim().slice(0, 40) : 'JEE/NEET';
        if (!question) return json({ error: 'Please enter a question.' }, 400, headers);
        if (question.length > 4000) return json({ error: 'Question is too long (maximum 4,000 characters).' }, 413, headers);
        const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: [
            { role: 'system', content: 'You are Ayush AI, a careful tutor for Indian JEE and NEET aspirants. Explain concepts step by step in clear language. For Biology, use standard NCERT-aligned terminology. Do not claim generated questions or answers are official. If uncertain, say so.' },
            { role: 'user', content: `Exam: ${exam}\nSubject: ${subject}\nQuestion: ${question}` }
          ], temperature: 0.3, max_tokens: 1000 })
        });
        if (!upstream.ok) return json({ error: upstream.status === 429 ? 'Groq rate limit reached. Please wait and try again.' : 'Groq could not complete the request. Check model availability and Worker logs.' }, 502, headers);
        const data = await upstream.json(); const answer = data?.choices?.[0]?.message?.content;
        if (typeof answer !== 'string' || !answer.trim()) return json({ error: 'The AI model returned an empty answer.' }, 502, headers);
        return json({ answer: answer.trim(), model: data.model || env.GROQ_MODEL || 'llama-3.3-70b-versatile' }, 200, headers);
      }

      if (path === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'Ayush9845 PDF Library' }, 200, headers);

      if (path === '/api/admin/login' && request.method === 'POST') {
        if (!env.OWNER_PASSWORD || !env.SESSION_SECRET) return json({ error: 'OWNER_PASSWORD and SESSION_SECRET secrets are required.' }, 500, headers);
        const body = await request.json().catch(() => ({}));
        const password = typeof body.password === 'string' ? body.password : '';
        if (!password || password !== env.OWNER_PASSWORD) return json({ error: 'Incorrect owner password.' }, 401, headers);
        return json({ token: await makeToken(env), expiresIn: SESSION_TTL_SECONDS }, 200, headers);
      }

      if (path === '/api/pdfs' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id, title, subject, original_name, size_bytes, created_at FROM pdfs ORDER BY created_at DESC').all();
        return json({ pdfs: rows.results || [] }, 200, headers);
      }

      if (path === '/api/admin/upload' && request.method === 'POST') {
        if (!(await requireOwner(request, env))) return json({ error: 'Owner session expired. Log in again.' }, 401, headers);
        const form = await request.formData(); const file = form.get('file');
        const title = String(form.get('title') || '').trim().slice(0, 120);
        const subject = String(form.get('subject') || 'General').trim().slice(0, 40);
        if (!title) return json({ error: 'Enter a PDF title.' }, 400, headers);
        if (!(file instanceof File)) return json({ error: 'Choose a PDF file.' }, 400, headers);
        if (file.size < 5 || file.size > MAX_PDF_BYTES) return json({ error: 'PDF must be smaller than 25 MB.' }, 413, headers);
        const name = safeName(file.name);
        if (!name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) return json({ error: 'Only PDF files are accepted.' }, 415, headers);
        const firstFive = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (new TextDecoder().decode(firstFive) !== '%PDF-') return json({ error: 'The selected file does not look like a valid PDF.' }, 415, headers);
        const id = crypto.randomUUID(); const objectKey = `pdfs/${id}.pdf`;
        await env.PDF_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' }, customMetadata: { title, subject, originalName: name } });
        try {
          await env.DB.prepare('INSERT INTO pdfs (id, object_key, title, subject, original_name, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, objectKey, title, subject, name, file.size, new Date().toISOString()).run();
        } catch (error) { await env.PDF_BUCKET.delete(objectKey); throw error; }
        return json({ ok: true, pdf: { id, title, subject, original_name: name, size_bytes: file.size } }, 201, headers);
      }

      const contentMatch = path.match(/^\/api\/pdfs\/([0-9a-f-]{36})\/content$/i);
      if (contentMatch && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT id, object_key, original_name FROM pdfs WHERE id = ?').bind(contentMatch[1]).first();
        if (!row) return json({ error: 'PDF not found.' }, 404, headers);
        const object = await env.PDF_BUCKET.get(row.object_key);
        if (!object) return json({ error: 'PDF file is missing from storage.' }, 404, headers);
        const filename = safeName(row.original_name);
        return new Response(object.body, { status: 200, headers: {
          ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`,
          'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'none',
        } });
      }

      const deleteMatch = path.match(/^\/api\/admin\/pdfs\/([0-9a-f-]{36})$/i);
      if (deleteMatch && request.method === 'DELETE') {
        if (!(await requireOwner(request, env))) return json({ error: 'Owner session expired. Log in again.' }, 401, headers);
        const row = await env.DB.prepare('SELECT object_key FROM pdfs WHERE id = ?').bind(deleteMatch[1]).first();
        if (!row) return json({ error: 'PDF not found.' }, 404, headers);
        await env.PDF_BUCKET.delete(row.object_key);
        await env.DB.prepare('DELETE FROM pdfs WHERE id = ?').bind(deleteMatch[1]).run();
        return json({ ok: true }, 200, headers);
      }
      return json({ error: 'Not found.' }, 404, headers);
    } catch (error) {
      console.error('PDF API error:', error?.message || 'unknown');
      return json({ error: 'Server error. Check Cloudflare Worker logs and setup instructions.' }, 500, headers);
    }
  }
};
