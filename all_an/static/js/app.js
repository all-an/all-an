// Dates are rendered in UTC by the server; the reader wants their own clock.
(function () {
  var format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

  function localise(root) {
    root.querySelectorAll('time[data-date]').forEach(function (el) {
      var date = new Date(el.getAttribute('datetime'));
      if (!isNaN(date)) el.textContent = format.format(date);
    });
  }

  document.addEventListener('DOMContentLoaded', function () { localise(document); });
  document.addEventListener('htmx:load', function (e) { localise(e.target); });
})();

// Hamburger menu for the site navigation on narrow screens.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.getElementById('shell-nav');
    if (!nav) return;
    var toggle = nav.querySelector('.nav-toggle');

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  });
})();
