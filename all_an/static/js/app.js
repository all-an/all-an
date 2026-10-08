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
