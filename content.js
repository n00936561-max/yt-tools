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
    '.ytp-skip-ad-button', '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button-slot button',
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
  const INJECTED_CLASS = 'ryd-injected';
  let lastVideoId = null;
  let pendingCount = null;
  let injected = false;

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function getLikeBtn() {
    return (
      document.querySelector('#like-button button') ||
      document.querySelector('ytd-toggle-button-renderer:first-child button') ||
      document.querySelector('like-button-view-model button')
    );
  }

  function getDislikeBtn() {
    return (
      document.querySelector('#dislike-button button') ||
      document.querySelector('#segmented-dislike-button button') ||
      document.querySelector('ytd-toggle-button-renderer:last-child button') ||
      (() => {
        for (const b of document.querySelectorAll('button')) {
          const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
          if (lbl.includes('dislike') && !lbl.includes('undo')) return b;
        }
      })()
    );
  }

  function getLikeTextContainer(likeBtn) {
    return (
      likeBtn.querySelector('.yt-spec-button-shape-next__button-text-content') ||
      likeBtn.querySelector('div[class*="cbox"]') ||
      likeBtn.querySelector('yt-formatted-string')
    );
  }

  function tryInject(count) {
    // Clean up any previous injection
    document.querySelectorAll('.' + INJECTED_CLASS).forEach(el => el.remove());

    const likeBtn = getLikeBtn();
    const dislikeBtn = getDislikeBtn();
    if (!likeBtn || !dislikeBtn) return false;

    const likeTextContainer = getLikeTextContainer(likeBtn);

    let textNode;
    if (likeTextContainer) {
      // Clone the like button's text container — guarantees matching style
      textNode = likeTextContainer.cloneNode(true);
      textNode.classList.add(INJECTED_CLASS);

      // Update the inner text span
      const inner = textNode.querySelector('span[role="text"]') || textNode.querySelector('span') || textNode;
      inner.textContent = fmt(count);
      if (inner !== textNode) textNode.textContent = '';
      if (inner !== textNode) textNode.appendChild(inner);
      inner.textContent = fmt(count);

      // Remove any stale text containers from dislike button before injecting
      dislikeBtn
        .querySelectorAll('.yt-spec-button-shape-next__button-text-content, [class*="cbox"], yt-formatted-string')
        .forEach(el => el.remove());

      // Switch button from icon-only to icon-with-text (like the like button)
      dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
      dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');

      dislikeBtn.appendChild(textNode);
    } else {
      // Fallback: plain span after the button's parent container
      const span = document.createElement('span');
      span.className = INJECTED_CLASS;
      span.textContent = fmt(count);
      span.style.cssText = `
        font-size:1.4rem;font-weight:500;
        color:var(--yt-spec-text-primary,#fff);
        margin-left:6px;align-self:center;
        display:inline-block;vertical-align:middle;pointer-events:none;
      `;
      const container =
        dislikeBtn.closest('ytd-toggle-button-renderer') ||
        dislikeBtn.closest('like-button-view-model') ||
        dislikeBtn.parentElement;
      container.insertAdjacentElement('afterend', span);
    }

    return true;
  }

  async function fetchCount(videoId) {
    try {
      const r = await fetch('https://returnyoutubedislike.com/api/votes?videoId=' + videoId);
      if (r.ok) {
        const d = await r.json();
        if (typeof d.dislikes === 'number') return d.dislikes;
      }
    } catch { /* fall through */ }
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'getDislikes', videoId }, res => resolve(res?.count ?? null));
      } catch { resolve(null); }
    });
  }

  async function onNewVideo(id) {
    pendingCount = null;
    injected = false;
    document.querySelectorAll('.' + INJECTED_CLASS).forEach(el => el.remove());
    const count = await fetchCount(id);
    if (!alive || count === null) return;
    pendingCount = count;
  }

  const mainTimer = setInterval(async () => {
    if (!alive) return;
    const id = new URLSearchParams(location.search).get('v');
    if (id && id !== lastVideoId) { lastVideoId = id; await onNewVideo(id); }
    if (!injected && pendingCount !== null) injected = tryInject(pendingCount);
  }, 800);
})();
