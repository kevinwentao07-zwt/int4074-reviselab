const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const dialogContent = document.querySelector('#dialog-content');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const store = 'reviselab-web-v28';
const steps = ['Plan', 'Write', 'Feedback', 'Revise', 'Skill practice'];
const stages = {
  1: ['Chart', 'Overview', 'Key features', 'Outline'],
  2: ['Question type', 'Ideas', 'Position', 'Outline']
};
const questions = {
  1: ['In your own words, what does the chart show?', 'What are the main patterns you can see?',
    'Which figures or features best support a comparison?', 'How would you group the main points into paragraphs?'],
  2: ['What type of question is this, and what does it ask you to do?', 'Which relevant reason or example could you develop?',
    'What is your position or main response to the question?', 'How would you organise your response across the paragraphs?']
};
let saved;
try { saved = JSON.parse(localStorage.getItem(store)); } catch { saved = null; }
const state = saved || { projects: [], active: null, target: 7, date: '', onboarded: false };
let bank;
let demo;
let page = 'home';
let task = '2';
let selected = null;
let issueIndex = 0;
let busy = false;
let busyMessage = '';
let status = '';
let error = '';
let inputMode = 'type';

const project = () => state.projects.find(item => item.id === state.active);
const issue = () => project()?.scores.at(-1)?.issues?.[issueIndex];
const words = value => (value.trim().match(/\S+/g) || []).length;
const band = value => Number.isFinite(Number(value)) && value != null ? Number(value).toFixed(1) : '—';
const $ = selector => app.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const btn = (label, action, className = '', extra = '') =>
  `<button type="button" data-action="${action}" class="${className}" ${extra}>${esc(label)}</button>`;
const card = html => `<section class="card">${html}</section>`;
const text = value => `<p class="pre">${esc(value)}</p>`;
const actionRow = (...buttons) => `<div class="actions">${buttons.join('')}</div>`;
const statusBox = () => `<div class="status ${error ? 'error' : ''}" role="status">${esc(error || (busy ? busyMessage : status))}</div>`;
const stat = (label, value) => `<div class="stat"><strong>${esc(value)}</strong>${esc(label)}</div>`;

function save() {
  try { localStorage.setItem(store, JSON.stringify(state)); }
  catch { error = 'Browser storage is unavailable or full. Keep this tab open to retain your work.'; }
}

function go(next) {
  if (busy) return;
  if (dialog.open) dialog.close();
  if (project() && ['tutor', 'write', 'score', 'issue', 'practice'].includes(next)) {
    project().lastPage = next === 'issue' || next === 'practice' ? 'score' : next;
    save();
  }
  page = next;
  status = '';
  error = '';
  render();
  window.scrollTo(0, 0);
  $('h1')?.focus({ preventScroll: true });
}

function showDialog(html) {
  dialogContent.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}

function start(next, topic = selected) {
  const item = {
    id: crypto.randomUUID(), task, topic: topic || { title: 'Custom writing task', prompt: '', type: '' },
    essay: '', scores: [], revisions: {}, practicePrompts: [], stage: 1, turns: [],
    hints: [], complete: [], plan: null, updated: Date.now()
  };
  state.projects.unshift(item);
  state.active = item.id;
  issueIndex = 0;
  inputMode = 'type';
  save();
  go(next);
}

function update() {
  const item = project();
  if (item) item.updated = Date.now();
  save();
}

function requestContext(item = project()) {
  return { task: item.task, topic: item.topic.prompt, chart: [item.topic.title, item.topic.type].filter(Boolean).join(' · ') };
}

async function api(endpoint, body, contentType) {
  const response = await fetch('api/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': contentType || 'application/json' },
    body: contentType ? body : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'The writing coach is unavailable. Please try again later.' : result.error);
  return result;
}

async function run(message, work) {
  if (busy) return;
  busy = true;
  error = '';
  status = '';
  busyMessage = message;
  render();
  let next;
  try { next = await work(); }
  catch (failure) { error = failure.message || 'Something went wrong. Try again.'; }
  finally { busy = false; }
  if (next) go(next);
  else render();
}

