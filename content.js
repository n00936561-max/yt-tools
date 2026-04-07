(function () {
  // ── Teardown on extension reload ──────────────────────────────────────────
  // When the extension reloads, the port disconnects and we stop everything
  // before Chrome can throw "Extension context invalidated"
  let alive = true;
  try {
    chrome.runtime.connect({ name: 'tab' }).onDisconnect.addListener(() => {
      alive = false;
      clearInterval(adTimer);
      clearInterval(dislikeTimer);
    });
  } catch { return; }

  // ── Ad skipper ────────────────────────────────────────────────────────────
  const RATE = 16;
  const SKIP = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
  ];
  let adActive = false, savedRate = 1;

  function tickAd() {
    if (!alive) return;
    const v = document.querySelector('video');
    if (!v) return;
    const isAd = !!document.querySelector('.ad-showing');
    if (isAd) {
      if (!adActive) { adActive = true; savedRate = v.playbackRate || 1; v.muted = true; }
      v.playbackRate = RATE;
      SKIP.forEach(s => { const b = document.querySelector(s); if (b) b.click(); });
    } else if (adActive) {
      adActive = false; v.playbackRate = savedRate; v.muted = false;
    }
  }
  const adTimer = setInterval(tickAd, 300);

  // ── Dislike counter ───────────────────────────────────────────────────────
  const LABEL = 'ryd-label';
  let shownVideoId = null;
  let dislikeCount = null;
  let dislikeTimer = null;

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  // Find the dislike button using every known YouTube selector
  function findDislikeBtn() {
    // aria-label is the most reliable cross-layout selector
    const all = document.querySelectorAll('button');
    for (const b of all) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('dislike') && !label.includes('undo')) return b;
    }
    return null;
  }

  function injectLabel(count) {
    // Remove stale label
    document.getElementById(LABEL)?.remove();
    const btn = findDislikeBtn();
    if (!btn) return false;

    const el = document.createElement('span');
    el.id = LABEL;
    el.textContent = fmt(count);
    el.style.cssText = `
      font-size: 1.4rem;
      font-weight: 500;
      color: var(--yt-spec-text-primary, #fff);
      margin-left: 4px;
      align-self: center;
      pointer-events: none;
      display: inline-block;
      vertical-align: middle;
    `;
    btn.parentNode.insertBefore(el, btn.nextSibling);
    return true;
  }

  function currentVideoId() {
    return new URLSearchParams(location.search).get('v');
  }

  function scheduleInjection() {
    if (!alive || dislikeCount === null) return;
    clearInterval(dislikeTimer);
    let attempts = 0;
    dislikeTimer = setInterval(() => {
      attempts++;
      if (!alive || attempts > 30) { clearInterval(dislikeTimer); return; }
      if (injectLabel(dislikeCount)) clearInterval(dislikeTimer);
    }, 600);
  }

  function onNavigate() {
    if (!alive) return;
    const id = currentVideoId();
    if (!id || id === shownVideoId) return;
    shownVideoId = id;
    dislikeCount = null;
    document.getElementById(LABEL)?.remove();

    try {
      chrome.runtime.sendMessage({ type: 'getDislikes', videoId: id }, (res) => {
        if (!alive || !res?.ok || res.count === null) return;
        dislikeCount = res.count;
        scheduleInjection();
      });
    } catch { /* context gone */ }
  }

  window.addEventListener('yt-navigate-finish', onNavigate);
  // Run on initial page load too
  onNavigate();
})();
