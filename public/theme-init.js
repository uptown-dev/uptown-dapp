// Applies the visitor's remembered light or dark choice before the page paints.
// Without a remembered choice the stylesheet follows the system setting.
(function () {
  try {
    var t = window.localStorage.getItem('uptown-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage unavailable: follow the system setting */
  }
})();