function title(label, lead = '') {
  return `<h1 tabindex="-1">${esc(label)}</h1>${lead ? `<p class="muted">${esc(lead)}</p>` : ''}`;
}

function promptCard(topic, label = 'Writing question') {
  return card(`<div class="eyebrow">${esc(label)}</div><h2>${esc(topic.title)}</h2>
    <p class="muted">${esc([topic.type, topic.theme].filter(Boolean).join(' · '))}</p>
    ${text(topic.prompt)}${topic.instruction ? text(topic.instruction) : ''}
    ${topic.image_file ? `<button type="button" class="chart-button" data-action="chart" data-image="${esc(topic.image_file)}">
      <img class="chart" src="assets/${esc(topic.image_file)}" alt="${esc(topic.title)}"><small>Enlarge chart</small></button>` : ''}`);
}

function workflow(active) {
  const item = project();
  const options = ['tutor', 'write', 'score', 'issue', 'practice'];
  return `<nav class="steps" aria-label="Writing stages">${steps.map((label, index) => {
    const disabled = [!item.topic.prompt, false, !item.scores.length, !issue(), !issue()][index];
    return btn(label, options[index], '', `${disabled ? 'disabled' : ''} aria-pressed="${index === active}"`);
  }).join('')}</nav>`;
}

function home() {
  const item = project();
  const recent = state.projects.flatMap(entry => entry.scores).sort((a, b) => b.at - a.at)[0];
  return `<section class="hero"><div class="eyebrow">IELTS Writing · Task 1 &amp; Task 2</div>
    ${title('Plan. Write. Revise. Improve.')}
    <p>Practise with real writing prompts, get an AI band estimate, and work on the skills your draft needs.</p>
    ${actionRow(btn('Choose a topic', 'topics', 'primary'), btn('Full essay practice', 'custom'))}</section>
    ${state.onboarded ? '' : card(`<h2>Set your goal</h2><div class="grid equal">
      <div><label for="target">Target band</label>${targetSelect()}</div>
      <div><label for="test-date">Test date (optional)</label><input id="test-date" type="date" value="${esc(state.date)}"></div>
      </div>${actionRow(btn('Save goal', 'goal', 'primary'), btn('Skip for now', 'goal-skip'))}`)}
    ${item ? card(`<div class="eyebrow">In progress</div><h2>${esc(item.topic.title)}</h2>
      ${actionRow(btn('Continue', 'continue', 'primary'), btn('Essay history', 'history'))}`) : ''}
    ${card(`<h2>My progress</h2><div class="stats">${stat('Target band', band(state.target))}
      ${stat('Latest estimate', band(recent?.overall))}${stat('Writing projects', state.projects.length)}</div>
      ${btn('View progress', 'history')}`)}
    <p class="muted">Projects are saved in this browser. Band estimates come from AI and may differ from an official IELTS score.</p>`;
}

function targetSelect() {
  return `<select id="target">${Array.from({ length: 13 }, (_, index) => 3 + index * .5).map(value =>
    `<option value="${value}" ${Number(state.target) === value ? 'selected' : ''}>${band(value)}</option>`).join('')}</select>`;
}

function topics() {
  const visible = bank[task];
  selected = visible.find(item => item.id === selected?.id) || visible[0];
  return `${title('Choose a topic')}<div class="grid">${card(`<div class="row">
      ${btn('Task 1 · Report', 'task1', '', `aria-pressed="${task === '1'}"`)}
      ${btn('Task 2 · Essay', 'task2', '', `aria-pressed="${task === '2'}"`)}
      </div><label for="topic-search">Search topics</label><input id="topic-search" type="search" placeholder="Title, theme or question type">
      <div class="topic-list">${visible.map(item => `<button type="button" data-action="select" data-id="${esc(item.id)}"
      data-search="${esc([item.title, item.theme, item.type].join(' ').toLowerCase())}" aria-pressed="${item.id === selected.id}">
      ${esc(item.title)}<small>${esc(item.type)} · ${esc(item.theme)}</small></button>`).join('')}</div>`)}
    <div>${promptCard(selected)}${actionRow(btn('Plan with tutor', 'start-tutor', 'primary'),
      btn('Skip to writing', 'start-write'), btn('Use my own question', 'start-custom'))}</div></div>`;
}

