/* Bankers Voice India — admin dashboard */
(() => {
'use strict';
if (!window.BV) return;
const { sb, $, $$, h, rpc, store, msg, errText, D, DT, N, label, LOGO, barsSvg } = window.BV;

const A = { who: null, ov: null, section: 'overview', cache: {} };
const STATUS_LABEL = { submitted: 'Submitted', under_review: 'Under review', published: 'Published', poll_created: 'Poll created', results: 'Results in', reported: 'Report ready', response: 'Response received', closed: 'Closed', rejected: 'Rejected',
  draft: 'Draft', active: 'Active', announced: 'Announced', under_discussion: 'Under discussion', in_progress: 'In progress', completed: 'Completed', deferred: 'Deferred', no_public_update: 'No public update', disputed: 'Disputed', answered: 'Answered', suspended: 'Suspended' };
const pill = s => `<span class="pill p-${h(s)}">${h(STATUS_LABEL[s] || label(s))}</span>`;
const opt = (v, t, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${h(t)}</option>`;
const dtLocal = iso => { if (!iso) return ''; const d = new Date(iso), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const isoOrEmpty = v => v ? new Date(v).toISOString() : '';
const ROLE_NAME = { super: 'Super admin', privacy: 'Privacy admin', moderator: 'Moderator', poll: 'Poll admin', report: 'Report admin', auditor: 'Auditor' };

const SECTIONS = [
  ['overview', 'Overview', ['*']],
  ['polls', 'Polls', ['poll', 'report']],
  ['issues', 'Issues', ['moderator', 'poll']],
  ['questions', 'Questions', ['moderator']],
  ['tracker', 'Commitments', ['moderator']],
  ['reports', 'Reports', ['report']],
  ['announcements', 'Announcements', ['moderator']],
  ['users', 'Users', ['privacy']],
  ['audit', 'Audit log', ['auditor', 'privacy']],
  ['admins', 'Admins', []]
];
const can = (roles) => A.who && (A.who.role === 'super' || roles.includes('*') || roles.includes(A.who.role));

/* ───────── screens outside the dashboard ───────── */
function screen(html) { $('#main').innerHTML = `<div class="adm-login"><section class="panel" style="border-top:6px solid var(--gold-bright)"><div style="margin-bottom:14px">${LOGO}</div>${html}</section></div>`; window.__admReady = true; }

function loginView(note) {
  screen(`<h1 style="font-size:32px">Admin sign in</h1><p class="muted">Use the email that has an admin role. We send a one-time code.</p>
  <form id="f" novalidate><div class="field"><label for="e">Email</label><input id="e" type="email" autocomplete="email" required value="${h(store.get('bv_email') || '')}"></div>
  <button class="btn" id="b" type="submit">Send code</button><p class="msg ${note ? 'err' : ''}" id="m" role="alert">${h(note || '')}</p></form>`);
  $('#f').addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('#e').value.trim().toLowerCase(), m = $('#m'), b = $('#b');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return msg(m, 'err', 'Enter a valid email address.');
    b.disabled = true; msg(m, 'info', 'Sending code…');
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) { b.disabled = false; return msg(m, 'err', /signups not allowed|not allowed for otp/i.test(error.message || '') ? 'No account with this email. Register on the main site first, then ask a super admin for a role.' : errText(error)); }
    store.set('bv_email', email); codeView(email);
  });
}
function codeView(email) {
  screen(`<h1 style="font-size:32px">Enter your code</h1><p class="muted">Sent to <b>${h(email)}</b>.</p>
  <form id="f" novalidate><div class="field"><label for="c">Code</label><input id="c" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div>
  <button class="btn" id="b" type="submit">Verify</button><p class="msg" id="m" role="alert"></p></form>`);
  $('#f').addEventListener('submit', async ev => {
    ev.preventDefault();
    const token = $('#c').value.replace(/\s/g, ''), m = $('#m'), b = $('#b');
    if (!/^\d{6,10}$/.test(token)) return msg(m, 'err', 'Enter the numeric code from your email.');
    b.disabled = true; msg(m, 'info', 'Checking…');
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) { b.disabled = false; return msg(m, 'err', errText(error)); }
    start();
  });
}
function noAccessView() {
  screen(`<h1 style="font-size:32px">No admin access</h1><p>This account has no admin role. If you should have one, ask a super admin to assign it.</p><div class="row"><button class="btn alt" id="so" type="button">Sign out</button><a href="index.html">Back to the site</a></div>`);
  $('#so').addEventListener('click', signOut);
}
async function mfaView(note) {
  let f;
  try { f = (await sb.auth.mfa.listFactors()).data; } catch (e) { return screen(`<h1 style="font-size:30px">Two-step check unavailable</h1><p>${h(errText(e))}</p>`); }
  const verified = ((f && f.totp) || []).find(x => x.status === 'verified');
  if (verified) {
    screen(`<h1 style="font-size:32px">Two-step verification</h1><p class="muted">Enter the 6-digit code from your authenticator app.</p>
    <form id="f" novalidate><div class="field"><label for="c">Authenticator code</label><input id="c" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <button class="btn" id="b" type="submit">Verify</button><p class="msg ${note ? 'err' : ''}" id="m" role="alert">${h(note || '')}</p></form>`);
    $('#f').addEventListener('submit', ev => { ev.preventDefault(); verifyMfa(verified.id, $('#c').value, $('#m'), $('#b')); });
    return;
  }
  for (const x of ((f && f.totp) || []).filter(y => y.status !== 'verified')) { try { await sb.auth.mfa.unenroll({ factorId: x.id }); } catch {} }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Bankers Voice admin ' + Date.now() });
  if (error) return screen(`<h1 style="font-size:30px">Could not start set-up</h1><p>${h(errText(error))}</p><p class="hintx">In Supabase, check Authentication, then Multi-factor, and make sure TOTP is enabled.</p>`);
  screen(`<h1 style="font-size:32px">Set up two-step verification</h1>
  <p>Admin access needs a second step. Scan this code with Google Authenticator, Microsoft Authenticator or a similar app.</p>
  <img class="qr" alt="QR code for your authenticator app" src="${h(data.totp.qr_code)}">
  <p class="hintx">Or enter this key by hand: <span class="mono">${h(data.totp.secret)}</span></p>
  <form id="f" novalidate><div class="field"><label for="c">6-digit code from the app</label><input id="c" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
  <button class="btn" id="b" type="submit">Turn on and continue</button><p class="msg" id="m" role="alert"></p></form>`);
  $('#f').addEventListener('submit', ev => { ev.preventDefault(); verifyMfa(data.id, $('#c').value, $('#m'), $('#b')); });
}
async function verifyMfa(factorId, code, m, b) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return msg(m, 'err', 'Enter the 6-digit code.');
  b.disabled = true; msg(m, 'info', 'Checking…');
  try {
    const ch = await sb.auth.mfa.challenge({ factorId }); if (ch.error) throw ch.error;
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code }); if (v.error) throw v.error;
    start();
  } catch (e) { b.disabled = false; msg(m, 'err', /invalid|expired/i.test(e.message || '') ? 'That code is wrong. Check the time on your phone and try again.' : errText(e)); }
}
async function signOut() { await sb.auth.signOut(); A.who = null; loginView(); }

/* ───────── dashboard shell ───────── */
async function start() {
  let ses; try { ses = (await window.BV.withTimeout(sb.auth.getSession(), 6000)).data.session; } catch {}
  if (!ses) return loginView();
  try { A.who = await rpc('bv_admin_whoami'); } catch (e) { return screen(`<h1 style="font-size:30px">Could not load</h1><p>${h(errText(e))}</p><p class="hintx">Make sure 03_upgrade_v2.sql has been run in Supabase.</p>`); }
  if (!A.who || !A.who.role) return noAccessView();
  if (A.who.mfa_required && A.who.aal !== 'aal2') return mfaView();
  try { A.ov = await rpc('bv_admin_overview'); } catch (e) { if (/mfa_required/.test(e.message || '')) return mfaView(); A.ov = null; }
  A.section = A.section && SECTIONS.find(s => s[0] === A.section && can(s[2])) ? A.section : 'overview';
  shell();
  go(A.section);
  window.__admReady = true;
}
function shell() {
  const badge = { issues: A.ov && A.ov.issues_pending, questions: A.ov && A.ov.questions_pending, users: A.ov && A.ov.suspicious };
  $('#main').innerHTML = `<div class="adm"><aside class="adm-side"><a class="brand" href="admin.html">${LOGO}<span>Admin</span></a>
    <div class="who"><b>${h(A.who.email || '')}</b>${h(ROLE_NAME[A.who.role] || A.who.role)}</div>
    <nav class="adm-nav" aria-label="Admin sections">${SECTIONS.filter(s => can(s[2])).map(s => `<button type="button" data-go="${s[0]}" class="${A.section === s[0] ? 'on' : ''}">${s[1]}${badge[s[0]] ? `<span class="cnt">${badge[s[0]]}</span>` : ''}</button>`).join('')}</nav>
    <div style="margin-top:18px;display:grid;gap:6px"><a class="btn ghost sm" href="index.html">View site</a><button class="btn ghost sm" type="button" id="so">Sign out</button></div></aside>
    <section class="adm-main"><div id="flash" class="msg" role="status"></div><div id="adm"></div></section></div>`;
  $('#so').addEventListener('click', signOut);
}
const flash = (kind, text) => { const f = $('#flash'); if (f) { msg(f, kind, text); if (text) window.scrollTo({ top: 0 }); } };
async function guarded(fn) {
  try { return await fn(); }
  catch (e) {
    if (/mfa_required/.test(e.message || '')) return mfaView('Please verify again to continue.');
    if (/not_signed_in|JWT/i.test(e.message || '')) return loginView('Your session ended. Sign in again.');
    flash('err', errText(e));
  }
}
function go(sec) {
  A.section = sec; flash('', '');
  $$('.adm-nav button').forEach(b => b.classList.toggle('on', b.dataset.go === sec));
  const fn = { overview: secOverview, polls: secPolls, issues: secIssues, questions: secQuestions, tracker: secTracker, reports: secReports, announcements: secAnnounce, users: secUsers, audit: secAudit, admins: secAdmins }[sec];
  $('#adm').innerHTML = '<p class="loading">Loading…</p>';
  guarded(fn);
}
const head = (t, s) => `<h1>${t}</h1><p class="sub">${s || ''}</p>`;

/* ───────── overview ───────── */
async function secOverview() {
  const o = A.ov = await rpc('bv_admin_overview');
  const days = []; const map = {}; (o.signups || []).forEach(x => map[x.d] = x.n);
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5), k = d.toISOString().slice(0, 10); days.push({ label: i % 5 === 0 ? String(d.getDate()) : '', n: map[k] || 0 }); }
  const kp = (n, t, alert) => `<div class="kpi ${alert ? 'alert' : ''}"><b>${N(n)}</b><span>${t}</span></div>`;
  $('#adm').innerHTML = head('Overview', 'Live numbers. Personal details are never shown on this page.') + `
  <div class="kpis">${kp(o.registered, 'Registered')}${kp(o.email_verified, 'Email verified')}${kp(o.mobile_verified, 'Mobile verified')}${kp(o.banks, 'Banks represented')}${kp(o.active_polls, 'Active polls')}${kp(o.responses, 'Poll responses')}${kp(o.issues_pending, 'Issues to review', o.issues_pending > 0)}${kp(o.questions_pending, 'Questions to review', o.questions_pending > 0)}${kp(o.suspicious, 'Flagged registrations', o.suspicious > 0)}${kp(o.suspended, 'Suspended')}${kp(o.reports_published, 'Reports published')}${kp(o.reports_generated, 'Reports generated')}</div>
  <div class="formcard"><h2>New registrations, last 30 days</h2><div class="chart">${barsSvg(days, { label: 'New registrations per day', h: 190 })}</div></div>
  <div class="formcard"><h2>Consent snapshot</h2><p class="muted">People who currently agree to each optional purpose.</p>
    <p>Platform updates: <b>${N((o.consents || {}).updates)}</b> &nbsp; Future contact: <b>${N((o.consents || {}).future_contact)}</b></p></div>`;
}

/* ───────── polls ───────── */
function pollForm(p) {
  const locked = p && p.voters > 0;
  return `<form id="pollForm" class="formcard" novalidate><h2>${p ? 'Edit poll' : 'New poll'}</h2>
  ${locked ? '<p class="draft">This poll already has responses. The wording of options and single/multiple choice are locked so results cannot be changed silently. Title, dates and description can still be edited, and every edit is logged.</p>' : ''}
  <input type="hidden" id="pid" value="${h(p ? p.id : '')}">
  <div class="field"><label for="ptitle">Question</label><input id="ptitle" type="text" maxlength="400" value="${h(p ? p.title : '')}"></div>
  <div class="field"><label for="pdesc">Description <span class="muted" style="font-weight:400">(shown under the question)</span></label><textarea id="pdesc" style="min-height:80px">${h(p ? p.description || '' : '')}</textarea></div>
  <div class="field"><label for="pmeth">How this poll works <span class="muted" style="font-weight:400">(methodology text)</span></label><textarea id="pmeth" style="min-height:80px">${h(p ? p.methodology || '' : 'Open to registered participants. One response per person. Results show participating users only and are not the views of all bankers.')}</textarea></div>
  <div class="field"><label for="popts">Options <span class="muted" style="font-weight:400">(one per line, at least two)</span></label><textarea id="popts" ${locked ? 'disabled' : ''}>${h(p ? p.options.map(o => o.text).join('\n') : 'Yes\nNo\nNot sure')}</textarea></div>
  <div class="form-grid two">
    <div class="field"><label for="pstart">Opens</label><input id="pstart" type="datetime-local" value="${dtLocal(p && p.start_at)}"></div>
    <div class="field"><label for="pend">Closes</label><input id="pend" type="datetime-local" value="${dtLocal(p && p.end_at)}"></div>
    <div class="field"><label for="pres">When results are visible</label><select id="pres">${opt('after_vote', 'After a person has voted', p ? p.results_mode : 'after_vote')}${opt('after_close', 'Only after the poll closes', p ? p.results_mode : '')}</select></div>
    <div class="field"><label for="psort">Order on the page <span class="muted" style="font-weight:400">(lower shows first)</span></label><input id="psort" type="number" value="${p ? p.sort_order : 0}"></div>
  </div>
  <div class="row" style="margin-bottom:16px"><label class="choice"><input type="checkbox" id="pmulti" ${p && p.multi_select ? 'checked' : ''} ${locked ? 'disabled' : ''}>People may choose more than one option</label>
  <label class="choice"><input type="checkbox" id="pchange" ${p && p.allow_change ? 'checked' : ''}>People may change their answer until it closes</label></div>
  <div class="row"><button class="btn" type="submit">${p ? 'Save changes' : 'Create as draft'}</button><button class="btn alt" type="button" data-act="cancel">Cancel</button></div></form>`;
}
async function secPolls() {
  const polls = A.cache.polls = await rpc('bv_admin_polls');
  const canEdit = can(['poll']);
  $('#adm').innerHTML = head('Polls', 'Create polls, open and close them. A poll starts as a draft and is not visible until you activate it.') +
    (canEdit ? '<div class="toolbar"><button class="btn" type="button" data-act="new-poll">New poll</button></div>' : '') + '<div id="editor"></div>' +
    (polls.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Poll</th><th>Status</th><th>Voters</th><th>Closes</th><th></th></tr></thead><tbody>${polls.map(p => `<tr><td><b>${h(p.title)}</b><br><span class="small muted">${p.options.map(o => `${h(o.text)} (${N(o.count)})`).join(', ')}</span></td><td>${pill(p.status)}</td><td>${N(p.voters)}</td><td>${p.end_at ? h(D(p.end_at)) : '-'}</td>
      <td>${canEdit ? `<div class="row" style="gap:6px"><button class="btn alt sm" data-act="edit-poll" data-id="${h(p.id)}">Edit</button>${p.status !== 'active' ? `<button class="btn sm" data-act="poll-status" data-id="${h(p.id)}" data-to="active">${p.status === 'closed' ? 'Reopen' : 'Activate'}</button>` : `<button class="btn alt sm" data-act="poll-status" data-id="${h(p.id)}" data-to="closed">Close</button>`}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No polls yet</b></div>');
}
async function savePoll(ev) {
  ev.preventDefault();
  const options = $('#popts').value.split('\n').map(x => x.trim()).filter(Boolean);
  const p = { id: $('#pid').value || null, title: $('#ptitle').value.trim(), description: $('#pdesc').value, methodology: $('#pmeth').value, options,
    multi_select: $('#pmulti').checked, allow_change: $('#pchange').checked, results_mode: $('#pres').value, start_at: isoOrEmpty($('#pstart').value), end_at: isoOrEmpty($('#pend').value), sort_order: $('#psort').value || 0 };
  if (!p.title) return flash('err', 'Enter the question.');
  if (!$('#popts').disabled && options.length < 2) return flash('err', 'A poll needs at least two options.');
  if (p.start_at && p.end_at && p.end_at <= p.start_at) return flash('err', 'The closing time must be after the opening time.');
  await guarded(async () => { await rpc('bv_admin_save_poll', { p }); flash('ok', p.id ? 'Poll updated.' : 'Poll created as a draft. Activate it when ready.'); await secPolls(); });
}

/* ───────── issues ───────── */
const ISSUE_STATUSES = ['submitted', 'under_review', 'published', 'poll_created', 'results', 'reported', 'response', 'closed', 'rejected'];
async function secIssues() {
  const all = A.cache.issues = await rpc('bv_admin_issues');
  const filter = A.issueFilter || 'todo';
  const list = filter === 'todo' ? all.filter(i => ['submitted', 'under_review'].includes(i.status)) : filter === 'all' ? all : all.filter(i => i.status === filter);
  const canMod = can(['moderator']), canPoll = can(['poll']);
  $('#adm').innerHTML = head('Issues', 'Review what participants submit. Nothing is public until you publish it. Submitters are pseudonymous, so you never see who wrote an issue.') +
    `<div class="toolbar"><label class="sr" for="ifilter">Filter</label><select id="ifilter">${opt('todo', 'Needs review', filter)}${opt('all', 'All issues', filter)}${ISSUE_STATUSES.map(s => opt(s, STATUS_LABEL[s], filter)).join('')}</select><span class="muted">${list.length} shown</span></div>` +
    (list.length ? list.map(i => `<article class="formcard" data-issue="${i.id}"><div class="row" style="margin-bottom:8px">${pill(i.status)}<span class="chip">${h(i.category)}</span><span class="small muted">${h(D(i.created_at))}</span><span class="small muted">Support ${i.support}, oppose ${i.oppose}, need info ${i.need_info}</span></div>
      <h3>${h(i.title)}</h3><p>${h(i.description)}</p>
      ${canMod ? `<details><summary style="cursor:pointer;font-weight:800">Edit wording</summary><div class="field" style="margin-top:10px"><label>Title</label><input data-f="title" value="${h(i.title)}"></div><div class="field"><label>Category</label><input data-f="category" value="${h(i.category)}"></div><div class="field"><label>Description</label><textarea data-f="description">${h(i.description)}</textarea></div></details>` : ''}
      <div class="form-grid two" style="margin-top:14px"><div class="field"><label>Status</label><select data-f="status" ${canMod ? '' : 'disabled'}>${ISSUE_STATUSES.map(s => opt(s, STATUS_LABEL[s], i.status)).join('')}</select></div>
      <div class="field"><label>Moderation note <span class="muted" style="font-weight:400">(internal)</span></label><input data-f="note" value="${h(i.note || '')}"></div></div>
      <div class="row">${canMod ? `<button class="btn" data-act="issue-save" data-id="${i.id}">Save</button>${['submitted', 'under_review'].includes(i.status) ? `<button class="btn gold" data-act="issue-publish" data-id="${i.id}">Publish</button><button class="btn alt" data-act="issue-reject" data-id="${i.id}">Reject</button>` : ''}` : ''}
      ${canPoll && !i.poll_id ? `<button class="btn alt" data-act="issue-poll" data-id="${i.id}">Create poll from this issue</button>` : ''}${i.poll_id ? '<span class="small muted">A poll exists for this issue.</span>' : ''}</div></article>`).join('')
      : '<div class="empty"><b>Nothing here</b>No issues match this filter.</div>');
  $('#ifilter').addEventListener('change', e => { A.issueFilter = e.target.value; guarded(secIssues); });
}
async function saveIssue(id, statusOverride) {
  const card = $(`[data-issue="${id}"]`), orig = A.cache.issues.find(x => x.id === Number(id)), f = k => (card.querySelector(`[data-f=${k}]`) || {}).value;
  const args = { p_id: Number(id), p_status: statusOverride || f('status'), p_note: f('note') || '' };
  ['title', 'category', 'description'].forEach(k => { if (f(k) != null && f(k).trim() !== (orig[k] || '')) args['p_' + k] = f(k).trim(); });
  await guarded(async () => { await rpc('bv_admin_issue_update', args); flash('ok', 'Saved.'); refreshCounts(); await secIssues(); });
}

/* ───────── questions ───────── */
async function secQuestions() {
  const all = A.cache.questions = await rpc('bv_admin_questions');
  const canMod = can(['moderator']);
  $('#adm').innerHTML = head('Questions to stakeholders', 'Publish neutral questions, then attach the official response with a source when it arrives.') +
    (all.length ? all.map(q => `<article class="formcard" data-q="${q.id}"><div class="row" style="margin-bottom:8px">${pill(q.status)}<span class="small muted">${h(D(q.created_at))}</span><span class="small muted">${N(q.votes)} supporters</span></div>
    <h3>${h(q.title)}</h3>${q.context ? `<p>${h(q.context)}</p>` : ''}
    <div class="form-grid two" style="margin-top:12px"><div class="field"><label>Status</label><select data-f="status" ${canMod ? '' : 'disabled'}>${['submitted', 'published', 'answered', 'rejected'].map(s => opt(s, STATUS_LABEL[s], q.status)).join('')}</select></div>
    <div class="field"><label>Answered by <span class="muted" style="font-weight:400">(organisation)</span></label><input data-f="by" value="${h(q.responded_by || '')}"></div></div>
    <div class="field"><label>Official response</label><textarea data-f="response" style="min-height:90px">${h(q.official_response || '')}</textarea></div>
    <div class="field"><label>Source <span class="muted" style="font-weight:400">(link or document name)</span></label><input data-f="source" value="${h(q.response_source || '')}"></div>
    ${canMod ? `<div class="row"><button class="btn" data-act="q-save" data-id="${q.id}">Save</button>${q.status === 'submitted' ? `<button class="btn gold" data-act="q-publish" data-id="${q.id}">Publish</button>` : ''}</div>` : ''}</article>`).join('')
    : '<div class="empty"><b>No questions yet</b></div>');
}
async function saveQuestion(id, status) {
  const c = $(`[data-q="${id}"]`), f = k => c.querySelector(`[data-f=${k}]`).value;
  await guarded(async () => { await rpc('bv_admin_question_update', { p_id: Number(id), p_status: status || f('status'), p_response: f('response'), p_source: f('source'), p_by: f('by') }); flash('ok', 'Saved.'); refreshCounts(); await secQuestions(); });
}

/* ───────── commitments ───────── */
const C_STATUS = ['announced', 'under_discussion', 'in_progress', 'completed', 'deferred', 'no_public_update', 'disputed'];
function commitForm(c) {
  const v = k => h(c ? c[k] || '' : '');
  return `<form id="commitForm" class="formcard" novalidate><h2>${c ? 'Edit commitment' : 'New commitment'}</h2><input type="hidden" id="cid" value="${c ? c.id : ''}">
  <div class="field"><label>Title</label><input id="ctitle" value="${v('title')}"></div>
  <div class="form-grid two"><div class="field"><label>Who made it <span class="muted" style="font-weight:400">(organisation)</span></label><input id="corg" value="${v('organisation')}"></div><div class="field"><label>Topic</label><input id="ctopic" value="${v('topic')}"></div>
  <div class="field"><label>Source title</label><input id="csrct" value="${v('source_title')}"></div><div class="field"><label>Source link</label><input id="csrcu" type="url" value="${v('source_url')}"></div>
  <div class="field"><label>Announced on</label><input id="csrcd" type="date" value="${c && c.source_date ? c.source_date : ''}"></div><div class="field"><label>Deadline <span class="muted" style="font-weight:400">(if one was stated)</span></label><input id="cdead" type="date" value="${c && c.deadline ? c.deadline : ''}"></div></div>
  <div class="field"><label>What was promised or announced</label><textarea id="csum" style="min-height:90px">${v('summary')}</textarea></div>
  <div class="field"><label>Expected action</label><input id="cact" value="${v('expected_action')}"></div>
  <div class="field"><label>Evidence <span class="muted" style="font-weight:400">(what supports the current status)</span></label><textarea id="cevid" style="min-height:70px">${v('evidence')}</textarea></div>
  <div class="form-grid two"><div class="field"><label>Status</label><select id="cstat" ${c ? 'disabled' : ''}>${C_STATUS.map(s => opt(s, STATUS_LABEL[s], c ? c.status : 'announced')).join('')}</select><p class="hintx">${c ? 'Change status with the update box on the card, so the history is kept.' : ''}</p></div>
  <div class="field"><label class="choice" style="margin-top:28px"><input type="checkbox" id="cpub" ${c && c.published ? 'checked' : ''}>Show publicly on the tracker</label></div></div>
  <div class="row"><button class="btn" type="submit">${c ? 'Save changes' : 'Create'}</button><button class="btn alt" type="button" data-act="cancel">Cancel</button></div></form>`;
}
async function secTracker() {
  const all = A.cache.commits = await rpc('bv_admin_commitments');
  $('#adm').innerHTML = head('Commitment tracker', 'Record what was promised, by whom, with a source. Every status change is kept as history.') +
    '<div class="toolbar"><button class="btn" type="button" data-act="new-commit">New commitment</button></div><div id="editor"></div>' +
    (all.length ? all.map(c => `<article class="formcard" data-c="${c.id}"><div class="row" style="margin-bottom:8px">${pill(c.status)}${c.published ? '<span class="pill p-published">Public</span>' : '<span class="pill">Hidden</span>'}<span class="small muted">${h(c.organisation)}</span></div>
      <h3>${h(c.title)}</h3><p>${h(c.summary)}</p>
      <div class="form-grid two"><div class="field"><label>Set new status</label><select data-f="status">${C_STATUS.map(s => opt(s, STATUS_LABEL[s], c.status)).join('')}</select></div><div class="field"><label>Note for the history <span class="muted" style="font-weight:400">(what changed)</span></label><input data-f="note"></div></div>
      <div class="field"><label>Link for this update <span class="muted" style="font-weight:400">(optional)</span></label><input data-f="src" type="url"></div>
      <div class="row"><button class="btn" data-act="c-status" data-id="${c.id}">Add update</button><button class="btn alt" data-act="edit-commit" data-id="${c.id}">Edit details</button></div>
      ${c.updates.length ? `<ul class="upd">${c.updates.map(u => `<li>${pill(u.status)} <span class="small muted">${h(D(u.at))}</span>${u.note ? '<br>' + h(u.note) : ''}</li>`).join('')}</ul>` : ''}</article>`).join('') : '<div class="empty"><b>Nothing tracked yet</b></div>');
}
async function saveCommit(ev) {
  ev.preventDefault();
  const g = id => $('#' + id).value.trim();
  const p = { id: g('cid') || null, title: g('ctitle'), organisation: g('corg'), topic: g('ctopic'), source_title: g('csrct'), source_url: g('csrcu'), source_date: g('csrcd'), summary: g('csum'), expected_action: g('cact'), deadline: g('cdead'), evidence: g('cevid'), published: $('#cpub').checked, status: $('#cstat').value };
  if (!p.title || !p.organisation || !p.summary) return flash('err', 'Title, organisation and what was promised are required.');
  await guarded(async () => { await rpc('bv_admin_commitment_save', { p }); flash('ok', 'Saved.'); await secTracker(); });
}

/* ───────── reports ───────── */
async function secReports() {
  const [polls, reps] = await Promise.all([rpc('bv_admin_polls'), rpc('bv_admin_reports')]);
  const withVotes = polls.filter(p => p.voters > 0);
  $('#adm').innerHTML = head('Reports', 'A report freezes the results at this moment. It only works when the poll has enough responses, and breakdowns follow the same privacy threshold as the public results.') + `
  <form id="repForm" class="formcard" novalidate><h2>Generate a report</h2>
  <div class="field"><label for="rpoll">Poll</label><select id="rpoll"><option value="">Select a poll</option>${withVotes.map(p => `<option value="${h(p.id)}">${h(p.title)} (${N(p.voters)} voters)</option>`).join('')}</select></div>
  <div class="field"><label for="rtopic">Report title</label><input id="rtopic"></div>
  <div class="field"><label for="rsum">Summary <span class="muted" style="font-weight:400">(plain, factual)</span></label><textarea id="rsum" style="min-height:90px"></textarea></div>
  <div class="field"><label for="rpur">Intended purpose of sharing</label><input id="rpur" placeholder="For example: shared with employee organisations"></div>
  <button class="btn" type="submit">Generate draft</button></form>` +
  (reps.length ? reps.map(r => `<article class="formcard" data-r="${r.id}"><div class="row" style="margin-bottom:8px">${pill(r.status)}<span class="chip">Version ${r.version}</span><span class="small muted">${N(r.total)} respondents, generated ${h(D(r.generated_at))}</span></div><h3>${h(r.topic)}</h3>${r.summary ? `<p>${h(r.summary)}</p>` : ''}${r.sharing_purpose ? `<p class="small muted">Purpose: ${h(r.sharing_purpose)}</p>` : ''}
    <div class="row"><button class="btn ${r.status === 'draft' ? 'gold' : 'alt'}" data-act="r-publish" data-id="${r.id}" data-to="${r.status === 'draft'}">${r.status === 'draft' ? 'Publish' : 'Unpublish'}</button>${r.status === 'published' ? `<a class="btn alt" target="_blank" rel="noopener" href="index.html#/report/${r.id}">Open public page</a>` : ''}</div>
    ${r.status === 'published' ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:800">Log where this report was shared</summary><div class="form-grid two" style="margin-top:10px"><div class="field"><label>Recipient</label><input data-f="rec"></div><div class="field"><label>Purpose</label><input data-f="pur"></div></div><div class="field"><label>Notes</label><input data-f="notes"></div><button class="btn sm" data-act="r-share" data-id="${r.id}">Log it</button></details>` : ''}
    ${r.shares.length ? `<ul class="upd">${r.shares.map(s => `<li><b>${h(s.recipient)}</b>, ${h(D(s.at))}. ${h(s.purpose)}${s.notes ? ' (' + h(s.notes) + ')' : ''}</li>`).join('')}</ul>` : ''}</article>`).join('') : '<div class="empty"><b>No reports yet</b></div>');
  $('#rpoll').addEventListener('change', e => { const p = withVotes.find(x => x.id === e.target.value); if (p && !$('#rtopic').value) $('#rtopic').value = p.title; });
  $('#repForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!$('#rpoll').value) return flash('err', 'Select a poll.');
    await guarded(async () => { await rpc('bv_admin_generate_report', { p_poll: $('#rpoll').value, p_topic: $('#rtopic').value, p_summary: $('#rsum').value, p_purpose: $('#rpur').value }); flash('ok', 'Draft report generated. Review it, then publish.'); await secReports(); });
  });
}

/* ───────── announcements ───────── */
async function secAnnounce() {
  const list = await rpc('bv_admin_announcements');
  $('#adm').innerHTML = head('Announcements', 'Short updates shown in every member’s Updates feed. Keep them factual.') + `
  <form id="annForm" class="formcard" novalidate><h2>New announcement</h2><div class="field"><label for="atitle">Headline</label><input id="atitle" maxlength="140"></div><div class="field"><label for="abody">Details <span class="muted" style="font-weight:400">(optional)</span></label><textarea id="abody" style="min-height:80px"></textarea></div><button class="btn" type="submit">Publish</button></form>` +
  (list.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Headline</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td><b>${h(a.title)}</b>${a.body ? `<br><span class="small muted">${h(a.body)}</span>` : ''}</td><td>${h(D(a.created_at))}</td><td>${a.published ? pill('published') : pill('closed')}</td><td>${a.published ? `<button class="btn alt sm" data-act="ann-hide" data-id="${a.id}">Hide</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '');
  $('#annForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const t = $('#atitle').value.trim();
    if (t.length < 3) return flash('err', 'Write a headline of at least 3 characters.');
    await guarded(async () => { await rpc('bv_admin_announce', { p_title: t, p_body: $('#abody').value }); flash('ok', 'Published to the Updates feed.'); await secAnnounce(); });
  });
}

/* ───────── users (personal data) ───────── */
async function secUsers() {
  $('#adm').innerHTML = head('Users', 'This page shows personal details. Every search and every action is written to the audit log. Use it only for a real need.') + `
  <div class="toolbar"><label class="sr" for="uq">Search</label><input id="uq" type="text" placeholder="Name, email, mobile or bank"><button class="btn" data-act="u-search">Search</button><button class="btn alt" data-act="u-flagged">Show flagged registrations</button></div>
  <div class="field" style="max-width:560px"><label for="ureason">Reason <span class="muted" style="font-weight:400">(required for suspend, unsuspend or delete, saved in the audit log)</span></label><input id="ureason"></div>
  <div id="ures"><div class="empty"><b>Search to see accounts</b>Or open the flagged list.</div></div>`;
}
function userTable(rows) {
  if (!rows.length) return '<div class="empty"><b>No accounts found</b></div>';
  return `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th>Details</th><th>Joined</th><th>Flags</th><th></th></tr></thead><tbody>${rows.map(u => `<tr><td><b>${h(u.name)}</b><br><span class="small">${h(u.email)}</span><br><span class="small">+91 ${h(u.mobile)}</span></td>
    <td class="small">${u.bank ? h(u.bank) + '<br>' : ''}${u.gender ? h(u.gender) + ', ' : ''}${u.scale ? 'Scale ' + h(u.scale) : ''}<br>${pill(u.status)}</td><td class="small">${h(D(u.created_at))}</td>
    <td>${(u.flags || []).map(f => `<span class="flagtag">${h(f)}</span>`).join('') || '<span class="muted small">None</span>'}</td>
    <td><div class="row" style="gap:6px">${u.status === 'active' ? `<button class="btn alt sm" data-act="u-do" data-id="${h(u.user_id)}" data-do="suspend">Suspend</button>` : `<button class="btn sm" data-act="u-do" data-id="${h(u.user_id)}" data-do="unsuspend">Unsuspend</button>`}<button class="btn danger sm" data-act="u-do" data-id="${h(u.user_id)}" data-do="delete">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

/* ───────── audit + admins ───────── */
async function secAudit() {
  const rows = await rpc('bv_admin_audit', { p_limit: 200 });
  $('#adm').innerHTML = head('Audit log', 'Every admin action, newest first. Entries cannot be edited or removed from this screen.') +
    (rows.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Object</th><th>Details</th></tr></thead><tbody>${rows.map(r => `<tr><td class="small">${h(DT(r.at))}</td><td class="small">${h(r.admin || 'system')}</td><td><b>${h(r.action)}</b></td><td class="small">${h(r.object_type || '')}${r.object_id ? '<br><span class="mono">' + h(String(r.object_id).slice(0, 12)) + '</span>' : ''}</td><td class="mono">${h(JSON.stringify(r.metadata || {}))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No entries yet</b></div>');
}
async function secAdmins() {
  const rows = await rpc('bv_admin_admins');
  $('#adm').innerHTML = head('Admins', 'Give people only the role they need. Super admin can do everything.') + `
  <form id="admForm" class="formcard" novalidate><h2>Give or change a role</h2><p class="muted">The person must have logged in to the site at least once with this email.</p>
  <div class="form-grid two"><div class="field"><label for="aemail">Email</label><input id="aemail" type="email"></div><div class="field"><label for="arole">Role</label><select id="arole">${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
  <button class="btn" type="submit">Save role</button></form>
  <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.email)}</td><td>${h(ROLE_NAME[r.role] || r.role)}</td><td class="small">${h(D(r.since))}</td><td><button class="btn alt sm" data-act="adm-remove" data-email="${h(r.email)}">Remove</button></td></tr>`).join('')}</tbody></table></div>
  <p class="notep">Roles: privacy admin can search users and see personal details. Moderator handles issues, questions, the tracker and announcements. Poll admin manages polls. Report admin generates and publishes reports. Auditor can only read the audit log.</p>`;
  $('#admForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const email = $('#aemail').value.trim();
    if (!email) return flash('err', 'Enter an email.');
    await guarded(async () => { await rpc('bv_admin_set_role', { p_email: email, p_role: $('#arole').value }); flash('ok', 'Role saved.'); await secAdmins(); });
  });
}
async function refreshCounts() { try { A.ov = await rpc('bv_admin_overview'); const s = { issues: A.ov.issues_pending, questions: A.ov.questions_pending, users: A.ov.suspicious };
  $$('.adm-nav button').forEach(b => { const n = s[b.dataset.go]; const c = b.querySelector('.cnt'); if (c) c.remove(); if (n) b.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`); }); } catch {} }

/* ───────── events ───────── */
document.addEventListener('click', ev => {
  const nav = ev.target.closest('[data-go]'); if (nav) return go(nav.dataset.go);
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  const ed = $('#editor');
  if (a === 'cancel') { ed.innerHTML = ''; return; }
  if (a === 'new-poll') { ed.innerHTML = pollForm(null); $('#pollForm').addEventListener('submit', savePoll); return; }
  if (a === 'edit-poll') { ed.innerHTML = pollForm(A.cache.polls.find(x => x.id === id)); $('#pollForm').addEventListener('submit', savePoll); ed.scrollIntoView(); return; }
  if (a === 'poll-status') return guarded(async () => { await rpc('bv_admin_poll_status', { p_id: id, p_status: el.dataset.to }); flash('ok', el.dataset.to === 'active' ? 'Poll is live.' : 'Poll closed.'); await secPolls(); });
  if (a === 'issue-save') return saveIssue(id);
  if (a === 'issue-publish') return saveIssue(id, 'published');
  if (a === 'issue-reject') { if (!window.confirm('Reject this issue? It will not be published.')) return; return saveIssue(id, 'rejected'); }
  if (a === 'issue-poll') return guarded(async () => { await rpc('bv_admin_issue_to_poll', { p_id: Number(id) }); flash('ok', 'Draft poll created. Find it under Polls, edit it and activate it.'); await secIssues(); });
  if (a === 'q-save') return saveQuestion(id);
  if (a === 'q-publish') return saveQuestion(id, 'published');
  if (a === 'new-commit') { ed.innerHTML = commitForm(null); $('#commitForm').addEventListener('submit', saveCommit); return; }
  if (a === 'edit-commit') { ed.innerHTML = commitForm(A.cache.commits.find(x => String(x.id) === id)); $('#commitForm').addEventListener('submit', saveCommit); ed.scrollIntoView(); return; }
  if (a === 'c-status') { const c = $(`[data-c="${id}"]`), f = k => c.querySelector(`[data-f=${k}]`).value; return guarded(async () => { await rpc('bv_admin_commitment_status', { p_id: Number(id), p_status: f('status'), p_note: f('note'), p_source_url: f('src') || null }); flash('ok', 'Update added to the history.'); await secTracker(); }); }
  if (a === 'r-publish') return guarded(async () => { await rpc('bv_admin_report_publish', { p_id: Number(id), p_publish: el.dataset.to === 'true' }); flash('ok', el.dataset.to === 'true' ? 'Report published.' : 'Report unpublished.'); await secReports(); });
  if (a === 'r-share') { const c = $(`[data-r="${id}"]`), f = k => c.querySelector(`[data-f=${k}]`).value; return guarded(async () => { await rpc('bv_admin_report_share', { p_id: Number(id), p_recipient: f('rec'), p_purpose: f('pur'), p_notes: f('notes') || null }); flash('ok', 'Logged.'); await secReports(); }); }
  if (a === 'ann-hide') return guarded(async () => { await rpc('bv_admin_announcement_hide', { p_id: Number(id) }); flash('ok', 'Hidden from the feed.'); await secAnnounce(); });
  if (a === 'u-search') return guarded(async () => { $('#ures').innerHTML = userTable(await rpc('bv_admin_users', { p_q: $('#uq').value })); });
  if (a === 'u-flagged') return guarded(async () => { $('#ures').innerHTML = userTable(await rpc('bv_admin_suspicious')); });
  if (a === 'u-do') {
    const reason = $('#ureason').value.trim(); if (!reason) return flash('err', 'Enter a reason first. It is saved in the audit log.');
    const what = el.dataset.do;
    if (what === 'delete' && !window.confirm('Permanently delete this account? Their answers stay in the combined results, unlinked. This cannot be undone.')) return;
    return guarded(async () => { await rpc('bv_admin_user_action', { p_user: id, p_action: what, p_reason: reason }); flash('ok', 'Done. Logged in the audit trail.'); const q = $('#uq').value; $('#ures').innerHTML = userTable(await rpc('bv_admin_users', { p_q: q })); refreshCounts(); });
  }
  if (a === 'adm-remove') { if (!window.confirm('Remove admin access for ' + el.dataset.email + '?')) return; return guarded(async () => { await rpc('bv_admin_set_role', { p_email: el.dataset.email, p_role: 'none' }); flash('ok', 'Removed.'); await secAdmins(); }); }
});

/* boot */
start().catch(e => window.BV.fatal('Admin could not start', 'Reload the page.', e && e.message));
})();
