// ReviseLab backend — Cloudflare Worker
// ------------------------------------------------------------
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY    your Google AI Studio key (needed for photo text recognition /ocr)
//   DEEPSEEK_API_KEY  optional: your DeepSeek key — if set, all text tasks use DeepSeek
//   OCRSPACE_API_KEY  optional: free key from ocr.space — backup text recognition when Gemini is busy
//   APP_KEY         any random string; the app sends it in the X-App-Key header
// Optional variable:
//   MODEL           Gemini model name, default "gemini-3.8-flash" (check AI Studio for the current name)
//   DEEPSEEK_MODEL  DeepSeek model name, default "deepseek-chat"
//
// Endpoints (all POST except /health):
//   /ocr       body = raw image bytes (Web.PostFile)          → {text, unclear}
//   /score     {topic, essay}                                 → scores + one issue + hints + practice task
//   /check     {topic, issue_sentence, issue_why, revision}   → {passed, message, next_hint}
//   /practice  {skill, prompt, answer}                        → {skill_applied, band, good, feedback, word_count, word_count_ok}
//   /tutor     {topic, transcript, message}                   → {reply, done, stage}
//   /hint      {topic, transcript, stage}                     → {hint}
//   /plan      {topic, transcript}                            → {step1, step2, step3, step4}  (summary of the tutor chat, one per plan step)
// Every JSON endpoint also accepts "task": "1" (Task 1 report on a chart, plus "chart": title and type) — default is Task 2.
//   /models    {}                                             → list of Gemini models your key can use (for checking)
// Add ?demo=1 to any URL to get a fixed sample reply (no AI call) — use it as a fallback in the live demo.
// ------------------------------------------------------------

const RULES = `You are ReviseLab, a friendly IELTS Writing Task 2 tutor for learners around band 5.0-6.5.
Rules:
- Use simple English (CEFR B1). Short sentences.
- Never write or rewrite the student's essay or paragraph for them. Give questions, hints, or a tiny example on a DIFFERENT topic only.
- Judge with the public IELTS Writing Task 2 band descriptors: Task Response (TR), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).
- Reply with JSON only, using exactly the keys requested.`;

// Task 1 (Academic report on a chart). The app sends "task": "1" for these; anything else is Task 2.
const RULES_T1 = `You are ReviseLab, a friendly IELTS Writing Task 1 (Academic) tutor for learners around band 5.0-6.5.
Rules:
- Use simple English (CEFR B1). Short sentences.
- Never write or rewrite the student's report for them. Give questions, hints, or a tiny example on a DIFFERENT chart only.
- Judge with the public IELTS Writing Task 1 band descriptors: Task Achievement (TA: clear overview, key features selected and compared, accurate data, at least 150 words), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).
- You cannot see the chart; judge from the task description and the report itself (overview, selection, comparisons, organisation, language).
- Reply with JSON only, using exactly the keys requested.`;
const isT1 = body => String(body && body.task) === "1";
const rulesFor = body => isT1(body) ? RULES_T1 : RULES;
const taskText = body => isT1(body)
  ? `Task 1 chart: ${str(body.chart) || "(see task)"}\nTask: ${need(body, "topic")}`
  : `Question: ${need(body, "topic")}`;

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
  "/tutor": { reply: "Good. Can a phone help learning in a lesson, or get in the way? Give one example.", done: false, stage: 2 },
  "/plan": { step1: "Opinion question: do you agree or disagree?", step2: "Phones help with dictionaries in class; phones distract with games.", step3: "Partly agree: ban phones in lessons, allow them for study tasks.", step4: "Intro + position / Body 1: distraction / Body 2: learning tools / Conclusion" },
  "/hint": { hint: "Think about one lesson where a phone helped you look something up quickly." }
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
        case "/hint": return json(await hint(await readJson(request), env));
        case "/plan": return json(await plan(await readJson(request), env));
        case "/models": return json({ models: await geminiModels(env) });
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
  if (bytes.length > 15 * 1024 * 1024) throw httpError(413, "Image too large (max 15 MB)");
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
  // 1st choice: Gemini (best for handwriting, keeps the student's mistakes)
  let geminiError;
  try {
    const out = await geminiRetry(env,
    "You transcribe student writing from photos. Copy the English text EXACTLY as written, including spelling and grammar mistakes — do NOT correct anything. Keep paragraph breaks as \\n\\n. Reply with JSON only.",
    `Transcribe the text in this image. Return JSON: {"text": "the full text", "unclear": ["words you could not read, if any"]}`,
    { mime_type: mime, data: toBase64(bytes) }, 1, 14000);   // at most 2 Gemini models, 14 s each
    return { text: String(out.text || ""), unclear: Array.isArray(out.unclear) ? out.unclear : [], source: "gemini" };
  } catch (e) { geminiError = e; }

  // 2nd choice: OCR.space (free OCR service). Engine 3 reads handwriting; Engine 2 is the backup. Free limit: 1 MB per photo.
  if (bytes.length <= 1024 * 1024) {
    for (const engine of [3, 2]) {
      try { return { text: await ocrSpace(bytes, mime, engine, env, engine === 3 ? 20000 : 10000), unclear: [], source: "ocr.space" }; }
      catch (e) { /* try the next engine */ }
    }
  }
  throw httpError(502, `Could not read the photo. Please try again or type your text. (${String(geminiError.message).slice(0, 80)})`);
}

