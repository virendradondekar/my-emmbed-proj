/**
 * utils.js — Shared helper functions
 */

// ── Date helpers ──
function daysLeft(dateStr) {
  if (!dateStr) return 9999;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(dateStr); exp.setHours(0,0,0,0);
  return Math.ceil((exp - today) / 86400000);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return s + 's ago';
  if (s < 3600)  return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// ── Money ──
function monthlyEq(cost, cycle) {
  const c = Number(cost) || 0;
  if (cycle === 'annual')    return c / 12;
  if (cycle === 'quarterly') return c / 3;
  if (cycle === 'one-time')  return 0;
  return c;
}

// ── Status from days ──
function statusOf(expiry) {
  const d = daysLeft(expiry);
  if (d < 0)   return { l:'Expired',  c:'pill-red' };
  if (d <= 7)  return { l:'Critical', c:'pill-red' };
  if (d <= 30) return { l:'Expiring', c:'pill-yel' };
  return       { l:'Active',   c:'pill-grn' };
}

// ── Days bar HTML ──
function daysBarHTML(expiry) {
  const d = daysLeft(expiry);
  const pct = d < 0 ? 0 : Math.min(100, (d/365)*100);
  const col = d < 0 || d <= 7 ? 'var(--red)' : d <= 30 ? 'var(--yel)' : 'var(--grn)';
  const txt = d < 0 ? 'Expired' : d === 0 ? 'Today' : d+'d';
  return `<div class="days-cell">
    <div class="days-bar"><div class="days-fill" style="width:${pct}%;background:${col}"></div></div>
    <span class="days-txt" style="color:${col}">${txt}</span>
  </div>`;
}

// ── Escape HTML ──
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Initials ──
function initials(s) { return (s||'?').slice(0,2).toUpperCase(); }

// ── Hex + alpha ──
function hexAlpha(hex, a) {
  if (!hex || hex.startsWith('var(')) return `rgba(79,142,247,${a})`;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Category constants ──
const CAT_ICON  = { SaaS:'☁️', Infrastructure:'🖥️', Design:'🎨', Domain:'🌐', Hardware:'💻', License:'🔑' };
const CAT_COLOR = { SaaS:'#4F8EF7', Infrastructure:'#9B72F5', Design:'#EC4899', Domain:'#F5C842', Hardware:'#26D07C', License:'#F97316' };
const CAT_PILL  = { SaaS:'pill-acc', Infrastructure:'pill-pur', Design:'pill-pur', Domain:'pill-yel', Hardware:'pill-grn', License:'pill-gray' };
const PALETTE   = ['#4F8EF7','#9B72F5','#EC4899','#F97316','#26D07C','#F5C842','#06B6D4','#EF4444'];

// ── Owner chip HTML ──
function ownerChipHTML(acct) {
  if (!acct) return '';
  return `<div class="owner-chip">
    <div class="owner-dot" style="background:${hexAlpha(acct.color,.2)};color:${acct.color}">${initials(acct.name)}</div>
    ${esc(acct.name)}
  </div>`;
}

// ── Category pill HTML ──
function catPillHTML(cat) {
  return `<span class="pill ${CAT_PILL[cat]||'pill-gray'}">${CAT_ICON[cat]||'📦'} ${esc(cat)}</span>`;
}

// ── Toast ──
function toast(msg, type='success') {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const ico = { success:'✓', error:'✕', warn:'⚠' }[type] || 'ℹ';
  const col = type==='success'?'var(--grn)':type==='error'?'var(--red)':'var(--yel)';
  t.innerHTML = `<span style="color:${col}">${ico}</span>${esc(msg)}`;
  w.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ── Color picker HTML ──
function colorPickerHTML(selectedColor, inputId) {
  return PALETTE.map(c =>
    `<div class="color-opt${c===selectedColor?' sel':''}" style="background:${c}" data-color="${c}" onclick="selectColor(this,'${inputId}')"></div>`
  ).join('');
}
function selectColor(el, inputId) {
  document.querySelectorAll(`#${inputId} .color-opt`).forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
}
function getSelectedColor(inputId) {
  return document.querySelector(`#${inputId} .color-opt.sel`)?.dataset.color || PALETTE[0];
}
