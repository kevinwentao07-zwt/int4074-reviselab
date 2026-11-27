# ReviseLab

IELTS Academic Writing practice for mobile and web.

- [MIT App Inventor v28 project](ReviseLab_v28.aia) and [historical App Inventor versions](archive/app-inventor/)
- Web source for [ReviseLab Site](ReviseLab_site/) and the [Node.js web app](ReviseLab_web/)
- [Database](ReviseLab_Database/) with the Writing Task 1 and Task 2 question banks
- [Demo video](https://github.com/kevinwentao07-zwt/int4074-reviselab/releases/download/v28/ReviseLab-demo.mp4)

Download the current project from the [v28 release](https://github.com/kevinwentao07-zwt/int4074-reviselab/releases/tag/v28) or get the [historical App Inventor archive](https://github.com/kevinwentao07-zwt/int4074-reviselab/releases/tag/historical-versions).

## Run the web versions locally

Use Node.js 22.13 or later. Both versions open at `http://127.0.0.1:8787` by default.

**ReviseLab Site**

```sh
cd ReviseLab_site
npm ci
npm run build
npm run dev
```

The Site's writing coach uses `REVISELAB_APP_KEY` to connect to the upstream Worker.

**Node.js web app**

```sh
cd ReviseLab_web
npm ci
REVISELAB_DEMO=1 npm start
```

Demo mode uses sample responses. For live responses, configure `REVISELAB_UPSTREAM` and `APP_KEY` to connect to the [Cloudflare Worker](ReviseLab_web/cloudflare/worker.js), or set the AI provider credentials listed in [worker.mjs](ReviseLab_web/worker.mjs) to run the Node.js app's Worker locally.
