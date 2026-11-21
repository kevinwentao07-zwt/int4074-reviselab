// ReviseLab backend — Cloudflare Worker
// ------------------------------------------------------------
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY  your Google AI Studio key
//   APP_KEY         any random string; the app sends it in the X-App-Key header
// Optional variable:
//   MODEL           model name, default "gemini-3.8-flash" (check AI Studio for the current name)
//
// Endpoints (all POST except /health):
//   /ocr       body = raw image bytes (Web.PostFile)          → {text, unclear}
//   /score     {topic, essay}                                 → scores + one issue + hints + practice task
//   /check     {topic, issue_sentence, issue_why, revision}   → {passed, message, next_hint}
//   /practice  {skill, prompt, answer}                        → {skill_applied, band, good, feedback, word_count, word_count_ok}
//   /tutor     {topic, transcript, message}                   → {reply, done}
// Add ?demo=1 to any URL to get a fixed sample reply (no AI call) — use it as a fallback in the live demo.
// ------------------------------------------------------------

const RULES = `You are ReviseLab, a friendly IELTS Writing Task 2 tutor for learners around band 5.0-6.5.
Rules:
- Use simple English (CEFR B1). Short sentences.
- Never write or rewrite the student's essay or paragraph for them. Give questions, hints, or a tiny example on a DIFFERENT topic only.
- Judge with the public IELTS Writing Task 2 band descriptors: Task Response (TR), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).
- Reply with JSON only, using exactly the keys requested.`;

const DEMO = {
  "/ocr": { text: "In recent years, smartphones have become part of students' daily lives. Some people argue that they should be banned in schools. I partly agree with this view.\n\nOn the one hand, phones can distract students during lessons.", unclear: [] },
  "/score": {
    tr: 5.5, cc: 6.5, lr: 6.0, gra: 6.0, overall: 6.0, range: "5.5-6.0",
    focus: "TR", focus_label: "Task Response", focus_reason: "Your reasons need specific examples.",
    issue_paragraph: 3, issue_sentence: "On the other hand, smartphones are useful because they help students.",
    issue_why: "This sentence says phones \"help students\" but not how. Higher Task Response bands need main ideas that are extended and supported.",
    next_step: "Explain how phones help, and add one specific situation from school life.",
    hints: ["Name one specific lesson situation where a phone helps.", "Think about what you do when you meet a new word in class."],
    practice_skill: "Give a specific example for each reason.",
    practice_prompt: "Some people believe homework should be banned in primary schools. To what extent do you agree or disagree? Write one body paragraph (100-150 words).",
    word_count: 263
  },
  "/check": { passed: true, message: "Now your reason has an example.", next_hint: "" },
  "/practice": { skill_applied: true, band: 6.0, good: "for example, my cousin spends three hours", feedback: "Your example is specific. Try to link it back to your main idea in the last sentence.", word_count: 128, word_count_ok: true },
  "/tutor": { reply: "Good. Can a phone help learning in a lesson, or get in the way? Give one example.", done: false }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && path === "/health") return json({ ok: true });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) return json({ error: "Unauthorized" }, 401);
    if (url.searchParams.get("demo") === "1" && DEMO[path]) return json(DEMO[path]);

    try {
      switch (path) {
        case "/ocr": return json(await ocr(request, env));
        case "/score": return json(await score(await readJson(request), env));
        case "/check": return json(await check(await readJson(request), env));
        case "/practice": return json(await practice(await readJson(request), env));
        case "/tutor": return json(await tutor(await readJson(request), env));
        default: return json({ error: "Not found" }, 404);
      }
    } catch (e) {
      const status = e.status || 500;
      return json({ error: String(e.message || e) }, status);
    }
  }
};

// ---------- endpoints ----------

async function ocr(request, env) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 100) throw httpError(400, "No image received");
  if (bytes.length > 7 * 1024 * 1024) throw httpError(413, "Image too large (max 7 MB)");
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
  const out = await gemini(env,
    "You transcribe student writing from photos. Copy the English text EXACTLY as written, including spelling and grammar mistakes — do NOT correct anything. Keep paragraph breaks as \\n\\n. Reply with JSON only.",
    `Transcribe the text in this image. Return JSON: {"text": "the full text", "unclear": ["words you could not read, if any"]}`,
    { mime_type: mime, data: toBase64(bytes) });
  return { text: String(out.text || ""), unclear: Array.isArray(out.unclear) ? out.unclear : [] };
}

