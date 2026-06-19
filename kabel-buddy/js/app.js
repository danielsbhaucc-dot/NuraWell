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
  installChoice: null,
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

const STEPS = ['install', 'detail', 'cable', 'load', 'environment', 'result'];
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

function getCategory() {
  return INSTALLATION_OPTIONS.find((c) => c.id === state.installCategory);
}

function refreshNav() {
  el.btnNext.disabled = !canProceed() && state.step < totalSteps - 1;
}

function updateProgress() {
  const pct = Math.round(((state.step + 1) / totalSteps) * 100);
  el.stepLabel.textContent = `שלב ${state.step + 1} מתוך ${totalSteps}`;
  el.stepPercent.textContent = `${pct}%`;
  el.progressFill.style.width = `${pct}%`;
  el.btnBack.classList.toggle('hidden', state.step === 0);
  el.btnNext.textContent = state.step === totalSteps - 1 ? '🔄 נתחיל מחדש' : 'יופי, הבא ←';
  refreshNav();
}

function bindOptionCards(container, onSelect, selectedValue) {
  container.querySelectorAll('.option-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.value === String(selectedValue));
    card.onclick = () => {
      container.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      onSelect(card.dataset.value, card);
      refreshNav();
    };
  });
}

function renderInstallStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🔌 איפה הכבל יושב?</h2>`));
  frag.appendChild(
    $(`<p class="step-hint">תבחר מה שהכי דומה למה שאתה רואה באתר — בלי לחשוב על אותיות ומספרים</p>`)
  );

  const grid = $('<div class="option-grid"></div>');
  INSTALLATION_OPTIONS.forEach((opt) => {
    grid.appendChild($(`
      <button type="button" class="option-card" data-value="${opt.id}">
        <span class="emoji">${opt.emoji}</span>
        <span class="text"><strong>${opt.title}</strong><span>${opt.hint}</span></span>
      </button>
    `));
  });
  frag.appendChild(grid);
  el.content.replaceChildren(frag);

  bindOptionCards(el.content, (value) => {
    const cat = INSTALLATION_OPTIONS.find((c) => c.id === value);
    state.installCategory = value;
    state.installChoice = null;
    state.method = null;
    state.isUnderground = !!cat?.isUnderground;
    state.ambientTemp = state.isUnderground ? 30 : 35;
  }, state.installCategory);
}

function renderDetailStep() {
  const cat = getCategory();
  if (!cat) {
    state.step = 0;
    return render();
  }

  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">${cat.emoji} עוד שאלה קטנה</h2>`));
  frag.appendChild(
    $(`<p class="step-hint">בחרת <em class="personal-em">${cat.title}</em> — עכשיו רק תגיד איך בדיוק זה נראה שם</p>`)
  );

  const grid = $('<div class="option-grid"></div>');
  cat.choices.forEach((choice) => {
    grid.appendChild($(`
      <button type="button" class="option-card" data-value="${choice.id}">
        <span class="emoji">${choice.emoji}</span>
        <span class="text">
          <strong>${choice.title}</strong>
          <span>${choice.subtitle}</span>
        </span>
      </button>
    `));
  });
  frag.appendChild(grid);
  frag.appendChild(
    $(`<p class="step-footnote">💡 לא בטוח? תבחר את מה שנראה לך הכי קרוב — אנחנו נתאים את הטבלה הנכונה מאחורי הקלעים</p>`)
  );
  el.content.replaceChildren(frag);

  bindOptionCards(el.content, (value) => {
    const choice = cat.choices.find((c) => c.id === value);
    state.installChoice = value;
    state.method = choice?.method ?? null;
  }, state.installChoice);
}

function renderCableStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🧵 על הכבל עצמו</h2>`));
  frag.appendChild($(`<p class="step-hint">שלוש בחירות מהירות — ומתקדמים</p>`));

  const sections = [
    { title: 'סוג הבידוד', options: INSULATION_OPTIONS, key: 'insulation' },
    { title: 'סוג המעגל', options: PHASE_OPTIONS, key: 'phase' },
    { title: 'חומר המוליך', options: MATERIAL_OPTIONS, key: 'material' },
  ];

  sections.forEach(({ title, options, key }) => {
    const sec = $(`
      <div class="section-block">
        <div class="section-label">${title}</div>
        <div class="option-grid"></div>
      </div>
    `);
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
    bindOptionCards(sec, (value) => {
      if (key === 'insulation') state.insulation = Number(value);
      else state[key] = value;
    }, state[key]);
  });

  el.content.replaceChildren(frag);
}

function renderLoadStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">💪 כמה זרם צריך?</h2>`));
  frag.appendChild($(`<p class="step-hint">אם יודע באמפר — מעולה. אם לא — נחשב מההספק</p>`));

  const modeRow = $(`
    <div class="option-grid" style="margin-bottom:1rem">
      <button type="button" class="option-card" data-mode="direct"><span class="emoji">🔢</span><span class="text"><strong>יודע כמה אמפר</strong><span>למשל מבטח 16A, או צריכה ידועה</span></span></button>
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
          <label>זרם העומס (אמפר)</label>
          <input type="number" id="ib-input" min="0.5" max="2000" step="0.5" value="${state.ib}" />
          <div class="field-hint">💡 שקע ביתי = 16A · תאורה = 10A · מזגן = לפי המדבקה</div>
        </div>`;
      fields.querySelector('#ib-input').addEventListener('input', (e) => {
        state.ib = Number(e.target.value) || 0;
        refreshNav();
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
          fields.querySelector('#calc-preview').innerHTML =
            `✨ יצא בערך <strong>${state.ib} אמפר</strong> — נשתמש בזה`;
          refreshNav();
        }
      };
      fields.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', update));
      update();
    }
    refreshNav();
  };

  modeRow.querySelectorAll('.option-card').forEach((c) => {
    c.addEventListener('click', () => setMode(c.dataset.mode));
  });
  setMode(state.currentMode);
}

