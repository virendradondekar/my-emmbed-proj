/**
 * app.js — Main application logic
 * Talks to backend via api.js, renders UI, manages state.
 */

// ── APP STATE ──
const ST = {
  accounts:      [],
  items:         [],
  settings:      {},
  integration:   { enabled: false, connectedAccts: {} },
  activity:      [],
  notifications: [],
  activeAcctId:  null,
  selectedAccts: [],   // for multi-account view
  filter:        'all',
  sort:          'days',
  sortDir:       1,
  searchQ:       '',
  currentPage:   'dashboard',
  settingsTab:   'accounts',
  vsWizardAcctId: null,
  vsServiceId: 'rowo0bqrhj5g',
  slack: { connected:false, enabled:false },
  invoices: [],
};

async function finishGmailConnection(authId, acctId) {
  try {
    const result=await API.connectGmail(acctId, authId);
    ST.integration=result.integration||result;
    refreshAll();
    renderIntegrationsPage();
    toast('Gmail connected. New emails will be analyzed automatically.', 'success');
  } catch(error) {
    toast(error.message, 'error');
  }
}

// ── INIT ──
async function init() {
  try {
    const session=await API.getSession();
    if(!session.authenticated){ window.location.replace('/login.html'); return; }
    document.body.classList.remove('auth-pending');
    applyTheme(localStorage.getItem('subtrack-theme')||'dark');
    const [accounts, items, settings, integration, activity, notifications] = await Promise.all([
      API.getAccounts(),
      API.getItems(),
      API.getSettings(),
      API.getIntegration(),
      API.getActivity(),
      API.getNotifications(),
    ]);
    ST.accounts      = accounts;
    ST.items         = items;
    ST.settings      = settings;
    ST.integration   = integration;
    ST.slack         = await API.getSlackStatus().catch(()=>ST.slack);
    ST.activity      = activity;
    ST.notifications = notifications;
    ST.activeAcctId  = accounts[0]?.id || null;

    renderSidebarAcct();
    renderAcctFilterBar();
    refreshAll();
    updateNavBadges();
  } catch(e) {
    console.error('Init failed:', e);
    toast('Could not connect to server. Is the backend running?', 'error');
  }
}

// ── ACTIVE ITEMS ──
function activeItems() {
  const ids = ST.selectedAccts.length ? ST.selectedAccts : [ST.activeAcctId];
  return ST.items.filter(i => ids.includes(i.acctId));
}
function filteredItems() {
  let it = activeItems();
  if (ST.filter !== 'all') it = it.filter(i => i.category === ST.filter);
  if (ST.searchQ) it = it.filter(i =>
    (i.name||'').toLowerCase().includes(ST.searchQ) ||
    (i.category||'').toLowerCase().includes(ST.searchQ) ||
    (i.plan||'').toLowerCase().includes(ST.searchQ) ||
    (i.notes||'').toLowerCase().includes(ST.searchQ)
  );
  it.sort((a,b) => {
    let av, bv;
    if (ST.sort==='name')     { av=a.name; bv=b.name; return ST.sortDir*(av<bv?-1:1); }
    if (ST.sort==='category') { av=a.category; bv=b.category; return ST.sortDir*(av<bv?-1:1); }
    if (ST.sort==='cost')     { av=monthlyEq(a.cost,a.cycle); bv=monthlyEq(b.cost,b.cycle); }
    else                      { av=daysLeft(a.expiry); bv=daysLeft(b.expiry); }
    return ST.sortDir*(av-bv);
  });
  return it;
}
function acctById(id) { return ST.accounts.find(a=>a.id===id) || { name:'?', email:'', color:'#4F8EF7' }; }

// ── REFRESH ALL ──
function refreshAll() {
  renderStats();
  renderTable();
  renderTimeline();
  renderSpend();
  renderActivity();
  renderVsBanner();
  updateNavBadges();
}

