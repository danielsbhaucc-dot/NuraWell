// One-off codemod: migrate generic Tailwind palette utilities to NuraWell brand tokens.
import fs from 'node:fs'; import path from 'node:path';
const roots = ['app','components','lib','hooks','emails','src'].filter(r=>fs.existsSync(r));
const fam = { emerald:'primary', green:'primary', lime:'primary', teal:'secondary', cyan:'secondary', sky:'secondary', blue:'secondary',
  amber:'accent', yellow:'accent', orange:'energy', rose:'coral', red:'coral', pink:'coral',
  violet:'iris', indigo:'iris', purple:'iris', fuchsia:'iris',
  slate:'ink', gray:'ink', zinc:'ink', neutral:'ink', stone:'ink' };
const P = '(bg|text|from|via|to|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret|inset-shadow|drop-shadow)';
const reFam = new RegExp(`(?<![\\w-])${P}-(${Object.keys(fam).join('|')})-(\\d{2,3})(?![\\w-])`,'g');
const reWB = new RegExp(`(?<![\\w-])${P}-(white|black)(?:\\/(\\d{1,3}|\\[[^\\]]+\\]))?(?![\\w-])`,'g');
let files=0, n=0;
function white(pre, a){
  const al = a && /^\d+$/.test(a) ? +a : (a?null:100);
  if (pre==='bg') { if (al!==null && al<=30) return `bg-on-dark/${a}`; return a && al!==100 ? `bg-glass/${a}` : 'bg-glass'; }
  if (['from','via','to'].includes(pre)) return `${pre}-glass${a?'/'+a:''}`;
  return `${pre}-on-dark${a?'/'+a:''}`;
}
function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name);
  if (e.isDirectory()) { if (!['node_modules','.next'].includes(e.name)) walk(p); continue; }
  if (!/\.(tsx?|css|mjs)$/.test(e.name) || p.endsWith('globals.css') && false) continue;
  let s=fs.readFileSync(p,'utf8'), o=s;
  s=s.replace(reFam,(m,pre,f,sh)=>{n++; return `${pre}-${fam[f]}-${sh}`});
  s=s.replace(reWB,(m,pre,c,a)=>{n++; return c==='white'? white(pre,a) : `${pre}-forest-950${a?'/'+a:''}`});
  if (s!==o){ fs.writeFileSync(p,s); files++; } } }
roots.forEach(walk); console.log({files,n});
