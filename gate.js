// Password screen: a blank white page with a password box, shown before anything else.
// Loaded first (and synchronously) in every page's <head>, so nothing is visible until it's unlocked.
// Only the main page (the app chooser) asks. An app page loads this with data-app="landscape/" (or "walls/"):
// if the tab isn't unlocked yet it goes to the main page, which asks and then sends you on to that app.
// Note: this keeps casual visitors out; it is not real security (the pages are public files).
(function () {
  var KEY = 'questsketch.unlocked';
  // FNV-1a hash of the password, so the word itself isn't written here.
  // New password: run  node -e 'let h=0x811c9dc5;for(const c of "newword"){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}console.log(h.toString(16).padStart(8,"0"))'
  var HASH = '1c3d764a';
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  var me = document.currentScript, app = me && me.getAttribute('data-app');
  var APPS = ['landscape/', 'walls/'];   // the only places the main page will send you on to
  var unlocked = false;
  try { unlocked = sessionStorage.getItem(KEY) === HASH; } catch (_) {}
  if (app) {
    // an app page: open if unlocked, otherwise off to the main page (showing nothing meanwhile)
    if (!unlocked) {
      document.documentElement.style.display = 'none';
      location.replace(new URL('../?next=' + encodeURIComponent(app), location.href).href);
    }
    return;
  }
  var next = null;
  try { next = new URLSearchParams(location.search).get('next'); } catch (_) {}
  if (APPS.indexOf(next) < 0) next = null;
  if (unlocked) { if (next) location.replace(new URL(next, location.href).href); return; }

  var root = document.documentElement;
  root.classList.add('pw-locked');
  var css = document.createElement('style');
  css.textContent =
    'html.pw-locked, html.pw-locked body { background: #fff !important; overflow: hidden !important; }' +
    'html.pw-locked body > *:not(#pwGate) { display: none !important; }' +
    '#pwGate { position: fixed; inset: 0; background: #fff; display: flex; align-items: center; justify-content: center; z-index: 2147483647; font-family: system-ui, sans-serif; }' +
    '#pwGate form { display: flex; flex-direction: column; gap: 10px; width: min(280px, 80vw); }' +
    '#pwGate input { font: inherit; font-size: 18px; padding: 10px 12px; border: 1px solid #bbb; border-radius: 8px; outline: none; color: #222; background: #fff; }' +
    '#pwGate input:focus { border-color: #666; }' +
    '#pwGate button { font: inherit; font-size: 16px; padding: 9px 12px; border: 1px solid #bbb; border-radius: 8px; background: #f4f4f4; color: #222; cursor: pointer; }' +
    '#pwGate .pwErr { color: #b3261e; font-size: 14px; min-height: 18px; text-align: center; }' +
    '@keyframes pwShake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-8px) } 75% { transform: translateX(8px) } }' +
    '#pwGate form.shake { animation: pwShake 0.25s 2; }';
  document.head.appendChild(css);

  function build() {
    var gate = document.createElement('div');
    gate.id = 'pwGate';
    gate.innerHTML = '<form autocomplete="off"><input type="password" placeholder="Password" aria-label="Password" autofocus>' +
      '<button type="submit">Enter</button><div class="pwErr"></div></form>';
    document.body.appendChild(gate);
    var form = gate.querySelector('form'), input = gate.querySelector('input'), err = gate.querySelector('.pwErr');
    input.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (fnv(input.value.trim().toLowerCase()) === HASH) {
        try { sessionStorage.setItem(KEY, HASH); } catch (_) {}
        if (next) { location.replace(new URL(next, location.href).href); return; }   // on to the app you were opening
        try { history.replaceState(null, '', location.pathname); } catch (_) {}
        gate.remove();
        root.classList.remove('pw-locked');
        window.dispatchEvent(new Event('resize'));   // let the 3D view size itself now that it's visible
        window.dispatchEvent(new Event('pwunlocked'));
      } else {
        err.textContent = 'Wrong password';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        input.select();
      }
    });
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