function tutor() {
  const item = project();
  const stage = item.stage;
  const hints = item.hints.filter(entry => entry.stage === stage);
  const turns = item.turns.filter(entry => entry.stage === stage);
  return `${title('AI tutor', `Step ${stage} of 4`)}${workflow(0)}<div class="grid">${promptCard(item.topic)}
    ${card(`<div class="steps">${stages[item.task].map((label, index) => btn(`${index + 1} · ${label}`, 'stage', '',
      `data-stage="${index + 1}" aria-pressed="${index + 1 === stage}" ${index > 0 && !item.complete.includes(index) ? 'disabled' : ''}`)).join('')}</div>
    <div class="messages">
      <p class="bubble">${esc(questions[item.task][stage - 1])}</p>
      ${turns.map(entry => `<p class="bubble student pre">${esc(entry.message)}</p><p class="bubble pre">${esc(entry.reply)}</p>`).join('')}
    </div>${hints.length ? `<blockquote>${hints.map(entry => text(entry.hint)).join('')}</blockquote>` : ''}
    <label for="chat">Your reply</label><textarea id="chat" class="chat" placeholder="Write a short response">${esc(item.chatDraft)}</textarea>
    ${statusBox()}${actionRow(btn('Send', 'send', 'primary'),
      SpeechRecognition ? btn('Dictate', 'dictate') : '',
      'speechSynthesis' in window ? btn('Listen to tutor', 'listen-tutor') : '', btn(`Get a hint (${Math.max(0, 3 - item.hints.length)} left)`, 'hint', '', item.hints.length >= 3 ? 'disabled' : ''),
      btn('Next step', 'next-stage', '', !item.complete.includes(stage) || stage === 4 ? 'disabled' : ''), btn('Start writing', 'write'),
      item.turns.length ? btn('View saved chat', 'saved-chat') : '')}`)}</div>`;
}

function uploadControls(kind, mode, id) {
  if (mode === 'type') return '';
  if (mode === 'file') return `<label for="${id}">Choose a PDF, Word or text file</label>
    <input id="${id}" data-kind="${kind}" type="file" accept=".pdf,.docx,.txt,.md"><p class="muted">Review the extracted text before submitting.</p>`;
  return `<div class="row"><div><label for="${id}">Add photos</label><input id="${id}" data-kind="${kind}" type="file" accept="image/*" multiple></div>
    <div><label for="${id}-camera">Take photo</label><input id="${id}-camera" data-kind="${kind}" type="file" accept="image/*" capture="environment"></div></div>`;
}

function write() {
  const item = project();
  const target = item.task === '1' ? 150 : 250;
  const noun = item.task === '1' ? 'report' : 'essay';
  return `${title('Your ' + noun, 'Step 2 of 5 · Write')}${workflow(1)}<div class="grid">
    ${item.topic.prompt && !item.topic.custom ? promptCard(item.topic) : card(`<h2>Your question</h2>
      <label for="custom-prompt">IELTS Writing Task ${item.task} prompt</label>
      <textarea id="custom-prompt">${esc(item.topic.prompt)}</textarea>`)}
    ${card(`<div class="row">${['type', 'photo', 'file'].map(mode => btn(mode[0].toUpperCase() + mode.slice(1),
      'mode', '', `data-mode="${mode}" aria-pressed="${inputMode === mode}"`)).join('')}
      ${item.turns.length ? btn('My plan', 'plan') : ''}</div>
    ${uploadControls('essay', inputMode, 'draft-upload')}
    <label for="essay">${inputMode === 'type' ? 'Draft' : 'Draft · check and edit the extracted text'}</label>
    <textarea id="essay" class="essay" placeholder="Write your ${noun} here" spellcheck="false">${esc(item.essay)}</textarea>
    <p class="muted"><span id="word-count">${words(item.essay)}</span> words · Target at least ${target}</p>
    ${statusBox()}${actionRow(btn('Get my estimate', 'estimate', 'primary'),
      item.scores.length ? btn('View last estimate', 'score') : '')}`)}</div>`;
}