function applyTheme(theme){
  const selected=theme==='light'?'light':'dark';
  document.documentElement.dataset.theme=selected;
  localStorage.setItem('subtrack-theme',selected);
  const btn=document.getElementById('themeToggle');
  if(btn) btn.textContent=selected==='dark'?'☀ Light':'☾ Dark';
}
function toggleTheme(){ applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'); }
async function logout(){ try{await API.logout();}finally{window.location.replace('/login.html');} }

async function loadInvoices(){
  try{ST.invoices=await API.getInvoices();renderInvoices();}
  catch(e){toast(e.message,'error');}
}
function renderInvoices(){
  const body=document.getElementById('invoiceBody'),empty=document.getElementById('invoiceEmpty');
  if(!body)return;
  const rows=ST.invoices||[];
  if(!rows.length){body.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  body.innerHTML=rows.map(i=>{let link='';try{const u=new URL(i.emailUrl||'');if(u.protocol==='https:'&&u.hostname==='mail.google.com')link=`<a href="${esc(u.href)}" target="_blank" rel="noopener">Open email ↗</a>`;}catch(_){}return `<tr><td>${esc(i.purchaseDate||'—')}</td><td><div class="prod-name">${esc(i.vendor||'Unknown vendor')}</div><div class="prod-sub">${esc(i.subject||'')}</div>${i.needsReview?'<span class="pill pill-yel">Review extraction</span>':''}</td><td><span class="pill pill-blue">${esc(i.kind||'purchase')}</span></td><td>${esc(i.invoiceNumber||'—')}</td><td>${esc(i.currency||'')} ${esc(i.amount||'—')}</td><td>${link||esc(i.sender||'—')}</td><td>${i.canReply?`<button class="btn btn-ghost btn-sm" onclick="openReplyModal('${esc(i.id)}')">↩ Reply${i.replies?.length?` (${i.replies.length})`:''}</button>`:''}</td></tr>`}).join('');
}
let replyInvoiceId=null;
function openReplyModal(id){
  const inv=(ST.invoices||[]).find(x=>x.id===id);if(!inv)return;
  replyInvoiceId=id;
  document.getElementById('replyModalTitle').textContent=`Reply: ${inv.subject||'email'}`;
  document.getElementById('replyModalSub').textContent=`To ${inv.sender||'sender'}`;
  document.getElementById('replyPreview').textContent=inv.emailPreview||'No preview available for this email.';
  document.getElementById('replyHistory').innerHTML=(inv.replies||[]).map(r=>`<div class="reply-sent"><strong>You replied · ${esc(new Date(r.sentAt).toLocaleString())}</strong>\n${esc(r.message)}</div>`).join('');
  document.getElementById('replyMode').value='sender';
  document.getElementById('replyCcWrap').style.display='none';
  document.getElementById('replyCc').value='';
  document.getElementById('replyMessage').value='';
  document.getElementById('replyError').textContent='';
  document.getElementById('replyModal').classList.add('open');
  document.getElementById('replyMessage').focus();
}
function closeReplyModal(){document.getElementById('replyModal')?.classList.remove('open');replyInvoiceId=null;}
async function sendInvoiceReply(){
  const message=document.getElementById('replyMessage').value.trim();
  const err=document.getElementById('replyError');const btn=document.getElementById('replySendBtn');
  if(!message){err.textContent='Write a reply first.';return;}
  btn.disabled=true;btn.textContent='Sending…';err.textContent='';
  try{
    const {invoice}=await API.replyInvoice(replyInvoiceId,{message,replyMode:document.getElementById('replyMode').value,cc:document.getElementById('replyCc').value.trim()});
    ST.invoices=ST.invoices.map(x=>x.id===invoice.id?invoice:x);
    renderInvoices();closeReplyModal();toast('Reply sent from Gmail.','success');
  }catch(e){err.textContent=e.message;}
  finally{btn.disabled=false;btn.textContent='Send reply';}
}

// ── NAV BADGES ──
function updateNavBadges() {
  const it = activeItems();
  const expiring = it.filter(i => { const d=daysLeft(i.expiry); return d>=0&&d<=30; }).length;
  const expired  = it.filter(i => daysLeft(i.expiry)<0).length;
  const urgent   = expiring + expired;
  const unread   = ST.notifications.filter(n=>n.unread).length;
  const linked   = Object.values(ST.integration?.connectedAccts||{}).filter(x=>x.linked).length;

  const nbExp  = document.getElementById('nbExpiring');
  const nbNotif= document.getElementById('nbNotif');
  const nbInteg= document.getElementById('nbInteg');
  const nDot   = document.getElementById('notifDot');

  if(nbExp)   { nbExp.textContent=urgent; nbExp.style.display=urgent?'':'none'; }
  if(nbNotif) { nbNotif.textContent=unread; nbNotif.style.display=unread?'':'none'; }
  if(nbInteg) { nbInteg.style.display=linked?'none':''; }
  if(nDot)    { nDot.style.display=unread?'':'none'; }
}

// ── STATS ──
function renderStats() {
  const el = document.getElementById('statsRow'); if(!el) return;
  const it = activeItems();
  let mo=0, expired=0, expiring=0, active=0;
  it.forEach(i => {
    mo += monthlyEq(i.cost, i.cycle);
    const d = daysLeft(i.expiry);
    if (d<0) expired++; else if (d<=30) expiring++; else active++;
  });
  el.innerHTML = `
    <div class="stat s-acc"><div class="stat-lbl">Total items</div><div class="stat-val">${it.length}</div><div class="stat-foot">${ST.accounts.length} account${ST.accounts.length!==1?'s':''} tracked</div></div>
    <div class="stat s-grn"><div class="stat-lbl">Monthly spend</div><div class="stat-val" style="font-size:20px">₹${Math.round(mo).toLocaleString('en-IN')}</div><div class="stat-foot">₹${Math.round(mo*12).toLocaleString('en-IN')} / year</div></div>
    <div class="stat s-yel"><div class="stat-lbl">Expiring ≤30d</div><div class="stat-val" style="color:var(--yel)">${expiring}</div><div class="stat-foot">needs attention</div></div>
    <div class="stat s-red"><div class="stat-lbl">Expired</div><div class="stat-val" style="color:var(--red)">${expired}</div><div class="stat-foot">overdue renewal</div></div>
    <div class="stat s-pur"><div class="stat-lbl">Active</div><div class="stat-val" style="color:var(--pur)">${active}</div><div class="stat-foot">running fine</div></div>`;
}

// ── TABLE ──
function renderTable() {
  const items = filteredItems();
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('tableEmpty');
  if (!tbody) return;
  if (!items.length) { tbody.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if (empty) empty.style.display='none';
  tbody.innerHTML = items.map(item => {
    const st  = statusOf(item.expiry);
    const acc = acctById(item.acctId);
    const mo  = monthlyEq(item.cost, item.cycle);
    const draftBadge = item.isDraft ? `<span class="pill pill-yel" style="font-size:10px;margin-left:6px">draft</span>` : '';
    return `<tr class="${item.isDraft?'draft-row':''}">
      <td><div class="prod-cell">
        <div class="prod-icon" style="background:${hexAlpha(CAT_COLOR[item.category]||'#4F607A',.15)}">${CAT_ICON[item.category]||'📦'}</div>
        <div><div class="prod-name">${esc(item.name)}${draftBadge}</div><div class="prod-sub">${esc(item.plan||'—')}</div></div>
      </div></td>
      <td>${catPillHTML(item.category)}</td>
      <td>${ownerChipHTML(acc)}</td>
      <td><div class="cost-main">₹${Number(item.cost||0).toLocaleString('en-IN')}</div>
          <div class="cost-sub">${item.cycle}${mo>0&&item.cycle!=='monthly'?' · ₹'+Math.round(mo)+'/mo':''}</div></td>
      <td style="font-family:var(--mono);font-size:12px">${fmtDate(item.expiry)}</td>
      <td>${daysBarHTML(item.expiry)}</td>
      <td><span class="pill ${st.c}"><span class="pill-dot"></span>${st.l}</span></td>
      <td><div class="row-actions">
        ${item.isDraft?`<button class="ib ok" onclick="confirmItem('${item.id}')" title="Confirm">✓</button>`:''}
        <button class="ib" onclick="openItemModal('${item.id}')" title="Edit">✎</button>
        <button class="ib del" onclick="deleteItem('${item.id}')" title="Delete">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ── TIMELINE ──
function renderTimeline() {
  const el = document.getElementById('timeline'); if(!el) return;
  const upcoming = activeItems()
    .filter(i => { const d=daysLeft(i.expiry); return d>=0&&d<=60; })
    .sort((a,b) => daysLeft(a.expiry)-daysLeft(b.expiry))
    .slice(0,8);
  if (!upcoming.length) { el.innerHTML='<div style="text-align:center;padding:20px;color:var(--tx3);font-size:12px">🎉 No renewals in the next 60 days</div>'; return; }
  const dot = d => d<=7?'var(--red)':d<=30?'var(--yel)':'var(--grn)';
  el.innerHTML = upcoming.map(i => {
    const d = daysLeft(i.expiry);
    const acc = acctById(i.acctId);
    return `<div class="tl-row">
      <div class="tl-date">${fmtDateShort(i.expiry)}</div>
      <div class="tl-dot" style="background:${dot(d)}"></div>
      <div class="tl-info">
        <div class="tl-name">${esc(i.name)}</div>
        <div class="tl-detail">${esc(acc.name)} · ${d}d · ₹${Number(i.cost||0).toLocaleString('en-IN')}</div>
      </div>
    </div>`;
  }).join('');
}

// ── SPEND ──
function renderSpend() {
  const el = document.getElementById('spendList'); if(!el) return;
  const bycat = {};
  activeItems().forEach(i => { const m=monthlyEq(i.cost,i.cycle); bycat[i.category]=(bycat[i.category]||0)+m; });
  const sorted = Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const maxv = sorted.length ? sorted[0][1] : 1;
  el.innerHTML = sorted.map(([cat,amt]) =>
    `<div class="spend-row">
      <div class="spend-lbl">${CAT_ICON[cat]||''} ${cat}</div>
      <div class="spend-bar-w"><div class="spend-bar-f" style="width:${(amt/maxv)*100}%;background:${CAT_COLOR[cat]||'#6B7A99'}"></div></div>
      <div class="spend-amt">₹${Math.round(amt).toLocaleString('en-IN')}</div>
    </div>`
  ).join('') || '<div style="color:var(--tx3);font-size:12px;text-align:center;padding:16px">No spend data</div>';
}

// ── ACTIVITY ──
function renderActivity() {
  const el = document.getElementById('activityList'); if(!el) return;
  if (!ST.activity.length) { el.innerHTML='<div style="color:var(--tx2);font-size:12px;padding:16px;text-align:center">No activity yet</div>'; return; }
  el.innerHTML = ST.activity.slice(0,6).map(a =>
    `<div class="act-item">
      <div class="act-ico" style="background:${a.color||'var(--acc-bg)'}">${a.ico}</div>
      <div><div class="act-txt">${esc(a.text)}</div><div class="act-time">${timeAgo(a.ts)}</div></div>
    </div>`
  ).join('');
}

// ── NOTIFICATIONS ──
function renderNotifications() {
  const el = document.getElementById('notifList'); if(!el) return;
  if (!ST.notifications.length) {
    el.innerHTML='<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">All clear</div><div class="empty-desc">No notifications at the moment.</div></div>';
    return;
  }
  el.innerHTML = ST.notifications.map(n =>
    `<div class="notif-item${n.unread?' unread':''}" onclick="markNotifRead('${n.id}')">
      <div class="notif-ico" style="background:${hexAlpha(n.color,.15)}">${n.ico}</div>
      <div style="flex:1">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-desc">${esc(n.desc)}</div>
        <div class="notif-time">${timeAgo(n.ts)}</div>
      </div>
      ${n.unread?'<div class="notif-unread-dot"></div>':''}
    </div>`
  ).join('');
}
async function markNotifRead(id) {
  await API.markRead(id).catch(()=>{});
  const n = ST.notifications.find(x=>x.id===id); if(n) n.unread=false;
  renderNotifications(); updateNavBadges();
}
async function markAllRead() {
  await API.markAllRead().catch(()=>{});
  ST.notifications.forEach(n=>n.unread=false);
  renderNotifications(); updateNavBadges();
  toast('All notifications marked as read','success');
}

// ── SPEND PAGE ──
function renderSpendPage() {
  const it = activeItems();
  let mo=0, ann=0;
  it.forEach(i => { const m=monthlyEq(i.cost,i.cycle); mo+=m; ann+=m*12; });
  const oneTime = it.filter(i=>i.cycle==='one-time').reduce((s,i)=>s+Number(i.cost||0),0);

  const ss = document.getElementById('spendStats');
  if(ss) ss.innerHTML=`
    <div class="stat s-grn"><div class="stat-lbl">Monthly total</div><div class="stat-val" style="font-size:20px">₹${Math.round(mo).toLocaleString('en-IN')}</div></div>
    <div class="stat s-acc"><div class="stat-lbl">Annual total</div><div class="stat-val" style="font-size:20px">₹${Math.round(ann).toLocaleString('en-IN')}</div></div>
    <div class="stat s-pur"><div class="stat-lbl">One-time costs</div><div class="stat-val" style="font-size:20px">₹${oneTime.toLocaleString('en-IN')}</div></div>`;

  const bycat={}; it.forEach(i=>{ bycat[i.category]=(bycat[i.category]||0)+monthlyEq(i.cost,i.cycle); });
  const sc=Object.entries(bycat).sort((a,b)=>b[1]-a[1]); const maxc=sc.length?sc[0][1]:1;
  const sl2=document.getElementById('spendList2');
  if(sl2) sl2.innerHTML=sc.map(([c,a])=>`<div class="spend-row"><div class="spend-lbl">${CAT_ICON[c]||''} ${c}</div><div class="spend-bar-w"><div class="spend-bar-f" style="width:${(a/maxc)*100}%;background:${CAT_COLOR[c]||'#6B7A99'}"></div></div><div class="spend-amt">₹${Math.round(a).toLocaleString('en-IN')}</div></div>`).join('');

  const byacct={}; it.forEach(i=>{ byacct[i.acctId]=(byacct[i.acctId]||0)+monthlyEq(i.cost,i.cycle); });
  const sa=Object.entries(byacct).sort((a,b)=>b[1]-a[1]); const maxa=sa.length?sa[0][1]:1;
  const sba=document.getElementById('spendByAcct');
  if(sba) sba.innerHTML=sa.map(([aid,amt])=>{ const a=acctById(aid); return `<div class="spend-row"><div class="spend-lbl">${esc(a.name)}</div><div class="spend-bar-w"><div class="spend-bar-f" style="width:${(amt/maxa)*100}%;background:${a.color}"></div></div><div class="spend-amt">₹${Math.round(amt).toLocaleString('en-IN')}</div></div>`; }).join('');

  const stb=document.getElementById('spendTableBody');
  if(stb) stb.innerHTML=it.map(i=>{ const m=monthlyEq(i.cost,i.cycle); const acc=acctById(i.acctId); return `<tr><td class="prod-name">${esc(i.name)}</td><td>${ownerChipHTML(acc)}</td><td>${catPillHTML(i.category)}</td><td style="font-size:12px;color:var(--tx2)">${esc(i.cycle)}</td><td class="cost-main">₹${Number(i.cost||0).toLocaleString('en-IN')}</td><td class="cost-main" style="color:var(--acc2)">₹${Math.round(m).toLocaleString('en-IN')}</td><td class="cost-main" style="color:var(--grn)">₹${Math.round(m*12).toLocaleString('en-IN')}</td></tr>`; }).join('');
}

// ── CALENDAR PAGE ──
function renderCalendar() {
  const el = document.getElementById('calendarPanel'); if(!el) return;
  const it = activeItems().filter(i=>{ const d=daysLeft(i.expiry); return d>=-7&&d<=90; }).sort((a,b)=>daysLeft(a.expiry)-daysLeft(b.expiry));
  if(!it.length){ el.innerHTML='<div class="empty"><div class="empty-ico">◫</div><div class="empty-title">No upcoming renewals</div><div class="empty-desc">Items expiring within 90 days will appear here.</div></div>'; return; }
  const groups={};
  it.forEach(i=>{ const d=daysLeft(i.expiry); let g=d<0?'Overdue':d<=7?'This week':d<=30?'This month':d<=60?'Next 60 days':'Next 90 days'; (groups[g]=groups[g]||[]).push(i); });
  const order=['Overdue','This week','This month','Next 60 days','Next 90 days'];
  el.innerHTML=order.filter(g=>groups[g]).map(g=>`
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;color:var(--tx3);margin-bottom:10px;font-family:var(--mono)">${g.toUpperCase()}</div>
      ${groups[g].map(i=>`
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--panel);border-radius:var(--r);border:1px solid var(--b1);margin-bottom:6px">
          <div class="prod-icon" style="background:${hexAlpha(CAT_COLOR[i.category]||'#4F607A',.15)}">${CAT_ICON[i.category]||'📦'}</div>
          <div style="flex:1"><div class="prod-name">${esc(i.name)}</div><div class="prod-sub">${esc(i.plan||i.category)} · ${ownerChipHTML(acctById(i.acctId))}</div></div>
          <div style="text-align:right"><div style="font-family:var(--mono);font-size:12px">${fmtDate(i.expiry)}</div><div style="font-size:11px;color:var(--tx3)">₹${Number(i.cost||0).toLocaleString('en-IN')} · ${i.cycle}</div></div>
          <span class="pill ${statusOf(i.expiry).c}" style="flex-shrink:0">${statusOf(i.expiry).l}</span>
        </div>`).join('')}
    </div>`).join('');
}

// ── SIDEBAR ACCOUNT ──
function renderSidebarAcct() {
  const a = ST.accounts.find(x=>x.id===ST.activeAcctId) || ST.accounts[0];
  if(!a) return;
  const av=document.getElementById('acctAvatar');
  const an=document.getElementById('acctName');
  const ae=document.getElementById('acctEmail');
  if(av){ av.textContent=initials(a.name); av.style.background=a.color; }
  if(an) an.textContent=a.name;
  if(ae) ae.textContent=a.email;
  const ua=document.getElementById('sbUserAvatar');
  const un=document.getElementById('sbUserName');
  const ue=document.getElementById('sbUserEmail');
  if(ua) ua.textContent=initials(ST.settings.name||'Y');
  if(un) un.textContent=ST.settings.name||'You';
  if(ue) ue.textContent=ST.settings.email||'me@example.com';
  renderAcctList();
}
function renderAcctList() {
  const ul=document.getElementById('acctList'); if(!ul) return;
  ul.innerHTML=ST.accounts.map(ac=>`
    <div class="acct-item${ac.id===ST.activeAcctId?' active-acct':''}" onclick="switchAcct('${ac.id}')">
      <div class="acct-avatar" style="background:${ac.color};color:#fff;width:22px;height:22px;font-size:9px">${initials(ac.name)}</div>
      <div class="acct-info"><div class="acct-name">${esc(ac.name)}</div><div class="acct-email">${esc(ac.email)}</div></div>
      ${ac.id===ST.activeAcctId?'<span class="check">✓</span>':''}
    </div>`).join('');
}

// ── ACCOUNT SWITCHER ──
function toggleAcctDropdown() {
  document.getElementById('acctDropdown')?.classList.toggle('show');
  document.getElementById('acctCurrent')?.classList.toggle('open');
}
function closeAcctDropdown() {
  document.getElementById('acctDropdown')?.classList.remove('show');
  document.getElementById('acctCurrent')?.classList.remove('open');
}
function switchAcct(id) {
  ST.activeAcctId=id; ST.selectedAccts=[];
  closeAcctDropdown(); renderSidebarAcct(); renderAcctFilterBar(); refreshAll();
}

// ── ACCOUNT FILTER BAR ──
function renderAcctFilterBar() {
  const bar=document.getElementById('acctFilterBar'); if(!bar) return;
  if(!ST.selectedAccts.length){ bar.classList.remove('show'); return; }
  bar.classList.add('show');
  bar.innerHTML=`<span style="font-size:12px;color:var(--tx3);margin-right:4px">Viewing:</span>`
    +ST.accounts.map(a=>`<div class="acct-chip${ST.selectedAccts.includes(a.id)?' selected':''}" onclick="toggleAcctFilter('${a.id}')">
      <div class="chip-avatar" style="background:${hexAlpha(a.color,.2)};color:${a.color}">${initials(a.name)}</div>
      ${esc(a.name)} <span style="font-size:11px;color:var(--tx3)">(${ST.items.filter(i=>i.acctId===a.id).length})</span>
    </div>`).join('')
    +`<div class="bar-sep"></div><div class="acct-chip" onclick="clearMulti()" style="color:var(--red);border-color:var(--red)">✕ Clear</div>`;
  const mb=document.getElementById('multiBanner');
  if(mb){ mb.textContent=`Viewing ${ST.selectedAccts.length} accounts`; mb.classList.toggle('show',ST.selectedAccts.length>1); }
}
function toggleAcctFilter(id) {
  const idx=ST.selectedAccts.indexOf(id);
  if(idx>-1) ST.selectedAccts.splice(idx,1); else ST.selectedAccts.push(id);
  renderAcctFilterBar(); refreshAll();
}
function clearMulti() { ST.selectedAccts=[]; renderAcctFilterBar(); refreshAll(); }

// ── MULTI SELECT MODAL ──
function openMultiSelect() {
  closeAcctDropdown();
  const body=document.getElementById('multiModalBody');
  body.innerHTML=`<div style="font-size:13px;color:var(--tx2);margin-bottom:12px">Select accounts to view together:</div>`
    +ST.accounts.map(a=>`<label style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--panel);border-radius:var(--r);margin-bottom:8px;cursor:pointer">
      <input type="checkbox" id="mc_${a.id}" ${(ST.selectedAccts.includes(a.id)||ST.activeAcctId===a.id)?'checked':''} style="accent-color:var(--acc);width:16px;height:16px">
      <div class="acct-avatar" style="background:${a.color};color:#fff;width:28px;height:28px;font-size:11px">${initials(a.name)}</div>
      <div><div style="font-size:13px;font-weight:500">${esc(a.name)}</div><div style="font-size:11px;color:var(--tx2)">${esc(a.email)} · ${ST.items.filter(i=>i.acctId===a.id).length} items</div></div>
    </label>`).join('');
  document.getElementById('multiModal')?.classList.add('open');
}
function applyMultiSelect() {
  const sel=ST.accounts.map(a=>a.id).filter(id=>document.getElementById('mc_'+id)?.checked);
  if(sel.length===1){ ST.activeAcctId=sel[0]; ST.selectedAccts=[]; }
  else { ST.selectedAccts=sel; }
  document.getElementById('multiModal')?.classList.remove('open');
  renderSidebarAcct(); renderAcctFilterBar(); refreshAll();
  toast(`Viewing ${sel.length} account${sel.length!==1?'s':''}`, 'success');
}

// ── ITEM CRUD ──
let _editItemId=null;
function openItemModal(itemId=null, defaultCat='') {
  _editItemId=itemId;
  const item = itemId ? ST.items.find(i=>i.id===itemId) : null;
  document.getElementById('itemModalTitle').textContent = item ? 'Edit item' : 'Add item';

  // Populate account dropdown
  const sel=document.getElementById('fAcct');
  sel.innerHTML=ST.accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${esc(a.email)}</option>`).join('');
  sel.value = item?.acctId || ST.activeAcctId || ST.accounts[0]?.id;

  document.getElementById('fName').value   = item?.name    || '';
  document.getElementById('fCat').value    = item?.category|| defaultCat||'';
  document.getElementById('fPlan').value   = item?.plan    || '';
  document.getElementById('fUrl').value    = item?.url     || '';
  document.getElementById('fCost').value   = item?.cost    || '';
  document.getElementById('fCurr').value   = item?.currency|| '₹ INR';
  document.getElementById('fCycle').value  = item?.cycle   || 'monthly';
  document.getElementById('fStart').value  = item?.start   || '';
  document.getElementById('fExpiry').value = item?.expiry  || '';
  document.getElementById('fKey').value    = item?.key     || '';
  document.getElementById('fSeats').value  = item?.seats   || '1';
  document.getElementById('fNotes').value  = item?.notes   || '';
  document.getElementById('itemModal')?.classList.add('open');
}
async function saveItem() {
  const name   = document.getElementById('fName').value.trim();
  const expiry = document.getElementById('fExpiry').value;
  if (!name||!expiry) { toast('Name and Expiry are required','error'); return; }
  const data = {
    acctId:   document.getElementById('fAcct').value,
    name,
    category: document.getElementById('fCat').value  || 'SaaS',
    plan:     document.getElementById('fPlan').value.trim(),
    url:      document.getElementById('fUrl').value.trim(),
    cost:     document.getElementById('fCost').value || '0',
    currency: document.getElementById('fCurr').value,
    cycle:    document.getElementById('fCycle').value,
    start:    document.getElementById('fStart').value,
    expiry,
    key:      document.getElementById('fKey').value.trim(),
    seats:    document.getElementById('fSeats').value || '1',
    notes:    document.getElementById('fNotes').value.trim(),
    isDraft:  false,
  };
  try {
    if (_editItemId) {
      const updated = await API.updateItem(_editItemId, data);
      const idx = ST.items.findIndex(i=>i.id===_editItemId);
      if(idx>-1) ST.items[idx]=updated;
      toast('Item updated','success');
    } else {
      const created = await API.createItem(data);
      ST.items.push(created);
      toast('Item added','success');
    }
    const act = await API.getActivity();
    ST.activity = act;
    document.getElementById('itemModal')?.classList.remove('open');
    refreshAll();
  } catch(e) { toast(e.message,'error'); }
}
async function confirmItem(id) {
  try {
    const updated = await API.confirmItem(id);
    const idx=ST.items.findIndex(i=>i.id===id); if(idx>-1) ST.items[idx]=updated;
    toast('Item confirmed','success'); refreshAll();
  } catch(e) { toast(e.message,'error'); }
}
async function deleteItem(id) {
  if(!confirm('Delete this item?')) return;
  try {
    await API.deleteItem(id);
    ST.items=ST.items.filter(i=>i.id!==id);
    const act=await API.getActivity(); ST.activity=act;
    toast('Item deleted','warn'); refreshAll();
  } catch(e) { toast(e.message,'error'); }
}

// ── ACCOUNT CRUD ──
let _editAcctId=null;
function openAcctModal(acctId=null) {
  closeAcctDropdown();
  _editAcctId=acctId;
  const ac = acctId ? ST.accounts.find(a=>a.id===acctId) : null;
  document.getElementById('acctModalTitle').textContent = ac ? 'Edit account' : 'Add account';
  document.getElementById('aName').value  = ac?.name  || '';
  document.getElementById('aEmail').value = ac?.email || '';
  document.getElementById('acctColorOpts').innerHTML = colorPickerHTML(ac?.color||PALETTE[0],'acctColorOpts');
  document.getElementById('acctModal')?.classList.add('open');
}
async function saveAcct() {
  const name  = document.getElementById('aName').value.trim();
  const email = document.getElementById('aEmail').value.trim();
  if(!name||!email){ toast('Name and email required','error'); return; }
  const color = getSelectedColor('acctColorOpts');
  try {
    if (_editAcctId) {
      const updated = await API.updateAccount(_editAcctId, {name,email,color});
      const idx=ST.accounts.findIndex(a=>a.id===_editAcctId); if(idx>-1) ST.accounts[idx]=updated;
      toast('Account updated','success');
    } else {
      const created = await API.createAccount({name,email,color});
      ST.accounts.push(created);
      if(!ST.activeAcctId) ST.activeAcctId=created.id;
      toast('Account added','success');
    }
    document.getElementById('acctModal')?.classList.remove('open');
    renderSidebarAcct(); renderSettings(); refreshAll();
  } catch(e) { toast(e.message,'error'); }
}
async function deleteAcct(id) {
  if(ST.accounts.length<=1){ toast('Cannot delete your only account','error'); return; }
  if(!confirm('Delete this account and all its items?')) return;
  try {
    await API.deleteAccount(id);
    ST.accounts=ST.accounts.filter(a=>a.id!==id);
    ST.items=ST.items.filter(i=>i.acctId!==id);
    if(ST.activeAcctId===id) ST.activeAcctId=ST.accounts[0]?.id;
    ST.selectedAccts=ST.selectedAccts.filter(x=>x!==id);
    renderSidebarAcct(); renderSettings(); renderAcctFilterBar(); refreshAll();
    toast('Account deleted','warn');
  } catch(e) { toast(e.message,'error'); }
}

// ── SETTINGS ──
function renderSettings() {
  const el=document.getElementById('settingsContent'); if(!el) return;
  if(ST.settingsTab==='accounts'){
    el.innerHTML=`<div class="settings-panel">
      <div class="sp-title">Accounts</div>
      <div class="sp-sub">Manage your email accounts and workspaces</div>
      <div class="acct-cards" id="acctCards"></div>
      <div style="margin-top:14px"><button class="btn btn-ghost btn-sm" onclick="openAcctModal()">+ Add account</button></div>
    </div>`;
    document.getElementById('acctCards').innerHTML=ST.accounts.map(a=>{
      const mo=ST.items.filter(i=>i.acctId===a.id).reduce((s,i)=>s+monthlyEq(i.cost,i.cycle),0);
      const linked=!!(ST.integration?.connectedAccts?.[a.id]?.linked);
      return `<div class="acct-card-s">
        <div class="acct-avatar" style="background:${a.color};color:#fff;width:36px;height:36px;font-size:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${initials(a.name)}</div>
        <div class="acct-card-meta">
          <div class="acct-card-name">${esc(a.name)}</div>
          <div class="acct-card-email">${esc(a.email)}</div>
          <div class="acct-card-stats">${ST.items.filter(i=>i.acctId===a.id).length} items · ₹${Math.round(mo).toLocaleString('en-IN')}/mo</div>
        </div>
        <div class="acct-card-actions">
          ${linked
            ?`<span class="pill pill-grn" style="font-size:10px">⚡ ViaSocket</span>`
            :`<button class="btn btn-ghost btn-sm" onclick="openVsWizard('${a.id}')">⚡ Connect email</button>`}
          <button class="btn btn-ghost btn-sm" onclick="openAcctModal('${a.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAcct('${a.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');
  }
  else if(ST.settingsTab==='profile'){
    el.innerHTML=`<div class="settings-panel">
      <div class="sp-title">Profile</div>
      <div class="sp-sub">Your personal information</div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="frow">
          <div class="fg"><label class="flabel">Display name</label><input class="finput" id="spName" value="${esc(ST.settings.name||'')}"></div>
          <div class="fg"><label class="flabel">Email</label><input class="finput" id="spEmail" value="${esc(ST.settings.email||'')}"></div>
        </div>
        <div class="fg"><label class="flabel">Bio</label><textarea class="finput" id="spBio">${esc(ST.settings.bio||'')}</textarea></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="saveProfileSettings()">Save changes</button></div>
      </div>
    </div>`;
  }
  else if(ST.settingsTab==='display'){
    el.innerHTML=`<div class="settings-panel">
      <div class="sp-title">Display</div>
      <div class="sp-sub">Customize how SubTrack looks</div>
      <div>
        <div class="sp-row"><div><div class="sp-row-label">Show expired items banner</div><div class="sp-row-desc">Highlight items that have expired</div></div>
          <div class="toggle${ST.settings.showExpiredBanner?' on':''}" onclick="toggleSetting('showExpiredBanner',this)"></div></div>
        <div class="sp-row"><div><div class="sp-row-label">Compact table rows</div><div class="sp-row-desc">Reduce row padding</div></div>
          <div class="toggle${ST.settings.compact?' on':''}" onclick="toggleSetting('compact',this)"></div></div>
        <div class="sp-row"><div><div class="sp-row-label">Show annual cost</div><div class="sp-row-desc">Display annual equivalent next to monthly</div></div>
          <div class="toggle${ST.settings.annualView?' on':''}" onclick="toggleSetting('annualView',this)"></div></div>
      </div>
    </div>`;
  }
  else if(ST.settingsTab==='danger'){
    el.innerHTML=`<div class="settings-panel">
      <div class="sp-title">Data & Privacy</div>
      <div class="sp-sub">Manage your local data</div>
      <div>
        <div class="sp-row"><div><div class="sp-row-label">Export all data</div><div class="sp-row-desc">Download subscriptions as CSV</div></div>
          <button class="btn btn-ghost btn-sm" onclick="exportCSV()">Export CSV</button></div>
        <div class="sp-row"><div><div class="sp-row-label">Clear activity log</div><div class="sp-row-desc">Remove all activity history</div></div>
          <button class="btn btn-ghost btn-sm" onclick="clearActivityLog()">Clear</button></div>
        <div class="sp-row"><div><div class="sp-row-label">Reset all data</div><div class="sp-row-desc">Delete everything. Cannot be undone.</div></div>
          <button class="btn btn-danger btn-sm" onclick="resetAllData()">Reset data</button></div>
      </div>
    </div>`;
  }
}
async function saveProfileSettings() {
  const data = {
    name:  document.getElementById('spName')?.value.trim(),
    email: document.getElementById('spEmail')?.value.trim(),
    bio:   document.getElementById('spBio')?.value.trim(),
  };
  try {
    ST.settings = await API.updateSettings({...ST.settings,...data});
    renderSidebarAcct(); toast('Saved','success');
  } catch(e) { toast(e.message,'error'); }
}
async function toggleSetting(key, el) {
  ST.settings[key]=!ST.settings[key]; el.classList.toggle('on',ST.settings[key]);
  await API.updateSettings({[key]:ST.settings[key]}).catch(()=>{});
}
function setSettingsTab(tab, el) {
  ST.settingsTab=tab;
  document.querySelectorAll('.snav-item').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  renderSettings();
}

// ── PROFILE PAGE ──
function renderProfilePage() {
  document.getElementById('profName').value  = ST.settings.name||'';
  document.getElementById('profEmail').value = ST.settings.email||'';
  document.getElementById('profBio').value   = ST.settings.bio||'';
  document.getElementById('colorOpts').innerHTML = colorPickerHTML(ST.settings.color,'colorOpts');
  const it=ST.items; const mo=it.reduce((s,i)=>s+monthlyEq(i.cost,i.cycle),0);
  const exp=it.filter(i=>daysLeft(i.expiry)<0).length;
  document.getElementById('profileCard').innerHTML=`
    <div class="profile-avatar-big" style="background:linear-gradient(135deg,${ST.settings.color||'var(--acc)'},var(--pur))">${initials(ST.settings.name||'Y')}</div>
    <div class="profile-name-big">${esc(ST.settings.name||'You')}</div>
    <div class="profile-email-big">${esc(ST.settings.email||'me@example.com')}</div>
    ${ST.settings.bio?`<div style="font-size:12px;color:var(--tx2);margin-bottom:8px">${esc(ST.settings.bio)}</div>`:''}
    <div class="profile-stats-row">
      <div class="pstat"><div class="pstat-val">${ST.accounts.length}</div><div class="pstat-lbl">Accounts</div></div>
      <div class="pstat"><div class="pstat-val">${it.length}</div><div class="pstat-lbl">Items</div></div>
      <div class="pstat"><div class="pstat-val">${exp}</div><div class="pstat-lbl">Expired</div></div>
    </div>`;
}
async function saveProfile() {
  const data={
    name:  document.getElementById('profName')?.value.trim(),
    email: document.getElementById('profEmail')?.value.trim(),
    bio:   document.getElementById('profBio')?.value.trim(),
    color: getSelectedColor('colorOpts'),
  };
  try {
    ST.settings=await API.updateSettings({...ST.settings,...data});
    renderSidebarAcct(); renderProfilePage(); toast('Profile saved','success');
  } catch(e) { toast(e.message,'error'); }
}

// ── VIASOCKET ──
function renderVsBanner() {
  const el=document.getElementById('vsBannerDash'); if(!el) return;
  if(ST.settings.vsBannerDismissed&&!isVsEnabled()) { el.innerHTML=''; return; }
  if(isVsEnabled()){
    const cnt=linkedCount();
    el.innerHTML=`<div class="vs-banner connected">
      <div class="vs-banner-ico">✅</div>
      <div class="vs-banner-body"><div class="vs-banner-title">Auto Tracking active</div>
        <div class="vs-banner-desc">${cnt} account${cnt!==1?'s':''} connected via ViaSocket — invoices will appear automatically.</div></div>
      <div class="vs-banner-actions"><button class="btn btn-ghost btn-sm" onclick="goPage('integrations')">Manage</button></div>
    </div>`;
  } else {
    el.innerHTML=`<div class="vs-banner">
      <div class="vs-banner-ico">⚡</div>
      <div class="vs-banner-body"><div class="vs-banner-title">Enable Auto Tracking</div>
        <div class="vs-banner-desc">Connect your email via ViaSocket to auto-detect invoices & renewals.</div></div>
      <div class="vs-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="openVsWizard()">Connect now</button>
        <button class="btn btn-ghost btn-sm" onclick="dismissVsBanner()">Dismiss</button>
      </div>
    </div>`;
  }
}
async function dismissVsBanner() {
  ST.settings.vsBannerDismissed=true;
  await API.updateSettings({vsBannerDismissed:true}).catch(()=>{});
  renderVsBanner();
}
function isVsEnabled() { return !!(ST.integration?.enabled && linkedCount()>0); }
function linkedCount() { return Object.values(ST.integration?.connectedAccts||{}).filter(x=>x.linked).length; }

function renderIntegrationsPage() {
  const el=document.getElementById('integrationsContent'); if(!el) return;
  const vs=ST.integration||{};
  const slack=ST.slack||{};
  el.innerHTML=`<div class="int-card">
    <div class="int-card-hdr"><div class="int-logo" style="background:var(--acc-bg)">✉️</div><div style="flex:1"><div class="int-name">Gmail — Invoice Auto Tracking</div><div class="int-desc">Connect the inboxes where purchase receipts and invoices arrive</div></div><div class="int-status ${isVsEnabled()?'on':'off'}">${isVsEnabled()?'Active':'Not connected'}</div></div>
    <div class="int-body">New incoming emails are analyzed with your local Ollama AI. Matching invoices and purchases are added automatically; recurring charges also enter Subscriptions. Low confidence extraction is marked for review. SubTrack stores ViaSocket connection references only; Gmail OAuth credentials stay encrypted at ViaSocket.</div>
    ${ST.accounts.map(a=>{const c=vs.connectedAccts?.[a.id];return `<div class="int-acct-item${c?.linked?' linked':''}"><div class="acct-avatar" style="background:${a.color};color:#fff;width:26px;height:26px;font-size:10px">${initials(a.name)}</div><div style="flex:1"><div style="font-size:12px;font-weight:500">${esc(a.name)}</div><div style="font-size:11px;color:var(--tx3)">${c?.linked?'Monitoring new email':esc(a.email)}</div></div>${c?.linked?`<span class="pill pill-grn">✓ Connected</span><button class="btn btn-ghost btn-sm" onclick="unlinkVsAcct('${a.id}')">Disconnect</button>`:`<button class="btn btn-primary btn-sm" onclick="openVsWizard('${a.id}')">Connect Gmail</button>`}</div>`}).join('')}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="openVsWizard()">+ Connect another Gmail</button>${linkedCount()?`<button class="btn btn-ghost btn-sm" onclick="toggleVsGlobal()">${vs.enabled?'⏸ Pause monitoring':'▶ Resume monitoring'}</button>`:''}</div>
  </div>
  <div class="int-card" style="margin-top:16px">
    <div class="int-card-hdr"><div class="int-logo" style="background:rgba(74,21,75,.2)">#</div><div style="flex:1"><div class="int-name">Slack — Purchase Notifications</div><div class="int-desc">Notify a channel or direct message when a matching invoice is added</div></div><div class="int-status ${slack.enabled?'on':'off'}">${slack.enabled?'Active':slack.connected?'Connected':'Optional'}</div></div>
    <div class="int-body">${slack.destinationLabel?`Current destination: <strong>${esc(slack.destinationLabel)}</strong>.`:'Choose a Slack channel or DM once when enabling.'} New recognized email purchases send a short summary.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="enableSlackNotifications()">${slack.enabled?'Change destination':'Enable Slack notifications'}</button>${slack.enabled?`<button class="btn btn-ghost btn-sm" onclick="toggleSlackNotifications(false)">Turn off</button>`:''}${slack.connected?`<button class="btn btn-ghost btn-sm" onclick="disconnectSlack()">Disconnect Slack</button>`:''}</div>
  </div>`;
  updateNavBadges();
}

function openVsWizard(acctId=null) {
  ST.vsWizardAcctId=acctId||ST.activeAcctId||ST.accounts[0]?.id;
  launchVsGmailConnection();
}
async function launchVsGmailConnection() {
  if(typeof window.viaSocketConnectGmail!=='function'){toast('Gmail connection module is still loading. Refresh and try again.','error');return;}
  try{const embedToken=await API.getEmbedToken();const {authId}=await window.viaSocketConnectGmail({embedToken,serviceId:ST.vsServiceId});await finishGmailConnection(authId,ST.vsWizardAcctId);}
  catch(error){if(error.code==='closed')return;toast(error.message||'Could not connect Gmail.','error');}
}
async function enableSlackNotifications(){
  try{
    let state=await API.getSlackStatus();
    if(!state.connected){
      if(typeof window.viaSocketConnectSlack!=='function')throw new Error('Slack popup is still loading. Refresh and retry.');
      const embedToken=await API.getEmbedToken();const {authId}=await window.viaSocketConnectSlack({embedToken});
      await API.connectSlack(authId);state=await API.getSlackStatus();
    }
    ST.slack=state;document.getElementById('slackDestinationModal')?.classList.add('open');await loadSlackOptions();
  }catch(e){if(e.code!=='closed')toast(e.message,'error');}
}
async function loadSlackOptions(){
  const type=document.getElementById('slackDestinationType')?.value||'channel';
  const select=document.getElementById('slackDestinationSelect');const err=document.getElementById('slackDestinationError');
  if(!select)return;select.innerHTML='<option>Loading…</option>';if(err)err.textContent='';
  try{const options=await API.getSlackOptions(type);select.innerHTML=options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')||'<option value="">No destinations found</option>';}
  catch(e){select.innerHTML='<option value="">Could not load destinations</option>';if(err)err.textContent=e.message;}
}
function closeSlackDestination(){document.getElementById('slackDestinationModal')?.classList.remove('open');}
async function saveSlackDestination(){
  const type=document.getElementById('slackDestinationType')?.value;
  const select=document.getElementById('slackDestinationSelect');const option=select?.selectedOptions?.[0];
  if(!option?.value){document.getElementById('slackDestinationError').textContent='Select a destination first.';return;}
  try{ST.slack=await API.setSlackDestination({type,value:option.value,label:option.textContent});closeSlackDestination();renderIntegrationsPage();toast('Slack purchase notifications enabled.','success');}
  catch(e){document.getElementById('slackDestinationError').textContent=e.message;}
}
async function toggleSlackNotifications(enabled){try{ST.slack={...ST.slack,...await API.toggleSlack(enabled)};renderIntegrationsPage();}catch(e){toast(e.message,'error');}}
async function disconnectSlack(){if(!confirm('Disconnect Slack notifications?'))return;try{await API.disconnectSlack();ST.slack={connected:false,enabled:false};renderIntegrationsPage();toast('Slack disconnected.','warn');}catch(e){toast(e.message,'error');}}
async function unlinkVsAcct(acctId) {
  if(!confirm('Disconnect this account from ViaSocket?')) return;
  try{const result=await API.unlinkAccount(acctId);ST.integration=result.integration||result;renderIntegrationsPage();renderVsBanner();updateNavBadges();toast('Gmail disconnected','warn');}
  catch(e){toast(e.message,'error');}
}
async function toggleVsGlobal() {
  try{const res=await API.toggleInteg();ST.integration=res.integration||ST.integration;renderIntegrationsPage();renderVsBanner();toast(res.enabled?'Auto tracking resumed':'Auto tracking paused',res.enabled?'success':'warn');}
  catch(e){toast(e.message,'error');}
}

// ── FILTER / SORT / SEARCH ──
function setFilter(cat, el) {
  ST.filter=cat;
  document.querySelectorAll('.ftab').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}
function sortBy(col) {
  if(ST.sort===col) ST.sortDir*=-1; else { ST.sort=col; ST.sortDir=1; }
  renderTable();
}
function handleSearch() {
  ST.searchQ=(document.getElementById('searchInput')?.value||'').toLowerCase();
  renderTable();
}

// ── EXPORT CSV ──
function exportCSV() {
  const it=activeItems();
  if(!it.length){ toast('No items to export','warn'); return; }
  const hdrs=['Name','Account','Category','Plan','Cost','Currency','Cycle','Start','Expiry','Days Left','Status','Key','Seats','Notes'];
  const rows=it.map(i=>{
    const d=daysLeft(i.expiry); const a=acctById(i.acctId);
    return [i.name,a.name,i.category,i.plan,i.cost,i.currency||'₹ INR',i.cycle,i.start,i.expiry,d,statusOf(i.expiry).l,i.key,i.seats,i.notes]
      .map(v=>'"'+(v||'').toString().replace(/"/g,'""')+'"').join(',');
  });
  const csv=[hdrs.join(','),...rows].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='subtrack_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  toast('CSV exported','success');
}

// Import the CSV format produced by exportCSV, including quoted commas/newlines.
function parseCSV(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"'&&text[i+1]==='"') { cell+='"'; i++; }
      else if(c==='"') quoted=false;
      else cell+=c;
    } else if(c==='"') quoted=true;
    else if(c===',') { row.push(cell); cell=''; }
    else if(c==='\n'||c==='\r') {
      if(c==='\r'&&text[i+1]==='\n') i++;
      row.push(cell); cell='';
      if(row.some(value=>value.trim())) rows.push(row);
      row=[];
    } else cell+=c;
  }
  row.push(cell);
  if(row.some(value=>value.trim())) rows.push(row);
  if(quoted) throw new Error('The CSV has an unclosed quoted field.');
  return rows;
}

async function importCSVFile(event) {
  const input=event.target, file=input.files?.[0];
  if(!file) return;
  input.value='';
  try {
    const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));
    if(rows.length<2) throw new Error('The CSV must include a header row and at least one item.');
    const headers=rows.shift().map(h=>h.trim().toLowerCase());
    const col=name=>headers.indexOf(name.toLowerCase());
    if(col('name')<0||col('expiry')<0) throw new Error('CSV needs at least “Name” and “Expiry” columns.');
    const imported=[]; let skipped=0;
    for(const values of rows) {
      const value=name=>{const i=col(name);return i<0?'':(values[i]||'').trim();};
      const name=value('Name'), expiry=value('Expiry');
      if(!name||!expiry||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { skipped++; continue; }
      const acctName=value('Account').toLowerCase();
      const account=ST.accounts.find(a=>a.name.toLowerCase()===acctName)||ST.accounts.find(a=>a.id===ST.activeAcctId)||ST.accounts[0];
      if(!account) { skipped++; continue; }
      try {
        imported.push(await API.createItem({
          acctId:account.id, name, expiry, category:value('Category')||'SaaS', plan:value('Plan'),
          cost:value('Cost')||'0', currency:value('Currency')||'₹ INR', cycle:value('Cycle')||'monthly',
          start:value('Start'), key:value('Key'), seats:value('Seats')||'1', notes:value('Notes')
        }));
      } catch(e) { skipped++; }
    }
    if(imported.length) {
      ST.items.push(...imported);
      refreshAll();
      renderSubsPage(); renderWarrantiesPage(); renderLicensesPage();
    }
    if(!imported.length) toast(`Nothing imported${skipped?` — ${skipped} invalid row(s) skipped`:''}`, 'warn');
    else toast(`Imported ${imported.length} item${imported.length===1?'':'s'}${skipped?`; skipped ${skipped} invalid row(s)`:''}`, 'success');
  } catch(e) { toast(e.message||'Could not read CSV file','error'); }
}

// ── SETTINGS HELPERS ──
async function clearActivityLog() {
  await API.clearActivity().catch(()=>{});
  ST.activity=[]; renderActivity(); toast('Activity cleared','warn');
}
async function resetAllData() {
  if(!confirm('This will delete ALL data on the server. Are you sure?')) return;
  toast('Please delete backend/data/db.json and restart the server to reset.','warn');
}

// ── PAGE NAVIGATION ──
const PAGES=['dashboard','subscriptions','warranties','licenses','invoices','spend','calendar','notifications','integrations','settings','profile'];
const PAGE_TITLES={dashboard:'Dashboard',subscriptions:'Subscriptions',warranties:'Warranties & Hardware',licenses:'Licenses',invoices:'Invoices & Purchases',spend:'Spend Analysis',calendar:'Renewal Calendar',notifications:'Notifications',integrations:'Integrations',settings:'Settings',profile:'Profile'};

function goPage(page, navEl=null) {
  PAGES.forEach(p => {
    const v=document.getElementById('view_'+p);
    if(v) v.classList.toggle('active', p===page);
  });
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  const nl=navEl||document.querySelector(`[data-page="${page}"]`);
  if(nl) nl.classList.add('active');
  document.getElementById('pageTitle').textContent=PAGE_TITLES[page]||page;
  ST.currentPage=page;
  if(page==='settings')      renderSettings();
  if(page==='profile')       renderProfilePage();
  if(page==='notifications') renderNotifications();
  if(page==='spend')         renderSpendPage();
  if(page==='calendar')      renderCalendar();
  if(page==='subscriptions') renderSubsPage();
  if(page==='warranties')    renderWarrantiesPage();
  if(page==='licenses')      renderLicensesPage();
  if(page==='invoices')      { loadInvoices(); }
  if(page==='integrations')  renderIntegrationsPage();
}

// ── SUBS / WARRANTIES / LICENSES PAGES ──
function renderSubsPage() {
  const it=activeItems().filter(i=>['SaaS','Infrastructure','Design','Domain'].includes(i.category));
  const tb=document.getElementById('subBody'); const em=document.getElementById('subEmpty');
  if(!tb) return;
  if(!it.length){ tb.innerHTML=''; if(em) em.style.display='block'; return; }
  if(em) em.style.display='none';
  tb.innerHTML=it.sort((a,b)=>daysLeft(a.expiry)-daysLeft(b.expiry)).map(i=>{
    const st=statusOf(i.expiry); const acc=acctById(i.acctId);
    const draftBadge=i.isDraft?`<span class="pill pill-yel" style="font-size:10px;margin-left:6px">draft</span>`:'';
    return `<tr>
      <td><div class="prod-cell"><div class="prod-icon" style="background:${hexAlpha(CAT_COLOR[i.category]||'#4F607A',.15)}">${CAT_ICON[i.category]||'📦'}</div>
        <div><div class="prod-name">${esc(i.name)}${draftBadge}</div>${i.url?`<div class="prod-sub" style="color:var(--acc2)">${esc(i.url)}</div>`:''}</div></div></td>
      <td>${ownerChipHTML(acc)}</td>
      <td style="font-size:12px;color:var(--tx2)">${esc(i.plan||'—')}</td>
      <td><div class="cost-main">₹${Number(i.cost||0).toLocaleString('en-IN')}</div></td>
      <td style="font-size:12px;color:var(--tx2)">${esc(i.cycle)}</td>
      <td style="font-family:var(--mono);font-size:12px">${fmtDate(i.expiry)}</td>
      <td>${daysBarHTML(i.expiry)}</td>
      <td><span class="pill ${st.c}"><span class="pill-dot"></span>${st.l}</span></td>
      <td><div class="row-actions">
        ${i.isDraft?`<button class="ib ok" onclick="confirmItem('${i.id}')">✓</button>`:''}
        <button class="ib" onclick="openItemModal('${i.id}')">✎</button>
        <button class="ib del" onclick="deleteItem('${i.id}')">✕</button>
      </div></td></tr>`;
  }).join('');
}
function renderWarrantiesPage() {
  const it=activeItems().filter(i=>i.category==='Hardware');
  const tb=document.getElementById('warBody'); const em=document.getElementById('warEmpty');
  if(!tb) return;
  if(!it.length){ tb.innerHTML=''; if(em) em.style.display='block'; return; }
  if(em) em.style.display='none';
  tb.innerHTML=it.map(i=>{ const st=statusOf(i.expiry); const acc=acctById(i.acctId); return `<tr>
    <td><div class="prod-cell"><div class="prod-icon" style="background:${hexAlpha(CAT_COLOR[i.category]||'#26D07C',.15)}">💻</div><div><div class="prod-name">${esc(i.name)}</div><div class="prod-sub">${esc(i.plan||'—')}</div></div></div></td>
    <td>${ownerChipHTML(acc)}</td>
    <td style="font-size:12px;color:var(--tx2);font-family:var(--mono)">${esc(i.key||i.notes||'—')}</td>
    <td class="cost-main">₹${Number(i.cost||0).toLocaleString('en-IN')}</td>
    <td style="font-family:var(--mono);font-size:12px">${fmtDate(i.expiry)}</td>
    <td>${daysBarHTML(i.expiry)}</td>
    <td><span class="pill ${st.c}"><span class="pill-dot"></span>${st.l}</span></td>
    <td><div class="row-actions"><button class="ib" onclick="openItemModal('${i.id}')">✎</button><button class="ib del" onclick="deleteItem('${i.id}')">✕</button></div></td>
  </tr>`; }).join('');
}
function renderLicensesPage() {
  const it=activeItems().filter(i=>i.category==='License');
  const tb=document.getElementById('licBody'); const em=document.getElementById('licEmpty');
  if(!tb) return;
  if(!it.length){ tb.innerHTML=''; if(em) em.style.display='block'; return; }
  if(em) em.style.display='none';
  tb.innerHTML=it.map(i=>{ const st=statusOf(i.expiry); const acc=acctById(i.acctId); return `<tr>
    <td><div class="prod-cell"><div class="prod-icon" style="background:${hexAlpha(CAT_COLOR[i.category]||'#F97316',.15)}">🔑</div><div><div class="prod-name">${esc(i.name)}</div><div class="prod-sub">${esc(i.plan||'—')}</div></div></div></td>
    <td>${ownerChipHTML(acc)}</td>
    <td style="font-size:12px;font-family:var(--mono);color:var(--tx2)">${i.key?esc(i.key.slice(0,22)+'…'):esc(i.notes||'—')}</td>
    <td style="font-family:var(--mono);font-size:12px">${i.seats||1}</td>
    <td class="cost-main">₹${Number(i.cost||0).toLocaleString('en-IN')}</td>
    <td style="font-family:var(--mono);font-size:12px">${fmtDate(i.expiry)}</td>
    <td><span class="pill ${st.c}"><span class="pill-dot"></span>${st.l}</span></td>
    <td><div class="row-actions"><button class="ib" onclick="openItemModal('${i.id}')">✎</button><button class="ib del" onclick="deleteItem('${i.id}')">✕</button></div></td>
  </tr>`; }).join('');
}

// ── CLOSE MODALS ON OVERLAY CLICK ──
document.addEventListener('DOMContentLoaded', () => {
  ['itemModal','acctModal','multiModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });
  });
  document.addEventListener('click', e => {
    if(!document.getElementById('acctSwitcher')?.contains(e.target)) closeAcctDropdown();
  });
  init();
});

// Escape closes whichever modal is open.
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(document.getElementById('replyModal')?.classList.contains('open'))closeReplyModal();if(document.getElementById('slackDestinationModal')?.classList.contains('open'))closeSlackDestination();});
