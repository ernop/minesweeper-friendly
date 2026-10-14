'use strict';

// Judgment problems (analysis/judgment/NOTES.md): situations from the
// player's own games, chosen by build-problems.js. Each problem asks how every
// shown move and the whole game should be judged, then shows the analysis.
// Answers stay in this browser's IndexedDB until exported.

//-------DEFINITIONS-------

const BANK_URL = 'judgment-problems.json';
const BANK_FORMAT = 'minesweeper-judgment-problems';
const BANK_FORMAT_VERSION = 1;
const ANSWERS_DB = 'minesweeper-judgments';
const ANSWERS_DB_VERSION = 1;
const ANSWERS_STORE = 'answers';
const EXPORT_FORMAT = 'minesweeper-judgment-answers';
const EXPORT_FORMAT_VERSION = 1;
// Rings mark the safest or most informative squares only when they are few;
// otherwise the percentages already show them.
const RING_LIMIT = 12;
const CELL_MIN_PX = 14;
const CELL_MAX_PX = 32;
// Cards wrap to a new row before their boards' squares drop below this, so
// the mine chances printed on covered squares stay readable.
const CARD_MIN_CELL_PX = 24;
const CARD_PADDING_PX = 30;

const RATINGS = [
  { id: 'best', label: 'Best available' },
  { id: 'fine', label: 'Fine' },
  { id: 'poor', label: 'Poor' },
  { id: 'blunder', label: 'Blunder' },
  { id: 'unsure', label: 'Can\u2019t tell' },
];
const RATING_HELP = 'Best available: nothing better was on the board. Fine: something better '
  + 'existed, but not by enough to count. Poor: a clearly better choice existed. Blunder: a '
  + 'serious error.';

const LOSS_CATEGORIES = [
  { id: 'known', label: 'Known death', detail: 'the numbers showed it was a mine' },
  { id: 'unnecessary-gamble', label: 'Unnecessary gamble', detail: 'a square was proven safe' },
  { id: 'worse-gamble', label: 'Worse gamble', detail: 'a safer guess existed' },
  { id: 'best-gamble', label: 'Best gamble', detail: 'nothing safer existed' },
  { id: 'own-flag-gamble', label: 'Trusted a guessed flag', detail: 'the flag was itself a guess' },
  { id: 'other', label: 'None of these', detail: 'say why in the note' },
];
const WIN_CATEGORIES = [
  { id: 'clean-no-guess', label: 'Clean', detail: 'never guessed' },
  { id: 'clean-best-only', label: 'Clean with forced guesses', detail: 'each at the lowest risk' },
  { id: 'won-despite-worse', label: 'Won despite a worse gamble', detail: 'a safer guess existed' },
  { id: 'won-despite-unnecessary', label: 'Won despite an unnecessary gamble',
    detail: 'a square was proven safe' },
  { id: 'other', label: 'None of these', detail: 'say why in the note' },
];
const SHARES = [
  { value: 0, label: 'None' },
  { value: 0.25, label: 'Some' },
  { value: 0.5, label: 'Half' },
  { value: 0.75, label: 'Most' },
  { value: 1, label: 'All' },
];

const MOMENT_KIND_LABELS = {
  'known-mine': 'Known death: the numbers proved this square a mine',
  'known-through-own-flag': 'Known death through the player\u2019s own flag, which the numbers contradicted',
  'gamble-on-own-flag': 'Gamble on the player\u2019s own flag, which was itself a guess',
  unnecessary: 'Unnecessary gamble: a square was proven safe',
  'unnecessary-justice': 'Unnecessary gamble: A Just Universe guaranteed a safe entry elsewhere',
  worse: 'Worse gamble: a safer square existed',
  best: 'Best gamble: the lowest risk available',
  'flag-on-safe': 'Flag placed on a proven-safe square',
  'removed-mine-flag': 'Flag removed from a proven mine',
  unmeasured: 'Not measured',
};
const PROOF_TIER_TEXT = {
  counting: 'counting single numbers',
  overlap: 'comparing overlapping numbers',
  'whole-board': 'whole-board reasoning',
};
const PHASE_TEXT = { opening: 'opening', middle: 'mid-game', endgame: 'endgame' };
const MISCLICK_TEXT = {
  'wrong-flag': 'a wrong flag placed beside it under a second before',
  'wrong-button': 'a chord on the number beside it lacked flags under a second before',
};

//-------STATE-------

