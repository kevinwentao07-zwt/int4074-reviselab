import { icon } from './icons.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const dialogContent = document.querySelector('#dialog-content');
const goalQuick = document.querySelector('#goal-quick');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const store = 'reviselab-web-v28';
const steps = ['Plan', 'Write', 'Feedback', 'Revise', 'Skill practice'];
const writingPages = ['tutor', 'write', 'score', 'issue', 'practice'];
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
const state = { projects: [], active: null, target: 7, date: '', onboarded: false, ...saved };
let bank;
let page = 'home';
let task = '2';
let selected = null;
let topicQuery = '';
let topicType = '';
let onlineOnly = false;
let issueIndex = 0;
let busy = false;
let busyMessage = '';
let status = '';
let error = '';
let inputMode = 'type';
let photoRetry = null;

const project = () => state.projects.find(item => item.id === state.active);
const issue = () => project()?.scores.at(-1)?.issues?.[issueIndex];
const words = value => (value.trim().match(/\S+/g) || []).length;
const band = value => Number.isFinite(Number(value)) && value != null ? Number(value).toFixed(1) : '—';
const hintCount = item => item.hints.length + Object.values(item.revisions).reduce((sum, entry) => sum + entry.hintsUsed, 0);
const $ = selector => app.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const actionIcons = {
  topics: 'book', custom: 'edit', 'start-custom': 'edit', 'start-write': 'edit',
  tutor: 'message', 'start-tutor': 'message', write: 'edit', score: 'chart', issue: 'file',
  practice: 'practise', continue: 'edit', estimate: 'star', 'listen-tutor': 'listen', dictate: 'mic',
  hint: 'hint', listen: 'listen', 'revision-hint': 'hint', check: 'check', 'practice-task': 'star',
  apply: 'check', plan: 'layers', 'saved-chat': 'history', 'open-project': 'edit',
  'open-score': 'chart', 'delete-project': 'delete', goal: 'check',
};
const btn = (label, action, className = '', extra = '', glyph = actionIcons[action]) =>
  `<button type="button" data-action="${action}" class="${className}" ${extra}>${icon(glyph)}<span>${esc(label)}</span></button>`;
const card = (html, className = '') => `<section class="card ${className}">${html}</section>`;
const text = value => `<p class="pre">${esc(value)}</p>`;
const actionRow = (...buttons) => `<div class="actions">${buttons.join('')}</div>`;
const statusBox = () => `<div class="status ${error ? 'error' : ''}" role="status">${esc(error || (busy ? busyMessage : status))}</div>
  ${error && photoRetry ? btn('Retry photo', 'retry-photo', '', '', 'photo') : ''}`;
const stat = (label, value, glyph) => `<div class="stat">${glyph ? `<span class="tile-icon">${icon(glyph)}</span>` : ''}
  <div><span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong></div></div>`;

function save() {
  try { localStorage.setItem(store, JSON.stringify(state)); }
  catch { error = 'Browser storage is unavailable or full. Keep this tab open to retain your work.'; }
}

function go(next) {
  if (busy) return;
  if (dialog.open) dialog.close();
  if (project() && writingPages.includes(next)) {
    project().lastPage = next;
    project().issueIndex = issueIndex;
    save();
  }
  page = next;
  status = '';
  error = '';
  photoRetry = null;
  render();
  window.scrollTo(0, 0);
  $('h1')?.focus({ preventScroll: true });
}

function showDialog(html) {
  dialogContent.innerHTML = html;
  const heading = dialogContent.querySelector('h2');
  if (heading) heading.id = 'dialog-title';
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
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Could not reach the writing coach. Try again.');
  return result;
}