function renderEnvironmentStep() {
  const frag = document.createDocumentFragment();
  frag.appendChild($(`<h2 class="step-title">🌤️ תנאי השטח</h2>`));
  frag.appendChild(
    $(`<p class="step-hint">אלה הדברים הקטנים שאבא שלך תמיד שם לב אליהם — חום, קיבוץ כבלים וכו'</p>`)
  );

  const tempLabel = state.isUnderground ? 'כמה חם באדמה? (°C)' : 'כמה חם באוויר בסביבה? (°C)';
  const tempDefault = state.isUnderground ? 30 : 35;
  const tempOptions = state.isUnderground
    ? [10, 15, 20, 25, 30, 35, 40, 45, 50]
    : [25, 30, 35, 40, 45, 50, 55, 60];

  let html = `
    <div class="field">
      <label>${tempLabel}</label>
      <select id="ambient">${tempOptions.map((t) => `<option value="${t}" ${t === (state.ambientTemp || tempDefault) ? 'selected' : ''}>${t}°C${t === tempDefault ? ' — רגיל בטבלה' : ''}</option>`).join('')}</select>
      <div class="field-hint">${state.isUnderground ? '🌍 בטבלאות אדמה — ברירת מחדל 30°C' : '☀️ בטבלאות אוויר — ברירת מחדל 35°C'}</div>
    </div>`;

  if (state.isUnderground) {
    html += `
      <div class="field">
        <label>סוג האדמה (תרמית)</label>
        <select id="soil">
          <option value="1.0" ${state.soilThermal === 1.0 ? 'selected' : ''}>רטובה מאוד</option>
          <option value="1.5" ${state.soilThermal === 1.5 ? 'selected' : ''}>רטובה</option>
          <option value="2.0" ${state.soilThermal === 2.0 ? 'selected' : ''}>בינונית</option>
          <option value="2.5" ${state.soilThermal === 2.5 ? 'selected' : ''}>רגילה (ברירת מחדל)</option>
          <option value="3.0" ${state.soilThermal === 3.0 ? 'selected' : ''}>יבשה</option>
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
        <label>איך הם מסודרים?</label>
        <select id="group-type">
          <option value="1" ${state.groupingType === 1 ? 'selected' : ''}>מקבץ באוויר / על משטח</option>
          <option value="2" ${state.groupingType === 2 ? 'selected' : ''}>שכבה על קיר/רצפה</option>
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
  if (soilEl) soilEl.addEventListener('change', (e) => { state.soilThermal = Number(e.target.value); });
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
  const cat = getCategory();
  const choice = cat?.choices.find((c) => c.id === state.installChoice);

  if (r.error) {
    frag.appendChild($(`<h2 class="step-title">😕 אופס, לא מצאנו</h2><p class="step-hint">${r.error}</p>`));
    el.content.replaceChildren(frag);
    return;
  }

  const matLabel = state.material === 'al' ? 'אלומיניום' : 'נחושת';
  const phaseLabel = state.phase === 'three' ? 'תלת-פאזי' : 'חד-פאזי';
  const insLabel = state.insulation === 90 ? 'בידוד 90°C' : 'בידוד 70°C (רגיל)';

  const checks = validateProtection({ ib: state.ib, in_: r.breaker, izCorrected: r.izCorrected });

  frag.appendChild($(`
    <div class="result-hero">
      <div class="big-emoji">🎉</div>
      <div class="result-kicker">הנה מה שיצא לך:</div>
      <div class="cross-section">${r.crossSection} <small>ממ"ר ${matLabel}</small></div>
    </div>
    <div class="result-cards">
      <div class="result-card"><span class="icon">🔌</span><div><div class="val">${r.breaker} אמפר</div><div class="lbl">מבטח מומלץ</div></div></div>
      <div class="result-card"><span class="icon">📊</span><div><div class="val">${r.izCorrected} אמפר</div><div class="lbl">הכבל נושא (אחרי תיקונים)</div></div></div>
      <div class="result-card"><span class="icon">📋</span><div><div class="val">${choice?.title ?? '—'}</div><div class="lbl">${cat?.title ?? ''}</div></div></div>
    </div>
    <div class="explain-box">
      <h4>💬 בשפה של בני אדם</h4>
      <p>
        ביקשת <strong>${state.ib} אמפר</strong> על מעגל <strong>${phaseLabel}</strong>,
        כבל <strong>${insLabel}</strong>, מותקן כ<strong>${choice?.title ?? state.method.label}</strong>.
        <br /><br />
        לפי תקנות החשמל (טבלה ${r.tableKey}), חתך <strong>${r.crossSection} ממ"ר</strong>
        נותן ${r.izTable} אמפר בטבלה. אחרי תיקון לטמפרטורה${state.useGrouping ? ' ולקיבוץ' : ''}
        (×${r.correctionTotal.toFixed(2)}) — נשאר <strong>${r.izCorrected} אמפר</strong> בבטחה.
        <br /><br />
        מבטח <strong>${r.breaker} אמפר</strong> — לא קטן מדי לעומס, לא גדול מדי לכבל. בדיוק כמו שצריך 👌
      </p>
    </div>
    <div class="explain-box">
      <h4>✅ בדיקות לפי התקן</h4>
      <ul class="check-list">
        ${checks.map((c) => `<li class="${c.ok ? 'ok' : 'fail'}">${c.text}</li>`).join('')}
      </ul>
    </div>
    <div class="explain-box explain-box--muted">
      <h4>🧮 התיקונים שחושבו</h4>
      <ul class="check-list">
        ${r.factors.map((f) => `<li class="ok">${f.name}: ×${f.value}</li>`).join('')}
        <li class="ok"><strong>סה"כ: ×${r.correctionTotal.toFixed(3)}</strong></li>
      </ul>
      <p class="legal-inline">מקור: ${LAW_META.title}</p>
    </div>
  `));

  el.content.replaceChildren(frag);
}

function canProceed() {
  const step = STEPS[state.step];
  if (step === 'install') return !!state.installCategory;
  if (step === 'detail') return !!state.method;
  if (step === 'cable') return !!state.insulation && !!state.phase && !!state.material;
  if (step === 'load') return state.ib > 0;
  if (step === 'environment') return true;
  return true;
}

function render() {
  updateProgress();

  switch (STEPS[state.step]) {
    case 'install':
      renderInstallStep();
      break;
    case 'detail':
      renderDetailStep();
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
    state.installCategory = null;
    state.installChoice = null;
    state.method = null;
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
