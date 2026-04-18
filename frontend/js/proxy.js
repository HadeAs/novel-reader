// Fetch a URL through the local proxy, automatically attaching stored cookies.
function proxyFetch(url) {
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch (_) {}
  const cookie = storage.getCookie(hostname);
  const proxyUrl = `/proxy?url=${encodeURIComponent(url)}${cookie ? `&cookie=${encodeURIComponent(cookie)}` : ''}`;
  return fetch(proxyUrl).then(res => {
    if (!res.ok) return res.json().then(j => { throw new Error(j.error || `HTTP ${res.status}`); });
    return res.text();
  });
}

if (typeof window !== 'undefined') window.proxyFetch = proxyFetch;