let bank;
let db;
const answers = new Map();
let current = 0;

function byId(id) {
  return document.getElementById(id);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(message) {
  const status = byId('judge-status');
  status.className = 'error';
  status.textContent = message;
}

window.addEventListener('error', (event) => showError('Error: ' + event.message));
window.addEventListener('unhandledrejection', (event) => showError('Error: '
  + (event.reason && event.reason.message ? event.reason.message : String(event.reason))));

//-------NUMBERS-------

function percent(value) {
  return (value * 100).toFixed(1) + '%';
}

function wholePercent(value) {
  return Math.round(value * 100) + '%';
}

function seconds(ms) {
  return (ms / 1000).toFixed(2) + ' s';
}

function cellPercent(p) {
  const value = p * 100;
  if (value < 1) return '<1';
  if (value > 99) return '>99';
  return String(Math.round(value));
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

//-------ANSWERS (IndexedDB)-------

function openAnswers() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ANSWERS_DB, ANSWERS_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ANSWERS_STORE, { keyPath: 'problemId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('the answers database is held open by an older tab'));
  });
}

function readAllAnswers() {
  return new Promise((resolve, reject) => {
    const request = db.transaction(ANSWERS_STORE, 'readonly').objectStore(ANSWERS_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeAnswer(record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ANSWERS_STORE, 'readwrite');
    transaction.objectStore(ANSWERS_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function recordFor(problem) {
  let record = answers.get(problem.id);
  if (record === undefined) {
    const now = new Date().toISOString();
    record = {
      problemId: problem.id,
      bankId: bank.bankId,
      answer: { ratings: {}, note: '' },
      createdAt: now,
      updatedAt: now,
    };
    answers.set(problem.id, record);
  }
  return record;
}

function saveRecord(record) {
  record.updatedAt = new Date().toISOString();
  record.bankId = bank.bankId;
  renderProgress();
  return writeAnswer(record);
}

//-------BOARDS-------

function boardElement(moment, revealed) {
  const position = moment.position;
  const board = element('div', 'judge-board');
  board.style.setProperty('--board-width', String(position.width));
  board.dataset.width = String(position.width);
  const numbers = new Map(position.revealed);
  const flagged = new Set(position.flagged);
  const selected = new Set(moment.selected || []);
  const pMine = new Map(moment.pMine || []);
  const safe = new Set(moment.safeCells || []);
  const mines = new Set(moment.mineCells || []);
  const lowestCells = moment.lowestCells || [];
  const lowestRing = new Set(lowestCells.length <= RING_LIMIT ? lowestCells : []);
  const lowestText = new Set(lowestCells);
  const betterCells = moment.higherLifeCells || [];
  const betterRing = new Set(betterCells.length <= RING_LIMIT ? betterCells : []);
  const contradicted = new Set(moment.contradictedFlags || []);
  const deathSquare = moment.result === 'death' && moment.action === 'reveal'
    ? moment.selected[0] : undefined;
  for (let cell = 0; cell < position.width * position.height; cell++) {
    const square = element('div');
    const classes = ['cell'];
    if (cell === deathSquare) {
      classes.push('revealed', 'mine-hit');
      square.innerHTML = MINE_SVG;
    } else if (numbers.has(cell)) {
      const count = numbers.get(cell);
      classes.push('revealed');
      if (count > 0) {
        classes.push('n' + count);
        square.textContent = String(count);
      }
    } else {
      classes.push('hidden');
      if (flagged.has(cell)) {
        square.innerHTML = revealed && contradicted.has(cell) ? WRONG_FLAG_SVG : FLAG_SVG;
      } else if (revealed && pMine.has(cell)) {
        const text = element('span', 'judge-p' + (lowestText.has(cell) ? ' judge-p-lowest' : ''),
          cellPercent(pMine.get(cell)));
        square.append(text);
      }
      if (revealed && !flagged.has(cell)) {
        if (safe.has(cell)) classes.push('judge-safe');
        else if (mines.has(cell)) classes.push('judge-mine');
        else if (betterRing.has(cell)) classes.push('judge-better');
        else if (lowestRing.has(cell)) classes.push('judge-lowest');
      }
    }
    if (moment.action === 'chord') {
      if (cell === moment.triggerCell) classes.push('judge-chosen');
      else if (selected.has(cell)) classes.push('judge-opened');
    } else if (selected.has(cell)) {
      classes.push('judge-chosen');
    }
    square.className = classes.join(' ');
    board.append(square);
  }
  return board;
}

// Each board takes the largest square size its card's width allows.
function sizeBoards() {
  for (const board of document.querySelectorAll('.judge-board')) {
    const card = board.closest('.judge-moment');
    const width = Number(board.dataset.width);
    const available = card.clientWidth - CARD_PADDING_PX;
    const cell = Math.max(CELL_MIN_PX, Math.min(CELL_MAX_PX, Math.floor(available / (width + 0.25))));
    board.style.setProperty('--cell-size', cell + 'px');
  }
}

//-------MOMENTS-------

function momentTitle(problem, moment) {
  if (moment.kind === 'final') return 'Final board';
  const at = ' at ' + seconds(moment.atMs);
  const move = 'Move ' + moment.actionNumber + ': ';
  if (moment.action === 'chord') {
    const number = new Map(moment.position.revealed).get(moment.triggerCell);
    return move + 'chorded a ' + number + at;
  }
  if (moment.action === 'flag-place') return move + 'placed a flag' + at;
  if (moment.action === 'flag-remove') return move + 'removed a flag' + at;
  return move + 'opened a square' + at;
}

function momentState(problem, moment) {
  if (moment.kind === 'final') return 'Won in ' + seconds(problem.timeMs);
  const position = moment.position;
  const open = moment.progress < 0.1 ? (moment.progress * 100).toFixed(1) + '%'
    : wholePercent(moment.progress);
  const parts = [open + ' of the safe squares open',
    (position.mines - position.flagged.length) + ' on the mine counter'];
  if (moment.sincePreviousMs !== undefined) {
    parts.push(seconds(moment.sincePreviousMs) + ' after the move before');
  }
  return parts.join(' \u00b7 ');
}

function momentResult(moment) {
  if (moment.kind === 'final') return 'Every safe square open.';
  if (moment.result !== 'death') return 'The game went on.';
  return moment.action === 'chord'
    ? 'This chord opened a mine and ended the game.'
    : 'This move hit a mine and ended the game.';
}

// One answer: a row of toggle buttons. Pressing the chosen one again clears
// it. `read` and `write` get and set the answer's value for this question.
function choiceGroup(problem, options, read, write) {
  const group = element('div', 'judge-choices');
  const record = answers.get(problem.id);
  const chosen = record === undefined ? undefined : read(record.answer);
  for (const option of options) {
    const button = element('button', 'ui-button');
    button.type = 'button';
    button.dataset.value = String(option.value);
    button.setAttribute('aria-pressed', String(chosen === option.value));
    button.append(document.createTextNode(option.label));
    if (option.detail) button.append(element('span', 'judge-choice-detail', ': ' + option.detail));
    button.addEventListener('click', () => {
      const target = recordFor(problem);
      const next = read(target.answer) === option.value ? undefined : option.value;
      write(target.answer, next);
      for (const other of group.children) {
        other.setAttribute('aria-pressed', String(next !== undefined && other === button));
      }
      saveRecord(target);
      renderGameAnalysis();
    });
    group.append(button);
  }
  return group;
}

function ratingQuestion(problem, moment) {
  const question = element('div', 'judge-question');
  const label = element('span', 'judge-question-label', 'This move was');
  const help = element('span', 'judge-help', '?');
  help.title = RATING_HELP;
  label.append(help);
  question.append(label);
  question.append(choiceGroup(problem,
    RATINGS.map((rating) => ({ value: rating.id, label: rating.label })),
    (answer) => answer.ratings[moment.actionNumber],
    (answer, value) => {
      if (value === undefined) delete answer.ratings[moment.actionNumber];
      else answer.ratings[moment.actionNumber] = value;
    }));
  return question;
}

function factsTable(rows) {
  const table = element('table', 'judge-facts');
  for (const [label, value] of rows) {
    const row = element('tr');
    row.append(element('th', null, label));
    const cell = element('td');
    if (value instanceof Node) cell.append(value);
    else cell.textContent = value;
    row.append(cell);
    table.append(row);
  }
  return table;
}

function momentFacts(problem, moment) {
  if (moment.kind === 'final') {
    return factsTable([['Board', 'rebuilt from the game\u2019s seed; flags mark every mine']]);
  }
  const rows = [];
  let judged = MOMENT_KIND_LABELS[moment.kind] || moment.kind;
  if (moment.proofTier) judged += ', by ' + PROOF_TIER_TEXT[moment.proofTier];
  rows.push(['Judged as', judged]);
  if (moment.phase) rows.push(['Phase', PHASE_TEXT[moment.phase]]);
  if (moment.kind === 'known-mine') rows.push(['Risk taken', '100% (proven mine)']);
  else if (typeof moment.chosenRisk === 'number') rows.push(['Risk taken', percent(moment.chosenRisk)]);
  if (moment.safeCells.length > 0) {
    let safe = plural(moment.safeCells.length, 'proven-safe square');
    if (moment.kind === 'unnecessary' && moment.proofTier) safe += ' (green rings)';
    rows.push(['Safe squares', safe]);
  } else if (moment.action === 'reveal' || moment.action === 'chord') {
    rows.push(['Safe squares', 'none proven']);
  }
  if ((moment.kind === 'worse' || moment.kind === 'best') && moment.lowestCells) {
    let lowest = percent(moment.bestRisk) + ' at ' + plural(moment.lowestCells.length, 'square');
    if (moment.kind === 'worse') {
      lowest += ', ' + moment.riskRatio.toFixed(2) + ' times safer, nearest '
        + plural(moment.nearestLowestDistance, 'square') + ' away';
    }
    rows.push(['Lowest risk', lowest]);
  }
  if (typeof moment.choiceShare === 'number') {
    rows.push(['Avoidable share of the risk', wholePercent(moment.choiceShare)]);
  }
  if (typeof moment.expectedLife === 'number') {
    let life = moment.expectedLife.toFixed(3) + ' chosen, ' + moment.bestExpectedLife.toFixed(3) + ' best';
    if (moment.lessInformative) life += ' (orange rings)';
    if (moment.moreInformative) life += ': the chosen square scored best';
    rows.push(['One-step survival model', life]);
  }
  if (moment.justiceProtected) rows.push(['A Just Universe', 'guaranteed this square safe']);
  if (moment.besideNumber !== undefined) {
    rows.push(['Beside a revealed number', moment.besideNumber ? 'yes' : 'no']);
  }
  if (moment.action === 'chord') {
    rows.push(['Flags around the number', plural(moment.chordFlags.length, 'flag') + ', '
      + (moment.wrongFlags.length > 0
        ? moment.wrongFlags.length + ' on a proven-safe square'
        : moment.openedProvenMines.length > 0 ? 'the chord opened a proven mine'
          : 'none contradicted by the numbers')]);
  }
  if (moment.contradictedFlags.length > 0) {
    rows.push(['Wrong flags on the board', plural(moment.contradictedFlags.length, 'flag')
      + ' on proven-safe squares (crossed)']);
  }
  if (moment.misclick) {
    rows.push(['Likely misclick', moment.misclick.map((reason) => MISCLICK_TEXT[reason]).join('; ')]);
  }
  if (moment.mistakes.length > 0) {
    rows.push(['The game\u2019s tags', moment.mistakes.map((tag) => tag.replace(/-/g, ' ')).join('; ')]);
  }
  if (!moment.oddsMeasured) rows.push(['Mine chances', 'not measured for this position']);
  return factsTable(rows);
}

function momentCard(problem, moment, revealed) {
  const card = element('article', 'judge-moment');
  card.append(element('h3', null, momentTitle(problem, moment)));
  card.append(element('p', 'judge-moment-state', momentState(problem, moment)));
  card.append(element('p', 'judge-moment-result' + (moment.result === 'death' ? ' judge-death' : ''),
    momentResult(moment)));
  card.append(boardElement(moment, revealed));
  if (moment.kind !== 'final') card.append(ratingQuestion(problem, moment));
  if (revealed) card.append(momentFacts(problem, moment));
  return card;
}

//-------THE GAME-------

function categoriesOf(problem) {
  return problem.outcome === 'loss' ? LOSS_CATEGORIES : WIN_CATEGORIES;
}

function categoryLabel(problem, id) {
  return categoriesOf(problem).find((category) => category.id === id).label;
}

function gameAnalysis(problem, record) {
  const proposed = problem.proposed;
  const answer = record === undefined ? { ratings: {} } : record.answer;
  let proposal = categoryLabel(problem, proposed.category);
  if (proposed.phase) proposal += ', ' + PHASE_TEXT[proposed.phase];
  if (proposed.decidingAction !== undefined) proposal += ' (move ' + proposed.decidingAction + ')';
  const rows = [['Proposed', proposal]];
  const yours = element('span');
  if (answer.category === undefined) {
    yours.textContent = 'not given';
  } else {
    yours.textContent = categoryLabel(problem, answer.category) + ' ';
    const same = answer.category === proposed.category;
    yours.append(element('span', same ? 'judge-match' : 'judge-differ', same ? 'matches' : 'differs'));
  }
  rows.push(['Your answer', yours]);
  const yourShare = answer.share === undefined ? ''
    : '; yours ' + SHARES.find((s) => s.value === answer.share).label.toLowerCase();
  if (typeof proposed.choiceShare === 'number') {
    rows.push(['Share from the player\u2019s choices', wholePercent(proposed.choiceShare) + yourShare]);
  }
  if (typeof proposed.avoidableRisk === 'number') {
    rows.push(['Avoidable mine chance survived', proposed.avoidableRisk.toFixed(2)
      + ' (summed over the riskier guesses)' + yourShare]);
  }
  if (typeof problem.guesses === 'number') {
    let guesses = String(problem.guesses);
    if (typeof problem.lifeLost === 'number' && problem.guesses > 0) {
      guesses += problem.justiceEnabled
        ? '; raw mine chances sum to ' + problem.lifeLost.toFixed(2) + ', ignoring A Just Universe'
        : '; mine chances sum to ' + problem.lifeLost.toFixed(2) + ', '
          + problem.lifeNeedless.toFixed(2) + ' of it above the safest square';
    }
    rows.push(['Guesses after the first click', guesses]);
  }
  rows.push(['The game\u2019s report says', problem.today.text]);
  rows.push(['Picked as', bank.strata.find((stratum) => stratum.id === problem.stratum).label]);
  rows.push(['A Just Universe', problem.justiceEnabled ? 'on' : 'off']);
  return rows;
}

function renderProgress() {
  let judged = 0;
  let seen = 0;
  for (const problem of bank.problems) {
    const record = answers.get(problem.id);
    if (record === undefined) continue;
    if (record.answer.category !== undefined) judged++;
    if (record.revealedAt !== undefined) seen++;
  }
  byId('judge-progress').textContent = judged + ' of ' + bank.problems.length + ' judged \u00b7 '
    + seen + ' analyses seen';
}

function renderProblem() {
  const problem = bank.problems[current];
  const record = answers.get(problem.id);
  const revealed = record !== undefined && record.revealedAt !== undefined;
  history.replaceState(null, '', '#p=' + (current + 1));

  const heading = byId('judge-heading');
  heading.replaceChildren(document.createTextNode('Problem ' + (current + 1) + ' of '
    + bank.problems.length + ' \u00b7 ' + problem.sizeName + ' \u00b7 '));
  heading.append(element('span', problem.outcome === 'loss' ? 'judge-lost' : 'judge-won',
    problem.outcome === 'loss' ? 'Lost' : 'Won'));
  const ended = new Date(problem.endedAt).toLocaleString('en-US', {
    timeZone: problem.timeZone, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  byId('judge-game-facts').textContent = ended + ' \u00b7 game time ' + seconds(problem.timeMs)
    + ' \u00b7 3BV ' + problem.bv3;

  const widest = Math.max(...problem.moments.map((moment) => moment.position.width));
  const moments = byId('judge-moments');
  moments.style.setProperty('--judge-card-min',
    Math.max(300, widest * CARD_MIN_CELL_PX + CARD_PADDING_PX + 10) + 'px');
  moments.replaceChildren(...problem.moments.map((moment) => momentCard(problem, moment, revealed)));
  sizeBoards();

  const categories = choiceGroup(problem,
    categoriesOf(problem).map((category) => ({ value: category.id, label: category.label,
      detail: category.detail })),
    (answer) => answer.category,
    (answer, value) => {
      if (value === undefined) delete answer.category;
      else answer.category = value;
    });
  categories.id = 'judge-categories';
  if (revealed) {
    for (const button of categories.children) {
      if (button.dataset.value === problem.proposed.category) button.classList.add('judge-proposed');
    }
  }
  byId('judge-categories').replaceWith(categories);
  byId('judge-share-heading').textContent = problem.outcome === 'loss'
    ? 'How much of this loss came from the player\u2019s choices?'
    : 'How much of the risk this win survived was the player\u2019s choice?';
  const shares = choiceGroup(problem, SHARES,
    (answer) => answer.share,
    (answer, value) => {
      if (value === undefined) delete answer.share;
      else answer.share = value;
    });
  shares.id = 'judge-shares';
  byId('judge-shares').replaceWith(shares);
  byId('judge-note').value = record === undefined ? '' : record.answer.note;

  byId('judge-reveal').textContent = revealed ? 'Next problem' : 'Show the analysis';
  byId('judge-analysis').hidden = !revealed;
  renderGameAnalysis();
  byId('judge-prev').disabled = current === 0;
  byId('judge-next').disabled = current === bank.problems.length - 1;
  renderProgress();
}

function renderGameAnalysis() {
  const problem = bank.problems[current];
  const record = answers.get(problem.id);
  if (record === undefined || record.revealedAt === undefined) return;
  const table = factsTable(gameAnalysis(problem, record));
  table.id = 'judge-game-analysis';
  byId('judge-game-analysis').replaceWith(table);
}

//-------NAVIGATION AND EXPORT-------

function go(index) {
  current = index;
  renderProblem();
  window.scrollTo(0, 0);
}

function firstOpenFrom(start) {
  for (let step = 0; step < bank.problems.length; step++) {
    const index = (start + step) % bank.problems.length;
    const record = answers.get(bank.problems[index].id);
    if (record === undefined || record.answer.category === undefined) return index;
  }
  return undefined;
}

function revealOrNext() {
  const problem = bank.problems[current];
  const record = recordFor(problem);
  if (record.revealedAt === undefined) {
    record.blind = JSON.parse(JSON.stringify(record.answer));
    record.revealedAt = new Date().toISOString();
    saveRecord(record);
    renderProblem();
    return;
  }
  if (current < bank.problems.length - 1) go(current + 1);
}

function exportAnswers() {
  const payload = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    bankId: bank.bankId,
    exportedAt: new Date().toISOString(),
    answers: [...answers.values()],
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'minesweeper-judgment-answers-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function wireControls() {
  byId('judge-prev').addEventListener('click', () => go(current - 1));
  byId('judge-next').addEventListener('click', () => go(current + 1));
  byId('judge-next-open').addEventListener('click', () => {
    const open = firstOpenFrom(current + 1);
    if (open === undefined) byId('judge-status').textContent = 'Every problem has an answer.';
    else go(open);
  });
  byId('judge-export').addEventListener('click', exportAnswers);
  window.addEventListener('hashchange', () => {
    const index = problemIndexFromHash();
    if (index !== undefined && index !== current) go(index);
  });
  byId('judge-reveal').addEventListener('click', revealOrNext);
  byId('judge-note').addEventListener('input', (event) => {
    const record = recordFor(bank.problems[current]);
    record.answer.note = event.target.value;
    saveRecord(record);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tag = event.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
    event.preventDefault();
    revealOrNext();
  });
  // Sizing a board changes the container's height, so only a width change
  // resizes, a frame later, outside the observer's own delivery.
  let sizedWidth = 0;
  new ResizeObserver((entries) => {
    const width = entries[0].contentRect.width;
    if (width === sizedWidth) return;
    sizedWidth = width;
    requestAnimationFrame(sizeBoards);
  }).observe(byId('judge-moments'));
}

//-------START-------

async function start() {
  const response = await fetch(BANK_URL, { cache: 'no-store' });
  if (!response.ok) {
    showError('No problem bank at analysis/judgment/' + BANK_URL + ' (HTTP ' + response.status
      + '). Build it from a history export:\n'
      + 'node analysis/judgment/build-problems.js <minesweeper-friendly-history-*.json>');
    return;
  }
  bank = await response.json();
  if (bank.format !== BANK_FORMAT || bank.formatVersion !== BANK_FORMAT_VERSION) {
    showError('The problem bank has format ' + bank.format + ' version ' + bank.formatVersion
      + '; this page reads ' + BANK_FORMAT + ' version ' + BANK_FORMAT_VERSION + '.');
    return;
  }
  db = await openAnswers();
  for (const record of await readAllAnswers()) answers.set(record.problemId, record);
  wireControls();
  byId('judge-problem').hidden = false;
  const index = location.hash === '' ? firstOpenFrom(0) : problemIndexFromHash();
  current = index === undefined ? 0 : index;
  renderProblem();
}

// The problem number in the address (#p=12), counted from 1.
function problemIndexFromHash() {
  const match = /^#p=(\d+)$/.exec(location.hash);
  if (match === null) return undefined;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < bank.problems.length ? index : undefined;
}

start();
