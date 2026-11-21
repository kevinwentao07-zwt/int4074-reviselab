# ReviseLab v9 — what changed and what you still need to do

v9 = v8 + a real backend. The screens, colours and layout are the same as v8.
Keep `ReviseLab_v8.aia` as a backup.

## What is new in v9

| Screen | Before (v8) | Now (v9) |
|---|---|---|
| Screen1 | — | 3 settings at the top: `SERVER`, `APP_KEY`, `TOPIC_SHEET`. Home shows the real latest band and essay count |
| Topic | 4 topics written in the blocks | Topics are read from a **Google Sheet** (same method as Lab 9). Filter by question type. New type "Two-part question" + icon |
| Write | Clock timer + fixed sample text | Photo → AI reads the handwriting (`/ocr`). Essay → AI scores it (`/score`). Score saved on the phone |
| Score | Fixed numbers | Real band, 4 criteria, bars and main issue |
| Feedback | Clock timer, always "fails" once | Real sentence and reason from the AI; revision checked by AI (`/check`) |
| Practice | Clock timer + fixed result | New question from the AI; paragraph checked by AI (`/practice`) |
| Tutor | Send only showed your text | Real chat with the AI tutor (`/tutor`); plan saved, shown in Write → "My plan" |
| Progress | Fixed chart | Chart uses the real band history |

Removed: the Clock timers that faked waiting; the "File" tab in Write (the AI server cannot read Word/PDF) is hidden.

## How the blocks work (for the presentation)

Every AI screen uses the same 3 blocks:

1. **`askAI` procedure** — sets `Web1.Url` = server + `/` + `request`, adds the app key header, and calls `Web1.PostText(body)`.
2. **The button** — sets `global request` (e.g. `"score"`), builds `global body` with a *make a dictionary* block + `Web1.JsonObjectEncode`, then calls `askAI`.
3. **`when Web1.GotText`** — if `responseCode = 200`, turns the reply into a dictionary with `Web1.JsonTextDecodeWithDictionaries` and shows the values (`get value for key ...`). Otherwise shows an error.

Photos use the `readPhoto` procedure (`Web1.PostFile` to `/ocr`).
Data between screens is passed with **TinyDB** (`last_score`, `band_history`, `essays`, `plan_transcript`).

The Topic screen is the Lab 9 pattern: `Web.Get` → `list from csv table` → remove header row → `select list item`.

## What YOU need to do

### 1. Deploy the AI server (about 15 min)
1. Get a free Gemini API key: https://aistudio.google.com → Get API key.
2. Cloudflare dashboard → Workers & Pages → Create → Worker → paste `backend/worker.js` → Deploy.
3. Worker → Settings → Variables and Secrets → add 2 **Secrets**:
   - `GEMINI_API_KEY` = your Gemini key
   - `APP_KEY` = any password you make up, e.g. `rl-2026-abc123`
4. Open `https://<your-worker>.workers.dev/health` in a browser → you should see `{"ok":true}`.
5. (If AI Studio no longer offers `gemini-2.5-flash`, add a Variable `MODEL` with the current model name.)

### 2. Make the topic Google Sheet (about 5 min)
1. Google Sheets → File → Import → upload `ReviseLab_Database/Task2/csv/task2_topics.csv`.
2. Share → General access: **Anyone with the link** (Viewer).
3. Copy the link and change the end `edit?usp=sharing` to `export?format=csv`.

### 3. Put the 3 settings into the app (2 min)
App Inventor → Projects → Import project (.aia) → `ReviseLab_v9.aia`.
Open **Screen1 → Blocks**, change the 3 text blocks at the top:
- `SERVER` → `https://<your-worker>.workers.dev` (no `/` at the end)
- `APP_KEY` → the same password as step 1.3
- `TOPIC_SHEET` → the link from step 2.3

### 4. Test on a phone (AI Companion), in this order
1. Topic list loads from the Sheet, filter works.
2. Tutor: send an idea → the AI replies.
3. Write: type or photograph an essay → Get my estimate → Score shows real numbers.
4. Score → Work on issue → Revise → Check my revision.
5. Practise skill → Submit.
6. Progress chart shows your bands.

If something fails, the app shows the server's error message — screenshot it.

## Good to know
- **Demo backup:** if the AI is down on presentation day, the Worker can return fixed sample answers. In the `askAI` block of a screen, add one more text block `?demo=1` at the end of the `join` that builds `Web1.Url`.
- Gemini free quota is limited: test once before recording the video.
- Do not show `APP_KEY` on your slides.
- "Open" in My essays always shows the most recent score (only the latest score is stored).
- The "Recurring issues" box on Progress is still fixed text.
- v9 was built and checked by a script (all components, variables and procedures match; the Worker was tested locally with mock AI replies). It has **not** been opened in App Inventor yet — if Import shows an error, send me the message.