async function ocrSpace(bytes, mime, engine, env, ms) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), mime === "image/png" ? "page.png" : "page.jpg");
  form.append("OCREngine", String(engine));
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  const r = await fetch("https://api.ocr.space/parse/image", {
    method: "POST", headers: { apikey: env.OCRSPACE_API_KEY || "helloworld" }, body: form,   // "helloworld" = public test key
    signal: AbortSignal.timeout(ms)
  });
  if (!r.ok) throw httpError(502, `OCR.space error ${r.status}`);
  const data = await r.json();
  const text = (data.ParsedResults || []).map(p => p.ParsedText || "").join("\n").replace(/\r\n/g, "\n").trim();
  if (data.IsErroredOnProcessing || !text) throw httpError(502, "OCR.space: " + [].concat(data.ErrorMessage || "no text found").join(" "));
  return text;
}

async function score(body, env) {
  const t1 = isT1(body);
  const essay = need(body, "essay");
  const wc = countWords(essay);
  if (wc < (t1 ? 40 : 50)) throw httpError(400, `Too short (${wc} words). Write at least ${t1 ? 40 : 50} words.`);

  const out = await ai(env, rulesFor(body), `${taskText(body)}

Student ${t1 ? "report" : "essay"} (${wc} words):
"""
${essay}
"""

Return JSON:
{"tr": number, "cc": number, "lr": number, "gra": number,   // each 0-9 in steps of 0.5 ("tr" = Task Response, or Task Achievement for Task 1)
 "focus": "TR" | "CC" | "LR" | "GRA",                      // the criterion that would raise the score most
 "focus_reason": "one sentence",
 "issue_paragraph": integer,                               // 1-based paragraph number of the issue
 "issue_sentence": "copy ONE sentence from the essay exactly",
 "issue_why": "why this sentence lowers the score, max 30 words",
 "next_step": "what to do next, max 20 words",
 "hints": ["hint 1: gentle", "hint 2: more specific, still not the answer"],
 "practice_skill": "the skill to practise, max 10 words",
 "practice_prompt": "${t1 ? "a NEW short Task 1 practice task that trains this skill, ending with: Write the overview only (30-60 words)." : "a NEW IELTS Task 2 question that trains this skill, ending with: Write one body paragraph (100-150 words)."}"}`);

  const tr = band(out.tr), cc = band(out.cc), lr = band(out.lr), gra = band(out.gra);
  const overall = band((tr + cc + lr + gra) / 4);          // computed here so it is always consistent
  const focus = ["TR", "CC", "LR", "GRA"].includes(out.focus) ? out.focus : lowest({ TR: tr, CC: cc, LR: lr, GRA: gra });
  return {
    tr, cc, lr, gra, overall,
    range: `${Math.max(0, overall - 0.5).toFixed(1)}-${overall.toFixed(1)}`,
    focus, focus_label: focus === "TR" && t1 ? "Task Achievement" : LABELS[focus],
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
  const out = await ai(env, rulesFor(body), `${taskText(body)}
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
  const out = await ai(env, rulesFor(body), `Skill being practised: ${need(body, "skill")}
Question: ${need(body, "prompt")}
Student paragraph (written without any hints, ${wc} words):
"""
${answer}
"""

Return JSON:
{"skill_applied": boolean,                 // did the student use the skill?
 "band": number,                           // Task Response (Task 1: Task Achievement) band for this answer, 0-9 in steps of 0.5
 "good": "quote the best phrase from the paragraph, max 15 words",
 "feedback": "max 30 words: what worked and one thing to improve"}`);
  return { skill_applied: out.skill_applied === true, band: band(out.band), good: str(out.good), feedback: str(out.feedback), word_count: wc, word_count_ok: isT1(body) ? wc >= 30 && wc <= 60 : wc >= 100 && wc <= 150 };
}

async function tutor(body, env) {
  const steps = isT1(body)
    ? "1 Chart (what the chart shows), 2 Overview (the main trends or features), 3 Key features (the important numbers and comparisons), 4 Outline (which features go in which paragraph)"
    : "1 Question type (what kind of Task 2 question it is), 2 Ideas (reasons and examples), 3 Position (a clear opinion), 4 Outline (which idea goes in which paragraph)";
  const out = await ai(env, rulesFor(body) + `
You are helping the student PLAN before writing. Ask ONE short question at a time. Never give a full answer or a model paragraph.
The plan has 4 steps: ${steps}.
"stage" is the step the student is working on now (1-4). If the student asks to work on a step, move to that step.
When the student has finished all 4 steps, set "done" to true and tell them they are ready to write.`,
  `${taskText(body)}

Conversation so far:
${str(body.transcript) || "(none)"}

Student: ${need(body, "message")}

Return JSON: {"reply": "your next message, max 40 words", "done": boolean, "stage": 1-4}`);
  const stage = Math.min(4, Math.max(1, Math.round(Number(out.stage)) || 1));
  return { reply: str(out.reply), done: out.done === true, stage };
}

async function plan(body, env) {
  const steps = isT1(body) ? ["Chart: what the chart shows", "Overview: the main trends or features", "Key features: the important numbers and comparisons", "Outline: which features go in which paragraph"]
                           : ["Question type: what kind of question it is", "Ideas: the reasons and examples", "Position: the student's opinion", "Outline: which idea goes in which paragraph"];
  const out = await ai(env, rulesFor(body) + `
Summarise the student's plan from the tutor conversation, for the student to look at while writing.
Use only what the STUDENT said or agreed to. Do not add new ideas. If a step was not discussed, write "Not discussed yet".`,
  `${taskText(body)}

Conversation:
${need(body, "transcript")}

The 4 steps are:
1 ${steps[0]}
2 ${steps[1]}
3 ${steps[2]}
4 ${steps[3]}

Return JSON: {"step1": "max 30 words", "step2": "max 40 words", "step3": "max 30 words", "step4": "max 40 words, use / between paragraphs"}`);
  return { step1: str(out.step1), step2: str(out.step2), step3: str(out.step3), step4: str(out.step4) };
}

async function hint(body, env) {
  const out = await ai(env, rulesFor(body) + `
The student is planning an essay and is stuck. Give ONE small hint (max 25 words) that helps them think of their own idea.
Do not write a sentence they can copy. Base the hint on the question and on what they have said so far.`,
  `${taskText(body)}
Plan step they are on (${isT1(body) ? "1 Chart, 2 Overview, 3 Key features, 4 Outline" : "1 Question type, 2 Ideas, 3 Position, 4 Outline"}): ${str(body.stage) || "2"}
Hints already given (give a NEW, different hint): ${str(body.previous) || "(none)"}

Conversation so far:
${str(body.transcript) || "(none)"}

Return JSON: {"hint": "your hint"}`);
  return { hint: str(out.hint) };
}

// ---------- helpers ----------

const LABELS = { TR: "Task Response", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy" };

// Choose the AI: photos -> Gemini (DeepSeek cannot read images); text -> DeepSeek if its key is set, else Gemini.
// If the first AI fails, try the other one once.
async function ai(env, system, userText, image) {
  if (image || !env.DEEPSEEK_API_KEY) return await geminiRetry(env, system, userText, image);
  try { return await deepseek(env, system, userText); }
  catch (e) { if (env.GEMINI_API_KEY) return await geminiRetry(env, system, userText); throw e; }
}

// Gemini is sometimes "busy" (503/429). Then try other Gemini models that can read images, one by one.
async function geminiRetry(env, system, userText, image, maxOthers = 4, ms = 45000) {
  const first = env.MODEL || "gemini-3.8-flash";
  const others = (await geminiModels(env)).filter(m => m !== first && /flash/.test(m) && !/tts|audio|image|embedding|live|preview-tts/.test(m));
  let lastError;
  for (const model of [first, ...others.slice(0, maxOthers)]) {
    try { return await gemini(env, system, userText, image, model, ms); }
    catch (e) {
      lastError = e;
      const busy = e.status === 429 || /503|404|UNAVAILABLE|not found|no longer|timeout|abort/i.test(String(e.name) + String(e.message));
      if (!busy) throw e;
    }
  }
  throw lastError;
}

// Ask Google which models this key can use (newest first).
async function geminiModels(env) {
  if (!env.GEMINI_API_KEY) return [];
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace("models/", ""))
    .reverse();
}

async function deepseek(env, system, userText) {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "system", content: system }, { role: "user", content: userText + "\nReply with JSON only." }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });
  if (!r.ok) throw httpError(502, `DeepSeek error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "")); }
  catch { throw httpError(502, "AI did not return valid JSON"); }
}

async function gemini(env, system, userText, image, model, ms = 45000) {
  if (!env.GEMINI_API_KEY) throw httpError(500, "GEMINI_API_KEY is not set");
  model = model || env.MODEL || "gemini-3.8-flash";
  const parts = [{ text: userText }];
  if (image) parts.push({ inline_data: image });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(ms),       // give up on a slow model instead of waiting forever
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
