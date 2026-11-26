# ReviseLab · INT4074 group project

ReviseLab is an IELTS Academic Writing practice app available as an MIT App Inventor project and a Node.js web app.

- [App Inventor v28 iOS text fix](ReviseLab_v28_ios_text_fixed.aia) includes the scoring fix, sentence replacement preview, and iOS input cleanup.
- [v282 teammate variant](ReviseLab_v282.aia) adds clearer photo upload errors and retry handling to v28.
- [Original v28](ReviseLab_v28.aia), [scoring fix](ReviseLab_v28_fixed.aia), and [revision fix](ReviseLab_v28_revision_fixed.aia) are available as individual exports.
- [Web app](ReviseLab_web/) includes the Task 1 and Task 2 question banks, AI scoring and feedback, targeted practice, and photo, PDF, and Word import.
- [Cloudflare Worker](backend/worker.js) — scoring, guided revision, targeted practice, tutor, writing plans, hints, and photo OCR.
- [Task 1 and Task 2 question banks](ReviseLab_Database/) and [archive](ReviseLab_Database.zip).
- [Teacher guidelines](Guidelines/) — assessment requirements, collaboration and peer evaluation forms, presentation outline, template, and example.
- [Promotional video versions and render script](ReviseLab%20Promo/).

## Running the web app locally

Use Node.js 22.13 or later.

```sh
cd ReviseLab_web
npm ci
REVISELAB_DEMO=1 npm start
```

Open http://127.0.0.1:8787. Demo mode returns sample AI responses. For live responses, start without demo mode and set `REVISELAB_UPSTREAM` and its `APP_KEY` to use an existing Worker, or supply the AI provider credentials listed in [worker.mjs](ReviseLab_web/worker.mjs) to run the Worker locally.

## Group presentation

**For any question about the current presentation, open the [live Canva design](https://www.canva.com/design/DAHbiTsaupo/-0EGqUAW3z29u5YZoE0DTA/edit) and read the relevant slides in Canva.** The Canva design ID is `DAHbiTsaupo`. Canva is the source for current slide content, page numbers, notes, screenshots, and layout.

AI assistants should use the Canva app or connector when available, or open the Canva link in a browser with access. If Canva cannot be opened, ask for the relevant current slides or screenshots before making claims about the current deck.

The [PowerPoint export](presentation/ReviseLab-INT4074-Canva.pptx) and [slide text](presentation/Canva-slide-text.md) are historical snapshots from the initial repository upload. Presentation edits happen in Canva. Keep those snapshots as archives and read the updated design in Canva when needed.
