// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail
// drawer with the model's own inputs and the protocol's farm plan, the
// live-token set the calibration comes from, and the method itself.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', growth: 'all', minTvl: 0, wl: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains && row.chains.length ? row.chains.length : 1;
    var chainMult = Math.min(model.chain_cap, 1 + model.chain_weight * Math.log(chains));
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the second action, the
  // capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the deposit on ' + name + ', then repay it within the week so the account shows both sides.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + " through " + name + "'s router on " + chain + ' and add the output back to the pool.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + small + ' back the other way through ' + name + ' so the wallet shows a round trip.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the staking rewards ' + name + ' shows, even a small amount, and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one at a smaller size to show repeat use.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first position on ' + name + ' and place a second one in a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move $' + small + ' into a second ' + name + ' vault on ' + chain + ' to show more than one vault used.';
    if (c.indexOf('stable') >= 0) return 'Redeem $' + small + ' of the stable asset through ' + name + ' and re-mint it the same week.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrued on the ' + name + ' asset and reinvest $' + small + ' of it.';
    if (c.indexOf('insurance') >= 0) return 'Review the cover terms on ' + name + ' and top the policy up by $' + small + ' if the app offers it.';
    return 'Use ' + name + "'s app a second way on " + chain + ' — a swap, a vote or a second deposit of $' + small + '.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + (capital >= 150 ? 5 : 2) + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Once a week open the protocol's own points or rewards page and check the balance, and claim only from a link the protocol itself publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a week' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, and plan the exit before you need it: unwind in reverse order and keep the receipts.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.growth === 'hot' && !(r.change_7d !== null && r.change_7d >= 10)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'radar-mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'Token ', el('b', { text: 'Radar' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: fmtUsd(DATA.floor_usd) }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor — every rankable one in the snapshot, ',
          el('b', { text: String(DATA.board_size) + ' rows in all' }),
          '. Implied value is a model calibrated on live tokens, not a promise.'
        )
      ),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered' })),
        el('div', { class: 'kpi' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows ranked' })),
        el('div', { class: 'kpi' }, el('b', { text: String(DATA.base_multiple) + 'x' }), el('span', { text: 'Base multiple (live median)' })),
        el('div', { class: 'kpi' }, el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('span', { text: 'Top implied value' }))
      )
    );
  }

  function spotlight() {
    var cards = DATA.rows.slice(0, 3).map(function (r) {
      var why = fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' in 7d · ' + fmtAge(r.age_days) + ' with no token on record';
      return el('button', { class: 'spot-card', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Farm first · Rank ' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'why', text: why }),
        el('span', { class: 'val', text: 'Implied ' + fmtUsd(r.implied_value_usd) })
      );
    });
    return el('section', { class: 'spot', 'aria-label': 'Top three protocols to farm first' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search the board', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var growth = el('select', { id: 'growth', 'aria-label': 'Filter by seven-day growth' },
      el('option', { value: 'all', text: 'Any 7d growth' }),
      el('option', { value: 'up', text: 'Growing (7d > 0)', selected: state.growth === 'up' ? 'selected' : null }),
      el('option', { value: 'hot', text: 'Hot (7d ≥ +10%)', selected: state.growth === 'hot' ? 'selected' : null }),
      el('option', { value: 'down', text: 'Falling (7d < 0)', selected: state.growth === 'down' ? 'selected' : null })
    );
    growth.addEventListener('change', function () { state.growth = growth.value; writeHash(); render(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Filter by minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL ≥ $50M', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL ≥ $100M', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL ≥ $500M', selected: state.minTvl === 500000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'TVL ≥ $1B', selected: state.minTvl === 1000000000 ? 'selected' : null })
    );
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value) || 0; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var countText = state.tab === 'pre' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : 'How the radar works';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'growth', text: '7d growth' }), growth),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvl),
      wl,
      el('div', { class: 'field' }, el('span', { text: 'View' }), el('div', { class: 'tabs' }, tabBtn('pre', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('method', 'Method'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.growth = 'all'; state.minTvl = 0; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tags = [];
      if (WATCH[r.slug]) tags.push(el('span', { class: 'tag', text: 'WATCHLIST' }));
      if (r.change_7d !== null && r.change_7d >= 10) tags.push(el('span', { class: 'tag hot', text: 'HOT +10%' }));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
          tags.length ? el('span', null, tags) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd !== null && r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The 24 largest live-token protocols by market cap. Their market cap is a fact, not a model — and their median market-cap-to-TVL ratio is what calibrates the pre-token board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd × ' + DATA.base_multiple + ' × growth × maturity × chains )' })
      ),
      el('ul', null,
        el('li', null, el('b', { text: 'Base ' + DATA.base_multiple + 'x. ' }), 'The median market-cap-to-TVL ratio of ' + DATA.live_calibration_n + ' live-token protocols in this same snapshot (exchanges excluded). The market prices live tokens against the TVL they secure; the median is the calibration.'),
        el('li', null, el('b', { text: 'Growth 0.70–1.90x. ' }), '1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '. A protocol growing fast is worth more than a shrinking one at the same TVL.'),
        el('li', null, el('b', { text: 'Maturity 0.70–1.00x. ' }), '0.70 + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × 0.30. Age is the time since DefiLlama first listed the protocol: how long it has run with no token on record. An unknown listing date uses ' + m.unknown_age_days + ' days.'),
        el('li', null, el('b', { text: 'Chains 1.00–1.25x. ' }), '1 + 0.05 × ln(chain count), capped at 1.25. More chains means a wider footprint for the same TVL.'),
        el('li', null, el('b', { text: 'Coverage. ' }), 'The board ranks every rankable pre-token protocol: the ' + DATA.watchlist_size + ' watchlist slugs plus ' + DATA.early_size + ' early ones below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor. Left out are wrapped, staked and bridged products of tokens that already trade, exchanges and versioned pools (a name ending in V2 / 2.0) — a product of another token is not a launch of its own.'),
        el('li', null, el('b', { text: 'What “no token” means. ' }), 'A protocol “records no token” when DefiLlama carries no market cap, CoinGecko id or symbol for it. That is the record, not proof it has none — a protocol on the list may still have a token the record does not carry.'),
        el('li', null, el('b', { text: 'What this is not. ' }), 'Implied value is the entry’s own claim about what a token would be worth if the protocol’s record stayed as it is. It does not predict whether or when a token is issued, and it is not a price. Farming costs gas and locks capital; never pay to claim an airdrop.')
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function multRow(label, value, pct) {
    return el('div', null,
      el('div', null, el('span', { text: label }), el('b', { class: 'num', text: value })),
      el('div', { class: 'mult-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round(pct)) + '%' }))
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String(row.chains ? row.chains.length : 0) })),
        multRow('Base multiple (live median)', row.base_multiple.toFixed(3) + 'x', (row.base_multiple / 0.5) * 100),
        multRow('Growth multiplier', String(row.growth_multiplier) + 'x', ((row.growth_multiplier - 0.7) / 1.2) * 100),
        multRow('Maturity multiplier', String(row.maturity_multiplier) + 'x', ((row.maturity_multiplier - 0.7) / 0.3) * 100),
        multRow('Chain multiplier', String(row.chain_multiplier) + 'x', ((row.chain_multiplier - 1) / 0.25) * 100),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' An estimate, not a price, and no promise a token is ever issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'warn', text: 'This protocol records no token — that is DefiLlama’s record, not proof it has none. Farming locks capital and costs gas, and a token may never be issued. Never pay to claim, and only ever claim from a link the protocol itself publishes.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    if (state.tab === 'pre') shell.appendChild(spotlight());
    shell.appendChild(controls());
    if (state.tab === 'pre') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(methodPanel());
    if (state.tab === 'pre') {
      shell.appendChild(el('p', { class: 'note', text: 'Implied value is this entry’s own claim, calibrated on the live-token median in this snapshot. “No token” means the protocol records none — not proof it has none. Farming costs gas and locks capital; never pay to claim an airdrop.' }));
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
