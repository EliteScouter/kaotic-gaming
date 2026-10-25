// ============================================================
//  Kaotic Gaming game SDK — the site adds this to every game page.
//  A game checks for window.KG and, when it's there, uses it for:
//    KG.user                 { id, username, role } of the signed-in player
//    KG.initialSave          this player's saved data for this game (or null)
//    KG.save(data)           save progress to the player's account
//    KG.report(summary)      what the admin page shows for this player, e.g. { level: 7, kills: 300 }
//    KG.event(type, data)    a moment worth logging: 'level_complete', 'death', ...
//    KG.setStatus(text)      what "Playing now" shows, e.g. 'Level 7 · Gas Station'
//    KG.saveState            'saved' | 'saving' | 'error' | 'signed-out'
//    KG.home()               back to the site's game list
//    KG.entitlements         what this player has bought on the site, e.g. ['supporter']
//    KG.shopOpen             true when this player can buy in the site's shop right now
//    KG.refreshEntitlements() re-check purchases (resolves to the new list), e.g. after the shop tab closes
//  Errors on the page are reported to the admin page automatically.
// ============================================================
(function () {
  const boot = window.KG_BOOT;
  if (!boot) return;
  const game = boot.game;
  const HEADERS = { 'Content-Type': 'application/json', 'X-KG': '1' };
  // keepalive lets a request finish after the page is closed or hidden (browsers allow it for bodies up to 64 KB)
  const call = (method, url, body, keepalive) => {
    const json = JSON.stringify(body || {});
    return fetch(url, { method, headers: HEADERS, body: json, credentials: 'same-origin', keepalive: !!keepalive && json.length < 60000 });
  };
  const leaving = () => document.visibilityState === 'hidden'; // tab hidden, app switched, or page closing

  let status = 'Playing', away = false;

  // one save request at a time; a burst of saves collapses into the newest data
  let saving = false, queued; // queued === undefined means nothing waiting
  async function save(data) {
    queued = data;
    if (saving) return;
    saving = true; KG.saveState = 'saving';
    while (queued !== undefined) {
      const v = queued; queued = undefined;
      try {
        const r = await call('PUT', `/api/save/${game}`, { data: v }, leaving());
        KG.saveState = r.ok ? 'saved' : r.status === 401 ? 'signed-out' : 'error';
      } catch (e) { KG.saveState = 'error'; }
    }
    saving = false;
  }

  function event(type, data) { call('POST', `/api/event/${game}`, { type, data }).catch(() => {}); }

  // reports in quick succession collapse into the last one; one made while the page is going away is sent at once
  let reportTimer = null, lastSummary = null;
  function sendReport() {
    clearTimeout(reportTimer); reportTimer = null;
    call('POST', `/api/report/${game}`, { summary: lastSummary }, leaving()).catch(() => {});
  }
  function report(summary) {
    lastSummary = summary;
    clearTimeout(reportTimer);
    if (leaving()) sendReport();
    else reportTimer = setTimeout(sendReport, 600);
  }
  const flushReport = () => { if (reportTimer) sendReport(); };

  function heartbeat(keepalive) { call('POST', `/api/heartbeat/${game}`, { status, away }, keepalive).catch(() => {}); }

  let errorsSent = 0;
  function reportError(message, detail) {
    if (errorsSent++ >= 5) return; // a broken loop shouldn't flood the admin page
    call('POST', '/api/error', { game, message: String(message || 'Unknown error').slice(0, 500), detail: String(detail || '').slice(0, 2000) }).catch(() => {});
  }
  addEventListener('error', e => reportError(e.message, e.error && e.error.stack));
  addEventListener('unhandledrejection', e => reportError(e.reason && (e.reason.message || e.reason), e.reason && e.reason.stack));

  const KG = {
    user: boot.user, game, title: boot.title, initialSave: boot.save,
    saveState: 'saved',
    save, event, report, reportError,
    setStatus(text) { status = String(text || '').slice(0, 80); },
    home() { location.href = '/'; },
    entitlements: Array.isArray(boot.entitlements) ? boot.entitlements : [],
    shopOpen: !!boot.shopOpen,
    async refreshEntitlements() {
      const r = await fetch('/api/shop', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error('Could not check purchases');
      const d = await r.json();
      // signed out, or signed in as someone else in another tab: not this player's answer, so change nothing
      if (!KG.user || d.userId !== KG.user.id) throw new Error('Signed in as someone else');
      KG.entitlements = Array.isArray(d.owned) ? d.owned : [];
      KG.shopOpen = !!d.open;
      return KG.entitlements;
    },
  };
  window.KG = KG;

  event('session_start');
  heartbeat();
  setInterval(() => { if (!document.hidden) heartbeat(); }, 20000);
  document.addEventListener('visibilitychange', () => { away = document.hidden; heartbeat(away); if (away) flushReport(); });
  addEventListener('pagehide', flushReport);
})();
