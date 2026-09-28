/* Bankers Voice India — public and member app */
(() => {
'use strict';
if (!window.BV) return;
const { CONFIG, sb, $, $$, h, rpc, store, local, msg, errText, D, DT, N, label, I, BANKS, STATES, CATEGORIES, barsSvg } = window.BV;

const S = { session: null, me: null, polls: [], stats: null, results: {}, sel: {}, timer: null, loadFailed: false,
  issues: [], questions: [], commitments: [], reports: [], feed: [], community: null, voiceTab: 'issues', trackFilter: 'all' };

const K = () => (S.stats && S.stats.k) || 10;
const STATUS = {
  announced: 'Announced', under_discussion: 'Under discussion', in_progress: 'In progress', completed: 'Completed',
  deferred: 'Deferred', no_public_update: 'No public update', disputed: 'Disputed or needs clarification',
  published: 'Published', poll_created: 'Poll created', results: 'Results in', reported: 'Report ready', response: 'Response received', closed: 'Closed', answered: 'Answered'
};

/* ───────── data loaders ───────── */
async function loadMe() { try { S.me = S.session ? await rpc('bv_me') : null; } catch { S.me = null; } }
async function loadPolls() { try { S.polls = (await rpc('bv_active_polls')) || []; } catch (e) { console.warn('bv_active_polls failed:', e); S.polls = []; S.loadFailed = true; } }
async function loadStats() { try { S.stats = await rpc('bv_public_stats'); } catch (e) { console.warn('bv_public_stats failed:', e); S.stats = null; S.loadFailed = true; } }
async function loadIssues() { try { S.issues = (await rpc('bv_issues_list')) || []; } catch { S.issues = []; } }
async function loadQuestions() { try { S.questions = (await rpc('bv_questions_list')) || []; } catch { S.questions = []; } }
async function loadFeed() {
  if (!S.me) { S.feed = []; return; }
  try { S.feed = (await rpc('bv_feed')) || []; } catch { S.feed = []; }
  renderNav();
}
const unseen = () => { const seen = local.get('bv_feed_seen') || 0; return S.feed.filter(f => new Date(f.at).getTime() > seen).length; };

(function captureRef() {
  const raw = new URLSearchParams(location.search).get('ref') || new URLSearchParams((location.hash.split('?')[1]) || '').get('ref');
  const v = (raw || '').toUpperCase().trim();
  if (/^BV-[A-Z0-9]{4}$/.test(v)) store.set('bv_ref', v);
  const p = store.get('bv_pending');
  if (p && p.pollId && Array.isArray(p.ids)) S.sel[p.pollId] = new Set(p.ids);
})();

/* ───────── chrome ───────── */
const PUB_LINKS = [['community', 'Community'], ['voice', 'Voice'], ['tracker', 'Tracker'], ['reports', 'Reports'], ['methodology', 'Methodology']];
const MEM_LINKS = [['home', 'Polls'], ['voice', 'Voice'], ['tracker', 'Tracker'], ['reports', 'Reports']];
const TABS = [['home', 'Polls', I.poll], ['voice', 'Voice', I.voice], ['tracker', 'Tracker', I.tracker], ['reports', 'Reports', I.report], ['account', 'Account', I.person]];
let CURRENT = '';

function renderNav() {
  const m = !!S.me;
  document.body.classList.toggle('member', m);
  const links = (m ? MEM_LINKS : PUB_LINKS).map(([k, t]) => `<a class="lnk ${CURRENT === k || (k === 'reports' && CURRENT === 'report') ? 'on' : ''}" href="#/${k}">${t}</a>`).join('');
  const initials = m ? (S.me.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase() : '';
  const n = m ? unseen() : 0;
  $('#nav').innerHTML = m
    ? `${links}<a class="bell" href="#/updates" aria-label="Updates${n ? ', ' + n + ' new' : ''}">${I.bell}${n ? `<span class="dot">${n > 9 ? '9+' : n}</span>` : ''}</a><a class="avatar" href="#/account" aria-label="Account">${h(initials)}</a>`
    : `${links}<a class="plain" href="#/login">Log in</a><a class="btn gold sm" href="#/join">Register</a>`;
  const sub = $('#subnav');
  sub.className = 'subnav' + (m ? '' : ' show');
  sub.innerHTML = m ? '' : PUB_LINKS.map(([k, t]) => `<a class="${CURRENT === k ? 'on' : ''}" href="#/${k}">${t}</a>`).join('');
  const tb = $('#tabbar');
  tb.innerHTML = m ? TABS.map(([k, t, ico]) => `<a class="${CURRENT === k || (k === 'reports' && CURRENT === 'report') ? 'on' : ''}" href="#/${k}">${ico}<span>${t}</span></a>`).join('') : '';
}
function setMain(html, title) {
  const m = $('#main');
  m.innerHTML = html;
  document.title = title ? `${title} | Bankers Voice India` : 'Bankers Voice India';
  m.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
const pageHead = (title, sub, extra) => `<section class="page-head"><div class="wrap"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}${extra ? `<div class="head-extra">${extra}</div>` : ''}</div></section>`;
const suspendedBanner = () => S.me && S.me.status === 'suspended' ? `<p class="msg err" role="alert">Your account is suspended, so you can read but not vote or post. Contact the platform team if you think this is a mistake.</p>` : '';

/* ───────── polls ───────── */
function optionsHtml(p) {
  const type = p.multi_select ? 'checkbox' : 'radio';
  const sel = S.sel[p.id] || new Set();
  return `<fieldset class="opts"><legend class="sr">${h(p.title)}</legend>` +
    p.options.map(o => `<label class="opt"><input type="${type}" name="p_${h(p.id)}" value="${h(o.id)}" ${sel.has(o.id) ? 'checked' : ''}><span class="box" aria-hidden="true"></span><span class="txt">${h(o.text)}</span></label>`).join('') + `</fieldset>`;
}
function pollHtml(p) {
  const member = !!S.me;
  const voted = (p.my_options || []).length > 0 && !p.editing;
  const top = `<div class="ballot-top"><span class="chip live"><i></i>Open poll</span><span>${p.end_at ? 'Closes ' + h(D(p.end_at)) : (p.multi_select ? 'Select all that apply' : 'Choose one')}</span></div>`;
  const hint = p.description ? `<p class="hint">${h(p.description)}</p>` : '';
  const method = p.methodology ? `<details><summary>How this poll works</summary><p style="margin-top:8px">${h(p.methodology)}</p></details>` : '';
  let body;
  if (voted) {
    body = `<div class="done"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#1D7A4B"/><path d="M6 11.5l3.3 3.3L16 8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Your response is recorded</div>
      <div class="results" data-results="${h(p.id)}"><p class="hintx">Loading results…</p></div>
      ${p.allow_change ? `<div class="foot" style="padding-top:0"><button class="btn alt" data-act="change" data-poll="${h(p.id)}" type="button">Change my response</button></div>` : ''}`;
  } else if (member) {
    const susp = S.me.status === 'suspended';
    body = `${optionsHtml(p)}<div class="foot"><button class="btn" data-act="vote" data-poll="${h(p.id)}" type="button" ${susp ? 'disabled' : ''}>Submit vote</button>
      <p class="note">${p.allow_change ? 'You can change your response until the poll closes.' : 'You can vote once. Your name is never shown next to your answer.'}</p>
      <p class="msg" data-msg="${h(p.id)}" role="alert"></p></div>`;
  } else {
    body = `${optionsHtml(p)}<div class="foot"><button class="btn" data-act="register-to-vote" data-poll="${h(p.id)}" type="button">Register to vote</button>
      <p class="note">Takes about a minute. Your name, mobile and email are never shown to other participants.</p></div>`;
  }
  return `<article class="ballot" data-ballot="${h(p.id)}">${top}<div class="head"><h2 class="q">${h(p.title)}</h2>${hint}</div>${body}${method}</article>`;
}
function bandHtml(o, mine) {
  const w = Math.max(0, Math.min(100, Number(o.pct) || 0));
  return `<div class="bar-row ${mine ? 'mine' : ''}"><div class="bar-top"><span>${h(o.text)}${mine ? '<span class="mine-tag">Your response</span>' : ''}</span><span class="num">${o.pct}% <small>(${N(o.count)})</small></span></div><div class="bar" role="img" aria-label="${h(o.text)}: ${o.pct} percent"><i style="width:${w}%"></i></div></div>`;
}
function breakdownHtml(title, bd, data) {
  if (!bd) return '';
  if (!bd.shown) return `<details class="bd"><summary>${h(title)}</summary><p class="hintx" style="margin-top:6px">Not shown yet. Every group needs at least ${data.k} responses before a breakdown appears, so no one can be singled out.</p></details>`;
  const head = bd.groups.map(g => `<th scope="col">${h(g.label)}<small>${N(g.n)} people</small></th>`).join('');
  const rows = data.options.map(o => `<tr><th scope="row" style="font-weight:600">${h(o.text)}</th>${bd.groups.map(g => { const v = (g.options.find(x => x.id === o.id) || {}).pct; return `<td>${v == null ? '-' : v + '%'}</td>`; }).join('')}</tr>`).join('');
  return `<details class="bd"><summary>${h(title)}</summary><div class="tbl-wrap"><table><thead><tr><th scope="col"><span class="sr">Option</span></th>${head}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
function resultsHtml(p, d) {
  if (!d) return '<p class="hintx">Results are not available right now.</p>';
  if (!d.available) {
    if (d.reason === 'after_close') return `<p class="hintx">Results will be published when this poll closes${d.end_at ? ' on ' + h(D(d.end_at)) : ''}.</p>`;
    return `<p class="hintx">Results appear once at least ${d.k} people have voted. ${d.total} so far.</p>`;
  }
  const mine = new Set(p.my_options || []);
  return d.options.map(o => bandHtml(o, mine.has(o.id))).join('') +
    `<p class="disc"><b>${N(d.total)}</b> participating ${d.total === 1 ? 'user' : 'users'} responded. These results represent participating users only and should not be read as the views of all Indian bankers.${p.multi_select ? ' Several options could be chosen, so percentages add up to more than 100%.' : ''}</p>` +
    breakdownHtml('By scale', d.by_scale, d) + breakdownHtml('By gender', d.by_gender, d);
}
async function loadResults(p) {
  const box = $(`[data-results="${CSS.escape(p.id)}"]`);
  if (!box) return;
  try { S.results[p.id] = await rpc('bv_poll_results', { p_poll_id: p.id }); box.innerHTML = resultsHtml(p, S.results[p.id]); }
  catch (e) { box.innerHTML = `<p class="hintx">${h(errText(e))}</p>`; }
}
function refreshCard(p) {
  const el = $(`[data-ballot="${CSS.escape(p.id)}"]`);
  if (!el) return;
  el.outerHTML = pollHtml(p);
  if ((p.my_options || []).length > 0 && !p.editing) loadResults(p);
}
async function castVote(pollId, btn) {
  const p = S.polls.find(x => x.id === pollId);
  const m = $(`[data-msg="${CSS.escape(pollId)}"]`);
  const ids = Array.from(S.sel[pollId] || []);
  if (!p) return;
  if (!ids.length) return msg(m, 'err', p.multi_select ? 'Select at least one option.' : 'Choose an option first.');
  btn.disabled = true; msg(m, 'info', 'Submitting…');
  try {
    await rpc('bv_cast_vote', { p_poll_id: pollId, p_option_ids: ids });
    p.my_options = ids; p.editing = false; delete S.results[pollId];
    const pend = store.get('bv_pending'); if (pend && pend.pollId === pollId) store.del('bv_pending');
    refreshCard(p);
  } catch (e) {
    btn.disabled = false; msg(m, 'err', errText(e));
    if (/already_voted|poll_closed/.test(e.message || '')) await loadPolls();
  }
}
function afterPolls() { S.polls.forEach(p => { if ((p.my_options || []).length > 0 && !p.editing) loadResults(p); }); }

/* ───────── views ───────── */
const views = {};

views[''] = {
  async load() { S.loadFailed = false; await Promise.all([loadPolls(), loadStats()]); },
  html() {
    const st = S.stats, first = S.polls[0], k = K();
    const counter = st && st.registered >= CONFIG.SHOW_COUNTER_FROM
      ? `<p class="counter"><b>${N(st.registered)}</b> bankers registered${st.banks >= 3 ? ` from ${st.banks} banks` : ''}.</p>` : '';
    const notice = S.loadFailed && !S.stats && !S.polls.length ? '<p class="notice" role="alert">Live data could not be loaded right now. Please try again in a few minutes.</p>' : '';
    const cta = S.me
      ? '<a class="btn gold" href="#/home">Go to my polls</a>'
      : '<a class="btn gold" href="#/join">Register your voice</a><button class="btn ghost" type="button" data-act="scroll-how">How it works</button>';
    const ballot = first ? pollHtml(first)
      : `<div class="ballot"><div class="ballot-top"><span class="chip">No poll open</span></div><div class="head"><h2 class="q">The next poll will appear here</h2><p class="hint">Register now to be notified in the app when it opens.</p></div><div class="foot"><a class="btn" href="#/join">Register your voice</a></div></div>`;
    return `
<section class="hero"><div class="wrap">${notice}
  <div class="hero-grid">
    <div>
      <h1>Your voice. Your choice. Your identity stays private.</h1>
      <p class="lede">A common platform for bankers to express their views on the issues that matter to them, and to see what participating bankers think.</p>
      <div class="row">${cta}</div>
      ${counter}
      <ul class="trust">
        <li>${I.eyeoff}<span>Name, mobile and email never shown</span></li>
        <li>${I.shield}<span>Groups under ${k} people stay hidden</span></li>
        <li>${I.person}<span>One person, one response</span></li>
      </ul>
    </div>
    <div>${ballot}</div>
  </div></div></section>

<section class="section after-hero"><div class="wrap">
  <div class="sec-head"><h2>Private by design</h2><p>Your contact details and your answers are kept in separate places with no link between them. Only combined results ever leave the system.</p></div>
  <div class="flow">
    <div class="flow-box"><span class="fi">${I.lock}</span><h3>Your details</h3><p>Kept in a locked identity record. Only a privacy admin can open it, and every search is logged.</p><ul class="mini"><li>Name</li><li>Mobile</li><li>Email</li></ul></div>
    <div class="flow-gap"><span class="wall"></span><small>No link<br>between them</small></div>
    <div class="flow-box"><span class="fi">${I.person}</span><h3>Your answers</h3><p>Stored under a scrambled key, never your name.</p><code class="key">7f3a9c02e1…b84d</code></div>
    <div class="flow-gap arrow"><small>Only groups<br>of ${k}+ people</small></div>
    <div class="flow-box dark"><span class="fi">${I.chart}</span><h3>Combined results</h3><p>Percentages and totals for participating users.</p><div class="minibars" aria-hidden="true"><i style="width:68%"></i><i style="width:22%"></i><i style="width:10%"></i></div></div>
  </div>
</div></section>

<section class="section white" id="how"><div class="wrap">
  <div class="sec-head"><h2>How it works</h2></div>
  <ol class="steps">
    <li><div><b>Register</b><p>Give your name, mobile, email, bank, gender and scale, and accept the consents.</p></div></li>
    <li><div><b>Verify your email</b><p>We send a code to your email. Your bank is self-declared and your mobile is not verified yet.</p></div></li>
    <li><div><b>Answer the current poll</b><p>One response per person. Your name is never shown next to your answer.</p></div></li>
    <li><div><b>See the combined result</b><p>Raise issues, support the ones that matter and follow what gets done.</p></div></li>
  </ol>
</div></section>

<section class="section"><div class="wrap">
  <div class="sec-head"><h2>More than a poll</h2><p>Everything runs on the same rule: participating users only, with the method shown.</p></div>
  <div class="rows">
    <a class="rowlink" href="#/voice"><h3>Voice</h3><p>Raise issues, support the ones that matter, and put questions to stakeholders. Official answers are labelled and sourced.</p><span class="go">Open</span></a>
    <a class="rowlink" href="#/tracker"><h3>Commitment tracker</h3><p>Public commitments and announcements with the source, the deadline and what has happened since.</p><span class="go">Open</span></a>
    <a class="rowlink" href="#/reports"><h3>Reports</h3><p>Aggregate reports with respondent counts, method and limits. Save as PDF or download the numbers as CSV.</p><span class="go">Open</span></a>
    <a class="rowlink" href="#/community"><h3>Community</h3><p>Who is taking part, by bank, scale and week, shown only where groups are large enough.</p><span class="go">Open</span></a>
  </div>
</div></section>
${S.me ? '' : `<section class="cta-band"><div class="wrap"><h2>Make your voice count</h2><p>Register once. Answer in a minute. Your identity stays private.</p><a class="btn gold" href="#/join">Register your voice</a></div></section>`}`;
  },
  after() { afterPolls(); }
};

views.join = {
  html() {
    const signedIn = !!S.session;
    const email = signedIn ? (S.session.user.email || '') : (store.get('bv_email') || '');
    const ref = store.get('bv_ref');
    return `<div class="auth-wrap"><section class="panel">
  <h1>Register your voice</h1>
  <p class="muted">${signedIn ? 'Your email is verified. Add your details to finish.' : 'Your name, mobile and email are never shown to other participants.'}</p>
  ${ref ? `<p class="hintx" style="margin-bottom:16px">You were invited with code <b>${h(ref)}</b>.</p>` : ''}
  <form id="joinForm" novalidate>
    <div class="field"><label for="name">Full name</label><input id="name" type="text" autocomplete="name" required maxlength="100"></div>
    <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" inputmode="email" required value="${h(email)}" ${signedIn ? 'readonly' : ''}>
      <p class="hintx">${signedIn ? 'Verified.' : 'We will send a verification code here.'}</p></div>
    <div class="field"><label for="mobile">Mobile number</label><div class="prefix"><span>+91</span><input id="mobile" type="tel" autocomplete="tel-national" inputmode="numeric" maxlength="14" required></div>
      <p class="hintx">Used to keep one account per person. Not verified yet.</p></div>
    <div class="field"><label for="bank">Bank</label><select id="bank" required><option value="">Select your bank</option>${BANKS.map(b => `<option>${h(b)}</option>`).join('')}</select></div>
    <fieldset class="field"><legend>Gender</legend><div class="choices">${['Male', 'Female', 'Prefer not to say'].map(g => `<label class="choice"><input type="radio" name="gender" value="${g}" required>${g}</label>`).join('')}</div></fieldset>
    <div class="field"><label for="scale">Scale</label><select id="scale" required><option value="">Select your scale</option><option value="I">Scale I</option><option value="II">Scale II</option><option value="III">Scale III</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></select></div>
    <div class="field"><label for="state">State or region <span class="muted" style="font-weight:400">(optional)</span></label><select id="state"><option value="">Prefer not to say</option>${STATES.map(s => `<option>${h(s)}</option>`).join('')}</select></div>
    <div class="consents">
      <label class="choice"><input type="checkbox" id="c_participation"><span>I want to participate in the platform. <b>(required)</b></span></label>
      <label class="choice"><input type="checkbox" id="c_reporting"><span>I agree that my responses may be used for the stated purposes in aggregated, anonymised form. <b>(required)</b></span></label>
      <label class="choice"><input type="checkbox" id="c_updates"><span>I agree to receive platform updates.</span></label>
      <label class="choice"><input type="checkbox" id="c_future"><span>I agree to be contacted about future surveys or participation opportunities.</span></label>
      <p class="hintx">Read the <a href="#/privacy" target="_blank" rel="noopener">privacy notice</a> and <a href="#/terms" target="_blank" rel="noopener">terms of use</a>.</p>
    </div>
    <div class="row" style="margin-top:20px"><button class="btn" id="joinBtn" type="submit">${signedIn ? 'Complete registration' : 'Send verification code'}</button>${signedIn ? '' : '<a href="#/login">I already registered</a>'}</div>
    <p class="msg" id="joinMsg" role="alert"></p>
  </form></section></div>`;
  },
  after() {
    const saved = store.get('bv_reg');
    if (saved) {
      $('#name').value = saved.name || ''; $('#mobile').value = saved.mobile || ''; $('#bank').value = saved.bank || '';
      $('#scale').value = saved.scale || ''; $('#state').value = saved.state || '';
      const g = $$('input[name=gender]').find(x => x.value === saved.gender); if (g) g.checked = true;
    }
    $('#joinForm').addEventListener('submit', onJoin);
  }
};

views.login = {
  html() {
    return `<div class="auth-wrap"><section class="panel">
  <h1>Log in</h1>
  <p class="muted">Enter the email you registered with. We will send you a code. There is no password.</p>
  <form id="loginForm" novalidate>
    <div class="field"><label for="lemail">Email</label><input id="lemail" type="email" autocomplete="email" inputmode="email" required value="${h(store.get('bv_email') || '')}"></div>
    <div class="row"><button class="btn" id="loginBtn" type="submit">Send code</button><a href="#/join">Register instead</a></div>
    <p class="msg" id="loginMsg" role="alert"></p>
  </form></section></div>`;
  },
  after() { $('#loginForm').addEventListener('submit', onLogin); }
};

views.verify = {
  html() {
    const email = store.get('bv_email') || '';
    return `<div class="auth-wrap"><section class="panel">
  <h1>Enter your code</h1>
  <p class="muted">We sent a code to <b>${h(email)}</b>. It can take a minute. Check your spam folder too.</p>
  <form id="verifyForm" novalidate>
    <div class="field"><label for="code">Verification code</label><input id="code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
    <div class="row"><button class="btn" id="verifyBtn" type="submit">Verify</button><button class="btn alt" id="resendBtn" type="button" disabled>Resend code</button></div>
    <p class="msg" id="verifyMsg" role="alert"></p>
    <p style="margin-top:14px"><a href="#/login">Use a different email</a></p>
  </form></section></div>`;
  },
  after() { $('#verifyForm').addEventListener('submit', onVerify); $('#resendBtn').addEventListener('click', onResend); startResendTimer(); $('#code').focus(); }
};

views.home = {
  needs: 'member',
  async load() { await loadPolls(); },
  html() {
    const me = S.me, first = h((me.name || '').split(' ')[0]);
    const link = `${location.origin}${location.pathname}?ref=${me.referral_code || ''}`;
    const shareText = `I've registered on Bankers Voice India. A platform where bankers can privately express their views and take part in community polls. Your identity stays private from other users. Join here: ${link}`;
    const welcome = store.get('bv_justRegistered');
    return `${pageHead(`Welcome, ${first}`, 'Your name, mobile and email are not visible to other participants.')}
<div class="wrap page-body"><div class="stack">
  ${suspendedBanner()}
  ${welcome ? `<div class="card"><h2>You are registered</h2><p class="muted">Invite other bankers. The message does not mention your bank, gender, scale or name.</p>
    <div class="row"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText)}">Share on WhatsApp</a>
    <button class="btn alt" type="button" data-act="copy" data-text="${h(shareText)}">Copy message</button></div><p class="msg" id="shareMsg" role="status"></p></div>` : ''}
  <section aria-labelledby="pollsH"><h2 id="pollsH" style="margin-bottom:16px;color:#fff;position:relative;top:-2px" class="sr">Open polls</h2>
    ${S.polls.length ? `<div class="stack">${S.polls.map(pollHtml).join('')}</div>` : '<div class="empty"><b>No poll is open right now</b>New polls will appear here and in your Updates.</div>'}
  </section>
</div></div>`;
  },
  after() { afterPolls(); store.del('bv_justRegistered'); }
};

/* Voice: issues + questions */
const STAGES = ['Published', 'Poll', 'Results', 'Report', 'Response'];
const STAGE_IDX = { published: 0, poll_created: 1, results: 2, reported: 3, response: 4, closed: 4 };
function voteBlock(i) {
  const v = i.votes || {};
  let head;
  if (v.hidden) head = `<p class="hintx" style="margin-top:14px">Counts appear once at least ${K()} people have responded.</p>`;
  else {
    const t = Math.max(1, v.total);
    head = `<div class="tally" role="img" aria-label="Support ${v.support}, do not support ${v.oppose}, need more information ${v.need_info}"><i class="s" style="width:${v.support / t * 100}%"></i><i class="o" style="width:${v.oppose / t * 100}%"></i><i class="n" style="width:${v.need_info / t * 100}%"></i></div>
      <div class="legend"><span class="s">Support ${N(v.support)}</span><span class="o">Do not support ${N(v.oppose)}</span><span class="n">Need more information ${N(v.need_info)}</span></div>`;
  }
  if (!S.me) return head + `<p class="hintx" style="margin-top:12px"><a href="#/join">Register</a> or <a href="#/login">log in</a> to give your view.</p>`;
  const b = (k, t) => `<button type="button" data-act="stance" data-id="${i.id}" data-stance="${k}" aria-pressed="${i.mine === k}">${t}</button>`;
  return head + `<div class="stance" role="group" aria-label="Your view">${b('support', 'Support')}${b('oppose', 'Do not support')}${b('need_info', 'Need more information')}</div>`;
}
function issueHtml(i) {
  const idx = STAGE_IDX[i.status] ?? 0;
  return `<article class="item" data-issue="${i.id}"><div class="item-head"><span class="chip">${h(i.category)}</span><span class="pill p-${h(i.status)}">${h(STATUS[i.status] || label(i.status))}</span><span class="small muted">${h(D(i.created_at))}</span></div>
    <h3>${h(i.title)}</h3><p>${h(i.description)}</p>
    <ol class="stages" aria-label="Progress">${STAGES.map((s, n) => `<li class="${n <= idx ? 'done' : ''}">${s}</li>`).join('')}</ol>
    ${voteBlock(i)}</article>`;
}
function questionHtml(q) {
  const vote = S.me ? `<button type="button" class="vote-btn" data-act="qvote" data-id="${q.id}" aria-pressed="${!!q.mine}">${q.mine ? 'Supported' : 'Support this question'} <span>${N(q.votes)}</span></button>`
    : `<span class="small muted">${N(q.votes)} supporters. <a href="#/join">Register</a> to support.</span>`;
  const off = q.status === 'answered' && q.official_response
    ? `<div class="official"><b>Official response${q.responded_by ? ' from ' + h(q.responded_by) : ''}${q.responded_at ? ', ' + h(D(q.responded_at)) : ''}</b><p>${h(q.official_response)}</p>${q.response_source ? `<p class="small">Source: ${/^https?:\/\//.test(q.response_source) ? `<a href="${h(q.response_source)}" target="_blank" rel="noopener">${h(q.response_source)}</a>` : h(q.response_source)}</p>` : ''}</div>` : '';
  return `<article class="item"><div class="item-head"><span class="chip">Question</span><span class="pill p-${h(q.status)}">${q.status === 'answered' ? 'Answered' : 'Awaiting response'}</span><span class="small muted">${h(D(q.created_at))}</span></div>
    <h3>${h(q.title)}</h3>${q.context ? `<p>${h(q.context)}</p>` : ''}<div class="row" style="margin-top:6px">${vote}</div>${off}</article>`;
}
function voiceBody() {
  if (S.voiceTab === 'issues') return S.issues.length ? `<div class="stack">${S.issues.map(issueHtml).join('')}</div>` : '<div class="empty"><b>No issues published yet</b>Issues appear here after a moderator reviews them. Raise the first one below.</div>';
  return S.questions.length ? `<div class="stack">${S.questions.map(questionHtml).join('')}</div>` : '<div class="empty"><b>No questions published yet</b>Questions appear here after review, so participants can support them.</div>';
}
views.voice = {
  async load() { await Promise.all([loadIssues(), loadQuestions(), S.stats ? null : loadStats()]); },
  html() {
    const forms = S.me ? `<details class="card"><summary>Raise an issue</summary>
      <p class="muted">Describe a matter that affects bank employees. A moderator reviews every issue before it is published. Please do not name or accuse individuals, and stick to facts you can support.</p>
      <form id="issueForm" novalidate>
        <div class="field"><label for="ititle">Title</label><input id="ititle" type="text" maxlength="140" required><p class="hintx">8 to 140 characters.</p></div>
        <div class="field"><label for="icat">Category</label><select id="icat" required><option value="">Select a category</option>${CATEGORIES.map(c => `<option>${h(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="idesc">What is the issue?</label><textarea id="idesc" maxlength="2000" required></textarea><p class="hintx">20 to 2000 characters.</p></div>
        <button class="btn" id="issueBtn" type="submit" ${S.me.status === 'suspended' ? 'disabled' : ''}>Submit for review</button><p class="msg" id="issueMsg" role="alert"></p>
      </form></details>
      <details class="card"><summary>Ask a question to stakeholders</summary>
      <p class="muted">Ask a neutral, factual question. Popular questions can be put to unions, associations, banks or authorities, and their answers are shown here with the source.</p>
      <form id="questionForm" novalidate>
        <div class="field"><label for="qtitle">Your question</label><input id="qtitle" type="text" maxlength="200" required><p class="hintx">10 to 200 characters. Ask a question, do not make an accusation.</p></div>
        <div class="field"><label for="qctx">Background <span class="muted" style="font-weight:400">(optional)</span></label><textarea id="qctx" maxlength="1000" style="min-height:90px"></textarea></div>
        <button class="btn" id="questionBtn" type="submit" ${S.me.status === 'suspended' ? 'disabled' : ''}>Submit for review</button><p class="msg" id="questionMsg" role="alert"></p>
      </form></details>` : '';
    return `${pageHead('Voice', 'Raise issues, show which ones matter, and put questions to stakeholders.', `<div class="seg" role="group" aria-label="Choose list"><button type="button" data-act="tab" data-tab="issues" aria-pressed="${S.voiceTab === 'issues'}">Issues</button><button type="button" data-act="tab" data-tab="questions" aria-pressed="${S.voiceTab === 'questions'}">Questions</button></div>`)}
<div class="wrap page-body"><div class="stack">
  ${suspendedBanner()}
  <div id="voiceBody">${voiceBody()}</div>
  ${forms}
  <p class="notep">Issues and questions are views of participating users. Official responses are labelled and sourced. Nothing here is presented as established fact unless a source is shown.</p>
</div></div>`;
  },
  after() {
    const f1 = $('#issueForm'); if (f1) f1.addEventListener('submit', onIssue);
    const f2 = $('#questionForm'); if (f2) f2.addEventListener('submit', onQuestion);
  }
};

/* Tracker */
function trackerCard(c) {
  const src = c.source_url ? `<a href="${h(c.source_url)}" target="_blank" rel="noopener">${h(c.source_title || 'Source')}</a>` : (c.source_title ? h(c.source_title) : '');
  return `<article class="item tl"><div class="item-head"><span class="pill p-${h(c.status)}">${h(STATUS[c.status] || label(c.status))}</span>${c.topic ? `<span class="chip">${h(c.topic)}</span>` : ''}</div>
    <h3>${h(c.title)}</h3>
    <div class="meta"><span>${h(c.organisation)}</span>${c.source_date ? `<span>Announced ${h(D(c.source_date))}</span>` : ''}${c.deadline ? `<span>Deadline ${h(D(c.deadline))}</span>` : '<span>No deadline stated</span>'}<span>Updated ${h(D(c.last_updated))}</span></div>
    <p>${h(c.summary)}</p>
    ${c.expected_action ? `<p><b>Expected action:</b> ${h(c.expected_action)}</p>` : ''}
    ${src ? `<p class="small"><b>Source:</b> ${src}</p>` : ''}
    ${c.evidence ? `<p class="small"><b>Evidence:</b> ${h(c.evidence)}</p>` : ''}
    ${c.updates && c.updates.length ? `<ul class="upd">${c.updates.map(u => `<li><span class="pill p-${h(u.status)}">${h(STATUS[u.status] || label(u.status))}</span> <span class="small muted">${h(D(u.at))}</span>${u.note ? `<br>${h(u.note)}` : ''}${u.source_url ? ` <a href="${h(u.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul>` : ''}</article>`;
}
views.tracker = {
  async load() { try { S.commitments = (await rpc('bv_commitments_list')) || []; } catch { S.commitments = []; } },
  html() {
    const present = Array.from(new Set(S.commitments.map(c => c.status)));
    const shown = S.trackFilter === 'all' ? S.commitments : S.commitments.filter(c => c.status === S.trackFilter);
    const filt = present.length > 1 ? `<div class="filters" role="group" aria-label="Filter by status"><button type="button" data-act="filter" data-f="all" aria-pressed="${S.trackFilter === 'all'}">All</button>${present.map(s => `<button type="button" data-act="filter" data-f="${h(s)}" aria-pressed="${S.trackFilter === s}">${h(STATUS[s] || label(s))}</button>`).join('')}</div>` : '';
    return `${pageHead('Commitment tracker', 'Public commitments and announcements, with the source and what has happened since.', filt)}
<div class="wrap page-body"><div class="stack">
  <div id="trackBody">${shown.length ? `<div class="timeline">${shown.map(trackerCard).join('')}</div>` : '<div class="empty"><b>Nothing tracked yet</b>Documented commitments will appear here with their source and status.</div>'}</div>
  <p class="notep">Statuses reflect publicly documented information. An item is never called a broken promise unless the evidence supports it and the context is shown.</p>
</div></div>`;
  }
};

/* Reports */
views.reports = {
  async load() { try { S.reports = (await rpc('bv_reports_list')) || []; } catch { S.reports = []; } },
  html() {
    return `${pageHead('Reports', 'Aggregate reports from participating users, with the method and limits stated.')}
<div class="wrap page-body"><div class="stack">
  ${S.reports.length ? S.reports.map(r => `<a class="item" style="text-decoration:none;color:inherit;display:block" href="#/report/${r.id}"><div class="item-head"><span class="chip">Version ${r.version}</span><span class="small muted">Published ${h(D(r.published_at))}</span></div><h3>${h(r.topic)}</h3>${r.summary ? `<p>${h(r.summary)}</p>` : ''}<p class="small"><b>${N(r.total)}</b> participating respondents${r.period_start ? `, ${h(D(r.period_start))} to ${h(D(r.period_end))}` : ''}</p></a>`).join('')
    : '<div class="empty"><b>No reports published yet</b>Reports appear after a poll gets enough responses and the team publishes the results.</div>'}
</div></div>`;
  }
};

function csvEsc(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function reportCsv(r) {
  const s = r.snapshot, rows = [['Report', r.topic], ['Version', r.version], ['Question', s.question], ['Respondents (participating users)', s.total],
    ['Minimum group size shown', s.k], [], ['Option', 'Count', 'Percent']];
  s.options.forEach(o => rows.push([o.text, o.count, o.pct]));
  [['Breakdown by scale', s.by_scale], ['Breakdown by gender', s.by_gender]].forEach(([t, bd]) => {
    rows.push([]); rows.push([t]);
    if (!bd || !bd.shown) { rows.push(['Not shown: at least one group is below the privacy threshold']); return; }
    rows.push(['Group', 'Respondents'].concat(s.options.map(o => o.text + ' (%)')));
    bd.groups.forEach(g => rows.push([g.label, g.n].concat(s.options.map(o => (g.options.find(x => x.id === o.id) || {}).pct))));
  });
  rows.push([]); rows.push(['Note', 'Aggregate data for participating users only. Not the views of all Indian bankers.']);
  return rows.map(r2 => r2.map(csvEsc).join(',')).join('\r\n');
}
views.report = {
  async load(arg) { S.report = null; S.reportErr = null; try { S.report = await rpc('bv_report_get', { p_id: Number(arg) }); } catch (e) { S.reportErr = errText(e); } },
  html() {
    const r = S.report;
    if (!r) return `${pageHead('Report', '')}<div class="wrap page-body"><div class="empty"><b>${h(S.reportErr || 'Report not found')}</b><a href="#/reports">Back to reports</a></div></div>`;
    const s = r.snapshot, m = r.methodology || {};
    const bd = (title, b) => !b || !b.shown ? `<h2>${title}</h2><p class="muted">Not shown. At least one group has fewer than ${s.k} respondents, so the breakdown is withheld to protect identities.</p>`
      : `<h2>${title}</h2><div class="tbl-wrap"><table><thead><tr><th scope="col">Option</th>${b.groups.map(g => `<th scope="col">${h(g.label)}<small>${N(g.n)} respondents</small></th>`).join('')}</tr></thead><tbody>${s.options.map(o => `<tr><th scope="row" style="font-weight:600">${h(o.text)}</th>${b.groups.map(g => `<td>${(g.options.find(x => x.id === o.id) || {}).pct ?? '-'}%</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const mrows = [['Who', m.who], ['When', r.period_start ? `${D(r.period_start)} to ${D(r.period_end)}` : ''], ['How participants joined', m.how], ['Verification', m.verification], ['Sample', m.sample],
      ['Duplicate control', m.duplicate_control], ['Incomplete responses', m.incomplete], ['Privacy threshold', m.privacy_threshold], ['Limitations', m.limitations]].filter(x => x[1]);
    const acts = '<div class="row no-print"><button class="btn gold" type="button" data-act="print">Save as PDF</button><button class="btn ghost" type="button" data-act="csv">Download CSV</button><a class="btn ghost" href="#/reports">All reports</a></div>';
    return `${pageHead('Community voice report', 'Bankers Voice India', acts)}
<div class="wrap page-body"><div class="stack">
  <article class="report-doc">
    <span class="chip">Version ${r.version}</span>
    <h1>${h(r.topic)}</h1>
    <p class="muted">Published ${h(D(r.published_at))}${r.period_start ? `. Survey period ${h(D(r.period_start))} to ${h(D(r.period_end))}.` : '.'}</p>
    <div class="disclaimer">These figures represent participating users of Bankers Voice India only. They are not the views of all Indian bankers.</div>
    ${r.summary ? `<h2>Summary</h2><p>${h(r.summary)}</p>` : ''}
    <div class="report-kpis"><div><b>${N(s.total)}</b><span>Participating respondents</span></div><div><b>${N(s.banks)}</b><span>Banks with ${s.k}+ respondents</span></div><div><b>${s.k}</b><span>Minimum group size shown</span></div></div>
    <h2>Question</h2><p>${h(s.question)}</p>
    <h2>Results</h2>${s.options.map(o => bandHtml(o, false)).join('')}${s.multi_select ? '<p class="small muted">Several options could be chosen, so percentages add up to more than 100%.</p>' : ''}
    ${bd('Breakdown by scale', s.by_scale)}${bd('Breakdown by gender', s.by_gender)}
    <h2>Methodology</h2><dl class="meth">${mrows.map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>
    ${r.submissions && r.submissions.length ? `<h2>Where this report was shared</h2><ul>${r.submissions.map(x => `<li><b>${h(x.recipient)}</b>, ${h(D(x.at))}. ${h(x.purpose)}</li>`).join('')}</ul>` : ''}
  </article>
</div></div>`;
  }
};

/* Community */
views.community = {
  async load() { try { S.community = await rpc('bv_community_stats'); } catch { S.community = null; } },
  html() {
    const c = S.community;
    if (!c) return `${pageHead('Community', '')}<div class="wrap page-body"><div class="empty"><b>Community numbers could not be loaded</b>Please try again in a few minutes.</div></div>`;
    if (c.hidden) return `${pageHead('Community', 'Who is taking part.')}<div class="wrap page-body"><div class="empty"><b>Numbers appear once ${c.k} bankers have registered</b>${c.total} so far. Small numbers are never shown, to protect identities.</div></div>`;
    const grp = (title, bd) => !bd || !bd.shown ? `<div class="card"><h2>${title}</h2><p class="muted">Not shown yet. Every group needs at least ${c.k} participants.</p></div>`
      : `<div class="card"><h2>${title}</h2>${bd.groups.map(g => `<div class="hbar"><span>${h(g.label)}</span><div class="bar"><i style="width:${(g.n / c.total * 100).toFixed(1)}%"></i></div><span class="n">${(g.n / c.total * 100).toFixed(0)}%</span></div>`).join('')}</div>`;
    const banks = c.banks && c.banks.list.length ? c.banks.list.map(b => `<div class="hbar"><span>${h(b.label)}</span><div class="bar"><i style="width:${(b.n / c.banks.list[0].n * 100).toFixed(1)}%"></i></div><span class="n">${N(b.n)}</span></div>`).join('') + (c.banks.other ? `<div class="hbar"><span>Other banks</span><div class="bar"><i style="width:${(c.banks.other / c.banks.list[0].n * 100).toFixed(1)}%;background:var(--mist)"></i></div><span class="n">${N(c.banks.other)}</span></div>` : '') : '<p class="muted">No bank has reached the minimum group size yet.</p>';
    const weekly = (c.weekly || []).map(w => ({ label: D(w.week, { day: 'numeric', month: 'short' }), n: w.n }));
    return `${pageHead('Community', 'Who is taking part. Groups smaller than ' + c.k + ' are never shown.')}
<div class="wrap page-body"><div class="stack">
  <div class="stat-grid"><div class="stat"><b>${N(c.total)}</b><span>Registered participants</span></div><div class="stat"><b>${c.banks.list.length}</b><span>Banks with ${c.k}+ participants</span></div></div>
  <div class="card"><h2>Participants by bank</h2>${banks}</div>
  <div class="row" style="align-items:stretch;gap:26px"><div style="flex:1;min-width:280px">${grp('By scale', c.by_scale)}</div><div style="flex:1;min-width:280px">${grp('By gender', c.by_gender)}</div></div>
  ${weekly.length ? `<div class="card chart"><h2>New participants per week</h2>${barsSvg(weekly, { label: 'New participants per week' })}</div>` : ''}
  <p class="notep">These numbers describe people who registered on this platform, not the whole banking workforce.</p>
</div></div>`;
  }
};

/* Updates */
const FEED_ICON = { announcement: I.megaphone, poll: I.poll, closing: I.poll, report: I.report, commitment: I.tracker, question: I.question };
views.updates = {
  needs: 'member',
  async load() { await loadFeed(); },
  html() {
    const seen = local.get('bv_feed_seen') || 0;
    return `${pageHead('Updates', 'New polls, reports, answers and tracker changes.')}
<div class="wrap page-body"><div class="stack">${S.feed.length ? `<div class="feed">${S.feed.map(f => `<div class="feed-item ${new Date(f.at).getTime() > seen ? 'new' : ''}"><span class="fi">${FEED_ICON[f.type] || I.bell}</span><div><b>${h(f.title)}</b><time datetime="${h(f.at)}">${h(DT(f.at))}</time>${f.body ? `<p>${h(f.body)}</p>` : ''}</div></div>`).join('')}</div>` : '<div class="empty"><b>Nothing new yet</b>New polls, reports and answers will show up here.</div>'}</div></div>`;
  },
  after() { local.set('bv_feed_seen', Date.now()); renderNav(); }
};

/* Account */
views.account = {
  needs: 'member',
  html() {
    const me = S.me, c = me.consents || {};
    const bdg = (t, good) => `<span class="badge ${good ? 'good' : ''}">${t}</span>`;
    const link = `${location.origin}${location.pathname}?ref=${me.referral_code || ''}`;
    return `${pageHead('Account', 'Only you can see this page.')}
<div class="wrap page-body"><div class="stack">
  ${suspendedBanner()}
  <section class="card"><h2>Your details</h2><p class="hintx">Other participants never see these details.</p>
    <dl class="profile" style="margin-top:8px">
      <div><dt>Name</dt><dd>${h(me.name)}</dd></div>
      <div><dt>Email</dt><dd>${h(me.email)} ${bdg('Email verified', me.email_verified)}</dd></div>
      <div><dt>Mobile</dt><dd>+91 ${h(me.mobile)} ${bdg(me.mobile_verified ? 'Mobile verified' : 'Mobile not verified', me.mobile_verified)}</dd></div>
      <div><dt>Bank</dt><dd>${h(me.bank)} ${bdg('Self-declared')}</dd></div>
      <div><dt>Gender</dt><dd>${h(me.gender)}</dd></div>
      <div><dt>Scale</dt><dd>${h(me.scale)}</dd></div>
      <div><dt>Activity</dt><dd>${me.polls_answered} polls answered, ${me.issues_submitted} issues raised, ${me.questions_submitted || 0} questions asked</dd></div>
    </dl></section>
  <section class="card"><h2>Invite other bankers</h2>
    <p class="muted">Your invite link carries a code, not your name. Bankers who register with it are counted below.</p>
    <p><b>${h(me.referral_code || '')}</b> &nbsp; <span class="muted">${N(me.referred_count)} registered with your link</span></p>
    <div class="row"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Bankers Voice India, a private platform for bankers to express their views. Join here: ' + link)}">Share on WhatsApp</a>
    <button class="btn alt" type="button" data-act="copy" data-text="${h(link)}">Copy link</button></div><p class="msg" id="shareMsg" role="status"></p></section>
  <section class="card"><h2>Your consents</h2>
    <div class="consents" style="border:0;padding-top:10px">
      <label class="choice"><input type="checkbox" checked disabled><span>Participation (required, accepted)</span></label>
      <label class="choice"><input type="checkbox" checked disabled><span>Aggregated, anonymised reporting (required, accepted)</span></label>
      <label class="choice"><input type="checkbox" data-consent="updates" ${c.updates ? 'checked' : ''}><span>Receive platform updates</span></label>
      <label class="choice"><input type="checkbox" data-consent="future_contact" ${c.future_contact ? 'checked' : ''}><span>Be contacted about future surveys</span></label>
    </div><p class="msg" id="consentMsg" role="status"></p>
    <p class="hintx" style="margin-top:8px">To withdraw a required consent, delete your account below.</p></section>
  <section class="card"><h2>Session and data</h2>
    <div class="row" style="margin-top:12px"><button class="btn alt" data-act="signout" type="button">Log out</button>${me.role ? '<a class="btn alt" href="admin.html">Admin dashboard</a>' : ''}</div>
    <details style="margin-top:22px"><summary style="cursor:pointer;font-weight:800;color:var(--danger)">Delete my account</summary>
      <p style="margin-top:10px">This permanently removes your name, mobile, email and login. Answers you already gave stay in the combined results, unlinked from you. This cannot be undone.</p>
      <div class="field"><label for="delConfirm">Type DELETE to confirm</label><input id="delConfirm" type="text" autocomplete="off"></div>
      <button class="btn danger" id="delBtn" data-act="delete" type="button" disabled>Delete my account</button><p class="msg" id="delMsg" role="alert"></p></details></section>
</div></div>`;
  },
  after() {
    $$('[data-consent]').forEach(cb => cb.addEventListener('change', async () => {
      const m = $('#consentMsg'); msg(m, 'info', 'Saving…');
      try { await rpc('bv_set_consent', { p_purpose: cb.dataset.consent, p_granted: cb.checked }); S.me.consents[cb.dataset.consent] = cb.checked; msg(m, 'ok', 'Saved.'); }
      catch (e) { cb.checked = !cb.checked; msg(m, 'err', errText(e)); }
    }));
    $('#delConfirm').addEventListener('input', e => { $('#delBtn').disabled = e.target.value.trim() !== 'DELETE'; });
  }
};

views.methodology = {
  html() {
    const row = (t, d) => `<div><dt>${t}</dt><dd>${d}</dd></div>`;
    return `${pageHead('Methodology', 'How we collect, protect and report what participants say.')}
<div class="wrap narrow page-body"><div class="stack">
  <section class="card"><h2>Every survey states</h2>
    <dl class="meth">
      ${row('Who', 'Registered participants who answered the poll.')}${row('When', 'Survey start and end dates.')}${row('How', 'How participants were invited: through the platform and links shared by other participants.')}
      ${row('Verification', 'Email verified by one-time code. Mobile not yet verified. Bank, gender and scale are self-declared.')}${row('Sample', 'Number of unique respondents.')}
      ${row('Duplicate control', 'One account per verified email and mobile number, and one response per person per poll.')}${row('Limitations', 'Participants chose to take part. Results describe participating users only, not all bankers.')}${row('Results', 'Raw count and percentage.')}
    </dl></section>
  <section class="card"><h2>Five promises</h2>
    <ol style="margin:0;padding-left:20px;display:grid;gap:8px"><li><b>Identity privacy.</b> Your name, mobile and email are never shown to other participants.</li><li><b>Transparent method.</b> Every report shows how it was made.</li><li><b>One person, one response</b> where a poll allows only one.</li><li><b>No silent changes.</b> Poll results cannot be edited, and every admin action is logged.</li><li><b>Facts, opinions and official responses are kept apart</b> and labelled.</li></ol></section>
  <section class="card"><h2>How small groups are protected</h2><p>A breakdown by scale, gender or bank is shown only when every group in it has at least ${K()} people. If even one group is smaller, the whole breakdown is hidden, so nobody can work out a small group by subtracting.</p></section>
</div></div>`;
  }
};
views.privacy = {
  html() {
    return `${pageHead('Privacy notice', '')}<div class="wrap narrow page-body"><section class="card legal">
<p class="draft">Draft. This text must be reviewed by a qualified lawyer against India's Digital Personal Data Protection Act, 2023 before public launch.</p>
<h2>What we collect</h2><p>Your name, mobile number, email address, bank (as you declare it), gender, scale and, optionally, your state. We also record your answers to polls, your support for issues and questions, any issues or questions you submit, and the consents you give.</p>
<h2>Why we collect it</h2><p>To let you take part, to prevent duplicate accounts, and to produce combined results and reports about participating users.</p>
<h2>What others can see</h2><p>Other participants never see your name, mobile, email or any account ID. Results are shown only as totals and percentages, and breakdowns appear only for groups of at least ${K()} people.</p>
<h2>How your answers are stored</h2><p>Your answers are stored under a scrambled key that is kept apart from your contact details. Administrators can search contact details only with a privacy role and two-step verification, and every search is logged.</p>
<h2>Sharing</h2><p>Any report shared outside the platform contains combined figures only, for the purposes stated in the report. We will not share your contact details.</p>
<h2>Your choices</h2><p>You can withdraw optional consents and delete your account from the Account page. Answers already given remain in combined results, unlinked from you.</p>
<h2>Contact</h2><p>[Add grievance / privacy contact here before launch.]</p></section></div>`;
  }
};
views.terms = {
  html() {
    return `${pageHead('Terms of use', '')}<div class="wrap narrow page-body"><section class="card legal">
<p class="draft">Draft. Have these terms reviewed by a qualified lawyer before public launch.</p>
<h2>Purpose</h2><p>Bankers Voice India lets bank employees express views and see combined results. It is independent and not run by any bank, union, association or authority.</p>
<h2>Your account</h2><p>Give accurate details and keep one account. Your bank is self-declared and is not checked yet.</p>
<h2>Conduct</h2><p>Do not harass, threaten or defame anyone. Do not present allegations as facts. Do not share confidential bank information or personal records. Issues and questions are moderated and may be edited, declined or removed.</p>
<h2>What results mean</h2><p>Results show the views of participating users only. They are not the views of all bankers.</p>
<h2>Changes</h2><p>We may update these terms and will tell you about material changes.</p></section></div>`;
  }
};

/* ───────── shared behaviours ───────── */
function startResendTimer() {
  clearInterval(S.timer);
  const btn = $('#resendBtn'); if (!btn) return;
  let left = CONFIG.RESEND_SECONDS;
  const tick = () => {
    if (!$('#resendBtn')) return clearInterval(S.timer);
    btn.disabled = left > 0; btn.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code';
    left--; if (left < -1) clearInterval(S.timer);
  };
  tick(); S.timer = setInterval(tick, 1000);
}
async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  store.set('bv_email', email);
}
async function register(p) {
  await rpc('bv_register', { p_name: p.name, p_mobile: p.mobile, p_bank: p.bank, p_gender: p.gender, p_scale: p.scale, p_state: p.state || null, p_consents: p.consents, p_ref: store.get('bv_ref') || null });
  store.del('bv_reg'); store.set('bv_justRegistered', true);
  await loadMe(); loadFeed();
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function onJoin(ev) {
  ev.preventDefault();
  const m = $('#joinMsg'), btn = $('#joinBtn');
  const v = { name: $('#name').value.trim(), email: $('#email').value.trim().toLowerCase(), mobile: $('#mobile').value.replace(/\D/g, ''), bank: $('#bank').value,
    gender: ($$('input[name=gender]').find(x => x.checked) || {}).value || '', scale: $('#scale').value, state: $('#state').value,
    consents: { participation: $('#c_participation').checked, reporting: $('#c_reporting').checked, updates: $('#c_updates').checked, future_contact: $('#c_future').checked } };
  if (v.name.length < 2) return msg(m, 'err', 'Enter your full name.');
  if (!EMAIL_RE.test(v.email)) return msg(m, 'err', 'Enter a valid email address.');
  let mob = v.mobile; if (mob.length === 12 && mob.startsWith('91')) mob = mob.slice(2); if (mob.length === 11 && mob.startsWith('0')) mob = mob.slice(1);
  if (!/^[6-9]\d{9}$/.test(mob)) return msg(m, 'err', 'Enter a valid 10-digit Indian mobile number.');
  v.mobile = mob;
  if (!v.bank) return msg(m, 'err', 'Select your bank.');
  if (!v.gender) return msg(m, 'err', 'Select an option for gender.');
  if (!v.scale) return msg(m, 'err', 'Select your scale.');
  if (!v.consents.participation || !v.consents.reporting) return msg(m, 'err', 'Accept the two required consents to continue.');
  btn.disabled = true;
  try {
    if (S.session) { msg(m, 'info', 'Saving…'); await register(v); renderNav(); location.hash = '#/home'; }
    else { msg(m, 'info', 'Sending code…'); store.set('bv_reg', v); await sendCode(v.email); location.hash = '#/verify'; }
  } catch (e) { msg(m, 'err', errText(e)); btn.disabled = false; }
}
async function onLogin(ev) {
  ev.preventDefault();
  const m = $('#loginMsg'), btn = $('#loginBtn'), email = $('#lemail').value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return msg(m, 'err', 'Enter a valid email address.');
  btn.disabled = true; msg(m, 'info', 'Sending code…');
  try { store.del('bv_reg'); await sendCode(email); location.hash = '#/verify'; }
  catch (e) { msg(m, 'err', errText(e)); btn.disabled = false; }
}
async function onResend() {
  const m = $('#verifyMsg'), email = store.get('bv_email');
  if (!email) { location.hash = '#/login'; return; }
  $('#resendBtn').disabled = true; msg(m, 'info', 'Sending a new code…');
  try { await sendCode(email); msg(m, 'ok', 'A new code is on its way.'); startResendTimer(); }
  catch (e) { msg(m, 'err', errText(e)); startResendTimer(); }
}
async function onVerify(ev) {
  ev.preventDefault();
  const m = $('#verifyMsg'), btn = $('#verifyBtn'), email = store.get('bv_email'), token = $('#code').value.replace(/\s/g, '');
  if (!email) { location.hash = '#/login'; return; }
  if (!/^\d{6,10}$/.test(token)) return msg(m, 'err', 'Enter the numeric code from your email.');
  btn.disabled = true; msg(m, 'info', 'Checking…');
  try {
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    S.session = data.session; await loadMe();
    if (!S.me) { const reg = store.get('bv_reg'); if (reg && reg.email === email) { msg(m, 'info', 'Finishing registration…'); await register(reg); } }
    if (S.me) loadFeed();
    renderNav();
    location.hash = S.me ? '#/home' : '#/join';
  } catch (e) { msg(m, 'err', errText(e)); btn.disabled = false; }
}
async function onIssue(ev) {
  ev.preventDefault();
  const m = $('#issueMsg'), btn = $('#issueBtn'), title = $('#ititle').value.trim(), category = $('#icat').value, description = $('#idesc').value.trim();
  if (title.length < 8) return msg(m, 'err', 'Give the issue a title of at least 8 characters.');
  if (!category) return msg(m, 'err', 'Choose a category.');
  if (description.length < 20) return msg(m, 'err', 'Describe the issue in at least 20 characters.');
  btn.disabled = true; msg(m, 'info', 'Submitting…');
  try { await rpc('bv_submit_issue', { p_title: title, p_category: category, p_description: description }); $('#issueForm').reset(); msg(m, 'ok', 'Submitted for review. It is published only after moderation.'); }
  catch (e) { msg(m, 'err', errText(e)); }
  btn.disabled = false;
}
async function onQuestion(ev) {
  ev.preventDefault();
  const m = $('#questionMsg'), btn = $('#questionBtn'), title = $('#qtitle').value.trim(), ctx = $('#qctx').value.trim();
  if (title.length < 10) return msg(m, 'err', 'Write your question in at least 10 characters.');
  btn.disabled = true; msg(m, 'info', 'Submitting…');
  try { await rpc('bv_submit_question', { p_title: title, p_context: ctx || null }); $('#questionForm').reset(); msg(m, 'ok', 'Submitted for review. It is published only after moderation.'); }
  catch (e) { msg(m, 'err', errText(e)); }
  btn.disabled = false;
}

document.addEventListener('change', ev => {
  const inp = ev.target.closest('.ballot input'); if (!inp) return;
  const id = inp.closest('[data-ballot]').dataset.ballot;
  if (inp.type === 'radio') S.sel[id] = new Set([inp.value]);
  else { const s = S.sel[id] || (S.sel[id] = new Set()); inp.checked ? s.add(inp.value) : s.delete(inp.value); }
  const m = $(`[data-msg="${CSS.escape(id)}"]`); if (m && m.classList.contains('err')) msg(m, '', '');
});

document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'vote') return castVote(el.dataset.poll, el);
  if (act === 'scroll-how') { const t = $('#how'); if (t) t.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  if (act === 'register-to-vote') { const ids = Array.from(S.sel[el.dataset.poll] || []); if (ids.length) store.set('bv_pending', { pollId: el.dataset.poll, ids }); location.hash = '#/join'; return; }
  if (act === 'change') { const p = S.polls.find(x => x.id === el.dataset.poll); if (!p) return; S.sel[p.id] = new Set(p.my_options || []); p.editing = true; refreshCard(p); return; }
  if (act === 'copy') { const m = $('#shareMsg'); try { await navigator.clipboard.writeText(el.dataset.text); msg(m, 'ok', 'Copied. Paste it into any chat.'); } catch { msg(m, 'err', 'Could not copy. Select and copy the text manually.'); } return; }
  if (act === 'tab') { S.voiceTab = el.dataset.tab; $$('[data-act=tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === S.voiceTab))); $('#voiceBody').innerHTML = voiceBody(); return; }
  if (act === 'filter') { S.trackFilter = el.dataset.f; const v = views.tracker; setMain(v.html(), 'Commitment tracker'); return; }
  if (act === 'stance') {
    const i = S.issues.find(x => String(x.id) === el.dataset.id); if (!i) return;
    const next = i.mine === el.dataset.stance ? 'clear' : el.dataset.stance;
    try { await rpc('bv_issue_support', { p_issue_id: Number(el.dataset.id), p_stance: next }); await loadIssues(); $('#voiceBody').innerHTML = voiceBody(); }
    catch (e) { alert(errText(e)); }
    return;
  }
  if (act === 'qvote') {
    try { await rpc('bv_question_vote', { p_question_id: Number(el.dataset.id) }); await loadQuestions(); $('#voiceBody').innerHTML = voiceBody(); }
    catch (e) { alert(errText(e)); }
    return;
  }
  if (act === 'print') { window.print(); return; }
  if (act === 'csv') {
    const blob = new Blob(['\ufeff' + reportCsv(S.report)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bankers-voice-report-${S.report.id}.csv`; document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  if (act === 'signout') { await sb.auth.signOut(); S.session = null; S.me = null; S.feed = []; store.del('bv_justRegistered'); renderNav(); location.hash = '#/'; return; }
  if (act === 'delete') {
    const m = $('#delMsg'); el.disabled = true; msg(m, 'info', 'Deleting…');
    try { await rpc('bv_delete_account'); await sb.auth.signOut().catch(() => {}); S.session = null; S.me = null; S.feed = []; ['bv_reg', 'bv_email', 'bv_pending', 'bv_justRegistered'].forEach(store.del); renderNav(); location.hash = '#/'; }
    catch (e) { msg(m, 'err', errText(e)); el.disabled = false; }
  }
});

/* ───────── router ───────── */
async function routeInner() {
  clearInterval(S.timer);
  const raw = location.hash.replace(/^#\/?/, '');
  const [path] = raw.split('?');
  const [name, arg] = path.split('/');
  const key = views[name || ''] ? (name || '') : '';
  const v = views[key];
  CURRENT = key;
  if (v.needs === 'member') { if (!S.session) { location.hash = '#/login'; return; } if (!S.me) { location.hash = '#/join'; return; } }
  if ((key === 'join' || key === 'login') && S.me) { location.hash = '#/home'; return; }
  if (key === 'verify' && !store.get('bv_email')) { location.hash = '#/login'; return; }
  renderNav();
  if (v.load) { setMain('<p class="loading">Loading…</p>'); await v.load(arg); }
  const titles = { join: 'Register', login: 'Log in', verify: 'Verify', home: 'Polls', voice: 'Voice', tracker: 'Commitment tracker', reports: 'Reports', report: 'Report', community: 'Community', updates: 'Updates', account: 'Account', methodology: 'Methodology', privacy: 'Privacy notice', terms: 'Terms of use' };
  setMain(v.html(arg), titles[key]);
  if (v.after) v.after();
  window.__bvReady = true;
}
async function route() {
  try { await routeInner(); }
  catch (e) { window.BV.fatal('Something went wrong', 'Reload the page. If it keeps happening, send the detail below to the developer.', e && e.message); }
}
window.addEventListener('hashchange', route);

/* ───────── boot ───────── */
(async function boot() {
  try {
    const { data } = await window.BV.withTimeout(sb.auth.getSession(), 6000);
    S.session = data.session;
    if (S.session) await loadMe();
  } catch {}
  sb.auth.onAuthStateChange((ev, ses) => { S.session = ses; if (ev === 'SIGNED_OUT') { S.me = null; S.feed = []; } });
  await route();
  if (S.me) loadFeed();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