function score() {
  const item = project();
  const current = item.scores.at(-1);
  const first = item.scores[0];
  const comparison = key => first === current ? band(current[key]) : `${band(first[key])} → ${band(current[key])}`;
  return `${title('Your estimate', 'Step 3 of 5 · Feedback')}${workflow(2)}
    ${card(`<h2>Estimated overall band</h2><div class="stats">${stat(first === current ? 'Overall' : 'First estimate → latest estimate', comparison('overall'))}
      ${stat('Estimated range', current.range || '—')}${stat('Words', current.word_count || words(current.essay))}</div>
      <div class="stats">${stat(item.task === '1' ? 'Task Achievement' : 'Task Response', comparison('tr'))}
      ${stat('Coherence & Cohesion', comparison('cc'))}${stat('Lexical Resource', comparison('lr'))}
      ${stat('Grammatical Range & Accuracy', comparison('gra'))}</div>
      <p class="muted">AI band estimate · ${item.scores.length} attempt${item.scores.length === 1 ? '' : 's'}</p>
      ${item.essay !== current.essay ? '<p class="muted">Your draft has changed since this estimate.</p>' : ''}
      ${actionRow(btn('Continue editing', 'write'))}`)}
    ${card(`<h2>Review writing issues</h2><div class="topic-list">${current.issues.map((entry, index) => btn(
      `${entry.focus_label} · ${entry.issue_title}`, 'select-issue', 'issue', `data-index="${index}"`)).join('') || '<p>No issues saved.</p>'}</div>`)}`;
}

function revisionData() {
  const item = project();
  const current = item.scores.at(-1);
  const key = current.id + ':' + issueIndex;
  if (!item.revisions[key]) {
    const entry = issue();
    const excerpt = entry.issue_sentence || '';
    const paragraphs = current.essay.split(/\n\s*\n/);
    const matching = excerpt ? paragraphs.filter(part => part.includes(excerpt)) : [];
    const before = entry.focus !== 'GRA' && matching.length === 1 ? matching[0].trim() : excerpt;
    item.revisions[key] = { before, draft: before, checks: [], hintsUsed: 0, practice: null };
  }
  return item.revisions[key];
}

function feedback() {
  const item = project();
  const entry = issue();
  const revision = revisionData();
  const latest = revision.checks.at(-1);
  const hints = entry.hints || [];
  return `${title('Writing issues', 'Step 4 of 5 · Revise')}${workflow(3)}<div class="grid">
    ${card(`<div class="eyebrow">${esc(entry.focus_label)}</div><h2>${esc(entry.issue_title)}</h2>
      <blockquote>${text(entry.issue_sentence)}</blockquote><h3>Why it affects your score</h3>${text(entry.issue_why)}
      <h3>Next step</h3>${text(entry.next_step)}
      ${actionRow('speechSynthesis' in window ? btn('Listen to feedback', 'listen') : '', btn('Other issues', 'score'))}`)}
    ${card(`<h2>Revise this ${entry.focus === 'GRA' ? 'sentence' : 'passage'}</h2><h3>Before</h3><blockquote>${text(revision.before)}</blockquote>
      ${hints.slice(0, revision.hintsUsed).map(text).join('')}
      ${revision.hintsUsed < hints.length ? btn('Show a hint', 'revision-hint') : ''}
      ${uploadControls('revision', 'photo', 'revision-upload')}
      <label for="revision">Your revision</label><textarea id="revision">${esc(revision.draft)}</textarea>
      ${statusBox()}${actionRow(btn('Check my revision', 'check', 'primary'), btn('Practise this skill', 'practice'))}
      ${latest ? `<hr><h3>AI feedback · ${latest.passed ? 'Goal met' : 'Keep revising'}</h3>
        <h3>After</h3><blockquote>${text(latest.draft)}</blockquote>${text(latest.message)}
        ${latest.next_hint ? text(latest.next_hint) : ''}
        ${latest.applied ? '<p class="muted">Applied to full draft.</p>' : actionRow(
          btn('Apply to full essay', 'apply', '', revision.draft !== latest.draft ? 'disabled' : ''))}
        ${actionRow(btn('Edit full essay', 'write'))}` : ''}
      ${item.essay.includes(revision.before) ? '' : '<p class="muted">The draft no longer contains this original passage.</p>'}`)}</div>`;
}

