(function () {
  // ── Teardown on extension reload ──────────────────────────────────────────
  let alive = true;
  try {
    chrome.runtime.connect({ name: 'tab' }).onDisconnect.addListener(() => { alive = false; });
  } catch { return; }

  // ── Ad skipper ────────────────────────────────────────────────────────────
  const RATE = 16;
  const SKIP_SELS = ['.ytp-skip-ad-button','.ytp-ad-skip-button','.ytp-ad-skip-button-modern','.ytp-ad-skip-button-slot button'];
  let adActive = false, savedRate = 1;
  setInterval(() => {
    if (!alive) return;
    const v = document.querySelector('video');
    if (!v) return;
    if (document.querySelector('.ad-showing')) {
      if (!adActive) { adActive = true; savedRate = v.playbackRate || 1; v.muted = true; }
      v.playbackRate = RATE;
      for (const s of SKIP_SELS) { const b = document.querySelector(s); if (b) { b.click(); break; } }
    } else if (adActive) { adActive = false; v.playbackRate = savedRate; v.muted = false; }
  }, 300);

  // ── Dislike counter ───────────────────────────────────────────────────────
  let lastId = null;
  let busy = false;

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  // Show a debug badge so we can see what stage the extension is at
  function badge(msg, color) {
    let el = document.getElementById('ryd-debug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ryd-debug';
      el.style.cssText = 'position:fixed;top:60px;right:12px;z-index:99999;padding:6px 10px;border-radius:6px;font:bold 13px/1 monospace;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = color || '#333';
    el.style.color = '#fff';
  }

  async function run(videoId) {
    if (busy) return;
    busy = true;
    badge('fetching…', '#555');

    let count = null;
    try {
      const r = await fetch('https://returnyoutubedislike.com/api/votes?videoId=' + videoId);
      const d = await r.json();
      count = typeof d.dislikes === 'number' ? d.dislikes : null;
    } catch (e) {
      badge('fetch error: ' + e.message, '#c00');
      busy = false;
      return;
    }

    if (count === null) { badge('no data', '#c00'); busy = false; return; }
    badge('got ' + fmt(count) + ' — finding btn…', '#555');

    // Retry injection until the button is in the DOM
    let tries = 0;
    const poll = setInterval(() => {
      if (!alive || tries++ > 40) { clearInterval(poll); busy = false; return; }

      // Find dislike button
      const dislikeBtn =
        document.querySelector('#dislike-button button') ||
        document.querySelector('#segmented-dislike-button button') ||
        (() => { for (const b of document.querySelectorAll('button')) { if ((b.getAttribute('aria-label')||'').toLowerCase().includes('dislike')) return b; } })();

      if (!dislikeBtn) return; // keep retrying

      clearInterval(poll);
      document.getElementById('ryd-count')?.remove();

      // Try to clone the like button's text node (matches YT styling exactly)
      const likeTextDiv = document.querySelector(
        '#like-button .yt-spec-button-shape-next__button-text-content, ' +
        '#like-button div[class*="cbox"], ' +
        'ytd-toggle-button-renderer:first-child .yt-spec-button-shape-next__button-text-content'
      );

      if (likeTextDiv) {
        // Remove any existing text containers in the dislike button
        dislikeBtn.querySelectorAll('.yt-spec-button-shape-next__button-text-content,[class*="cbox"]').forEach(e => e.remove());
        // Switch button class so it makes room for text
        dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
        dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');
        // Clone like count div and update text
        const clone = likeTextDiv.cloneNode(true);
        clone.id = 'ryd-count';
        (clone.querySelector('span[role="text"]') || clone.querySelector('span') || clone).textContent = fmt(count);
        dislikeBtn.appendChild(clone);
        badge('✓ ' + fmt(count), '#080');
      } else {
        // Simple fallback: plain text after the button
        const span = document.createElement('span');
        span.id = 'ryd-count';
        span.style.cssText = 'color:var(--yt-spec-text-primary,#fff);font-size:1.4rem;font-weight:500;margin-left:6px;align-self:center;display:inline-block;vertical-align:middle;';
        span.textContent = fmt(count);
        dislikeBtn.insertAdjacentElement('afterend', span);
        badge('✓ fallback ' + fmt(count), '#080');
      }

      busy = false;
    }, 500);
  }

  // Poll for video ID changes
  setInterval(() => {
    if (!alive) return;
    const id = new URLSearchParams(location.search).get('v');
    if (id && id !== lastId) {
      lastId = id;
      busy = false;
      document.getElementById('ryd-count')?.remove();
      run(id);
    }
  }, 1000);
})();
