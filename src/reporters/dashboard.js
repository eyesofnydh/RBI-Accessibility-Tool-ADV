/* Dashboard for reports/index.html. Plain JavaScript, no dependencies; the data is embedded in the page. */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('report-data').textContent);
  var view = document.getElementById('view');
  var tabsEl = document.getElementById('tabs');
  var state = { tab: 'Overview', f: { url: '', wcag: '', severity: '', category: '', status: '', level: '', q: '' }, issue: null, page: D.pages[0] ? D.pages[0].url : '', contrast: 'false', limit: 200, grouped: D.pages.length > 1 };

  /** Element builder. Example: h('td', { class: 'num', text: '4.47' }) */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') Object.keys(v).forEach(function (p) { e.style[p] = v[p]; });
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    [].concat(kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  }
  function word(s) { return s === true ? 'true' : s === false ? 'false' : 'null'; }
  function cls(s) { return s === true ? 't' : s === false ? 'f' : 'r'; }
  function pill(s, label) { return h('span', { class: 'pill ' + cls(s), text: label || (s === true ? 'PASS  true' : s === false ? 'FAIL  false' : 'MANUAL_REVIEW  null') }); }
  function table(head, rows) {
    var first = rows[0] ? rows[0].children : [];
    return h('div', { class: 'scroll' }, h('table', null, [
      h('thead', null, h('tr', null, head.map(function (t, i) { return h('th', { scope: 'col', text: t, class: first[i] && /\bnum\b/.test(first[i].className) ? 'num' : null }); }))),
      h('tbody', null, rows)
    ]));
  }
  function uniq(list) { return Array.from(new Set(list.filter(Boolean))).sort(); }
  function select(label, key, options, obj, after) {
    var s = h('select', { onchange: function () { obj[key] = s.value; state.limit = 200; (after || render)(); } },
      [h('option', { value: '', text: 'All' })].concat(options.map(function (o) { var v = typeof o === 'string' ? o : o[0]; return h('option', { value: v, text: typeof o === 'string' ? o : o[1] }); })));
    s.value = obj[key] || '';
    return h('label', null, [label, s]);
  }
  function pagePicker() {
    var s = h('select', { onchange: function () { state.page = s.value; render(); } }, D.pages.map(function (p) { return h('option', { value: p.url, text: p.url }); }));
    s.value = state.page;
    return h('div', { class: 'filters' }, h('label', null, ['Page', s]));
  }
  function currentPage() { return D.pages.filter(function (p) { return p.url === state.page; })[0] || D.pages[0]; }
  function swatch(c) {
    if (!/^#|^rgb/.test(c || '')) return h('span', { text: c || '' });
    return h('span', { style: { whiteSpace: 'nowrap' } }, [h('span', { class: 'sw', style: { background: c } }), h('code', { text: c })]);
  }
  function go(tab, filters) { state.tab = tab; if (filters) { state.f = Object.assign({ url: '', wcag: '', severity: '', category: '', status: '', level: '', q: '' }, filters); state.issue = null; } render(); view.focus(); }

  // ------------------------------------------------------------------ Overview
  function overview() {
    var t = D.totals, v = t.wcagAA;
    var text = v === false ? 'Overall WCAG AA: FAIL (false)' : v === null ? 'Overall WCAG AA: not decided (null)' : 'Overall WCAG AA: PASS (true)';
    var sub = v === false ? t.failed + ' automatic check(s) failed.' : v === null ? 'No automatic check failed, but ' + t.manualReview + ' item(s) still need a manual review. This is not a pass.' : 'Every automatic check passed and nothing is left to review.';
    var out = [
      h('div', { class: 'verdict ' + cls(v) }, [
        h('div', null, [h('div', { class: 'score', text: t.score + '%' }), h('small', { text: 'Accessibility score' })]),
        h('div', null, [h('div', { class: 'big', text: text }), h('small', { text: sub + ' Score = passed / (passed + failed) over automatic WCAG checks. Manual-review items are not counted either way.' })])
      ]),
      h('div', { class: 'counts' }, [
        count('t', '\u2713 ' + t.passed.toLocaleString(), 'Passed (true)', null),
        count('f', '\u2715 ' + t.failed.toLocaleString(), 'Failed (false)', { status: 'false', level: 'wcag' }),
        count('r', '? ' + t.manualReview.toLocaleString(), 'Manual review (null)', { status: 'null' }),
        count('', String(t.projectFailed), 'RBI project-rule failures (not WCAG)', { status: 'false', level: 'project' }),
        count('', String(t.pages), 'Pages tested', null)
      ])
    ];
    function count(c, big, label, filters) {
      return h('button', { class: 'count ' + c, onclick: filters ? function () { go('Issues', filters); } : null, disabled: filters ? null : 'disabled', style: filters ? null : { cursor: 'default' } }, [h('b', { text: big }), h('span', { text: label })]);
    }
    var sev = ['Critical', 'Serious', 'Moderate', 'Minor'];
    out.push(h('h2', { text: 'Failures by severity and level' }));
    out.push(h('div', { class: 'counts' }, sev.map(function (s) {
      return h('button', { class: 'count', onclick: function () { go('Issues', { severity: s, status: 'false' }); } }, [h('b', { text: String(t.bySeverity[s] || 0) }), h('span', { text: s + ' issues' })]);
    }).concat(['A', 'AA'].map(function (l) {
      return h('button', { class: 'count', onclick: function () { go('Issues', { level: l, status: 'false' }); } }, [h('b', { text: String(t.byLevel[l] || 0) }), h('span', { text: 'WCAG ' + l + ' issues' })]);
    }))));
    out.push(h('h2', { text: 'By category' }));
    out.push(table(['Category', 'Passed', 'Failed (WCAG)', 'Manual review', 'RBI project rules', ''], Object.keys(t.byCategory).sort().map(function (c) {
      var x = t.byCategory[c];
      return h('tr', null, [h('td', { text: c }), h('td', { class: 'num', text: x.passed }), h('td', { class: 'num' }, x.failed ? pill(false, String(x.failed)) : '0'), h('td', { class: 'num' }, x.manualReview ? pill(null, String(x.manualReview)) : '0'), h('td', { class: 'num', text: x.project }),
        h('td', null, h('button', { class: 'linkbtn', text: 'Show issues', onclick: function () { go('Issues', { category: c }); } }))]);
    })));
    out.push(h('h2', { text: 'By page' }));
    out.push(table(['Page', 'Passed', 'Failed', 'Manual review', 'RBI project rules', 'WCAG AA', ''], D.pages.map(function (p) {
      var s = p.summary;
      return h('tr', null, [h('td', null, [h('a', { href: p.url, text: p.url }), h('div', { class: 'muted', text: p.title })]), h('td', { class: 'num', text: s.passed }), h('td', { class: 'num', text: s.failed }), h('td', { class: 'num', text: s.manualReview }), h('td', { class: 'num', text: s.projectFailed }), h('td', null, pill(s.wcagAA, word(s.wcagAA))),
        h('td', null, h('button', { class: 'linkbtn', text: 'Show issues', onclick: function () { go('Issues', { url: p.url }); } }))]);
    })));
    var notes = D.pages.filter(function (p) { return p.errors && p.errors.length; });
    if (notes.length) {
      out.push(h('h2', { text: 'Notes from the run' }));
      notes.forEach(function (p) { out.push(h('div', { class: 'note' }, [h('strong', { text: p.url }), h('ul', null, p.errors.map(function (e) { return h('li', { text: e }); }))])); });
    }
    return out;
  }

  // ------------------------------------------------------------------ Issues
  function matches(f) {
    var s = state.f;
    if (s.url && f.url !== s.url) return false;
    if (s.wcag && f.wcag !== s.wcag) return false;
    if (s.severity && f.severity !== s.severity) return false;
    if (s.category && f.category !== s.category) return false;
    if (s.status && word(f.status) !== s.status) return false;
    if (s.level === 'wcag' && f.level !== 'A' && f.level !== 'AA') return false;
    if (s.level === 'project' && (f.level === 'A' || f.level === 'AA')) return false;
    if (s.level && s.level !== 'wcag' && s.level !== 'project' && f.level !== s.level) return false;
    if (s.q && (f.id + ' ' + f.bugSentence + ' ' + f.selector + ' ' + f.issue + ' ' + f.regression).toLowerCase().indexOf(s.q.toLowerCase()) < 0) return false;
    return true;
  }
  function bugText(f) {
    return ['Issue ID: ' + f.id, 'Page: ' + f.page + ' (' + f.url + ')', 'Section: ' + (f.section || '-'), 'Issue: ' + f.bugSentence, '', 'Steps to Reproduce:'].concat(f.steps.map(function (s, i) { return (i + 1) + '. ' + s; }))
      .concat(['', 'Actual Result: ' + f.actual, 'Expected Result: ' + f.expected, 'WCAG Criterion: ' + (f.wcag ? f.wcag + ' ' + f.wcagName : 'Not a WCAG criterion'), 'WCAG Level: ' + f.level, 'Severity: ' + f.severity, 'Selector: ' + f.selector, 'Evidence: ' + [f.evidence, f.html].filter(Boolean).join(' '), 'Screenshot: ' + (f.screenshot || '-'), 'Status: ' + f.result + ' (' + word(f.status) + ')']).join('\n');
  }
  function detail(f) {
    var dl = h('dl');
    function row(k, v) { if (v === '' || v === null || v === undefined) return; dl.append(h('dt', { text: k }), h('dd', null, v)); }
    row('Result', pill(f.status));
    row('WCAG', f.wcag ? f.wcag + ' ' + f.wcagName + ' (Level ' + f.level + ')' : f.level + ' rule, not a WCAG criterion');
    row('Severity and confidence', f.severity + ', ' + f.confidence);
    row('Page', h('a', { href: f.url, text: f.url }));
    row('Where', [f.section, f.context !== 'desktop' ? 'at ' + f.context : ''].filter(Boolean).join(', '));
    row('Steps to reproduce', h('ol', { style: { margin: '0', paddingLeft: '20px' } }, f.steps.map(function (s) { return h('li', { text: s }); })));
    row('Actual', f.actual);
    row('Expected', f.expected);
    row('Why this was raised', f.why);
    row('Evidence', f.evidence);
    if (f.status === null) row('What to check by hand', f.manualInstruction);
    row('Suggested fix', f.recommendation);
    if (f.regression) row('RBI regression item', f.regression);
    var grp = (D.groups || []).filter(function (g) { return g.id === f.group; })[0];
    if (grp && grp.pages > 1) row('Also on', h('ul', { style: { margin: '0', paddingLeft: '20px' } }, grp.urls.slice(0, 25).map(function (u) { return h('li', null, h('a', { href: u, text: u })); }).concat(grp.urls.length > 25 ? [h('li', { text: 'and ' + (grp.urls.length - 25) + ' more pages' })] : [])));
    if (f.count > 1) row('Elements affected', String(f.count));
    if (f.screenshot) row('Screenshot', h('a', { href: f.screenshot, target: '_blank', rel: 'noopener' }, h('img', { src: f.screenshot, alt: 'Screenshot of the affected element (opens full size in a new tab)', loading: 'lazy' })));
    row('Selector', f.selector && h('pre', { text: f.selector }));
    row('XPath', f.xpath && h('pre', { text: f.xpath }));
    row('Element', f.element && [h('code', { text: '<' + f.element + '>' }), ' role: ', h('code', { text: f.role || '-' }), ' name: ', h('code', { text: f.name || '(none)' })]);
    row('HTML', f.html && h('pre', { text: f.html }));
    var css = Object.keys(f.computedStyle || {}).map(function (k) { return k + ': ' + f.computedStyle[k] + ';'; }).join('\n');
    row('Computed CSS', css && h('pre', { text: css }));
    var copied = h('span', { class: 'muted', role: 'status' });
    return h('aside', { class: 'detail', 'aria-label': 'Issue details' }, [
      h('h3', { text: f.id + '  ' + f.issue }),
      h('p', { text: f.bugSentence }),
      h('p', null, [
        h('button', { class: 'btn primary', text: 'Copy bug report', onclick: function () { navigator.clipboard.writeText(bugText(f)).then(function () { copied.textContent = ' Bug report copied'; }, function () { copied.textContent = ' Copy failed; select the text instead'; }); } }), ' ',
        h('button', { class: 'btn', text: 'Close details', onclick: function () { state.issue = null; render(); } }), copied
      ]),
      dl
    ]);
  }
  function issues() {
    var F = D.findings, s = state.f;
    var search = h('input', { type: 'search', value: s.q, placeholder: 'ID, text or selector' });
    search.addEventListener('change', function () { s.q = search.value; state.limit = 200; render(); });
    var filters = h('div', { class: 'filters' }, [
      select('Status', 'status', [['false', 'Failed (false)'], ['null', 'Manual review (null)']], s),
      select('Level', 'level', [['wcag', 'WCAG A and AA'], ['A', 'WCAG A'], ['AA', 'WCAG AA'], ['project', 'RBI project and best practice']], s),
      select('Severity', 'severity', ['Critical', 'Serious', 'Moderate', 'Minor'], s),
      select('Category', 'category', uniq(F.map(function (f) { return f.category; })), s),
      select('WCAG criterion', 'wcag', uniq(F.map(function (f) { return f.wcag; })).map(function (w) { var x = F.filter(function (f) { return f.wcag === w; })[0]; return [w, w + ' ' + x.wcagName]; }), s),
      select('URL', 'url', uniq(F.map(function (f) { return f.url; })), s),
      h('label', null, ['Search', search]),
      h('button', { class: 'btn', text: 'Clear filters', onclick: function () { go('Issues', {}); } })
    ]);
    var rows = F.filter(matches);
    var selected = F.filter(function (f) { return f.id === state.issue; })[0];
    var viewSel = h('select', { onchange: function () { state.grouped = viewSel.value === 'g'; state.limit = 200; render(); } }, [h('option', { value: 'g', text: 'Each distinct issue once' }), h('option', { value: 'a', text: 'Every occurrence' })]);
    viewSel.value = state.grouped ? 'g' : 'a';
    filters.insertBefore(h('label', null, ['Show', viewSel]), filters.firstChild);
    if (state.grouped) {
      // One row per distinct issue: the first occurrence stands for the group.
      var byGroup = {}, order = [];
      rows.forEach(function (f) { var k = f.group || f.id; if (!byGroup[k]) { byGroup[k] = { first: f, n: 0, urls: {} }; order.push(k); } byGroup[k].n += f.count; byGroup[k].urls[f.url] = 1; });
      var gbody = order.slice(0, state.limit).map(function (k) {
        var g = byGroup[k], f = g.first, pages = Object.keys(g.urls).length;
        return h('tr', null, [
          h('td', { class: 'nowrap' }, h('button', { class: 'linkbtn', text: f.group || f.id, 'aria-label': 'Show details of ' + (f.group || f.id), onclick: function () { state.issue = f.id; render(); } })),
          h('td', null, pill(f.status, f.status === false ? 'FAIL' : 'REVIEW')),
          h('td', { text: f.severity }), h('td', { text: f.wcag || f.level }), h('td', { text: f.category }),
          h('td', { text: f.bugSentence }),
          h('td', { class: 'num', text: pages }), h('td', { class: 'num', text: g.n }),
          h('td', { class: 'muted', text: f.context })
        ]);
      });
      var glist = [h('p', { class: 'muted', role: 'status', text: order.length + ' distinct issue(s) covering ' + rows.length + ' occurrence(s). Select an ID for the full bug report.' })];
      glist.push(order.length ? table(['Group', 'Result', 'Severity', 'WCAG', 'Category', 'Bug sentence', 'Pages', 'Elements', 'Viewport or state'], gbody) : h('p', { text: 'No issues match these filters.' }));
      if (order.length > state.limit) glist.push(h('p', null, h('button', { class: 'btn', text: 'Show 200 more', onclick: function () { state.limit += 200; render(); } })));
      return [filters, h('div', { class: 'split' + (selected ? ' open' : '') }, [h('div', null, glist), selected ? detail(selected) : null])];
    }
    var body = rows.slice(0, state.limit).map(function (f) {
      return h('tr', null, [
        h('td', { class: 'nowrap' }, h('button', { class: 'linkbtn', text: f.id, 'aria-label': 'Show details of ' + f.id, onclick: function () { state.issue = f.id; render(); } })),
        h('td', null, pill(f.status, f.status === false ? 'FAIL' : 'REVIEW')),
        h('td', { text: f.severity }),
        h('td', { text: f.wcag || f.level }),
        h('td', { text: f.category }),
        h('td', null, [f.bugSentence, f.count > 1 ? h('span', { class: 'muted', text: ' (' + f.count + ' elements)' }) : null]),
        h('td', { class: 'muted', text: f.url.replace(/^https?:\/\/[^/]+/, '') || '/' }),
        h('td', { class: 'muted', text: f.context })
      ]);
    });
    var list = [h('p', { class: 'muted', role: 'status', text: rows.length + ' of ' + F.length + ' issues shown. Select an ID for the full bug report.' })];
    list.push(rows.length ? table(['ID', 'Result', 'Severity', 'WCAG', 'Category', 'Bug sentence', 'Page', 'Viewport'], body) : h('p', { text: 'No issues match these filters.' }));
    if (rows.length > state.limit) list.push(h('p', null, h('button', { class: 'btn', text: 'Show 200 more', onclick: function () { state.limit += 200; render(); } })));
    return [filters, h('div', { class: 'split' + (selected ? ' open' : '') }, [h('div', null, list), selected ? detail(selected) : null])];
  }

  // ------------------------------------------------------------------ Colour contrast
  function contrast() {
    var st = { v: state.contrast };
    var filters = h('div', { class: 'filters' }, [
      (function () {
        var s = h('select', { onchange: function () { state.contrast = s.value; render(); } }, [['false', 'Failed (false)'], ['null', 'Manual review (null)'], ['true', 'Passed (true), grouped by colour pair']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        s.value = st.v;
        return h('label', null, ['Show', s]);
      })(),
      select('Page', 'url', D.pages.map(function (p) { return p.url; }), state.f)
    ]);
    var out = [h('h2', { text: 'Color Contrast Report' }), h('p', { class: 'muted', text: 'Colours are read from computed CSS, not from screenshots. Ratios are cut to two decimals and never rounded up, so 4.499 shows as 4.49 and fails. "Check" opens the WebAIM contrast checker with the same two colours. Every element, passes included, is in contrast-report.csv.' }), filters];
    function sample(c) { return /^#/.test(c.foreground) && /^#/.test(c.background) ? h('span', { class: 'aa', text: 'Aa', style: { color: c.foreground, background: c.background } }) : null; }
    function check(c) { return c.webaim ? h('a', { href: c.webaim, target: '_blank', rel: 'noopener', text: 'Check', 'aria-label': 'Check ' + c.foreground + ' on ' + c.background + ' in WebAIM (opens in a new tab)' }) : ''; }
    if (st.v === 'true') {
      out.push(table(['Pass', 'Ratio', 'Required', 'Sample', 'Foreground', 'Background', 'Check type', 'WCAG', 'Elements', 'Pages', 'Example text', 'WebAIM'], D.contrastPasses.map(function (c) {
        return h('tr', null, [h('td', null, pill(true, 'true')), h('td', { class: 'num', text: c.contrastRatio === null ? '' : c.contrastRatio.toFixed(2) + ':1' }), h('td', { class: 'num', text: c.requiredRatio + ':1' }), h('td', null, sample(c)), h('td', null, swatch(c.foreground)), h('td', null, swatch(c.background)), h('td', { text: c.check }), h('td', { text: c.wcag }), h('td', { class: 'num', text: c.count }), h('td', { class: 'num', text: c.pages }), h('td', { text: c.sample }), h('td', null, check(c))]);
      })));
      return out;
    }
    var rows = D.contrast.filter(function (c) { return word(c.status) === st.v && (!state.f.url || c.url === state.f.url); });
    out.push(h('p', { class: 'muted', role: 'status', text: rows.length + ' row(s).' }));
    out.push(rows.length ? table(['Page', 'Element', 'Text', 'Sample', 'Foreground', 'Background', 'Size / weight', 'Ratio', 'Required', 'WCAG', 'Pass', 'Note', 'WebAIM'], rows.slice(0, 1500).map(function (c) {
      return h('tr', null, [h('td', { class: 'muted', text: c.url.replace(/^https?:\/\/[^/]+/, '') || '/' }), h('td', null, h('code', { text: c.selector })), h('td', { text: c.text }), h('td', null, sample(c)), h('td', null, swatch(c.foreground)), h('td', null, swatch(c.background)),
        h('td', { text: c.fontSize ? c.fontSize + ' / ' + c.fontWeight + (c.largeText ? ' (large)' : '') : c.check }), h('td', { class: 'num', text: c.contrastRatio === null ? 'not measurable' : c.contrastRatio.toFixed(2) + ':1' }), h('td', { class: 'num', text: c.requiredRatio + ':1' }), h('td', { text: c.wcag }), h('td', null, pill(c.status, word(c.status))), h('td', { class: 'muted', text: c.note }), h('td', null, check(c))]);
    })) : h('p', { text: 'Nothing to show for this selection.' }));
    return out;
  }

  // ------------------------------------------------------------------ Colours
  function colours() {
    return [h('h2', { text: 'Color inventory' }), h('p', { class: 'muted', text: 'Every colour declared in stylesheets, CSS variables and inline styles, and how many rendered elements use it. Pairs that are actually used together are in the Color contrast tab.' }),
      table(['Color', 'As written', 'CSS variable', 'Source stylesheet', 'Selector', 'Property', 'Used by', 'Used as', 'Occurrences'], D.colors.map(function (c) {
        var src = c.sources || [];
        return h('tr', null, [h('td', null, swatch(c.color)), h('td', null, h('code', { text: c.raw.join(' | ') })), h('td', null, h('code', { text: c.variables.join(', ') })), h('td', { text: uniq(src.map(function (s) { return s.stylesheet; })).join(', ') }), h('td', null, h('code', { text: src.slice(0, 3).map(function (s) { return s.selector; }).join(' | ') })), h('td', { text: uniq(src.map(function (s) { return s.property; })).join(', ') }), h('td', { class: 'num', text: c.usedBy }), h('td', { text: c.usedAs.join(', ') }), h('td', { class: 'num', text: c.occurrences })]);
      }))];
  }

  // ------------------------------------------------------------------ Keyboard
  function keyboard() {
    var p = currentPage();
    var rows = (p.focusOrder || []).map(function (s) {
      var b = s.boundingBox;
      return h('tr', null, [h('td', { class: 'num', text: s.step }), h('td', { text: s.name || '(no name)' }), h('td', { text: s.role }), h('td', null, h('code', { text: s.selector })), h('td', { class: 'num', text: b ? b.x + ', ' + b.y : '' }), h('td', { class: 'num', text: b ? b.width + ' x ' + b.height : '' }),
        h('td', null, s.visible ? pill(true, 'visible') : pill(false, s.obscuredBy ? 'covered' : 'not visible')), h('td', { text: (s.indicator || []).join(' + ') || 'none found in CSS' })]);
    });
    return [pagePicker(), h('h2', { text: 'Keyboard focus order' }), h('p', { class: 'muted', text: 'The order in which Tab reached each element at desktop size. Position is the top-left corner in page pixels.' }),
      rows.length ? table(['Step', 'Accessible name', 'Role', 'Selector', 'Position', 'Size', 'Focus target', 'Focus indicator'], rows) : h('p', { text: 'No Tab stops were recorded for this page.' })];
  }

  // ------------------------------------------------------------------ Structure
  function structure() {
    var p = currentPage();
    var out = [pagePicker(), h('h2', { text: 'Heading tree' }), h('pre', { text: p.headingTree || '(no headings)' }), h('h2', { text: 'Landmark tree' }), h('pre', { text: p.landmarkTree || '(no landmarks)' })];
    out.push(h('h2', { text: 'Tables' }));
    out.push((p.tables || []).length ? table(['Selector', 'Rows', 'Columns', 'Header cells', 'Caption or name', 'thead', 'scope', 'headers'], p.tables.map(function (t) {
      return h('tr', null, [h('td', null, h('code', { text: t.selector })), h('td', { class: 'num', text: t.rows }), h('td', { class: 'num', text: t.columns }), h('td', { class: 'num', text: t.headerCells }), h('td', { text: t.caption || t.name || '(none)' }), h('td', { text: String(t.hasThead) }), h('td', { class: 'num', text: t.scope }), h('td', { class: 'num', text: t.headersAttr })]);
    })) : h('p', { text: 'No tables on this page.' }));
    out.push(h('h2', { text: 'Images' }));
    out.push((p.images || []).length ? table(['Selector', 'File', 'alt', 'Classification (heuristic)', 'Size'], p.images.map(function (i) {
      return h('tr', null, [h('td', null, h('code', { text: i.selector })), h('td', { text: i.src }), h('td', { text: i.alt === null ? '(no alt attribute)' : i.alt === '' ? 'alt=""' : i.alt }), h('td', { text: i.classification }), h('td', { class: 'num', text: i.width + ' x ' + i.height })]);
    })) : h('p', { text: 'No images on this page.' }));
    out.push(h('h2', { text: 'Live regions' }));
    out.push((p.liveRegions || []).length ? table(['Selector', 'Role', 'aria-live', 'aria-atomic', 'Current text'], p.liveRegions.map(function (r) {
      return h('tr', null, [h('td', null, h('code', { text: r.selector })), h('td', { text: r.role }), h('td', { text: r.live }), h('td', { text: r.atomic || '' }), h('td', { text: r.text })]);
    })) : h('p', { text: 'No live regions on this page.' }));
    if (p.ariaSnapshotFile) out.push(h('p', null, ['Accessibility tree snapshot: ', h('a', { href: p.ariaSnapshotFile, text: p.ariaSnapshotFile })]));
    return out;
  }

  // ------------------------------------------------------------------ Links
  function links() {
    var p = currentPage(), list = p.links || [];
    var ext = list.filter(function (l) { return l.type === 'external'; });
    return [pagePicker(), h('h2', { text: 'Links' }),
      h('p', { class: 'muted', text: list.length + ' links: ' + (list.length - ext.length) + ' internal, ' + ext.length + ' external. "Says external or new tab" is read from the accessible name and description; what the screen reader speaks must be checked by hand.' }),
      table(['Type', 'Accessible name', 'href', 'Says external or new tab', 'target'], list.map(function (l) {
        return h('tr', null, [h('td', null, h('span', { class: 'pill ' + (l.type === 'external' ? 'r' : 'n'), text: l.type })), h('td', { text: l.name || '(none)' }), h('td', null, h('code', { text: l.href })), h('td', null, l.type === 'external' || l.target === '_blank' ? pill(l.saysExternalOrNewTab ? true : false, String(l.saysExternalOrNewTab)) : ''), h('td', { text: l.target || '' })]);
      }))];
  }

  // ------------------------------------------------------------------ Screenshots
  function screenshots() {
    var p = currentPage(), shots = p.screenshots || {};
    var keys = Object.keys(shots).filter(function (k) { return shots[k]; });
    return [pagePicker(), h('h2', { text: 'Page screenshots' }), h('p', { class: 'muted', text: 'Full page and every screenful while scrolling, at 100%, 200% and 400% zoom and at each small viewport. Issue screenshots are in the Issues tab.' }),
      keys.length ? h('div', { class: 'shots' }, keys.map(function (k) {
        return h('figure', null, [h('figcaption', { text: k }), h('a', { href: shots[k], target: '_blank', rel: 'noopener' }, h('img', { src: shots[k], alt: k + ' (opens full size in a new tab)', loading: 'lazy' }))]);
      })) : h('p', { text: 'No screenshots for this page.' })];
  }

  // ------------------------------------------------------------------ Manual checks
  function manual() {
    return [h('h2', { text: 'Manual Screen Reader Verification Required' }),
      h('p', { text: 'This tool checks markup. It does not replace JAWS, NVDA, VoiceOver or TalkBack, and it never reports a screen reader test as passed. Work through this list by hand; the ticks are only kept while this page is open.' }),
      h('ul', { class: 'check' }, D.checklist.map(function (c, i) {
        return h('li', null, [h('label', null, [h('input', { type: 'checkbox', id: 'chk' + i }), h('span', { text: c.area + ': ' + c.item })]), h('p', { text: c.how }),
          c.pages.length ? h('p', { class: 'muted', text: 'Pages (' + c.pages.length + '): ' + c.pages.slice(0, 10).join(', ') + (c.pages.length > 10 ? ', and ' + (c.pages.length - 10) + ' more' : '') }) : null]);
      })),
      h('p', null, h('button', { class: 'btn', text: 'Show all manual-review issues', onclick: function () { go('Issues', { status: 'null' }); } }))];
  }

  var TABS = { 'Overview': overview, 'Issues': issues, 'Color contrast': contrast, 'Colors': colours, 'Keyboard': keyboard, 'Structure': structure, 'Links': links, 'Screenshots': screenshots, 'Manual checks': manual };
  function render() {
    tabsEl.replaceChildren.apply(tabsEl, Object.keys(TABS).map(function (name) {
      return h('button', { role: 'tab', 'aria-selected': String(state.tab === name), text: name, onclick: function () { state.tab = name; state.limit = 200; render(); } });
    }));
    view.replaceChildren.apply(view, [].concat(TABS[state.tab]()).filter(Boolean));
  }
  // When opened through "npm start", offer a way back to the start page.
  if (location.protocol.indexOf('http') === 0 && location.pathname.indexOf('/report/') === 0) {
    var top = document.querySelector('header.top p');
    if (top) top.append(' \u00a0|\u00a0 ', h('a', { href: '/', text: 'Start a new test', style: { color: '#fff' } }));
  }
  render();
})();