function practice() {
  const entry = issue();
  const item = project();
  const practice = revisionData().practice;
  const question = practice?.question;
  const result = practice?.result;
  return `${title('Skill practice', 'Step 5 of 5 · Apply the skill')}${workflow(4)}<div class="grid">
    ${card(`<div class="eyebrow">${esc(entry.focus_label)}</div><h2>${esc(entry.practice_skill || entry.issue_title)}</h2>
      ${question ? `<h3>Practice question</h3>${text(question.prompt)}${text(question.instructions)}
        ${question.reference_data ? `<blockquote>${text(question.reference_data)}</blockquote>` : ''}
        <p class="muted">Target ${esc(question.word_min)}–${esc(question.word_max)} words</p>` : ''}
      ${actionRow(btn(question ? 'Generate another question' : 'Generate practice question', 'practice-task', 'primary'),
        btn('Back to full essay', 'write'), btn('Other issues', 'score'))}
      ${question ? '' : statusBox()}`)}
    ${question ? card(`<h2>Your answer</h2>${uploadControls('practice', 'photo', 'practice-upload')}
      <label for="practice-answer">Practice response</label><textarea id="practice-answer">${esc(practice.answer)}</textarea>
      <p class="muted"><span id="word-count">${words(practice.answer)}</span> words</p>
      ${statusBox()}${actionRow(btn('Submit', 'practice-submit', 'primary'))}
      ${result ? `<hr><h3>${result.skill_applied ? 'Skill applied' : 'Keep practising'}</h3>
        ${text(result.good)}${text(result.feedback)}
        <p class="muted">${esc(result.word_count)} words · Band ${band(result.band)}${result.word_count_ok ? '' : ' · Outside the target length'}</p>` : ''}`) : ''}
    </div>`;
}

function history() {
  const scored = state.projects.flatMap(entry => entry.scores.map(result => ({ ...result, title: entry.topic.title })))
    .sort((a, b) => a.at - b.at).slice(-12);
  const projects = [...state.projects].sort((a, b) => b.updated - a.updated);
  return `${title('My progress', 'Your projects are saved in this browser.')}
    ${card(`<h2>Estimated bands</h2><p class="muted">Target ${band(state.target)}</p>
      ${scored.length ? `<div class="progress-chart" aria-label="Recent estimates">${scored.map(entry =>
        `<div class="progress-bar" title="${esc(entry.title)}"><strong>${band(entry.overall)}</strong>
         <span style="height:${Math.max(3, Math.min(100, Number(entry.overall) / 9 * 100 || 0))}px"></span></div>`).join('')}</div>
         <div class="topic-list">${scored.slice().reverse().map(entry => text(`${entry.title} · ${band(entry.overall)} · ${entry.focus_label || 'Feedback available'}`)).join('')}</div>`
        : '<p class="muted">Score a draft to see your progress here.</p>'}`)}
    ${card(`<h2>My essays</h2>${projects.map(item => {
      const latest = item.scores.at(-1);
      return `<div class="card"><h3>${esc(item.topic.title)}</h3><p class="muted">Task ${item.task} · ${words(item.essay)} words ·
      ${latest ? 'Band ' + band(latest.overall) : 'Draft'} · ${item.hints.length + Object.values(item.revisions).reduce((sum, entry) => sum + entry.hintsUsed, 0)} hints used</p>
      ${actionRow(btn('Edit essay', 'open-project', '', `data-id="${item.id}"`),
        latest ? btn('View last score', 'open-score', '', `data-id="${item.id}"`) : '',
        btn('Delete project', 'delete-project', 'quiet', `data-id="${item.id}"`))}</div>`;
    }).join('') || '<p>No writing projects yet.</p>'}${btn('Start a new essay', 'topics', 'primary')}`)}
    ${card(`<h2>Writing goal</h2><div class="grid equal"><div><label for="target">Target band</label>${targetSelect()}</div>
      <div><label for="test-date">Test date (optional)</label><input id="test-date" type="date" value="${esc(state.date)}"></div></div>
      ${statusBox()}${actionRow(btn('Save goal', 'goal', 'primary'))}`)}`;
}

