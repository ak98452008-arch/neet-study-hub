const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function getCorsHeaders(origin, env) {
  const allowedOrigin = (env.ALLOWED_ORIGIN || "").trim();
  const allowed = Boolean(allowedOrigin && origin === allowedOrigin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (new URL(request.url).pathname !== "/api/chat") return json({ error: "Not found" }, 404, headers);
    if (request.method !== "POST") return json({ error: "Use POST /api/chat" }, 405, headers);
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed. Check the ALLOWED_ORIGIN Worker variable." }, 403, headers);
    }
    if (!env.GROQ_API_KEY) {
      return json({ error: "Groq API key is not configured on the server." }, 500, headers);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Request body must be valid JSON." }, 400, headers); }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 40) : "General";
    const exam = typeof body.exam === "string" ? body.exam.trim().slice(0, 40) : "JEE/NEET";
    if (!question) return json({ error: "Please enter a question." }, 400, headers);
    if (question.length > 4000) return json({ error: "Question is too long (maximum 4,000 characters)." }, 413, headers);

    try {
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL || DEFAULT_MODEL,
          messages: [
            {
                role: "system",
                content: "You are Ayush AI, a careful tutor for Indian JEE and NEET aspirants. Explain concepts step by step in clear language, show equations when useful, and state assumptions. For Biology, use standard NCERT-aligned terminology. Do not claim that generated questions or answers are official. If uncertain, say so. Keep the response educational and focused."
            },
            { role: "user", content: `Exam: ${exam}\nSubject: ${subject}\nQuestion: ${question}` }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });
      if (!upstream.ok) {
        // Keep provider response and request details out of the browser.
        const status = upstream.status;
        return json({ error: status === 429 ? "Groq rate limit reached. Please wait and try again." : "Groq could not complete the request. Check your Groq model, account limits, and Worker logs." }, 502, headers);
      }
      const data = await upstream.json();
      const answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) {
        return json({ error: "The AI model returned an empty answer. Please try again." }, 502, headers);
      }
      return json({ answer: answer.trim(), model: data.model || env.GROQ_MODEL || DEFAULT_MODEL }, 200, headers);
    } catch {
      return json({ error: "AI service temporarily unavailable. Please try again shortly." }, 502, headers);
    }
  }
};
