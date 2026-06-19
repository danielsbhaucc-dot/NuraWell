import {
  IZ_TABLES,
  STANDARD_BREAKERS,
  TEMP_AIR,
  TEMP_SOIL,
  SOIL_THERMAL,
  GROUPING_TABLE,
} from './data.js';

export function resolveTableKey(baseTable, insulation) {
  const temp = insulation === 90 ? '90' : '70';
  const suffix = baseTable.split('.')[1];
  return `${temp}.${suffix}`;
}

export function getCorrectionFactor({
  insulation,
  isUnderground,
  ambientTemp,
  soilThermal,
  groupingType,
  circuitCount,
}) {
  const factors = [];
  const ins = insulation === 90 ? 90 : 70;

  if (isUnderground) {
    const soilTable = TEMP_SOIL[ins];
    const t = soilTable[ambientTemp] ?? soilTable[30];
    factors.push({ name: 'טמפרטורת אדמה', value: t });
    if (soilThermal && SOIL_THERMAL[soilThermal]) {
      factors.push({ name: 'התנגדות תרמית של האדמה', value: SOIL_THERMAL[soilThermal] });
    }
  } else {
    const airTable = TEMP_AIR[ins];
    const t = airTable[ambientTemp] ?? airTable[35];
    factors.push({ name: 'טמפרטורת האוויר בסביבה', value: t });
  }

  if (groupingType && circuitCount > 1) {
    const row = GROUPING_TABLE[groupingType];
    const idx = Math.min(circuitCount, row.length) - 1;
    factors.push({ name: 'כבלים מקובצים יחד', value: row[idx] });
  }

  const total = factors.reduce((acc, f) => acc * f.value, 1);
  return { factors, total };
}

export function getIzFromTable(tableKey, material, phase, crossSection) {
  const table = IZ_TABLES[tableKey];
  if (!table) return null;
  const row = table.find((r) => r.s === crossSection);
  if (!row) return null;
  const mat = material === 'al' ? row.al : row.cu;
  const val = phase === 'three' ? mat.three : mat.single;
  return val ?? null;
}

export function findCable({
  tableKey,
  material,
  phase,
  requiredIb,
  correctionTotal,
}) {
  const table = IZ_TABLES[tableKey];
  if (!table) return { error: 'טבלה לא נמצאה' };

  const phaseKey = phase === 'three' ? 'three' : 'single';
  const matKey = material === 'al' ? 'al' : 'cu';

  for (const row of table) {
    const iz = row[matKey][phaseKey];
    if (iz == null) continue;
    const izCorrected = iz * correctionTotal;
    if (izCorrected >= requiredIb) {
      const breaker = pickBreaker(requiredIb, izCorrected);
      return {
        crossSection: row.s,
        izTable: iz,
        izCorrected: Math.round(izCorrected * 10) / 10,
        breaker,
        margin: Math.round((izCorrected - requiredIb) * 10) / 10,
      };
    }
  }

  return { error: 'אין חתך מתאים בטבלה — צריך להתייעץ עם מהנדס או לבדוק תנאים נוספים' };
}

export function pickBreaker(ib, izCorrected) {
  const candidates = STANDARD_BREAKERS.filter((in_) => in_ >= ib && in_ <= izCorrected);
  if (candidates.length) return candidates[0];
  const above = STANDARD_BREAKERS.filter((in_) => in_ >= ib);
  return above[0] ?? null;
}

export function calcCurrentFromPower({ powerKw, voltage, phase, powerFactor = 0.9 }) {
  if (!powerKw || !voltage) return null;
  const p = powerKw * 1000;
  if (phase === 'three') {
    return p / (Math.sqrt(3) * voltage * powerFactor);
  }
  return p / (voltage * powerFactor);
}

export function validateProtection({ ib, in_, izCorrected }) {
  const checks = [];
  checks.push({
    ok: ib <= in_,
    text: `זרם העומס (${ib}A) לא עולה על המבטח (${in_}A)`,
  });
  checks.push({
    ok: in_ <= izCorrected,
    text: `המבטח (${in_}A) לא גדול מהכבל המתוקן (${izCorrected}A)`,
  });
  checks.push({
    ok: ib <= izCorrected,
    text: `הכבל שורף את העומס בנוחות`,
  });
  return checks;
}