function custom() {
  return `${title('Full essay practice')}${card(`<h2>Choose a writing task</h2>${actionRow(
    btn('Task 1 · Report', 'custom1', 'primary'), btn('Task 2 · Essay', 'custom2', 'primary'),
    btn('Browse the topic bank', 'topics'))}`)}`;
}

const pages = { home, topics, tutor, write, score, issue: feedback, practice, history, custom };
function render() {
  app.innerHTML = (demo ? '<p class="notice">Demo mode · AI replies are samples.</p>' : '') + pages[page]();
  app.setAttribute('aria-busy', String(busy));
  if (busy) app.querySelectorAll('button, textarea, input, select').forEach(element => { element.disabled = true; });
  const messages = $('.messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function issuePayload() {
  const entry = issue();
  return { ...requestContext(), criterion: entry.focus_label, criterion_code: entry.focus,
    issue_title: entry.issue_title, issue_sentence: entry.issue_sentence, issue_why: entry.issue_why,
    next_step: entry.next_step, skill: entry.practice_skill || entry.issue_title };
}

function tutorTranscript(item, stage) {
  return item.turns.filter(turn => !stage || turn.stage === stage)
    .map(turn => `Step ${turn.stage}\nStudent: ${turn.message}\nTutor: ${turn.reply}`).join('\n\n');
}

async function generatePractice() {
  const item = project();
  const revision = revisionData();
  if (revision.practice?.answer && !window.confirm('Replace this practice question and answer?')) return;
  await run('Preparing your practice question…', async () => {
    const question = await api('practice-task', { ...issuePayload(), avoid_prompts: item.practicePrompts });
    revision.practice = { question, answer: '', result: null };
    item.practicePrompts = [question.prompt, ...item.practicePrompts].slice(0, 12);
    update();
  });
}

function readAloud(value) {
  const speech = new SpeechSynthesisUtterance(value);
  speech.lang = 'en-GB';
  speechSynthesis.cancel();
  speechSynthesis.speak(speech);
}

const handlers = {
  home: () => go('home'),
  topics: () => go('topics'),
  history: () => go('history'),
  custom: () => go('custom'),
  'goal-skip': () => { state.onboarded = true; save(); render(); },
  goal: () => {
    state.target = Number($('#target').value);
    state.date = $('#test-date').value;
    state.onboarded = true;
    save();
    status = 'Goal saved.';
    render();
  },
  task1: () => { task = '1'; selected = null; render(); },
  task2: () => { task = '2'; selected = null; render(); },
  select: element => {
    const query = $('#topic-search').value;
    selected = bank[task].find(item => item.id === element.dataset.id);
    render();
    $('#topic-search').value = query;
    filterTopics(query);
    app.querySelector('[data-action="select"][aria-pressed="true"]')?.focus();
  },
  chart: element => showDialog(`<img src="assets/${esc(element.dataset.image)}" alt="Enlarged writing chart">`),
  'start-tutor': () => start('tutor'),
  'start-write': () => start('write'),
  'start-custom': () => start('write', null),
  custom1: () => { task = '1'; start('write', null); },
  custom2: () => { task = '2'; start('write', null); },
  continue: () => { issueIndex = 0; go(project().lastPage || 'write'); },
  'open-project': element => { state.active = element.dataset.id; issueIndex = 0; save(); go('write'); },
  'open-score': element => { state.active = element.dataset.id; issueIndex = 0; save(); go('score'); },
  'delete-project': element => {
    if (!window.confirm('Delete this writing project from this browser?')) return;
    state.projects = state.projects.filter(item => item.id !== element.dataset.id);
    if (state.active === element.dataset.id) state.active = state.projects[0]?.id ?? null;
    save();
    render();
  },
  tutor: () => go('tutor'),
  write: () => go('write'),
  score: () => go('score'),
  issue: () => go('issue'),
  practice: () => {
    go('practice');
    if (!revisionData().practice) return generatePractice();
  },
  'select-issue': element => { issueIndex = Number(element.dataset.index); go('issue'); },
  stage: element => { project().stage = Number(element.dataset.stage); update(); render(); },
  'next-stage': () => { project().stage += 1; update(); render(); },
  send: async () => {
    const item = project();
    const message = (item.chatDraft || '').trim();
    if (!message) return;
    await run('Waiting for your tutor…', async () => {
      const stage = item.stage;
      const result = await api('tutor', { ...requestContext(), stage, transcript: tutorTranscript(item, stage), message });
      item.turns.push({ stage, message, reply: result.reply });
      item.chatDraft = '';
      if (result.stage_complete && !item.complete.includes(stage)) item.complete.push(stage);
      update();
    });
  },
  hint: () => run('Getting a hint…', async () => {
    const item = project();
    const stage = item.stage;
    const previous = item.hints.filter(hint => hint.stage === stage).map(hint => hint.hint).join('\n');
    const result = await api('hint', { ...requestContext(), stage, transcript: tutorTranscript(item, stage), previous });
    item.hints.push({ stage, hint: result.hint });
    update();
  }),
  'saved-chat': () => showDialog(`<h2>Saved chat</h2>${text(tutorTranscript(project()))}`),
  plan: () => run('Preparing your outline…', async () => {
    const item = project();
    if (item.plan?.turns !== item.turns.length) {
      const result = await api('plan', { ...requestContext(), transcript: tutorTranscript(item) });
      item.plan = { turns: item.turns.length, result };
      update();
    }
    showDialog(`<h2>My plan</h2>${stages[item.task].map((stage, index) =>
      `<h3>${esc(stage)}</h3>${text(item.plan.result['step' + (index + 1)])}`).join('')}`);
  }),
  mode: element => { inputMode = element.dataset.mode; render(); },
  estimate: () => run('Reading your draft and estimating your band…', async () => {
    const item = project();
    if (!item.topic.prompt.trim()) throw new Error('Enter a writing question first.');
    const minimum = item.task === '1' ? 40 : 50;
    if (words(item.essay) < minimum) throw new Error(`Write at least ${minimum} words before requesting feedback.`);
    const result = await api('score', { ...requestContext(), essay: item.essay });
    const issues = result.issues || [];
    item.scores.push({ ...result, issues, id: crypto.randomUUID(), at: Date.now(), essay: item.essay });
    issueIndex = 0;
    update();
    return 'score';
  }),
  'listen-tutor': () => {
    const item = project();
    const last = item.turns.filter(turn => turn.stage === item.stage).at(-1);
    readAloud(last?.reply || questions[item.task][item.stage - 1]);
  },
  dictate: () => {
    const item = project();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-GB';
    recognition.onresult = event => {
      if (page !== 'tutor' || project() !== item || busy) return;
      const transcript = event.results[0][0].transcript;
      item.chatDraft = [item.chatDraft, transcript].filter(Boolean).join(' ');
      update();
      status = '';
      render();
      $('#chat').focus();
    };
    recognition.onerror = () => {
      if (page !== 'tutor' || project() !== item || busy) return;
      error = 'Voice input is unavailable. You can type your reply.';
      render();
    };
    status = 'Listening…';
    render();
    recognition.start();
  },
  listen: () => readAloud([issue().issue_why, issue().next_step].join(' ')),
  'revision-hint': () => { revisionData().hintsUsed++; update(); render(); },
  check: () => run('Checking your revision…', async () => {
    const revision = revisionData();
    if (!revision.draft.trim()) throw new Error('Write a revision first.');
    const result = await api('check', { ...issuePayload(), issue_sentence: revision.before, revision: revision.draft });
    revision.checks.push({ ...result, draft: revision.draft });
    update();
  }),
  apply: () => {
    const item = project();
    const revision = revisionData();
    const latest = revision.checks.at(-1);
    const index = item.essay.indexOf(revision.before);
    if (!revision.before || index < 0 || index !== item.essay.lastIndexOf(revision.before)) {
      error = 'The original passage is missing or appears more than once. Open the full draft to apply the revision manually.';
      render();
      return;
    }
    if (!window.confirm('Replace the original passage in your full draft?')) return;
    item.essay = item.essay.slice(0, index) + latest.draft.trim() + item.essay.slice(index + revision.before.length);
    latest.applied = true;
    update();
    go('write');
    status = 'Revision applied to your full draft.';
    render();
  },
  'practice-task': generatePractice,
  'practice-submit': () => run('Checking your practice answer…', async () => {
    const practice = revisionData().practice;
    if (!practice.answer.trim()) throw new Error('Write a practice response first.');
    practice.result = await api('practice', { ...issuePayload(), ...practice.question, answer: practice.answer });
    update();
  })
};

function filterTopics(value) {
  const query = value.trim().toLowerCase();
  app.querySelectorAll('[data-search]').forEach(button => { button.hidden = !button.dataset.search.includes(query); });
}

function storeDraft(kind, value) {
  if (kind === 'essay') project().essay = value;
  if (kind === 'revision') revisionData().draft = value;
  if (kind === 'practice') revisionData().practice.answer = value;
  if ($('#word-count')) $('#word-count').textContent = words(value);
  update();
}

function photoBlob(file) {
  if (file.size > 15 * 1024 ** 2) throw new Error('Choose an image under 15 MB.');
  if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return file;
  return createImageBitmap(file).then(image => {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2500 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Try a JPEG or PNG image.')), 'image/jpeg', .9));
  }).catch(() => { throw new Error('This browser could not open the photo. Try JPEG or PNG.'); });
}

async function importDraft(kind, files, mode) {
  await run(mode === 'file' ? 'Reading your document…' : 'Reading text from your photos…', async () => {
    const results = [];
    let unclear = false;
    for (const file of files) {
      if (file.size > 15 * 1024 ** 2) throw new Error('Choose a file under 15 MB.');
      if (mode === 'file') {
        if (/\.(txt|md)$/i.test(file.name)) results.push(await file.text());
        else {
          const type = /\.pdf$/i.test(file.name) ? 'application/pdf' :
            /\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '';
          if (!type) throw new Error('Choose a PDF, DOCX or text file.');
          results.push((await api('document', file, type)).text);
        }
      } else {
        const result = await api('ocr', await photoBlob(file), 'application/octet-stream');
        results.push(result.text);
        unclear ||= Boolean(result.unclear?.length);
      }
    }
    const extracted = results.filter(Boolean).join('\n\n').trim();
    if (!extracted) throw new Error('No text was found. Try a clearer photo or another file.');
    const previous = kind === 'essay' ? project().essay : kind === 'revision' ? revisionData().draft : revisionData().practice.answer;
    storeDraft(kind, kind === 'essay' && mode === 'photo' && previous.trim() ? previous.trimEnd() + '\n\n' + extracted : extracted);
    status = unclear ? 'Text imported. Some words were unclear, so check the transcription.' : 'Text imported. Check it before submitting.';
  });
}

app.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button && !busy) handlers[button.dataset.action]?.(button);
});
app.addEventListener('input', event => {
  const { id, value } = event.target;
  if (id === 'topic-search') filterTopics(value);
  if (id === 'essay') storeDraft('essay', value);
  if (id === 'revision') {
    storeDraft('revision', value);
    const apply = $('[data-action="apply"]');
    if (apply) apply.disabled = value !== revisionData().checks.at(-1).draft;
  }
  if (id === 'practice-answer') storeDraft('practice', value);
  if (id === 'chat') { project().chatDraft = value; update(); }
  if (id === 'custom-prompt') {
    project().topic.prompt = value;
    project().topic.custom = true;
    $('[data-action="tutor"]').disabled = !value.trim();
    update();
  }
});
app.addEventListener('change', event => {
  const input = event.target;
  if (input.type === 'file' && input.files.length) importDraft(input.dataset.kind, [...input.files], inputMode === 'file' && input.dataset.kind === 'essay' ? 'file' : 'photo');
});
for (const route of ['home', 'topics', 'history']) document.getElementById(route).addEventListener('click', () => go(route));

try {
  const [topicsResponse, healthResponse] = await Promise.all([fetch('topics.json'), fetch('health')]);
  if (!topicsResponse.ok || !healthResponse.ok) throw new Error();
  bank = await topicsResponse.json();
  demo = (await healthResponse.json()).demo;
  render();
} catch {
  app.innerHTML = '<h1>ReviseLab couldn’t load</h1><p>Refresh the page to try again.</p>';
  app.setAttribute('aria-busy', 'false');
}
