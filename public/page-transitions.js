/* ==========================================================================
   GraceBooks page transitions
   Purely additive — does not modify, override, or intercept any existing
   onclick handler, form, or business logic. Scope is deliberately narrow:

   1. Clicks on plain <a href="..."> links that point to another page on
      this same origin (not target="_blank", not a modifier-key click, not
      a same-page hash link) get a short delay so the CSS exit fade in
      page-transitions.css is visible before the browser navigates away.
   2. window.gbFadeNav(url) does the same delay-then-navigate for the small
      number of buttons whose entire onclick is a plain redirect (verified
      individually before being switched to call this helper — anything
      more than a plain redirect, e.g. logout's confirm() dialog, is left
      completely untouched and keeps navigating instantly).

   If prefers-reduced-motion is set, neither behavior runs — links navigate
   natively and gbFadeNav redirects immediately, with zero added delay.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  if (reduceMotion) {
    window.gbFadeNav = function (url) {
      if (url) window.location.href = url;
    };
    return;
  }

  var EXIT_MS = 170;

  function isPlainLeftClick(e) {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  }

  function sameOriginHtmlHref(a) {
    try {
      var target = a.getAttribute('target');
      if (target && target !== '_self') return null;
      if (a.hasAttribute('download')) return null;

      var href = a.getAttribute('href');
      if (!href) return null;

      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return null;

      var here = window.location;
      if (url.pathname === here.pathname && url.search === here.search) return null; // same-page hash change

      return url.href;
    } catch (err) {
      return null;
    }
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || !isPlainLeftClick(e)) return;

    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;

    var dest = sameOriginHtmlHref(a);
    if (!dest) return;

    e.preventDefault();
    document.documentElement.classList.add('gb-page-exit');
    setTimeout(function () {
      window.location.href = dest;
    }, EXIT_MS);
  }, false);

  window.gbFadeNav = function (url) {
    if (!url) return;
    document.documentElement.classList.add('gb-page-exit');
    setTimeout(function () {
      window.location.href = url;
    }, EXIT_MS);
  };
})();
