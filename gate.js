// Password screen: a blank white page with a password box, shown before anything else.
// Loaded first (and synchronously) in each page's <head>, so nothing on the page is visible until it's unlocked.
// Once unlocked, this browser tab stays unlocked while you move between the pages.
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
  try { if (sessionStorage.getItem(KEY) === HASH) return; } catch (_) {}

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
