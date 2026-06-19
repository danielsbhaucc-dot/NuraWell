import {
  INSTALLATION_OPTIONS,
  INSULATION_OPTIONS,
  PHASE_OPTIONS,
  MATERIAL_OPTIONS,
  LAW_META,
} from './data.js';
import {
  resolveTableKey,
  getCorrectionFactor,
  findCable,
  calcCurrentFromPower,
  validateProtection,
} from './engine.js';

const state = {
  step: 0,
  installCategory: null,
  method: null,
  insulation: 70,
  phase: 'single',
  material: 'cu',
  currentMode: 'direct',
  ib: 16,
  powerKw: 3.5,
  voltage: 230,
  powerFactor: 0.9,
  isUnderground: false,
  ambientTemp: 35,
  soilThermal: 2.5,
  useGrouping: false,
  groupingType: 1,
  circuitCount: 1,
};

const STEPS = ['install', 'method', 'cable', 'load', 'environment', 'result'];
const totalSteps = STEPS.length;

const el = {
  content: document.getElementById('step-content'),
  btnNext: document.getElementById('btn-next'),
  btnBack: document.getElementById('btn-back'),
  stepLabel: document.getElementById('step-label'),
  stepPercent: document.getElementById('step-percent'),
  progressFill: document.getElementById('progress-fill'),
};

function $(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function updateProgress() {
  const pct = Math.round(((state.step + 1) / totalSteps) * 100);
  el.stepLabel.textContent = `שלב ${state.step + 1} מתוך ${totalSteps}`;
  el.stepPercent.textContent = `${pct}%`;
  el.progressFill.style.width = `${pct}%`;
  el.btnBack.classList.toggle('hidden', state.step === 0);
  el.btnNext.textContent = state.step === totalSteps - 1 ? '🔄 חישוב מחדש' : 'הבא ←';
}

function bindOptionCards(container, key, value) {
  container.querySelectorAll('.option-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.value === String(value));
    card.addEventListener('click', () => {
      container.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state[key] = card.dataset.value;
      if (key === 'installCategory') {
        const cat = INSTALLATION_OPTIONS.find((c) => c.id === state.installCategory);
        state.isUnderground = !!cat?.isUnderground;
        state.method = null;
        state.ambientTemp = state.isUnderground ? 30 : 35;
      }
      if (key === 'insulation') state.insulation = Number(state.insulation);
      render();
    });
  });
}

function renderInstallStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🔌 איך הכבל מחובר?</h2>`));
  frag.appendChild($(`<p class="step-hint">תבחר את המצב הכי דומה למה שיש באתר — אנחנו נדאג לשאר</p>`));

  const grid = $('<div class="option-grid"></div>');
  INSTALLATION_OPTIONS.forEach((opt) => {
    const card = $(`
      <button type="button" class="option-card" data-value="${opt.id}">
        <span class="emoji">${opt.emoji}</span>
        <span class="text"><strong>${opt.title}</strong><span>${opt.hint}</span></span>
      </button>
    `);
    grid.appendChild(card);
  });
  frag.appendChild(grid);
  el.content.replaceChildren(frag);
  bindOptionCards(el.content, 'installCategory', state.installCategory);
}

function renderMethodStep() {
  const cat = INSTALLATION_OPTIONS.find((c) => c.id === state.installCategory);
  if (!cat) {
    state.step = 0;
    return render();
  }

  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">${cat.emoji} פרט קטן על ההתקנה</h2>`));
  frag.appendChild($(`<p class="step-hint">${cat.hint}</p>`));

  const grid = $('<div class="option-grid"></div>');
  cat.methods.forEach((m) => {
    const card = $(`
      <button type="button" class="option-card" data-value="${m.id}">
        <span class="emoji">📌</span>
        <span class="text">
          <strong>שיטה ${m.code} — ${m.label}</strong>
          <span>לפי תקנות החשמל, תוספת שלישית</span>
        </span>
      </button>
    `);
    card.dataset.method = JSON.stringify(m);
    grid.appendChild(card);
  });
  frag.appendChild(grid);
  el.content.replaceChildren(frag);

  el.content.querySelectorAll('.option-card').forEach((card) => {
    const m = cat.methods.find((x) => x.id === card.dataset.value);
    card.classList.toggle('selected', state.method?.id === m?.id);
    card.addEventListener('click', () => {
      el.content.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.method = m;
    });
  });
}

function renderCableStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🧵 סוג הכבל</h2>`));
  frag.appendChild($(`<p class="step-hint">שלוש שאלות קצרות — ואנחנו מתקדמים</p>`));

  const sections = [
    { title: '🌡️ טמפרטורת הבידוד', options: INSULATION_OPTIONS, key: 'insulation' },
    { title: '⚡ סוג המעגל', options: PHASE_OPTIONS, key: 'phase' },
    { title: '🔩 חומר המוליך', options: MATERIAL_OPTIONS, key: 'material' },
  ];

  sections.forEach(({ title, options, key }) => {
    const sec = $(`<div style="margin-bottom:1rem"><div class="field-hint" style="font-weight:600;margin-bottom:0.5rem;color:var(--text)">${title}</div><div class="option-grid"></div></div>`);
    const grid = sec.querySelector('.option-grid');
    options.forEach((opt) => {
      grid.appendChild($(`
        <button type="button" class="option-card" data-value="${opt.id}">
          <span class="emoji">${opt.emoji}</span>
          <span class="text"><strong>${opt.title}</strong><span>${opt.subtitle || ''}</span></span>
        </button>
      `));
    });
    frag.appendChild(sec);
    bindOptionCards(sec, key, state[key]);
  });

  el.content.replaceChildren(frag);
}

function renderLoadStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">💪 כמה זרם צריך?</h2>`));
  frag.appendChild($(`<p class="step-hint">אפשר להקליד ישירות באמפרים, או לחשב מההספק</p>`));

  const modeRow = $(`
    <div class="option-grid" style="margin-bottom:1rem">
      <button type="button" class="option-card" data-mode="direct"><span class="emoji">🔢</span><span class="text"><strong>יודע/ת כמה אמפר</strong><span>למשל: מבטח 16A, או צריכה ידועה</span></span></button>
      <button type="button" class="option-card" data-mode="power"><span class="emoji">⚙️</span><span class="text"><strong>מחשב מההספק</strong><span>קילוואט + מתח → אמפר</span></span></button>
    </div>
  `);
  frag.appendChild(modeRow);

  const fields = $('<div id="load-fields"></div>');
  frag.appendChild(fields);
  el.content.replaceChildren(frag);

  const setMode = (mode) => {
    state.currentMode = mode;
    modeRow.querySelectorAll('.option-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.mode === mode);
    });
    if (mode === 'direct') {
      fields.innerHTML = `
        <div class="field">
          <label>זרם העומס (אמפר) — Ib</label>
          <input type="number" id="ib-input" min="0.5" max="2000" step="0.5" value="${state.ib}" />
          <div class="field-hint">💡 טיפ: לרוב שקע ביתי = 16A, תאורה = 10A, מזגן = לפי מדבקה</div>
        </div>`;
      fields.querySelector('#ib-input').addEventListener('input', (e) => {
        state.ib = Number(e.target.value) || 0;
      });
    } else {
      const vDefault = state.phase === 'three' ? 400 : 230;
      fields.innerHTML = `
        <div class="row-2">
          <div class="field"><label>הספק (קילוואט)</label><input type="number" id="kw" min="0.1" step="0.1" value="${state.powerKw}" /></div>
          <div class="field"><label>מתח (וולט)</label><input type="number" id="volt" min="100" step="1" value="${state.voltage || vDefault}" /></div>
        </div>
        <div class="field"><label>מקדם הספק (cos φ)</label><input type="number" id="pf" min="0.5" max="1" step="0.05" value="${state.powerFactor}" /></div>
        <div class="explain-box" id="calc-preview">...</div>`;
      const update = () => {
        state.powerKw = Number(fields.querySelector('#kw').value) || 0;
        state.voltage = Number(fields.querySelector('#volt').value) || vDefault;
        state.powerFactor = Number(fields.querySelector('#pf').value) || 0.9;
        const ib = calcCurrentFromPower({
          powerKw: state.powerKw,
          voltage: state.voltage,
          phase: state.phase,
          powerFactor: state.powerFactor,
        });
        if (ib) {
          state.ib = Math.ceil(ib * 10) / 10;
          fields.querySelector('#calc-preview').innerHTML = `✨ יצא בערך <strong>${state.ib} אמפר</strong> — נשתמש בזה לחישוב`;
        }
      };
      fields.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', update));
      update();
    }
  };

  modeRow.querySelectorAll('.option-card').forEach((c) => {
    c.addEventListener('click', () => setMode(c.dataset.mode));
  });
  setMode(state.currentMode);
}

function renderEnvironmentStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🌤️ תנאי הסביבה</h2>`));
  frag.appendChild($(`<p class="step-hint">דברים קטנים שמשנים את הקוטר — כמו שאבא שלך אמר!</p>`));

  const tempLabel = state.isUnderground ? 'טמפרטורת האדמה (°C)' : 'טמפרטורת האוויר בסביבה (°C)';
  const tempDefault = state.isUnderground ? 30 : 35;
  const tempOptions = state.isUnderground
    ? [10, 15, 20, 25, 30, 35, 40, 45, 50]
    : [25, 30, 35, 40, 45, 50, 55, 60];

  let html = `
    <div class="field">
      <label>${tempLabel}</label>
      <select id="ambient">${tempOptions.map((t) => `<option value="${t}" ${t === (state.ambientTemp || tempDefault) ? 'selected' : ''}>${t}°C${t === tempDefault ? ' (ברירת מחדל בטבלה)' : ''}</option>`).join('')}</select>
      <div class="field-hint">${state.isUnderground ? '🌍 בטבלאות אדמה — ברירת מחדל 30°C' : '☀️ בטבלאות אוויר — ברירת מחדל 35°C'}</div>
    </div>`;

  if (state.isUnderground) {
    html += `
      <div class="field">
        <label>התנגדות תרמית של האדמה (K·m/W)</label>
        <select id="soil">
          <option value="1.0" ${state.soilThermal === 1.0 ? 'selected' : ''}>1.0 — אדמה רטובה מאוד</option>
          <option value="1.5" ${state.soilThermal === 1.5 ? 'selected' : ''}>1.5</option>
          <option value="2.0" ${state.soilThermal === 2.0 ? 'selected' : ''}>2.0</option>
          <option value="2.5" ${state.soilThermal === 2.5 ? 'selected' : ''}>2.5 — ברירת מחדל בטבלה</option>
          <option value="3.0" ${state.soilThermal === 3.0 ? 'selected' : ''}>3.0 — אדמה יבשה</option>
        </select>
      </div>`;
  }

  html += `
    <div class="toggle-row">
      <span>🔗 יש עוד כבלים צמודים/מקובצים?</span>
      <button type="button" class="toggle ${state.useGrouping ? 'on' : ''}" id="toggle-group" aria-label="קיבוץ כבלים"></button>
    </div>
    <div id="group-fields" class="${state.useGrouping ? '' : 'hidden'}">
      <div class="field">
        <label>איך הכבלים מסודרים?</label>
        <select id="group-type">
          <option value="1" ${state.groupingType === 1 ? 'selected' : ''}>מקבץ באוויר / על משטח</option>
          <option value="2" ${state.groupingType === 2 ? 'selected' : ''}>שכבה אחת על קיר/רצפה</option>
          <option value="3" ${state.groupingType === 3 ? 'selected' : ''}>צמוד לתקרה</option>
          <option value="4" ${state.groupingType === 4 ? 'selected' : ''}>על מגש מחורר</option>
          <option value="5" ${state.groupingType === 5 ? 'selected' : ''}>על סולם / חבקים</option>
        </select>
      </div>
      <div class="field">
        <label>כמה מעגלים / כבלים ביחד?</label>
        <input type="number" id="circuit-count" min="2" max="20" value="${state.circuitCount || 2}" />
      </div>
    </div>`;

  frag.appendChild($(html));
  el.content.replaceChildren(frag);

  el.content.querySelector('#ambient').addEventListener('change', (e) => {
    state.ambientTemp = Number(e.target.value);
  });
  const soilEl = el.content.querySelector('#soil');
  if (soilEl) {
    soilEl.addEventListener('change', (e) => {
      state.soilThermal = Number(e.target.value);
    });
  }
  const toggle = el.content.querySelector('#toggle-group');
  toggle.addEventListener('click', () => {
    state.useGrouping = !state.useGrouping;
    toggle.classList.toggle('on', state.useGrouping);
    el.content.querySelector('#group-fields').classList.toggle('hidden', !state.useGrouping);
  });
  const gt = el.content.querySelector('#group-type');
  if (gt) gt.addEventListener('change', (e) => { state.groupingType = Number(e.target.value); });
  const cc = el.content.querySelector('#circuit-count');
  if (cc) cc.addEventListener('input', (e) => { state.circuitCount = Number(e.target.value) || 2; });
}

function computeResult() {
  const tableKey = resolveTableKey(state.method.table, state.insulation);
  const { factors, total: correctionTotal } = getCorrectionFactor({
    insulation: state.insulation,
    isUnderground: state.isUnderground,
    ambientTemp: state.ambientTemp,
    soilThermal: state.isUnderground ? state.soilThermal : null,
    groupingType: state.useGrouping ? state.groupingType : null,
    circuitCount: state.useGrouping ? state.circuitCount : 1,
  });

  const result = findCable({
    tableKey,
    material: state.material,
    phase: state.phase,
    requiredIb: state.ib,
    correctionTotal,
  });

  return { ...result, tableKey, factors, correctionTotal };
}

function renderResultStep() {
  const r = computeResult();
  const frag = document.createDocumentFragment();

  if (r.error) {
    frag.appendChild($(`<h2 class="step-title">😕 אופס</h2><p class="step-hint">${r.error}</p>`));
    el.content.replaceChildren(frag);
    return;
  }

  const matLabel = state.material === 'al' ? 'אלומיניום' : 'נחושת';
  const phaseLabel = state.phase === 'three' ? 'תלת-פאזי' : 'חד-פאזי';
  const insLabel = state.insulation === 90 ? 'בידוד 90°C (XLPE)' : 'בידוד 70°C (PVC)';

  const checks = validateProtection({ ib: state.ib, in_: r.breaker, izCorrected: r.izCorrected });

  frag.appendChild($(`
    <div class="result-hero">
      <div class="big-emoji">🎉</div>
      <div>המלצה שלנו:</div>
      <div class="cross-section">${r.crossSection} <small>ממ"ר ${matLabel}</small></div>
    </div>
    <div class="result-cards">
      <div class="result-card"><span class="icon">🔌</span><div><div class="val">${r.breaker} אמפר</div><div class="lbl">מבטח מומלץ (In)</div></div></div>
      <div class="result-card"><span class="icon">📊</span><div><div class="val">${r.izCorrected} אמפר</div><div class="lbl">יכולת נשיאה מתוקנת (I'z)</div></div></div>
      <div class="result-card"><span class="icon">📋</span><div><div class="val">טבלה ${r.tableKey}</div><div class="lbl">שיטה ${state.method.code}</div></div></div>
    </div>
    <div class="explain-box">
      <h4>💬 בשפה פשוטה</h4>
      <p>
        ביקשת <strong>${state.ib} אמפר</strong> על מעגל <strong>${phaseLabel}</strong>
        עם כבל <strong>${insLabel}</strong>, מותקן כ<strong>${state.method.label}</strong>.
        <br /><br />
        לפי טבלה <strong>${r.tableKey}</strong> של תקנות החשמל, חתך
        <strong>${r.crossSection} ממ"ר</strong> נושא ${r.izTable} אמפר בטבלה.
        אחרי תיקון לטמפרטורה${state.useGrouping ? ' וקיבוץ' : ''} (מקדם ${r.correctionTotal.toFixed(2)}) —
        נשאר <strong>${r.izCorrected} אמפר</strong> בבטחה.
        <br /><br />
        מבטח של <strong>${r.breaker} אמפר</strong> מתאים: לא קטן מדי לעומס, ולא גדול מדי לכבל.
      </p>
    </div>
    <div class="explain-box">
      <h4>✅ בדיקות לפי התקן</h4>
      <ul class="check-list">
        ${checks.map((c) => `<li class="${c.ok ? 'ok' : 'fail'}">${c.text}</li>`).join('')}
      </ul>
    </div>
    <div class="explain-box">
      <h4>🧮 מקדמי התיקון שחושבו</h4>
      <ul class="check-list">
        ${r.factors.map((f) => `<li class="ok">${f.name}: ×${f.value}</li>`).join('')}
        <li class="ok"><strong>סה"כ: ×${r.correctionTotal.toFixed(3)}</strong></li>
      </ul>
    </div>
    <div class="explain-box" style="font-size:0.78rem;color:var(--text-soft)">
      📎 מקור: ${LAW_META.title}<br />
      נוסחה: Ib ≤ In ≤ I'z &nbsp;|&nbsp; I'z = Iz × c
    </div>
  `));

  el.content.replaceChildren(frag);
}

function canProceed() {
  const step = STEPS[state.step];
  if (step === 'install') return !!state.installCategory;
  if (step === 'method') return !!state.method;
  if (step === 'cable') return !!state.insulation && !!state.phase && !!state.material;
  if (step === 'load') return state.ib > 0;
  if (step === 'environment') return true;
  return true;
}

function render() {
  updateProgress();
  el.btnNext.disabled = !canProceed() && state.step < totalSteps - 1;

  switch (STEPS[state.step]) {
    case 'install':
      renderInstallStep();
      break;
    case 'method':
      renderMethodStep();
      break;
    case 'cable':
      renderCableStep();
      break;
    case 'load':
      renderLoadStep();
      break;
    case 'environment':
      renderEnvironmentStep();
      break;
    case 'result':
      renderResultStep();
      break;
    default:
      break;
  }
}

el.btnNext.addEventListener('click', () => {
  if (state.step < totalSteps - 1) {
    if (!canProceed()) return;
    state.step += 1;
    render();
  } else {
    state.step = 0;
    render();
  }
});

el.btnBack.addEventListener('click', () => {
  if (state.step > 0) {
    state.step -= 1;
    render();
  }
});

render();
