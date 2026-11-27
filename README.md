# ReviseLab · INT4074 group project

ReviseLab is an IELTS Academic Writing practice app available as an MIT App Inventor project and two web implementations.

- [Current App Inventor V28](ReviseLab_v28.aia) uses V282 as its base, fixes the five Revision Result actions, and restores the score list when fewer than four issues are returned.
- [App Inventor v28 iOS text fix](archive/app-inventor/v28-variants/ReviseLab_v28_ios_text_fixed.aia) includes the scoring fix, sentence replacement preview, and iOS input cleanup.
- [v282 teammate variant](archive/app-inventor/v28-variants/ReviseLab_v282.aia) adds clearer photo upload errors and retry handling to v28.
- [Earlier scoring fix](archive/app-inventor/v28-variants/ReviseLab_v28_fixed.aia) and [earlier revision fix](archive/app-inventor/v28-variants/ReviseLab_v28_revision_fixed.aia) are available as individual exports.
- [ReviseLab Site](ReviseLab_site/) is the current browser interface, with PDF and Word import and a Worker that connects the writing coach.
- [Node.js web app](ReviseLab_web/) includes the Task 1 and Task 2 question banks, AI scoring and feedback, targeted practice, and photo, PDF, and Word import.
- [Cloudflare Worker](backend/worker.js) — scoring, guided revision, targeted practice, tutor, writing plans, hints, and photo OCR.
- [Task 1 and Task 2 question banks](ReviseLab_Database/) and [archive](ReviseLab_Database.zip).
- [Teacher guidelines](Guidelines/) — assessment requirements, collaboration and peer evaluation forms, presentation outline, template, and example.
- [Promotional video versions and render script](ReviseLab%20Promo/).

## Version downloads

- [ReviseLab v28 release](https://github.com/kevinwentao07-zwt/int4074-reviselab/releases/tag/v28) includes the current App Inventor project and a source bundle with both web implementations and the backend Worker.
- [Historical versions release](https://github.com/kevinwentao07-zwt/int4074-reviselab/releases/tag/historical-versions) archives v8–v27, the extra v9 export, and four v28 variants. You can also browse the [historical exports](archive/app-inventor/).

## Running ReviseLab Site locally

Use Node.js 22.13 or later.

```sh
cd ReviseLab_site
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:8787. Set `REVISELAB_APP_KEY` in the Worker environment to connect the writing coach to the upstream service.

## Running the Node.js web app locally

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
