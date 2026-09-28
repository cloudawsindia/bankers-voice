/* Bankers Voice India — shared helpers (used by index.html and admin.html) */
(function () {
'use strict';

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const h = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function fatal(title, detail, tech) {
  const m = document.getElementById('main') || document.body;
  m.innerHTML = '<div class="auth-wrap"><section class="panel"><h1>' + h(title) + '</h1><p>' + h(detail) + '</p>' +
    (tech ? '<p class="hintx">Technical detail: ' + h(tech) + '</p>' : '') +
    '<p><button class="btn" type="button" onclick="location.reload()">Reload</button></p></section></div>';
}
const stuck = () => document.querySelector('#main .loading');
window.addEventListener('error', e => { if (stuck()) fatal('This page could not start', 'Reload the page. If it keeps happening, send the detail below to the developer.', e.message); });
window.addEventListener('unhandledrejection', e => { if (stuck()) fatal('This page could not start', 'Reload the page. If it keeps happening, send the detail below to the developer.', e.reason && e.reason.message); });

if (!window.supabase || !window.supabase.createClient) {
  fatal('This page could not start', 'A required file (supabase.js) did not load. Upload supabase.js to the same place as index.html, then reload with Ctrl+Shift+R.');
  return;
}

/* ───────── Config ───────── */
const CONFIG = {
  SUPABASE_URL: 'https://pzyqonrxirzxambgcrew.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6eXFvbnJ4aXJ6eGFtYmdjcmV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTUyMTIsImV4cCI6MjEwNjE5MTIxMn0.ufYrfUxjBD4PewG7b0GuO6rdfYtF6BdKprzMb8VfsW8',
  SHOW_COUNTER_FROM: 50,
  RESEND_SECONDS: 30
};

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const BANKS = ['State Bank of India','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Bank of India','Indian Bank','Central Bank of India','Indian Overseas Bank','UCO Bank','Bank of Maharashtra','Punjab & Sind Bank','HDFC Bank','ICICI Bank','Axis Bank','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','IDFC FIRST Bank','Federal Bank','South Indian Bank','Karnataka Bank','Karur Vysya Bank','City Union Bank','RBL Bank','Bandhan Bank','DCB Bank','CSB Bank','Dhanlaxmi Bank','Tamilnad Mercantile Bank','Jammu & Kashmir Bank','AU Small Finance Bank','Equitas Small Finance Bank','Ujjivan Small Finance Bank','India Post Payments Bank','Regional Rural Bank','Cooperative bank','Other'];
const STATES = ['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];
const CATEGORIES = ['Employee representation','Working hours','Staffing / workload','Transfers','Promotions','Salary / benefits','Pension','Technology','Targets','Branch operations','Leave','Other'];

const ERR = {
  not_signed_in: 'Please log in first.',
  not_registered: 'Finish registration first. If you registered already, your account may be suspended.',
  already_registered: 'This account is already registered. Log in instead.',
  consent_required: 'Accept the two required consents to continue.',
  invalid_mobile: 'Enter a valid 10-digit Indian mobile number.',
  mobile_taken: 'This mobile number is already registered.',
  poll_closed: 'This poll is no longer open.',
  choose_option: 'Choose an option first.',
  choose_one: 'Choose one option only.',
  invalid_option: 'That option is not valid. Reload and try again.',
  already_voted: 'You have already voted in this poll.',
  vote_first: 'Vote to see the results.',
  rate_limited: 'You have reached the limit of 3 in 24 hours. Please try again later.',
  invalid_category: 'Choose a category.',
  issue_not_found: 'That issue is no longer available.',
  question_not_found: 'That question is no longer available.',
  report_not_found: 'This report is not available.',
  invalid_stance: 'That choice is not valid.',
  forbidden: 'Your admin role does not allow this action.',
  mfa_required: 'Two-step verification is required for this action.',
  locked_after_votes: 'This cannot be changed after people have voted.',
  need_two_options: 'A poll needs at least two options.',
  invalid_title: 'Enter a title.',
  invalid_status: 'That status is not valid.',
  below_threshold: 'Not enough responses yet to publish a report from this poll.',
  report_not_published: 'Publish the report before logging a submission.',
  missing_fields: 'Fill in all required fields.',
  reason_required: 'Enter a reason.',
  not_yourself: 'You cannot do this to your own account.',
  user_not_found: 'No account with that email.',
  last_super: 'You are the last super admin. Add another one first.',
  poll_exists: 'A poll already exists for this issue.',
  response_required: 'Add the official response text before marking as answered.',
  poll_not_found: 'Poll not found.'
};
function errText(e) {
  const m = (e && (e.message || e.error_description)) || '';
  for (const k in ERR) if (m.includes(k)) return ERR[k];
  if (/timeout/i.test(m)) return 'The server took too long to respond. Try again.';
  if (/rate limit|too many|over_email_send_rate_limit|security purposes/i.test(m)) return 'Too many attempts. Wait a few minutes, then try again.';
  if (/token|otp/i.test(m) && /expired|invalid/i.test(m)) return 'That code is wrong or has expired. Check it, or request a new code.';
  if (/failed to fetch|network/i.test(m)) return 'No connection. Check your internet and try again.';
  return 'Something went wrong. Please try again.';
}

async function rpc(name, args) {
  const { data, error } = await withTimeout(sb.rpc(name, args || {}), 15000);
  if (error) throw error;
  return data;
}
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} }
};
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function msg(el, kind, text) { if (!el) return; el.className = 'msg ' + kind; el.textContent = text || ''; }
const D = (x, o) => x ? new Date(x).toLocaleDateString('en-IN', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const DT = x => x ? new Date(x).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const N = x => Number(x || 0).toLocaleString('en-IN');
const label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

const ic = p => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  lock: ic('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  shield: ic('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  person: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  eyeoff: ic('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4 9.5 6-.5 1-1.5 2.5-3 3.8M6.4 7.7C4.5 9 3.3 10.8 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.4-.3 3.5-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  poll: ic('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8 12l3 3 5-6"/>'),
  voice: ic('<path d="M4 5h16v11H9l-5 4z"/>'),
  tracker: ic('<path d="M5 21V4"/><path d="M5 5h12l-2 4 2 4H5"/>'),
  report: ic('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 13h5M10 17h5"/>'),
  bell: ic('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  chart: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  question: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'),
  megaphone: ic('<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M18 9a4 4 0 0 1 0 6"/>'),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7"/>')
};
const LOGO = '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#E4B93A"/><path d="M8 16.5l5.5 5.5L24 9.5" fill="none" stroke="#071A33" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function barsSvg(items, opts) {
  const w = 640, hgt = (opts && opts.h) || 200, pad = 30;
  const max = Math.max(1, ...items.map(i => i.n));
  const bw = (w - pad * 2) / Math.max(items.length, 1);
  return `<svg viewBox="0 0 ${w} ${hgt}" role="img" aria-label="${h((opts && opts.label) || 'Bar chart')}">` +
    `<line x1="${pad}" y1="${hgt - 32}" x2="${w - pad}" y2="${hgt - 32}" stroke="#DCE3EE" stroke-width="2"/>` +
    items.map((it, i) => {
      const bh = Math.round((it.n / max) * (hgt - 74));
      const x = pad + i * bw + bw * 0.18, wd = bw * 0.64;
      return `<rect x="${x.toFixed(1)}" y="${hgt - 32 - bh}" width="${wd.toFixed(1)}" height="${bh}" rx="5" fill="${(opts && opts.color) || '#123663'}"/>` +
        `<text x="${(x + wd / 2).toFixed(1)}" y="${hgt - 36 - bh}" text-anchor="middle" font-size="12" font-weight="700" fill="#0B1B33">${it.n}</text>` +
        `<text x="${(x + wd / 2).toFixed(1)}" y="${hgt - 12}" text-anchor="middle" font-size="11" fill="#4F5F78">${h(it.label)}</text>`;
    }).join('') + '</svg>';
}

window.BV = { CONFIG, sb, $, $$, h, rpc, store, local, msg, errText, withTimeout, fatal, D, DT, N, label, I, LOGO, BANKS, STATES, CATEGORIES, barsSvg };
})();