async function run(message, work) {
  if (busy) return;
  const trigger = document.activeElement?.dataset.action;
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
  else {
    render();
    if (trigger && !dialog.open) $(`[data-action="${CSS.escape(trigger)}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }
}

function title(label, lead = '') {
  return `<div class="page-heading"><h1 tabindex="-1">${esc(label)}</h1>${lead ? `<p class="muted">${esc(lead)}</p>` : ''}</div>`;
}

function promptCard(topic, label = 'Writing question') {
  const metadata = [topic.type, topic.theme].filter(Boolean);
  return card(`<p class="eyebrow">${icon('book')}${esc(label)}</p><h2>${esc(topic.title)}</h2>
    ${metadata.length ? `<div class="tags">${metadata.map(label => `<span>${esc(label)}</span>`).join('')}</div>` : ''}
    ${text(topic.prompt)}${topic.instruction ? `<p class="muted instruction">${esc(topic.instruction)}</p>` : ''}
    ${topic.online ? `<p class="muted topic-attribution"><a href="https://www.ielts.international/teaching-materials/writing-task-2-question-bank" target="_blank" rel="noopener noreferrer">IELTS.international</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>` : ''}
    ${topic.image_file ? `<button type="button" class="chart-button" data-action="chart" data-image="${esc(topic.image_file)}" data-title="${esc(topic.title)}">
      <img class="chart" src="assets/${esc(topic.image_file)}" alt="${esc(topic.title)}"><span>${icon('zoom')} Enlarge chart</span></button>` : ''}`,
    'prompt-card');
}

function workflow(active) {
  const item = project();
  return `<nav class="steps workflow" aria-label="Writing stages">${steps.map((label, index) => {
    const disabled = [!item.topic.prompt, false, !item.scores.length, !issue(), !issue()][index];
    return btn(label, writingPages[index], '', `${disabled ? 'disabled' : ''} ${index === active ? 'aria-current="step"' : ''}`);
  }).join('')}</nav>`;
}

function taskCard(number, count) {
  const report = number === '1';
  const type = report ? 'Academic reports' : 'Essays';
  return `<button type="button" class="task-card ${report ? 'report' : 'essay-task'}" data-action="${count ? `browse${number}` : `custom${number}`}">
    <span class="tile-icon">${icon(report ? 'chart' : 'edit')}</span>
    <span class="task-info"><strong>Task ${number}</strong><span>${type}</span></span>
    ${count ? `<span class="task-count">${count} topics</span>` : ''}
  </button>`;
}

function home() {
  const item = project();
  const recent = state.projects.flatMap(entry => entry.scores).sort((a, b) => b.at - a.at)[0];
  const currentStage = item && steps[writingPages.indexOf(item.lastPage)];
  return `<section class="hero">
    <img class="hero-art" src="assets/writing-desk.webp" alt="" width="960" height="640" fetchpriority="high">
    <div class="hero-copy"><h1 tabindex="-1">Write. Revise.<br>Improve.</h1>
      <p>IELTS practice with AI feedback.</p>
      ${actionRow(btn('Browse topics', 'topics', 'primary'), btn('Use my own prompt', 'custom', 'hero-secondary'))}
    </div></section>
    ${item ? card(`<div class="resume-title"><span class="tile-icon">${icon('file')}</span><div>
      <p class="muted">Task ${esc(item.task)}${currentStage ? ` · ${currentStage}` : ''}</p><h2>${esc(item.topic.title)}</h2></div></div>
      ${btn('Continue', 'continue', 'primary')}`, 'resume-card') : ''}
    <section class="home-section" aria-labelledby="tasks-title">
      <h2 id="tasks-title">Choose a task</h2>
      <div class="task-grid">${taskCard('1', bank[1].length)}${taskCard('2', bank[2].length)}</div>
    </section>
    <section class="home-section" aria-labelledby="progress-title">
      <div class="section-heading"><h2 id="progress-title">Your progress</h2>${btn('View progress', 'history', 'quiet')}</div>
      <div class="stats overview-stats">${item ? stat('Hints used', hintCount(item), 'hint') : stat('Target band', band(state.target), 'target')}
      ${stat('Latest estimate', band(recent?.overall), 'trend')}${stat('Drafts', state.projects.length, 'file')}</div>
    </section>`;
}

function goalFields(prefix = 'history') {
  const options = Array.from({ length: 13 }, (_, index) => 3 + index * .5).map(value =>
    `<option value="${value}" ${Number(state.target) === value ? 'selected' : ''}>${band(value)}</option>`).join('');
  return `<div class="grid equal"><div><label for="${prefix}-target">Target band</label>
    <select id="${prefix}-target" data-goal-target>${options}</select></div><div>
    <label for="${prefix}-date">Test date <span class="muted">(optional)</span></label>
    <input id="${prefix}-date" data-goal-date type="date" value="${esc(state.date)}"></div></div>`;
}

function topics() {
  const hasOnline = bank[task].some(item => item.online);
  const visible = onlineOnly && hasOnline ? bank[task].filter(item => item.online) : bank[task];
  const types = [...new Set(visible.map(item => item.type))];
  selected = visible.find(item => item.id === selected?.id) || visible[0];
  return `${title('Topic bank')}<div class="grid">${card(`<div class="section-heading"><div class="segments" role="group" aria-label="IELTS task">
      ${btn('Task 1', 'task1', '', `aria-pressed="${task === '1'}"`, 'chart')}
      ${btn('Task 2', 'task2', '', `aria-pressed="${task === '2'}"`, 'edit')}
      </div>${hasOnline ? btn('Online', 'online', 'source-toggle', `aria-pressed="${onlineOnly}"`, 'book') : ''}
      </div><div class="topic-filters">
        <label class="search-field"><span class="sr-only">Search topics</span>${icon('search')}
          <input id="topic-search" type="search" placeholder="Search topics" value="${esc(topicQuery)}"></label>
        <label class="filter-field"><span class="sr-only">Question type</span><select id="topic-type">
          <option value="">All types</option>${types.map(type => `<option ${topicType === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}
        </select></label>
      </div>
      <div class="section-heading topic-summary"><span id="topic-count" class="muted" role="status"></span>
        ${btn('Use my own prompt', 'start-custom', 'quiet')}</div>
      <div id="topic-list" class="topic-list">${visible.map(item => `<button type="button" data-action="select" data-id="${esc(item.id)}"
        data-type="${esc(item.type)}" data-search="${esc([item.title, item.theme, item.type, item.online ? item.prompt : ''].join(' ').toLowerCase())}" aria-pressed="${item.id === selected.id}">
        <span>${esc(item.title)}</span><small>${esc(item.type)} · ${esc(item.theme)}</small></button>`).join('')}
        <p id="topics-empty" class="empty muted" hidden>No matching topics.</p></div>`)}
    <div id="topic-detail" class="topic-detail" tabindex="-1">${promptCard(selected, `Task ${task} · Writing question`)}
      ${actionRow(btn('Plan with tutor', 'start-tutor', 'primary'), btn('Skip to writing', 'start-write'))}</div></div>`;
}

function tutor() {
  const item = project();
  const stage = item.stage;
  const hints = item.hints.filter(entry => entry.stage === stage);
  const turns = item.turns.filter(entry => entry.stage === stage);
  return `${title('AI tutor')}${workflow(0)}<div class="grid">${promptCard(item.topic)}
    ${card(`<div class="section-heading"><h2>Build your outline</h2><span class="muted">Step ${stage} of ${stages[item.task].length}</span></div>
    <div class="steps tutor-steps" role="group" aria-label="Tutor steps">${stages[item.task].map((label, index) => btn(label, 'stage', '',
      `data-stage="${index + 1}" aria-pressed="${index + 1 === stage}" ${index > 0 && !item.complete.includes(index) ? 'disabled' : ''}`)).join('')}</div>
    <div class="messages">
      <p class="bubble">${esc(questions[item.task][stage - 1])}</p>
      ${turns.map(entry => `<p class="bubble student pre">${esc(entry.message)}</p><p class="bubble pre">${esc(entry.reply)}</p>`).join('')}
    </div>${hints.length ? `<blockquote>${hints.map(entry => text(entry.hint)).join('')}</blockquote>` : ''}
    <label for="chat">Your reply</label><textarea id="chat" class="chat" placeholder="Write a short response">${esc(item.chatDraft)}</textarea>
    ${statusBox()}${actionRow(btn('Send', 'send', 'primary'),
      SpeechRecognition ? btn('Dictate', 'dictate') : '',
      'speechSynthesis' in window ? btn('Listen', 'listen-tutor') : '',
      btn(`Hint (${Math.max(0, 3 - item.hints.length)} left)`, 'hint', '', item.hints.length >= 3 ? 'disabled' : ''))}
    <div class="editor-footer">${actionRow(btn('Next step', 'next-stage', '', !item.complete.includes(stage) || stage === 4 ? 'disabled' : ''),
      btn('Start writing', 'write'), item.turns.length ? btn('Saved chat', 'saved-chat', 'quiet') : '')}</div>`)}</div>`;
}

function uploadControls(kind, mode, id) {
  if (mode === 'type') return '';
  if (mode === 'file') return `<div class="upload-row"><label class="upload-button" for="${id}">${icon('file')} Choose file
    <input id="${id}" class="sr-only" data-kind="${kind}" type="file" accept=".pdf,.docx,.txt,.md"></label>
    <span class="muted">PDF, DOCX or text</span></div>`;
  return `<div class="upload-row"><label class="upload-button" for="${id}">${icon('photo')} Add photos
    <input id="${id}" class="sr-only" data-kind="${kind}" type="file" accept="image/*" multiple></label>
    <label class="upload-button" for="${id}-camera">${icon('camera')} Take photo
    <input id="${id}-camera" class="sr-only" data-kind="${kind}" type="file" accept="image/*" capture="environment"></label></div>`;
}

const photoTools = (kind, id) => `<details class="photo-tools"><summary>${icon('photo')} Import a photo</summary>${uploadControls(kind, 'photo', id)}</details>`;

function write() {
  const item = project();
  const target = item.task === '1' ? 150 : 250;
  const noun = item.task === '1' ? 'report' : 'essay';
  return `${title('Your ' + noun)}${workflow(1)}<div class="grid">
    ${item.topic.prompt && !item.topic.custom ? promptCard(item.topic) : card(`<h2>Your question</h2>
      <label for="custom-prompt">IELTS Writing Task ${item.task} prompt</label>
      <textarea id="custom-prompt" class="question-input" placeholder="Paste your own prompt">${esc(item.topic.prompt)}</textarea>`)}
    ${card(`<div class="section-heading editor-tools"><div class="segments input-modes" role="group" aria-label="Draft input">
      ${[['Type', 'type', 'edit'], ['Photo', 'photo', 'photo'], ['File', 'file', 'file']].map(([label, mode, glyph]) => btn(label,
        'mode', '', `data-mode="${mode}" aria-pressed="${inputMode === mode}"`, glyph)).join('')}</div>
      ${item.turns.length ? btn('My plan', 'plan', 'quiet') : ''}</div>
    ${uploadControls('essay', inputMode, 'draft-upload')}
    <label for="essay">Draft</label>
    <textarea id="essay" class="essay" placeholder="Write your ${noun} here" spellcheck="false">${esc(item.essay)}</textarea>
    <p class="word-count muted"><span id="word-count">${words(item.essay)}</span> words <span class="word-target">Target ${target}+</span></p>
    ${statusBox()}${actionRow(btn('Get my estimate', 'estimate', 'primary'),
      item.scores.length ? btn('View last estimate', 'score') : '')}`)}</div>`;
}

function score() {
  const item = project();
  const current = item.scores.at(-1);
  const first = item.scores[0];
  const comparison = key => first === current ? band(current[key]) : `${band(first[key])} → ${band(current[key])}`;
  return `${title('Your estimate')}${workflow(2)}
    ${card(`<div class="score-summary"><div><p class="eyebrow">${icon('star')} AI band estimate</p>
      <h2>Overall band</h2><div class="band-value">${esc(comparison('overall'))}</div></div>
      <div class="score-context"><span>${first === current ? '' : 'First to latest · '}${esc(item.scores.length)} attempt${item.scores.length === 1 ? '' : 's'}</span>
      <span>${current.range ? `Range ${esc(String(current.range).replace('-', '–'))} · ` : ''}${esc(current.word_count || words(current.essay))} words</span></div>
      </div><div class="stats criteria">${stat(item.task === '1' ? 'Task achievement' : 'Task response', comparison('tr'))}
      ${stat('Coherence & Cohesion', comparison('cc'))}${stat('Lexical Resource', comparison('lr'))}
      ${stat('Grammatical Range & Accuracy', comparison('gra'))}</div>
      <div class="section-heading score-footer"><p class="muted">${item.essay !== current.essay ? 'Draft updated since this estimate.' : 'Unofficial IELTS estimate.'}</p>
      ${btn('Continue editing', 'write', 'quiet')}</div>`, 'score-card')}
    ${card(`<h2>Writing issues</h2><div class="issue-list">${current.issues.map((entry, index) => `<button type="button" class="issue"
      data-action="select-issue" data-index="${index}"><span class="tile-icon">${icon('edit')}</span><span><small>${esc(entry.focus_label)}</small>
      <strong>${esc(entry.issue_title)}</strong></span></button>`).join('') || '<p class="muted empty">No issues saved.</p>'}</div>`)}`;
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
  return `${title('Revise your draft')}${workflow(3)}<div class="grid">
    ${card(`<p class="eyebrow">${icon('edit')}${esc(entry.focus_label)}</p><h2>${esc(entry.issue_title)}</h2>
      <blockquote>${text(entry.issue_sentence)}</blockquote><h3>Why it matters</h3>${text(entry.issue_why)}
      <h3>Next step</h3>${text(entry.next_step)}
      ${actionRow('speechSynthesis' in window ? btn('Listen to feedback', 'listen') : '', btn('Other issues', 'score'))}`)}
    ${card(`<h2>Revise this ${entry.focus === 'GRA' ? 'sentence' : 'passage'}</h2><h3>Before</h3><blockquote>${text(revision.before)}</blockquote>
      ${hints.slice(0, revision.hintsUsed).map(text).join('')}
      ${revision.hintsUsed < hints.length ? btn('Show a hint', 'revision-hint') : ''}
      <label for="revision">Your revision</label><textarea id="revision">${esc(revision.draft)}</textarea>
      ${photoTools('revision', 'revision-upload')}
      ${statusBox()}${actionRow(btn('Check my revision', 'check', 'primary'), btn('Practise this skill', 'practice'))}
      ${latest ? `<hr><div class="section-heading"><h3>AI feedback</h3>
        <span class="result-tag ${latest.passed ? 'passed' : ''}">${latest.passed ? 'Goal met' : 'Keep revising'}</span></div>
        <h3>After</h3><blockquote>${text(latest.draft)}</blockquote>${text(latest.message)}
        ${latest.next_hint ? text(latest.next_hint) : ''}
        ${latest.applied ? '<p class="muted">Applied to full draft.</p>' : actionRow(
          btn('Apply to full essay', 'apply', '', revision.draft !== latest.draft ? 'disabled' : ''))}
        ${actionRow(btn('Edit full essay', 'write'))}` : ''}
      ${latest?.applied || item.essay.includes(revision.before) ? '' : '<p class="muted">The draft no longer contains this original passage.</p>'}`)}</div>`;
}

function practice() {
  const entry = issue();
  const practice = revisionData().practice;
  const question = practice?.question;
  const result = practice?.result;
  return `${title('Skill practice')}${workflow(4)}<div class="grid">
    ${card(`<p class="eyebrow">${icon('practise')}${esc(entry.focus_label)}</p><h2>${esc(entry.practice_skill || entry.issue_title)}</h2>
      ${question ? `<h3>Practice question</h3>${text(question.prompt)}${text(question.instructions)}
        ${question.reference_data ? `<blockquote>${text(question.reference_data)}</blockquote>` : ''}
        <p class="muted">Target ${esc(question.word_min)}–${esc(question.word_max)} words</p>` : ''}
      ${actionRow(btn(question ? 'Generate another question' : 'Generate practice question', 'practice-task', 'primary'),
        btn('Back to full essay', 'write'), btn('Other issues', 'score'))}
      ${question ? '' : statusBox()}`)}
    ${question ? card(`<h2>Your answer</h2><label class="sr-only" for="practice-answer">Practice response</label>
      <textarea id="practice-answer">${esc(practice.answer)}</textarea>
      ${photoTools('practice', 'practice-upload')}
      <p class="word-count muted"><span id="word-count">${words(practice.answer)}</span> words</p>
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
  return `${title('Your progress')}
    ${card(`<div class="section-heading"><h2>Estimated bands</h2><span class="target-label">${icon('target')} Target ${band(state.target)}</span></div>
      ${scored.length ? `<div class="progress-chart" role="list" aria-label="Recent band estimates">${scored.map(entry =>
        `<div role="listitem" class="progress-bar" title="${esc(entry.title)}" aria-label="${esc(entry.title)}: Band ${band(entry.overall)}">
         <strong>${band(entry.overall)}</strong><span style="height:${Math.max(3, Math.min(100, (Number(entry.overall) / 9) * 100 || 0))}%"></span></div>`).join('')}</div>
         <details class="history-details"><summary>See estimates</summary><ul>${scored.slice().reverse().map(entry =>
         `<li><span>${esc(entry.title)}${entry.issue_title ? `<small>${esc(entry.issue_title)}</small>` : ''}</span>
         <strong>${band(entry.overall)}</strong></li>`).join('')}</ul></details>`
        : '<p class="empty muted">Your first estimate will appear here.</p>'}`)}
    ${card(`<div class="section-heading"><h2>My drafts</h2>${btn('New draft', 'topics', 'primary')}</div>
      <div class="draft-list">${projects.map(item => {
      const latest = item.scores.at(-1);
      const data = `data-id="${esc(item.id)}"`;
      const hints = hintCount(item);
      return `<article class="draft-item"><div><h3>${esc(item.topic.title)}</h3><p class="muted">Task ${esc(item.task)} · ${words(item.essay)} words ·
      ${latest ? 'Band ' + band(latest.overall) : 'Draft'}${hints ? ` · ${hints} hints used` : ''}</p></div>
      ${actionRow(btn('Edit draft', 'open-project', '', data),
        latest ? btn('View last score', 'open-score', '', data) : '', btn('Delete', 'delete-project', 'quiet', data))}</article>`;
    }).join('') || '<p class="empty muted">No drafts yet.</p>'}</div>`)}
    ${card(`<h2>Writing goal</h2>${goalFields()}${statusBox()}${actionRow(btn('Save goal', 'goal', 'primary'))}`)}`;
}

function custom() {
  return `${title('Use your own prompt', 'Choose a writing task.')}
    <div class="task-grid">${taskCard('1')}${taskCard('2')}</div>${actionRow(btn('Browse topics', 'topics', 'quiet'))}`;
}

const pages = { home, topics, tutor, write, score, issue: feedback, practice, history, custom };

function renderTopBar() {
  const active = page === 'history' || page === 'home' ? page : 'topics';
  for (const route of ['home', 'topics', 'history']) {
    const nav = document.getElementById(route);
    if (route === active) nav.setAttribute('aria-current', route === page ? 'page' : 'true');
    else nav.removeAttribute('aria-current');
  }
  goalQuick.innerHTML = `${icon('target')}<span>${state.onboarded ? `Target ${band(state.target)}` : 'Set goal'}</span>`;
  goalQuick.disabled = busy;
}

function render({ topicChanged = false } = {}) {
  app.classList.toggle('page-enter', app.dataset.page !== page);
  app.dataset.page = page;
  app.innerHTML = pages[page]();
  if (topicChanged) $('#topic-detail')?.classList.add('topic-enter');
  renderTopBar();
  app.setAttribute('aria-busy', String(busy));
  if (busy) app.querySelectorAll('button, textarea, input, select').forEach(element => { element.disabled = true; });
  if (page === 'topics') filterTopics();
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
    const checked = revision.checks.at(-1);
    const question = await api('practice-task', { ...issuePayload(), avoid_prompts: item.practicePrompts,
      revision: checked?.draft, revision_feedback: checked?.message, estimate: item.scores.at(-1)?.overall });
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

function selectTask(number) {
  task = number;
  selected = null;
  topicQuery = '';
  topicType = '';
  onlineOnly = false;
}

function saveGoal(container) {
  state.target = Number(container.querySelector('[data-goal-target]').value);
  state.date = container.querySelector('[data-goal-date]').value;
  state.onboarded = true;
  save();
  status = 'Goal saved.';
  render();
}

const handlers = {
  home: () => go('home'),
  topics: () => go('topics'),
  history: () => go('history'),
  custom: () => go('custom'),
  goal: () => saveGoal(app),
  browse1: () => { selectTask('1'); go('topics'); },
  browse2: () => { selectTask('2'); go('topics'); },
  task1: () => { selectTask('1'); render({ topicChanged: true }); $('[data-action="task1"]').focus(); },
  task2: () => { selectTask('2'); render({ topicChanged: true }); $('[data-action="task2"]').focus(); },
  online: () => {
    onlineOnly = !onlineOnly;
    render({ topicChanged: true });
    $('[data-action="online"]').focus();
  },
  select: element => {
    const listOffset = $('#topic-list').scrollTop;
    const nextTopic = bank[task].find(item => item.id === element.dataset.id);
    const topicChanged = nextTopic !== selected;
    selected = nextTopic;
    render({ topicChanged });
    $('#topic-list').scrollTop = listOffset;
    if (window.matchMedia('(max-width: 750px)').matches) $('#topic-detail').focus();
    else $('[data-action="select"][aria-pressed="true"]')?.focus({ preventScroll: true });
  },
  chart: element => showDialog(`<h2>${esc(element.dataset.title)}</h2>
    <img src="assets/${esc(element.dataset.image)}" alt="${esc(element.dataset.title)} chart">`),
  'start-tutor': () => start('tutor'),
  'start-write': () => start('write'),
  'start-custom': () => start('write', null),
  custom1: () => { selectTask('1'); start('write', null); },
  custom2: () => { selectTask('2'); start('write', null); },
  continue: () => { issueIndex = project().issueIndex || 0; go(project().lastPage || 'write'); },
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
  'retry-photo': () => { if (photoRetry) return importDraft(photoRetry.kind, photoRetry.files, 'photo'); },
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
      status = '';
      error = 'Voice input is unavailable. You can type your reply.';
      render();
    };
    recognition.onend = () => {
      if (page !== 'tutor' || project() !== item || status !== 'Listening…' || busy) return;
      status = '';
      render();
    };
    status = 'Listening…';
    error = '';
    render();
    try { recognition.start(); }
    catch { status = ''; error = 'Voice input is unavailable. You can type your reply.'; render(); }
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
    if (!latest || latest.applied || latest.draft !== revision.draft) return;
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

function filterTopics() {
  const query = topicQuery.trim().toLowerCase();
  let count = 0;
  app.querySelectorAll('[data-search]').forEach(button => {
    const matches = (!topicType || button.dataset.type === topicType) && button.dataset.search.includes(query);
    button.hidden = !matches;
    if (matches) count += 1;
  });
  $('#topic-count').textContent = `${count} ${count === 1 ? 'topic' : 'topics'}`;
  $('#topics-empty').hidden = count > 0;
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
    photoRetry = mode === 'photo' ? { kind, files } : null;
    const results = [];
    let unclear = false;
    for (const file of files) {
      if (file.size > 15 * 1024 ** 2) throw new Error('Choose a file under 15 MB.');
      if (mode === 'file') {
        const { readDocument } = await import('./documents.js');
        results.push(await readDocument(file));
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
    photoRetry = null;
    status = unclear ? 'Text imported. Some words were unclear, so check the transcription.' : 'Text imported. Check it before submitting.';
  });
}

app.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button && !busy) handlers[button.dataset.action]?.(button);
});
app.addEventListener('input', event => {
  const { id, value } = event.target;
  if (id === 'topic-search') { topicQuery = value; filterTopics(); }
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
  if (input.id === 'topic-type') { topicType = input.value; filterTopics(); }
  if (input.type === 'file' && input.files.length) importDraft(input.dataset.kind, [...input.files], inputMode === 'file' && input.dataset.kind === 'essay' ? 'file' : 'photo');
});

document.getElementById('brand').addEventListener('click', () => { if (bank) go('home'); });
for (const [route, glyph] of [['home', 'home'], ['topics', 'book'], ['history', 'trend']]) {
  const tab = document.getElementById(route);
  tab.insertAdjacentHTML('afterbegin', icon(glyph));
  tab.addEventListener('click', () => { if (bank) go(route); });
}
document.getElementById('sidebar-note').insertAdjacentHTML('afterbegin', icon('lock'));
document.getElementById('dialog-close').innerHTML = icon('close');
goalQuick.addEventListener('click', () => {
  showDialog(`<h2>Writing goal</h2><form id="goal-form">${goalFields('dialog')}
    <div class="actions"><button class="primary">${icon('check')} Save goal</button></div></form>`);
  dialogContent.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    saveGoal(dialogContent);
    dialog.close();
  });
});

try {
  const topicsResponse = await fetch('topics.json');
  if (!topicsResponse.ok) throw new Error();
  bank = await topicsResponse.json();
  render();
} catch {
  app.innerHTML = '<h1>ReviseLab couldn’t load</h1><p>Refresh the page to try again.</p>';
  app.setAttribute('aria-busy', 'false');
}
