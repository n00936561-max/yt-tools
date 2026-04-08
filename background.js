// Fetch dislike counts on behalf of the content script
// (avoids any content-script fetch restrictions)
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'getDislikes') return false;

  fetch('https://returnyoutubedislike.com/api/votes?videoId=' + msg.videoId, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; YTTools/1.0)',
    }
  })
    .then(async r => {
      const text = await r.text();
      if (!r.ok) return reply({ ok: false, count: null, raw: 'HTTP ' + r.status + ': ' + text.slice(0, 100) });
      try {
        const d = JSON.parse(text);
        reply({ ok: true, count: d.dislikes ?? null, raw: JSON.stringify(d).slice(0, 200) });
      } catch (e) {
        reply({ ok: false, count: null, raw: 'JSON parse error: ' + text.slice(0, 100) });
      }
    })
    .catch(e => reply({ ok: false, count: null, raw: e.message }));

  return true; // keep message channel open for async reply
});
