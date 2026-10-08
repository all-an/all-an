// The quiz countdown. Cosmetic: the server stamped when the question was served and measures the
// answer against that, so pausing or editing this changes nothing but when the browser submits.
//
// The question fragment carries data-countdown (milliseconds left) and data-limit (seconds). Every
// time #runner is swapped, this restarts for the new content - or stops, for a verdict.

(function () {
  var timer = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(runner) {
    var deadline = Date.now() + Number(runner.dataset.countdown);
    var limitMs = Number(runner.dataset.limit) * 1000;
    var clock = runner.querySelector('#clock');
    var bar = runner.querySelector('#bar');
    var form = runner.querySelector('#answer-form');

    function tick() {
      var left = Math.max(0, deadline - Date.now());

      clock.textContent = Math.ceil(left / 1000) + 's';
      clock.classList.toggle('urgent', Math.ceil(left / 1000) <= 10);
      bar.style.width = Math.min(100, (left / limitMs) * 100) + '%';

      if (left <= 0) {
        stop();
        // Submit whatever is there. The server decides whether it was in time.
        htmx.trigger(form, 'submit');
      }
    }

    tick();
    timer = setInterval(tick, 100);
  }

  htmx.onLoad(function (root) {
    var runner = root.id === 'runner' ? root : root.querySelector && root.querySelector('#runner');

    // Other swaps (the notice, the "learned" note) pass through here too; leave the clock alone.
    if (!runner) return;

    stop();

    if (runner.dataset.countdown) start(runner);
  });
})();
