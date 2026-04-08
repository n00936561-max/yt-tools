(function () {
  // ── Ad skipper ────────────────────────────────────────────────────────────
  const RATE = 16;
  const SKIP_SELS = ['.ytp-skip-ad-button','.ytp-ad-skip-button','.ytp-ad-skip-button-modern','.ytp-ad-skip-button-slot button'];
  let adActive = false, savedRate = 1;

  setInterval(() => {
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

  function badge(msg, color) {
    let el = document.getElementById('ryd-debug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ryd-debug';
      el.style.cssText = 'position:fixed;top:70px;right:16px;z-index:2147483647;padding:8px 12px;border-radius:8px;font:bold 14px monospace;color:#fff;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.5);';
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = color || '#222';
  }

  async function run(videoId) {
    if (busy) return;
    busy = true;
    badge('RYD: fetching…', '#333');

    // Fetch via background service worker — avoids CORS restrictions
    let count = null;
    try {
      count = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'getDislikes', videoId }, res => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(res?.ok ? res.count : null);
        });
      });
    } catch (e) {
      badge('RYD: fetch failed — ' + e.message, '#900');
      busy = false;
      return;
    }

    if (count === null) { badge('RYD: no count in response', '#900'); busy = false; return; }
    badge('RYD: got ' + fmt(count) + ', finding button…', '#333');

    let tries = 0;
    const poll = setInterval(() => {
      if (tries++ > 40) { clearInterval(poll); badge('RYD: button not found', '#900'); busy = false; return; }

      const dislikeBtn =
        document.querySelector('#dislike-button button') ||
        document.querySelector('#segmented-dislike-button button') ||
        (() => { for (const b of document.querySelectorAll('button')) { if ((b.getAttribute('aria-label')||'').toLowerCase().includes('dislike')) return b; } })();

      if (!dislikeBtn) return;
      clearInterval(poll);
      document.getElementById('ryd-count')?.remove();

      const likeTextDiv = document.querySelector(
        '#like-button .yt-spec-button-shape-next__button-text-content, ' +
        'ytd-toggle-button-renderer:first-child .yt-spec-button-shape-next__button-text-content'
      );

      if (likeTextDiv) {
        dislikeBtn.querySelectorAll('.yt-spec-button-shape-next__button-text-content').forEach(e => e.remove());
        dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
        dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');
        const clone = likeTextDiv.cloneNode(true);
        clone.id = 'ryd-count';
        (clone.querySelector('span[role="text"]') || clone.querySelector('span') || clone).textContent = fmt(count);
        dislikeBtn.appendChild(clone);
        badge('RYD: ✓ ' + fmt(count), '#060');
      } else {
        const span = document.createElement('span');
        span.id = 'ryd-count';
        span.style.cssText = 'color:#fff;font-size:1.4rem;font-weight:500;margin-left:6px;display:inline-block;vertical-align:middle;';
        span.textContent = fmt(count);
        dislikeBtn.insertAdjacentElement('afterend', span);
        badge('RYD: ✓ fallback ' + fmt(count), '#060');
      }

      busy = false;
    }, 500);
  }

  // Show badge immediately so we know the script is alive
  badge('RYD: waiting for video…', '#333');

  setInterval(() => {
    const id = new URLSearchParams(location.search).get('v');
    if (id && id !== lastId) {
      lastId = id;
      busy = false;
      document.getElementById('ryd-count')?.remove();
      run(id);
    }
  }, 1000);
})();
