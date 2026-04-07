(function () {
  // ── Teardown on extension reload ──────────────────────────────────────────
  let alive = true;
  try {
    chrome.runtime.connect({ name: 'tab' }).onDisconnect.addListener(() => {
      alive = false;
      clearInterval(adTimer);
      clearInterval(mainTimer);
    });
  } catch { return; }

  // ── Ad skipper ────────────────────────────────────────────────────────────
  const RATE = 16;
  const SKIP_SELS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
  ];
  let adActive = false, savedRate = 1;

  function tickAd() {
    const v = document.querySelector('video');
    if (!v) return;
    const isAd = !!document.querySelector('.ad-showing');
    if (isAd) {
      if (!adActive) { adActive = true; savedRate = v.playbackRate || 1; v.muted = true; }
      v.playbackRate = RATE;
      for (const s of SKIP_SELS) { const b = document.querySelector(s); if (b) { b.click(); break; } }
    } else if (adActive) {
      adActive = false; v.playbackRate = savedRate; v.muted = false;
    }
  }
  const adTimer = setInterval(tickAd, 300);

  // ── Dislike counter ───────────────────────────────────────────────────────
  const LABEL_ID = 'ryd-label';
  let lastVideoId = null;
  let pendingCount = null;
  let injected = false;

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  // Walk up from the dislike button until we find a container wide enough
  // to sit alongside the button visually
  function findInsertTarget() {
    // Scan all buttons for one whose aria-label mentions "dislike"
    for (const btn of document.querySelectorAll('button')) {
      const lbl = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!lbl.includes('dislike')) continue;

      // Walk up to ytd-toggle-button-renderer, like-button-view-model,
      // yt-button-shape or at most 6 levels — whichever comes first
      let el = btn.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!el) break;
        const tag = el.tagName.toLowerCase();
        if (
          tag === 'ytd-toggle-button-renderer' ||
          tag === 'like-button-view-model' ||
          tag === 'dislike-button-view-model' ||
          tag === 'yt-button-shape'
        ) return el;
        el = el.parentElement;
      }
      // Fallback: use the button's grandparent
      return btn.parentElement?.parentElement ?? btn.parentElement;
    }
    return null;
  }

  function tryInject(count) {
    document.getElementById(LABEL_ID)?.remove();
    const target = findInsertTarget();
    if (!target) return false;

    const span = document.createElement('span');
    span.id = LABEL_ID;
    span.textContent = fmt(count);
    span.style.cssText = `
      font-size: 1.4rem;
      font-weight: 500;
      color: var(--yt-spec-text-primary, #fff);
      margin-left: 6px;
      align-self: center;
      display: inline-flex;
      align-items: center;
      pointer-events: none;
      white-space: nowrap;
    `;
    target.insertAdjacentElement('afterend', span);
    return true;
  }

  async function fetchCount(videoId) {
    // Try direct fetch (content script has host_permissions for the RYD domain)
    try {
      const r = await fetch('https://returnyoutubedislike.com/api/votes?videoId=' + videoId);
      if (r.ok) {
        const d = await r.json();
        if (typeof d.dislikes === 'number') return d.dislikes;
      }
    } catch { /* fall through to background fetch */ }

    // Fallback: ask the background service worker
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'getDislikes', videoId }, res => {
          resolve(res?.count ?? null);
        });
      } catch { resolve(null); }
    });
  }

  async function onNewVideo(videoId) {
    pendingCount = null;
    injected = false;
    document.getElementById(LABEL_ID)?.remove();

    const count = await fetchCount(videoId);
    if (!alive || count === null) return;
    pendingCount = count;
  }

  // Main loop: detect video changes + retry injection until it sticks
  const mainTimer = setInterval(async () => {
    if (!alive) return;

    const id = new URLSearchParams(location.search).get('v');

    // New video detected
    if (id && id !== lastVideoId) {
      lastVideoId = id;
      injected = false;
      await onNewVideo(id);
    }

    // Keep trying to inject until it succeeds (button may not be in DOM yet)
    if (!injected && pendingCount !== null) {
      injected = tryInject(pendingCount);
    }
  }, 800);
})();
