/* Start page for "npm start". Plain JavaScript; talks to the local server in src/app.ts. */
(function () {
  'use strict';
  var TESTS = [
    ['contrast', 'Colour contrast', 'Text, placeholders, borders, icons'],
    ['colorInventory', 'Colour inventory', 'Every colour in the CSS and where it is used'],
    ['keyboard', 'Keyboard', 'Tab order, traps, controls that cannot be reached'],
    ['focus', 'Focus visible', 'Missing or weak focus indicators'],
    ['responsive', 'Small viewports', '360 x 256 and 320 x 256, scrolled top to bottom'],
    ['zoom', 'Zoom', '100%, 200% and 400%, scrolled top to bottom'],
    ['textSpacing', 'Text spacing', 'Line, letter, word and paragraph spacing increased'],
    ['forcedColors', 'Windows High Contrast', 'Forced colours: screenshot and focus check'],
    ['openedContent', 'Menus, accordions and tabs', 'Opens each one and tests what was hidden'],
    ['hoverContent', 'Tooltips', 'Content shown on hover or focus'],
    ['formErrors', 'Form errors', 'Submits forms empty; nothing is sent to the server'],
    ['headings', 'Headings', 'Heading tree, skipped levels, missing markup'],
    ['images', 'Images', 'Alt text, decorative and complex images'],
    ['links', 'Links', 'Purpose, external and new-tab links, breadcrumbs'],
    ['aria', 'ARIA and names', 'Accessible names, ARIA references and roles'],
    ['forms', 'Forms', 'Labels, required fields, grouping'],
    ['landmarks', 'Landmarks', 'Main, navigation, skip link'],
    ['page', 'Page title and language', 'Title, lang, duplicate ids'],
    ['modals', 'Modal dialogs', 'Name, focus in, focus kept in, focus return'],
    ['dynamicContent', 'Dynamic content', 'Live regions and search result updates'],
    ['carousel', 'Carousels', 'Auto-rotation, hidden slides'],
    ['screenReader', 'Screen reader markup', 'Hidden content, date ranges, link and date grouping'],
    ['axe', 'axe-core rules', 'Standard WCAG 2.2 A and AA rule set'],
    // Optional: not ticked unless the config turns them on.
    ['tables', 'Table markup (optional)', 'Headers, captions, scope. Tick only when needed'],
    ['lists', 'List markup (optional)', 'Typed bullets, list-like content. Tick only when needed']
  ];
  // Focus checks happen during the keyboard test; the colour inventory is collected with the contrast test.
  var NEEDS = { focus: 'keyboard', colorInventory: 'contrast' };

  var root = document.getElementById('view');
  var boxes = {}, timer = null, seen = 0, wasRunning = false;

  /** Element builder. Example: h('button', { class: 'btn', text: 'Run' }) */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  }
  function api(path, body) {
    return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }

  // ------------------------------------------------------------------ form
  var url = h('input', { type: 'url', id: 'url', required: true, placeholder: 'https://stg-rbi.webc.in/regulated-entities', autocomplete: 'url', 'aria-describedby': 'url-hint url-error' });
  var urlError = h('p', { class: 'error', id: 'url-error', role: 'alert' });
  var more = h('textarea', { id: 'more', rows: '3', placeholder: 'https://stg-rbi.webc.in/about-us\nhttps://stg-rbi.webc.in/press-releases', 'aria-describedby': 'more-hint' });
  var single = h('input', { type: 'radio', name: 'mode', value: 'test', checked: true });
  var crawl = h('input', { type: 'radio', name: 'mode', value: 'crawl' });
  var maxPages = h('input', { type: 'number', id: 'maxPages', min: '1', max: '2000', value: '50' });
  var maxDepth = h('input', { type: 'number', id: 'maxDepth', min: '0', max: '20', value: '3' });
  var limits = h('div', { class: 'row', hidden: true }, [
    h('div', { class: 'field' }, [h('label', { for: 'maxPages', text: 'Most pages to test' }), maxPages]),
    h('div', { class: 'field' }, [h('label', { for: 'maxDepth', text: 'Link depth from the start page' }), maxDepth])
  ]);
  function modeChanged() { limits.hidden = !crawl.checked; }
  single.addEventListener('change', modeChanged);
  crawl.addEventListener('change', modeChanged);

  var testGrid = h('div', { class: 'tests' }, TESTS.map(function (t) {
    var box = h('input', { type: 'checkbox', checked: !/optional/.test(t[1]) });
    boxes[t[0]] = box;
    box.addEventListener('change', function () { link(t[0]); });
    return h('label', { class: 'choice' }, [box, h('span', null, [t[1], h('small', { text: t[2] })])]);
  }));
  function link(changed) {
    Object.keys(NEEDS).forEach(function (dep) {
      var parent = NEEDS[dep];
      if (changed === dep && boxes[dep].checked) boxes[parent].checked = true;
      if (changed === parent && !boxes[parent].checked) boxes[dep].checked = false;
    });
  }
  var OPTIONAL = { tables: true, lists: true };
  // "Select all" selects the standard set; the optional tests stay as they are.
  function setAll(v) { Object.keys(boxes).forEach(function (k) { if (v && OPTIONAL[k]) return; boxes[k].checked = v; }); }

  var user = h('input', { type: 'text', id: 'user', autocomplete: 'off' });
  var pass = h('input', { type: 'password', id: 'pass', autocomplete: 'off' });
  var loginNote = h('p', { class: 'hint' });
  var runBtn = h('button', { class: 'btn primary run', type: 'submit', text: 'Run test' });
  var lastReport = h('a', { href: '/report/', text: 'Open the last report', hidden: true });

  var form = h('form', { novalidate: true, onsubmit: start }, [
    h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [
        h('label', { for: 'url', text: 'Page address' }), url,
        h('span', { class: 'hint', id: 'url-hint', text: 'The page to test, or the page to start crawling from.' }), urlError
      ]),
      h('fieldset', null, [
        h('legend', { text: 'What to test' }),
        h('div', { class: 'row' }, [
          h('label', { class: 'choice' }, [single, h('span', null, ['These pages only', h('small', { text: 'Tests the address above and any listed below.' })])]),
          h('label', { class: 'choice' }, [crawl, h('span', null, ['Whole site', h('small', { text: 'Follows links on the same site and tests every page found.' })])])
        ])
      ]),
      limits,
      h('div', { class: 'field', style: 'margin-top:14px' }, [
        h('label', { for: 'more', text: 'More pages (optional)' }), more,
        h('span', { class: 'hint', id: 'more-hint', text: 'One full address per line. They are tested as well as the page above.' })
      ])
    ]),
    h('div', { class: 'card' }, h('fieldset', null, [
      h('legend', { text: 'Tests to run' }),
      h('p', null, [h('button', { class: 'btn', type: 'button', text: 'Select all', onclick: function () { setAll(true); } }), ' ', h('button', { class: 'btn', type: 'button', text: 'Clear all', onclick: function () { setAll(false); } })]),
      testGrid
    ])),
    h('div', { class: 'card' }, h('fieldset', null, [
      h('legend', { text: 'Site login' }), loginNote,
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { for: 'user', text: 'Username (optional)' }), user]),
        h('div', { class: 'field' }, [h('label', { for: 'pass', text: 'Password (optional)' }), pass])
      ])
    ])),
    h('p', null, [runBtn, ' \u00a0 ', lastReport])
  ]);

  // ------------------------------------------------------------------ progress panel
  var status = h('h2', { id: 'status', role: 'status', tabindex: '-1', text: '' });
  var log = h('pre', { id: 'log', tabindex: '0', 'aria-label': 'Progress log' });
  var stopBtn = h('button', { class: 'btn', type: 'button', text: 'Stop after this page', onclick: function () { stopBtn.disabled = true; api('/api/stop', {}).catch(function () {}); } });
  var result = h('div', { class: 'result', hidden: true });
  var panel = h('div', { class: 'card', hidden: true }, [status, h('p', null, stopBtn), log, result]);

  root.append(form, panel);

  // ------------------------------------------------------------------ behaviour
  function start(e) {
    e.preventDefault();
    urlError.textContent = '';
    var value = url.value.trim();
    if (!/^https?:\/\/\S+\.\S+|^https?:\/\/localhost|^https?:\/\/127\./.test(value)) {
      urlError.textContent = 'Enter the full page address, starting with https:// or http://';
      url.focus();
      return;
    }
    var tests = {};
    Object.keys(boxes).forEach(function (k) { tests[k] = boxes[k].checked; });
    if (!Object.keys(tests).some(function (k) { return tests[k]; })) { urlError.textContent = 'Tick at least one test.'; return; }
    runBtn.disabled = true;
    api('/api/run', { url: value, mode: crawl.checked ? 'crawl' : 'test', maxPages: Number(maxPages.value), maxDepth: Number(maxDepth.value), tests: tests, urls: more.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean), username: user.value, password: pass.value })
      .then(function () { pass.value = ''; seen = 0; log.textContent = ''; result.hidden = true; panel.hidden = false; status.textContent = 'Starting\u2026'; panel.scrollIntoView({ block: 'start' }); poll(true); })
      .catch(function (err) { urlError.textContent = err.message; runBtn.disabled = false; });
  }

  function show(s) {
    if (s.log.length) {
      var atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
      log.append(s.log.join('\n') + '\n');
      if (atEnd) log.scrollTop = log.scrollHeight;
    }
    seen = s.next;
    panel.hidden = !(s.running || s.summary || s.error);
    stopBtn.hidden = !s.running;
    stopBtn.disabled = s.stopRequested;
    runBtn.disabled = s.running;
    lastReport.hidden = !s.hasReport || s.running;
    if (s.running) {
      var text = 'Testing ' + s.target + ' \u2013 ' + s.pagesDone + ' page(s) finished' + (s.stopRequested ? ', stopping after the current page' : '');
      if (status.textContent !== text) status.textContent = text;
    } else if (s.error) {
      status.textContent = 'The test could not run: ' + s.error;
      result.hidden = true;
    } else if (s.summary) {
      var t = s.summary, v = t.wcagAA;
      status.textContent = 'Finished: ' + t.pages + ' page(s) tested';
      var cls = v === false ? 'f' : v === null ? 'r' : 't';
      var verdict = v === false ? 'Overall WCAG AA: FAIL (false)' : v === null ? 'Overall WCAG AA: not decided (null), manual review pending' : 'Overall WCAG AA: PASS (true)';
      result.replaceChildren.apply(result, [
        h('span', { class: 'big pill ' + cls, text: verdict }),
        h('span', { text: t.passed + ' passed, ' + t.failed + ' failed, ' + t.manualReview + ' manual review, ' + t.projectFailed + ' RBI project-rule failures' }),
        h('a', { class: 'btn primary', href: '/report/', text: 'Open the dashboard' }),
        s.problems && s.problems.length ? h('p', { class: 'error', text: s.problems.length + ' page(s) could not be tested: ' + s.problems.slice(0, 3).join('; ') }) : null
      ].filter(Boolean));
      result.hidden = false;
    }
    if (wasRunning && !s.running) { panel.scrollIntoView({ block: 'start' }); status.focus(); } // tell keyboard and screen reader users it has finished
    wasRunning = s.running;
  }

  function poll(now) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      api('/api/state?since=' + seen).then(function (s) { show(s); if (s.running) poll(); }).catch(function () { poll(); });
    }, now ? 0 : 1000);
  }

  // First load: fill in the defaults from the config file, and pick up a run that is already going.
  api('/api/state?since=0').then(function (s) {
    var d = s.defaults;
    if (d.url) url.value = d.url;
    maxPages.value = d.maxPages;
    maxDepth.value = d.maxDepth;
    Object.keys(boxes).forEach(function (k) { if (k in d.tests) boxes[k].checked = d.tests[k]; });
    loginNote.textContent = d.loginFromEnv
      ? 'A username and password were found in the .env file and will be used. Leave these empty unless you want to use a different login for this run.'
      : 'No login was found in the .env file. If the site asks for a username and password, enter them here. They are used for this run only and are not saved.';
    show(s);
    if (s.running) poll();
  });
})();