async function score(body, env) {
  const topic = need(body, "topic");
  const essay = need(body, "essay");
  const wc = countWords(essay);
  if (wc < 50) throw httpError(400, `Essay too short (${wc} words). Write at least 50 words.`);

  const out = await gemini(env, RULES, `Question: ${topic}

Student essay (${wc} words):
"""
${essay}
"""

Return JSON:
{"tr": number, "cc": number, "lr": number, "gra": number,   // each 0-9 in steps of 0.5
 "focus": "TR" | "CC" | "LR" | "GRA",                      // the criterion that would raise the score most
 "focus_reason": "one sentence",
 "issue_paragraph": integer,                               // 1-based paragraph number of the issue
 "issue_sentence": "copy ONE sentence from the essay exactly",
 "issue_why": "why this sentence lowers the score, max 30 words",
 "next_step": "what to do next, max 20 words",
 "hints": ["hint 1: gentle", "hint 2: more specific, still not the answer"],
 "practice_skill": "the skill to practise, max 10 words",
 "practice_prompt": "a NEW IELTS Task 2 question that trains this skill, ending with: Write one body paragraph (100-150 words)."}`);

  const tr = band(out.tr), cc = band(out.cc), lr = band(out.lr), gra = band(out.gra);
  const overall = band((tr + cc + lr + gra) / 4);          // computed here so it is always consistent
  const focus = ["TR", "CC", "LR", "GRA"].includes(out.focus) ? out.focus : lowest({ TR: tr, CC: cc, LR: lr, GRA: gra });
  return {
    tr, cc, lr, gra, overall,
    range: `${Math.max(0, overall - 0.5).toFixed(1)}-${overall.toFixed(1)}`,
    focus, focus_label: LABELS[focus],
    focus_reason: str(out.focus_reason),
    issue_paragraph: Number.isInteger(out.issue_paragraph) ? out.issue_paragraph : 1,
    issue_sentence: str(out.issue_sentence),
    issue_why: str(out.issue_why),
    next_step: str(out.next_step),
    hints: (Array.isArray(out.hints) ? out.hints : []).map(str).slice(0, 2),
    practice_skill: str(out.practice_skill),
    practice_prompt: str(out.practice_prompt),
    word_count: wc
  };
}

async function check(body, env) {
  const out = await gemini(env, RULES, `Question: ${need(body, "topic")}
Original sentence: ${need(body, "issue_sentence")}
Problem: ${str(body.issue_why)}
Student's revision:
"""
${need(body, "revision")}
"""

Did the revision fix the problem? Return JSON:
{"passed": boolean,
 "message": "max 20 words; if passed, say what improved; if not, say what is still missing",
 "next_hint": "if not passed, one new hint (not the answer); otherwise empty string"}`);
  return { passed: out.passed === true, message: str(out.message), next_hint: out.passed === true ? "" : str(out.next_hint) };
}

async function practice(body, env) {
  const answer = need(body, "answer");
  const wc = countWords(answer);
  const out = await gemini(env, RULES, `Skill being practised: ${need(body, "skill")}
Question: ${need(body, "prompt")}
Student paragraph (written without any hints, ${wc} words):
"""
${answer}
"""

Return JSON:
{"skill_applied": boolean,                 // did the student use the skill?
 "band": number,                           // Task Response band for this paragraph, 0-9 in steps of 0.5
 "good": "quote the best phrase from the paragraph, max 15 words",
 "feedback": "max 30 words: what worked and one thing to improve"}`);
  return { skill_applied: out.skill_applied === true, band: band(out.band), good: str(out.good), feedback: str(out.feedback), word_count: wc, word_count_ok: wc >= 100 && wc <= 150 };
}

async function tutor(body, env) {
  const out = await gemini(env, RULES + `
You are helping the student PLAN ideas before writing. Ask ONE short question at a time. Never give a full answer or a model paragraph.
When the student has a position and two reasons with examples, set "done" to true and tell them they are ready to write.`,
  `Question: ${need(body, "topic")}

Conversation so far:
${str(body.transcript) || "(none)"}

Student: ${need(body, "message")}

Return JSON: {"reply": "your next message, max 40 words", "done": boolean}`);
  return { reply: str(out.reply), done: out.done === true };
}

// ---------- helpers ----------

const LABELS = { TR: "Task Response", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy" };

async function gemini(env, system, userText, image) {
  if (!env.GEMINI_API_KEY) throw httpError(500, "GEMINI_API_KEY is not set");
  const model = env.MODEL || "gemini-3.8-flash";
  const parts = [{ text: userText }];
  if (image) parts.push({ inline_data: image });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generation_config: { temperature: 0.2, response_mime_type: "application/json" }
    })
  });
  if (r.status === 429) throw httpError(429, "AI is busy (quota). Try again in a minute.");
  if (!r.ok) throw httpError(502, `AI error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, ""));
  } catch {
    throw httpError(502, "AI did not return valid JSON");
  }
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, "Body must be JSON"); }
}

function need(obj, key) {
  const v = obj && obj[key];
  if (v === undefined || v === null || String(v).trim() === "") throw httpError(400, `Missing "${key}"`);
  return String(v);
}

function str(v) { return v === undefined || v === null ? "" : String(v); }

function band(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.min(9, Math.max(0, Math.round(n * 2) / 2));   // IELTS-style: nearest 0.5, .25 rounds up
}

function lowest(scores) { return Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0]; }

function countWords(t) { return (String(t).match(/[A-Za-z0-9'’-]+/g) || []).length; }

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
