// Google Translate's website widget. Its script loads only when someone opens the language list
// or has already chosen a language, because translating sends the page's text to Google.
const HOST = 'google-translate-host';
let loading = null;

// Google wraps text in <font> tags, which makes React's own DOM updates throw. Skip those stale moves.
const { removeChild, insertBefore } = Node.prototype;
Node.prototype.removeChild = function patched(child) { return child.parentNode === this ? removeChild.call(this, child) : child; };
Node.prototype.insertBefore = function patched(node, ref) { return ref && ref.parentNode !== this ? node : insertBefore.call(this, node, ref); };

// Google translates the words but leaves the layout, so right-to-left languages flip it here.
const RTL = ['ar', 'fa', 'iw', 'he', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'pa-Arab', 'ms-Arab', 'fa-AF'];
const applyDirection = (code) => { document.documentElement.dir = RTL.includes(code) ? 'rtl' : 'ltr'; };

const combo = () => document.querySelector('.goog-te-combo');

export const currentLanguage = () => document.cookie.match(/(?:^|; )googtrans=\/[^/]*\/([^;]+)/)?.[1] || '';

// Resolves with the language select Google builds, or rejects if it can't be reached.
export function loadTranslate() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.id = HOST;
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    window.googleTranslateElementInit = () => new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, HOST);
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.onerror = () => { loading = null; script.remove(); host.remove(); reject(new Error('blocked')); };
    document.head.appendChild(script);
    const started = Date.now();
    const wait = setInterval(() => {
      if (combo()?.options.length > 1) { clearInterval(wait); resolve(combo()); } else if (Date.now() - started > 15000) { clearInterval(wait); loading = null; reject(new Error('timeout')); }
    }, 200);
  });
  return loading;
}

export async function setLanguage(code) {
  if (!code) {
    // Reloading is the only reliable way to put the original text back.
    const expired = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = expired;
    document.cookie = `${expired}; domain=${location.hostname}`;
    location.reload();
    return;
  }
  applyDirection(code);
  const select = await loadTranslate();
  select.value = code;
  select.dispatchEvent(new Event('change'));
}

applyDirection(currentLanguage());
if (currentLanguage()) loadTranslate().catch(() => {});
