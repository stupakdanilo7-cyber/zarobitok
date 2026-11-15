// Заробіток — версія для телефона. Та сама логіка, що й у програмі для комп'ютера (D:\Zarobitok\src\Core.cs):
// розбір сум, курс НБУ на дату кожного запису, тимчасовий найближчий курс, файл даних того самого формату.
'use strict';
(function () {
  var VERSION = '1.0';
  var NB = '\u00A0';
  var MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  var MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  var MONTH_LETTER = ['с', 'л', 'б', 'к', 'т', 'ч', 'л', 'с', 'в', 'ж', 'л', 'г'];
  var DAY_NAMES = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
  var SIGN = { UAH: '₴', USD: '$', EUR: '€' };
  var CURS = ['UAH', 'USD', 'EUR'];
  var MIN_RATE_DATE = '1996-09-02';
  var MIN_MONTH = '2000-01-01';
  var LIMIT_CENTS = 10000000000; // 100 000 000 — не включно

  // ================= дати (рядки «РРРР-ММ-ДД», місцевий час) =================
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDate(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function todayStr() { return ymd(new Date()); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dim(y, m) { return new Date(y, m, 0).getDate(); } // m: 1..12
  function wd(s) { return (toDate(s).getDay() + 6) % 7; } // 0 = пн
  function dayMonth(s) { return (+s.slice(8, 10)) + NB + MONTHS_GEN[+s.slice(5, 7) - 1]; }
  function dmy(s) { return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4); }
  function plural(n, one, few, many) {
    n = Math.abs(n); var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  // ================= числа (український формат) =================
  function roundAway(v, d) {
    var f = Math.pow(10, d), a = Math.abs(v);
    var r = Math.round(Number((a * f).toPrecision(12))) / f;
    return v < 0 ? -r : r;
  }
  function num(v, d) {
    v = roundAway(v, d);
    var neg = v < 0; if (neg) v = -v;
    var s = v.toFixed(d), dot = s.indexOf('.');
    var ip = dot < 0 ? s : s.slice(0, dot), fp = dot < 0 ? '' : s.slice(dot + 1), out = neg && v !== 0 ? '−' : '';
    for (var i = 0; i < ip.length; i++) { if (i > 0 && (ip.length - i) % 3 === 0) out += NB; out += ip[i]; }
    return fp ? out + ',' + fp : out;
  }
  function money(v, c) { return num(v, 2) + NB + SIGN[c]; }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 999999.5) { var m = v / 1000000; return num(m, Math.abs(m) >= 100 ? 0 : (Math.abs(m) >= 10 ? 1 : 2)) + NB + 'млн'; }
    if (a >= 999.995) return num(v, 0);
    var r = roundAway(v, 2);
    return r === Math.trunc(r) ? num(r, 0) : num(r, 2);
  }
  function short(v, c) {
    var a = Math.abs(v);
    if (a >= 999999.5) return compact(v) + NB + SIGN[c];
    return (a >= 99.995 ? num(v, 0) : num(v, 2)) + NB + SIGN[c];
  }
  /** Сума в клітинці календаря — щоб влазила й на вузькому екрані: «12,5», «1 250», «12,3к», «1,2м». */
  function cellNum(v) {
    var a = Math.abs(v);
    if (a >= 999999.5) return num(v / 1000000, a >= 99999999.5 ? 0 : 1) + 'м';
    if (a >= 9999.5) return num(v / 1000, a >= 99999.5 ? 0 : 1) + 'к';
    if (a >= 99.995) return num(v, 0);
    var r = roundAway(v, 2);
    return r === Math.trunc(r) ? num(r, 0) : num(r, 2);
  }
  function whole(v, c) { return num(v, 0) + NB + SIGN[c]; }
  function rateStr(r) { return num(r, 2); }
  function editable(cents) { return cents % 100 === 0 ? String(cents / 100) : (Math.floor(cents / 100) + ',' + pad(cents % 100)); }

  // ================= розбір введеної суми (як MoneyParser) =================
  var USDW = ['usd', 'dollar', 'dol', 'buck', 'долар', 'дол', 'бакс'];
  var EURW = ['eur', 'євро', 'евро'];
  var UAHW = ['uah', 'hrn', 'grn', 'hryvn', 'grivn', 'грн', 'гривн', 'гривен'];
  function hit(tok, words) { for (var i = 0; i < words.length; i++) if (words[i].indexOf(tok) === 0 || tok.indexOf(words[i]) === 0) return true; return false; }
  function trimDots(s) { return s.replace(/^[.,]+|[.,]+$/g, ''); }
  function tokenCur(raw) {
    var t = trimDots((raw || '').trim()).trim().toLowerCase();
    if (!t) return { cur: null, unknown: false };
    t = t.replace(/\$/g, ' $ ').replace(/€/g, ' € ').replace(/₴/g, ' ₴ ');
    var parts = t.split(' '), found = null;
    for (var i = 0; i < parts.length; i++) {
      var w = trimDots(parts[i]); if (!w) continue;
      var c;
      if (w === '$') c = 'USD'; else if (w === '€') c = 'EUR'; else if (w === '₴') c = 'UAH';
      else {
        var u = hit(w, USDW), e = hit(w, EURW), h = hit(w, UAHW);
        if ((u ? 1 : 0) + (e ? 1 : 0) + (h ? 1 : 0) !== 1) return { cur: null, unknown: true };
        c = u ? 'USD' : (e ? 'EUR' : 'UAH');
      }
      if (found && found !== c) return { cur: null, unknown: true };
      found = c;
    }
    return { cur: found, unknown: false };
  }
  function isDig(c) { return c >= '0' && c <= '9'; }
  function groups(parts) {
    if (parts[0].length < 1 || parts[0].length > 3) return false;
    for (var k = 1; k < parts.length; k++) if (parts[k].length !== 3) return false;
    return true;
  }
  /** {err: null|'Empty'|'Incomplete'|'BadNumber'|'Ambiguous'|'TooManyDecimals'|'Negative'|'TooBig'|'UnknownCurrency', cents, hint} */
  function parseMoney(text) {
    if (text == null) return { err: 'Empty' };
    var s = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if ('\u00A0\u202F\u2009\u2007\t\r\n'.indexOf(ch) >= 0) s += ' ';
      else if ('\u2212\u2013\u2014'.indexOf(ch) >= 0) s += '-';
      else s += ch;
    }
    s = s.trim();
    if (!s) return { err: 'Empty' };
    var a = 0;
    while (a < s.length && !(isDig(s[a]) || s[a] === '-' || s[a] === '+')) a++;
    if (a < s.length && a > 0 && isDig(s[a]) && (s[a - 1] === ',' || s[a - 1] === '.')) a--;
    var b = s.length;
    while (b > a && !isDig(s[b - 1])) b--;
    var lead = s.slice(0, a), trail = s.slice(b);
    var core = s.slice(a, b).replace(/[ '’_]/g, '');
    var L = tokenCur(lead), T = tokenCur(trail);
    var neg = false;
    if (core.length && (core[0] === '-' || core[0] === '+')) { neg = core[0] === '-'; core = core.slice(1); }
    var digits = 0, nc = 0, nd = 0;
    for (var j = 0; j < core.length; j++) {
      var c = core[j];
      if (isDig(c)) digits++; else if (c === ',') nc++; else if (c === '.') nd++; else return { err: 'BadNumber' };
    }
    if (!digits) return { err: 'Incomplete' };
    var ip, fp = '';
    if (!nc && !nd) ip = core;
    else if (nc && nd) {
      var dec = core.lastIndexOf(',') > core.lastIndexOf('.') ? ',' : '.';
      if ((dec === ',' ? nc : nd) !== 1) return { err: 'BadNumber' };
      var k = core.lastIndexOf(dec);
      if (!groups(core.slice(0, k).split(dec === ',' ? '.' : ','))) return { err: 'BadNumber' };
      ip = core.slice(0, k).replace(/[.,]/g, ''); fp = core.slice(k + 1);
    } else if (nc + nd > 1) {
      var parts = core.split(nc ? ',' : '.');
      if (!groups(parts)) return { err: 'BadNumber' };
      ip = parts.join('');
    } else {
      var q = core.indexOf(nc ? ',' : '.');
      ip = core.slice(0, q); fp = core.slice(q + 1);
      if (fp.length === 3 && ip.length >= 1 && ip.length <= 3 && ip[0] !== '0') return { err: 'Ambiguous' };
    }
    if (fp.length > 2) return { err: 'TooManyDecimals' };
    ip = ip.replace(/^0+/, '');
    if (ip.length > 12) return { err: 'TooBig' };
    if (!ip) ip = '0';
    var cents = Number(ip) * 100 + (fp ? Number((fp + '0').slice(0, 2)) : 0);
    if (L.unknown || T.unknown) return { err: 'UnknownCurrency' };
    if (L.cur && T.cur && L.cur !== T.cur) return { err: 'UnknownCurrency' };
    if (neg && cents !== 0) return { err: 'Negative' };
    if (cents >= LIMIT_CENTS) return { err: 'TooBig' };
    return { err: null, cents: cents, hint: L.cur || T.cur };
  }
  function parseMessage(e) {
    switch (e) {
      case 'Ambiguous': return 'Незрозуміло, де тут копійки. Введіть 1250 або 1250,50';
      case 'TooManyDecimals': return 'Після коми — не більше двох цифр';
      case 'Negative': return 'Сума має бути 0 або більше';
      case 'TooBig': return 'Сума має бути меншою за 100 000 000';
      case 'UnknownCurrency': return 'Невідома валюта. Можна: грн, $, євро';
      default: return 'Сума має бути числом, наприклад 1250,50';
    }
  }

  // ================= сховище =================
  var KEY = { entries: 'zb.entries', rates: 'zb.rates', settings: 'zb.settings', prev: 'zb.prev' };
  var storageOk = true, saveError = null;
  function readJson(k, def) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { storageOk = false; return def; }
  }
  function writeRaw(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) { saveError = 'пам’ять програми недоступна або заповнена'; return false; }
  }

  // ================= дані =================
  var entries = [];      // {id, date, cents, cur, note, usd, eur, rateDate, exact}
  var rates = {};        // 'РРРР-ММ-ДД' -> [usd, eur]
  var rateKeys = [];     // відсортовані дати курсів
  var settings = { display: 'UAH', input: 'UAH', lastExport: '', hideInstall: false };
  var nextId = 1, version = 0, totalsCache = null;

  function validRate(u, e) { return u > 0 && e > 0; }
  function rebuildKeys() { rateKeys = Object.keys(rates).sort(); }
  function putRate(d, u, e) {
    if (!validRate(u, e)) return false;
    var o = rates[d];
    if (o && o[0] === u && o[1] === e) return false;
    rates[d] = [u, e]; if (!o) rebuildKeys();
    return true;
  }
  /** Найближчий відомий курс: останній не пізніше дати, а якщо такого немає — найраніший після. */
  function nearest(d) {
    if (!rateKeys.length) return null;
    var lo = 0, hi = rateKeys.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (rateKeys[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    if (ans < 0) ans = 0;
    return { date: rateKeys[ans], p: rates[rateKeys[ans]] };
  }
  function applyRate(e) {
    var p = rates[e.date];
    if (p) { e.usd = p[0]; e.eur = p[1]; e.rateDate = e.date; e.exact = true; return; }
    var n = nearest(e.date);
    if (n) { e.usd = n.p[0]; e.eur = n.p[1]; e.rateDate = n.date; e.exact = false; return; }
    e.usd = 0; e.eur = 0; e.rateDate = ''; e.exact = false;
  }
  function rateOf(e, c) { return c === 'USD' ? e.usd : (c === 'EUR' ? e.eur : 1); }
  function conv(e, target) {
    var amt = e.cents / 100;
    if (target === e.cur) return amt;
    if (!validRate(e.usd, e.eur)) return 0;
    return amt * rateOf(e, e.cur) / rateOf(e, target);
  }
  function touch() { version++; totalsCache = null; }

  function saveEntries() {
    var ok = writeRaw(KEY.entries, JSON.stringify(entries.map(function (e) {
      return [e.date, e.cents, e.cur, e.usd, e.eur, e.rateDate, e.exact ? 1 : 0, e.note || ''];
    })));
    if (ok) saveError = null;
    return ok;
  }
  function saveRates() { writeRaw(KEY.rates, JSON.stringify(rates)); }
  function saveSettings() { writeRaw(KEY.settings, JSON.stringify(settings)); }

  function loadAll() {
    try { localStorage.setItem('zb.test', '1'); localStorage.removeItem('zb.test'); } catch (e) { storageOk = false; }
    var r = readJson(KEY.rates, {});
    rates = {};
    for (var d in r) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && r[d] && validRate(+r[d][0], +r[d][1])) rates[d] = [+r[d][0], +r[d][1]];
    var s = readJson(KEY.settings, {});
    for (var k in s) settings[k] = s[k];
    if (CURS.indexOf(settings.display) < 0) settings.display = 'UAH';
    if (CURS.indexOf(settings.input) < 0) settings.input = 'UAH';
    entries = [];
    var list = readJson(KEY.entries, []);
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x[0]) || !(x[1] >= 0) || CURS.indexOf(x[2]) < 0) continue;
      var e = { id: nextId++, date: x[0], cents: Math.round(x[1]), cur: x[2], usd: +x[3] || 0, eur: +x[4] || 0, rateDate: x[5] || '', exact: x[6] === 1, note: x[7] || '' };
      if (!validRate(e.usd, e.eur)) { e.usd = 0; e.eur = 0; e.rateDate = ''; e.exact = false; }
      if (e.exact && e.rateDate !== e.date) e.exact = false;
      entries.push(e);
    }
    entries.forEach(function (e) { if (e.exact) putRate(e.date, e.usd, e.eur); });
    rebuildKeys();
    entries.forEach(function (e) { if (!e.exact) applyRate(e); });
    touch();
  }

  function resolveRates() {
    var n = 0;
    entries.forEach(function (e) {
      if (e.exact) return;
      var bu = e.usd, be = e.eur, bd = e.rateDate;
      applyRate(e);
      if (e.exact || bu !== e.usd || be !== e.eur || bd !== e.rateDate) n++;
    });
    if (n) { touch(); saveEntries(); }
    return n;
  }

  // ---- підсумки ----
  function newTotals() { return { UAH: 0, USD: 0, EUR: 0, rawUAH: 0, rawUSD: 0, rawEUR: 0, count: 0, noRate: 0, nrUAH: 0, nrUSD: 0, nrEUR: 0, approx: false }; }
  function addEntry(t, e) {
    t.count++;
    if (e.cents === 0) return;
    var amt = e.cents / 100;
    t['raw' + e.cur] += amt;
    if (validRate(e.usd, e.eur)) {
      t.UAH += conv(e, 'UAH'); t.USD += conv(e, 'USD'); t.EUR += conv(e, 'EUR');
      if (!e.exact) t.approx = true;
    } else { t.noRate++; t[e.cur] += amt; t['nr' + e.cur]++; }
  }
  function addTotals(t, o) {
    ['UAH', 'USD', 'EUR', 'rawUAH', 'rawUSD', 'rawEUR', 'count', 'noRate', 'nrUAH', 'nrUSD', 'nrEUR'].forEach(function (k) { t[k] += o[k]; });
    if (o.approx) t.approx = true;
  }
  function complete(t, c) { return t.noRate === t['nr' + c]; }
  function currencies(t) { return (t.rawUAH > 0 ? 1 : 0) + (t.rawUSD > 0 ? 1 : 0) + (t.rawEUR > 0 ? 1 : 0); }
  function dayMap() {
    if (!totalsCache) {
      totalsCache = {};
      entries.forEach(function (e) { var t = totalsCache[e.date] || (totalsCache[e.date] = newTotals()); addEntry(t, e); });
    }
    return totalsCache;
  }
  function dayTotals(d) { return dayMap()[d] || newTotals(); }
  function monthTotals(y, m) {
    var t = newTotals(), pre = y + '-' + pad(m) + '-', map = dayMap();
    for (var d in map) if (d.indexOf(pre) === 0) addTotals(t, map[d]);
    return t;
  }
  function yearTotals(y) { var t = newTotals(), map = dayMap(); for (var d in map) if (+d.slice(0, 4) === y) addTotals(t, map[d]); return t; }
  function dayEntries(d) { return entries.filter(function (e) { return e.date === d; }).sort(function (a, b) { return a.id - b.id; }); }

  // ================= курси НБУ =================
  // Запит на одну дату повертає всі валюти; вихідні повторюють курс п'ятниці; ще не встановлений курс — «[]».
  var net = { busy: false, queue: [], offline: false, notBefore: {}, busySince: 0 };
  function nbuUrl(d) { return 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=' + d.replace(/-/g, '') + '&json'; }
  function fetchRate(d) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(nbuUrl(d), { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (arr) {
        clearTimeout(timer);
        if (!Array.isArray(arr)) throw new Error('неочікувана відповідь');
        if (!arr.length) return null;
        var u = 0, e = 0, want = dmy(d);
        arr.forEach(function (o) {
          if (!o || o.exchangedate !== want) return;
          var cc = String(o.cc || '').toUpperCase(), rate = Number(o.rate);
          if (cc === 'USD') u = rate; else if (cc === 'EUR') e = rate;
        });
        if (!u || !e) throw new Error('у відповіді немає курсу');
        if (u < 1 || u > 1000 || e < 1 || e > 1000) throw new Error('підозрілий курс');
        return [u, e];
      }, function (err) { clearTimeout(timer); throw err; });
  }
  function ensure(d, urgent) {
    if (rates[d]) return;
    if (d > addDays(todayStr(), 1) || d < MIN_RATE_DATE) return;
    var nb = net.notBefore[d];
    if (nb && Date.now() < nb) return;
    var i = net.queue.indexOf(d);
    if (i >= 0) { if (!urgent) return; net.queue.splice(i, 1); }
    if (urgent) net.queue.unshift(d); else net.queue.push(d);
  }
  function ensureNeeded() {
    var seen = {};
    entries.filter(function (e) { return !e.exact; }).map(function (e) { return e.date; })
      .sort().reverse().forEach(function (d) { if (!seen[d]) { seen[d] = 1; ensure(d, false); } });
    ensure(state.sel, true);
    ensure(todayStr(), true);
    pump();
  }
  function pump() {
    if (net.busy || !net.queue.length) return;
    net.busy = true; net.busySince = Date.now();
    var d = net.queue.shift();
    setTimeout(function () { if (net.busy) render(); }, 1100);
    fetchRate(d).then(function (p) {
      net.offline = false;
      if (p) { if (putRate(d, p[0], p[1])) { saveRates(); resolveRates(); } }
      else net.notBefore[d] = Date.now() + 30 * 60000;   // ще не оприлюднено
    }, function () {
      net.offline = true; net.queue = [];                // мережі немає — решту спробуємо за хвилину
    }).then(function () {
      net.busy = false;
      render();
      if (!net.offline) pump();
    });
  }
  function retryRates() { net.notBefore = {}; net.offline = false; ensureNeeded(); render(); }

  // ================= стан інтерфейсу =================
  var today = todayStr();
  var state = { sel: today, y: +today.slice(0, 4), m: +today.slice(5, 7), edit: null, inCur: settings.input, dirty: false, error: '', flash: null, flashErr: false };
  var $ = function (id) { return document.getElementById(id); };
  var amt;

  function isOpen(d) { return d <= today || dayTotals(d).count > 0; }
  function firstEntryFrom(from) { var best = ''; entries.forEach(function (e) { if (e.date >= from && (!best || e.date < best)) best = e.date; }); return best; }
  function lastEntryBefore(before) { var best = ''; entries.forEach(function (e) { if (e.date < before && e.date > best) best = e.date; }); return best; }
  function monthStart(y, m) { return y + '-' + pad(m) + '-01'; }
  function shiftYm(y, m, k) { var t = y * 12 + (m - 1) + k; return [Math.floor(t / 12), t % 12 + 1]; }
  function canShift(k) {
    var ym = shiftYm(state.y, state.m, k), first = monthStart(ym[0], ym[1]);
    if (first < MIN_MONTH) return false;
    if (k < 0 || first <= today) return true;
    return !!firstEntryFrom(first);
  }

  // ---- редагування ----
  function editorVisible() { return state.edit !== null || dayEntries(state.sel).length === 0; }
  function startAdd() {
    leaveEdit();
    state.edit = { id: null }; state.inCur = settings.input; state.error = ''; state.dirty = false;
    amt.value = '';
    render(); focusAmt(false);
  }
  function startEdit(e) {
    if (state.edit && state.edit.id === e.id) return;
    leaveEdit();
    state.edit = { id: e.id }; state.inCur = e.cur; state.error = ''; state.dirty = false;
    amt.value = editable(e.cents);
    render(); focusAmt(true);
  }
  function focusAmt(selectAll) {
    try { amt.focus({ preventScroll: true }); } catch (x) { amt.focus(); }
    if (selectAll) { try { amt.setSelectionRange(0, amt.value.length); } catch (x) { } }
    setTimeout(function () { $('editor').scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 250);
  }
  function endEdit() {
    state.edit = null; state.error = ''; state.dirty = false; state.inCur = settings.input;
    amt.value = ''; amt.blur();
  }
  /** Пішли деінде, не натиснувши «Зберегти»: набрану правильну суму зберігаємо, незрозумілу — відкидаємо. */
  function leaveEdit() {
    if (state.dirty && parseMoney(amt.value).err === null) commit(true);
    else if (state.edit !== null || amt.value) endEdit();
  }
  function snapshot() { return JSON.stringify(entries); }
  function restoreSnapshot(s) {
    var list = JSON.parse(s); entries = list; nextId = 1;
    entries.forEach(function (e) { e.id = nextId++; });
    entries.forEach(function (e) { if (!e.exact) applyRate(e); });
    touch(); saveEntries();
  }
  function commit(quiet) {
    var r = parseMoney(amt.value);
    var target = state.edit && state.edit.id !== null ? entries.filter(function (e) { return e.id === state.edit.id; })[0] : null;
    if (r.err === 'Empty') {
      if (target) { endEdit(); deleteEntry(target); return; }
      if (!quiet) { state.error = 'Введіть суму, наприклад 1250'; render(); }
      return;
    }
    if (r.err) { state.error = parseMessage(r.err); render(); return; }
    var cur = r.hint || state.inCur, snap = snapshot();
    if (target) {
      endEdit();
      if (target.cents === r.cents && target.cur === cur) { render(); return; }
      var curChanged = target.cur !== cur;
      target.cents = r.cents; target.cur = cur;
      if (curChanged) { settings.input = cur; saveSettings(); }
      touch(); saveEntries();
      afterChange(target.date);
      toast('Суму за ' + dayMonth(target.date) + ' змінено', snap);
    } else {
      var day = state.sel;
      endEdit();
      var e = { id: nextId++, date: day, cents: r.cents, cur: cur, note: '', usd: 0, eur: 0, rateDate: '', exact: false };
      applyRate(e);
      entries.push(e);
      settings.input = cur; saveSettings();
      touch(); saveEntries();
      afterChange(day);
      toast('Збережено: ' + money(e.cents / 100, cur) + ' за ' + dayMonth(day), snap);
    }
  }
  function deleteEntry(e) {
    var snap = snapshot();
    entries = entries.filter(function (x) { return x !== e; });
    touch(); saveEntries();
    afterChange(e.date);
    toast('Запис за ' + dayMonth(e.date) + ' видалено', snap);
  }
  function afterChange(day) {
    state.flash = day; state.flashErr = !!saveError;
    if (!isOpen(state.sel)) { state.sel = today; state.y = +today.slice(0, 4); state.m = +today.slice(5, 7); }
    ensureNeeded();
    render();
    state.flash = null;
  }

  // ---- навігація ----
  function selectDay(d) {
    if (d === state.sel) return;
    leaveEdit();
    if (!isOpen(d)) d = today;
    if (d < MIN_MONTH) d = MIN_MONTH;
    followPending = false;
    state.sel = d; state.y = +d.slice(0, 4); state.m = +d.slice(5, 7);
    ensureNeeded(); render();
  }
  function shiftMonth(k) {
    if (!canShift(k)) return;
    var ym = shiftYm(state.y, state.m, k), first = monthStart(ym[0], ym[1]), d;
    if (first > today) {
      d = k > 0 ? firstEntryFrom(first) : lastEntryBefore(monthStart.apply(null, shiftYm(ym[0], ym[1], 1)));
      if (!d || d <= today) d = today;
    } else if (first === monthStart(+today.slice(0, 4), +today.slice(5, 7))) d = today;
    else d = first.slice(0, 8) + pad(Math.min(+state.sel.slice(8, 10), dim(ym[0], ym[1])));
    leaveEdit();
    state.sel = d; state.y = +d.slice(0, 4); state.m = +d.slice(5, 7);
    ensureNeeded(); render();
  }
  function goMonth(m) {
    var first = monthStart(state.y, m), d;
    if (first > today) { d = firstEntryFrom(first); if (!d || d.slice(0, 7) !== first.slice(0, 7)) return; }
    else if (first.slice(0, 7) === today.slice(0, 7)) d = today;
    else d = first.slice(0, 8) + pad(Math.min(+state.sel.slice(8, 10), dim(state.y, m)));
    leaveEdit();
    state.sel = d; state.y = +d.slice(0, 4); state.m = +d.slice(5, 7);
    ensureNeeded(); render();
  }
  // Як на комп'ютері: настав новий день — через 2 хв без дій переходимо на нього (навіть якщо поле відкрите);
  // інший день лишили вибраним — через 10 хв без дій повертаємось на сьогодні. Час, коли програма згорнута, — теж «без дій».
  var lastInput = Date.now(), followPending = false;
  function checkDate() {
    var t = todayStr();
    if (t !== today) { if (state.sel === today) followPending = true; today = t; }
    var idle = Date.now() - lastInput;
    var follow = followPending && idle > 120000, back = state.sel !== today && idle > 600000;
    if (!isOpen(state.sel) || follow || back) {
      followPending = false;
      leaveEdit();
      state.sel = today; state.y = +today.slice(0, 4); state.m = +today.slice(5, 7);
      ensureNeeded();
    }
    render();
  }
  function commitPending() { if (state.dirty && parseMoney(amt.value).err === null) leaveEdit(); }

  // ================= малювання =================
  var heat = { key: '', linear: true, max: 0, t1: 0, t2: 0, t3: 0 };
  function pct(sorted, p) { var k = Math.ceil(p * sorted.length) - 1; return sorted[Math.max(0, Math.min(sorted.length - 1, k))]; }
  function buildHeat() {
    var key = version + '|' + state.y + '|' + state.m;
    if (heat.key === key) return;
    heat.key = key;
    var end = state.y + '-' + pad(state.m) + '-' + pad(dim(state.y, state.m)), start = addDays(end, -89), pre = end.slice(0, 8);
    var win = [], mon = [], map = dayMap();
    for (var d in map) {
      var t = map[d];
      if (!complete(t, 'UAH')) continue;
      var v = t.UAH; if (v <= 0) continue;
      if (d >= start && d <= end) win.push(v);
      if (d.indexOf(pre) === 0) mon.push(v);
    }
    var vals = (win.length >= 8 ? win : mon).sort(function (a, b) { return a - b; });
    heat.max = vals.length ? vals[vals.length - 1] : 0;
    heat.linear = vals.length < 4;
    if (heat.linear) return;
    var cap = pct(vals, 0.9);
    vals = vals.map(function (v) { return v > cap ? cap : v; });
    heat.t1 = pct(vals, 0.25); heat.t2 = pct(vals, 0.5); heat.t3 = pct(vals, 0.75);
    if (heat.t1 === heat.t3) heat.linear = true;
  }
  function heatLevel(t) {
    if (!t.count) return 0;
    if (!complete(t, 'UAH')) return 1;
    var v = t.UAH; if (v <= 0) return 0;
    if (heat.linear) { if (heat.max <= 0) return 1; var q = v / heat.max; return q <= 0.25 ? 1 : (q <= 0.5 ? 2 : (q <= 0.75 ? 3 : 4)); }
    return v <= heat.t1 ? 1 : (v <= heat.t2 ? 2 : (v <= heat.t3 ? 3 : 4));
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function moneyOrDash(t, c) { return complete(t, c) ? money(t[c], c) : '—' + NB + SIGN[c]; }
  function received(t) {
    var p = [];
    if (t.rawUAH > 0) p.push(money(t.rawUAH, 'UAH'));
    if (t.rawUSD > 0) p.push(money(t.rawUSD, 'USD'));
    if (t.rawEUR > 0) p.push(money(t.rawEUR, 'EUR'));
    return p.join(' · ');
  }
  function others(amountCents, cur, p) {
    var e = { cents: amountCents, cur: cur, usd: p[0], eur: p[1] };
    return CURS.filter(function (c) { return c !== cur; }).map(function (c) { return '≈' + NB + money(conv(e, c), c); }).join(' · ');
  }
  function bestRate(d) {
    if (rates[d]) return { p: rates[d], date: d, exact: true };
    var n = nearest(d);
    return n ? { p: n.p, date: n.date, exact: false } : null;
  }
  function setSeg(el, c) { Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-c') === c ? 'true' : 'false'); }); }

  function render() {
    var disp = settings.display;
    var mt = monthTotals(state.y, state.m);
    // шапка
    $('monthName').textContent = MONTHS[state.m - 1] + ' ' + state.y;
    $('prev').disabled = !canShift(-1);
    $('next').disabled = !canShift(1);
    // головне число
    setSeg($('dispSeg'), disp);
    $('heroLabel').textContent = 'За ' + MONTHS[state.m - 1].toLowerCase();
    $('heroBig').textContent = complete(mt, disp) ? money(mt[disp], disp) : '—' + NB + SIGN[disp];
    $('heroSec').textContent = CURS.filter(function (c) { return c !== disp; }).map(function (c) { return moneyOrDash(mt, c); }).join(' · ');
    var note = '', err = false;
    if (saveError) { note = 'Не збережено: ' + saveError; err = true; }
    else if (mt.noRate > 0) note = !complete(mt, disp) ? 'Курсу НБУ ще немає. Отримано: ' + received(mt) : 'Курсу НБУ ще немає — інші валюти перерахуємо, щойно буде інтернет';
    else if (mt.approx) note = 'Частина сум — за курсом іншого дня, уточниться автоматично';
    else if (currencies(mt) > 1) note = 'Отримано: ' + received(mt);
    $('heroNote').textContent = note;
    $('heroNote').className = 'note' + (err ? ' err' : '');
    // календар
    buildHeat();
    var first = monthStart(state.y, state.m), start = addDays(first, -wd(first));
    var days = dim(state.y, state.m), cells = Math.ceil((wd(first) + days) / 7) * 7, html = '';
    for (var i = 0; i < cells; i++) {
      var d = addDays(start, i), inMonth = d.slice(0, 7) === first.slice(0, 7);
      var t = dayTotals(d), cls = 'c', val = '';
      if (!inMonth) cls += ' out';
      else if (!isOpen(d)) cls += ' fut';
      else {
        var lv = heatLevel(t); if (lv) cls += ' l' + lv;
        if (t.count) {
          if (complete(t, disp)) val = cellNum(t[disp]);
          else { var rc = t.rawUAH > 0 ? 'UAH' : (t.rawUSD > 0 ? 'USD' : 'EUR'); val = currencies(t) === 1 ? cellNum(t['raw' + rc]) + SIGN[rc] : '…'; }
        }
      }
      if (d === today) cls += ' today';
      if (d === state.sel) cls += ' sel';
      if (d === state.flash) cls += state.flashErr ? ' flashErr' : ' flash';
      var dis = !inMonth || !isOpen(d);
      html += '<button class="' + cls + '" data-d="' + d + '"' + (dis ? ' disabled' : '') + ' aria-label="' + dayMonth(d) + (val ? ': ' + val : '') + '">' +
        (inMonth ? '<span class="n">' + (+d.slice(8, 10)) + '</span>' : '') + (val ? '<span class="v">' + esc(val) + '</span>' : '') + '</button>';
    }
    $('grid').innerHTML = html;
    // під календарем
    var map = dayMap(), cnt = 0, sum = 0, best = -1, bestD = '', pre = first.slice(0, 8);
    for (var dd in map) {
      if (dd.indexOf(pre) !== 0 || !map[dd].count) continue;
      var v = map[dd][disp]; cnt++; sum += v;
      if (v > best || (v === best && dd < bestD)) { best = v; bestD = dd; }
    }
    if (!cnt) $('calFoot').innerHTML = '<div>Натисніть на день, щоб внести суму</div>';
    else {
      var ok = complete(mt, disp);
      $('calFoot').innerHTML = '<div>Днів із записом<b>' + cnt + '</b></div><div>У середньому<b>' + (ok ? esc(short(sum / cnt, disp)) : '—') + '</b></div>' +
        '<div>Найкращий' + (ok ? ': ' + (+bestD.slice(8, 10)) + '-го' : ' день') + '<b>' + (ok ? esc(short(best, disp)) : '—') + '</b></div>';
    }
    renderDay();
    renderYear();
    renderBanner();
  }

  function renderDay() {
    var d = state.sel, list = dayEntries(d), dt = dayTotals(d), disp = settings.display;
    var dn = DAY_NAMES[toDate(d).getDay()];
    $('dayTitle').textContent = dayMonth(d) + ', ' + dn + (d === today ? ' (сьогодні)' : '');
    $('dayTotal').innerHTML = list.length > 1 ? 'Разом за день<b>' + esc(complete(dt, disp) ? money(dt[disp], disp) : '—') + '</b>' : '';
    var html = '';
    list.forEach(function (e) {
      var on = state.edit && state.edit.id === e.id;
      var o = e.cents === 0 ? 'День без заробітку' : (validRate(e.usd, e.eur) ? others(e.cents, e.cur, [e.usd, e.eur]) : 'Курсу ще немає — перерахунок з’явиться пізніше');
      html += '<button class="er' + (on ? ' on' : '') + '" data-id="' + e.id + '"><span class="a">' + esc(money(e.cents / 100, e.cur)) + '</span><span class="o">' + esc(o) + '</span></button>';
    });
    $('rows').innerHTML = html;
    var vis = editorVisible(), editingRow = state.edit && state.edit.id !== null;
    $('editor').classList.toggle('hidden', !vis);
    $('addMore').classList.toggle('hidden', vis);
    $('del').classList.toggle('hidden', !editingRow);
    $('cancel').classList.toggle('hidden', !(state.edit && (editingRow || list.length > 0)));
    $('save').textContent = editingRow ? 'Зберегти зміну' : 'Зберегти';
    amt.placeholder = list.length && !editingRow ? 'Ще сума' : 'Сума';
    setSeg($('inSeg'), state.inCur);
    updateHint();
    // курс
    var br = bestRate(d), l1, l2 = '', retry = false;
    var waiting = net.busy && Date.now() - net.busySince > 1000;
    if (br) l2 = '1' + NB + '$ = ' + rateStr(br.p[0]) + NB + '₴ · 1' + NB + '€ = ' + rateStr(br.p[1]) + NB + '₴';
    if (br && br.exact) l1 = 'Курс НБУ на ' + dmy(br.date);
    else if (waiting) l1 = 'Оновлюємо курс НБУ…';
    else if (net.busy) l1 = br ? 'Курс НБУ за ' + dmy(br.date) : '';
    else if (br) { l1 = net.offline ? 'Немає зв’язку з НБУ — узято курс за ' + dmy(br.date) : 'Курс за ' + dmy(br.date) + ', уточниться автоматично'; retry = net.offline; }
    else { l1 = 'Курсу НБУ ще немає. Перерахунок з’явиться, коли буде інтернет'; retry = true; }
    $('rateLine').innerHTML = '<div>' + esc(l1) + (l2 ? '<br>' + esc(l2) : '') + '</div>' + (retry ? '<button class="retry" id="retry">Оновити</button>' : '');
  }

  function updateHint() {
    var h = $('amtHint'), r = parseMoney(amt.value), cls = 'hint', txt = '';
    if (r.hint && r.err === null && r.hint !== state.inCur) { state.inCur = r.hint; setSeg($('inSeg'), state.inCur); }
    if (state.error && (r.err === null || r.err === 'Empty') && state.dirty) state.error = '';
    if (state.error) { txt = state.error; cls += ' err'; }
    else if (r.err === null) {
      var br = bestRate(state.sel), cur = r.hint || state.inCur;
      txt = r.cents === 0 ? 'Нуль — день без заробітку' : (br ? others(r.cents, cur, br.p) : 'Курсу ще немає — перерахунок з’явиться пізніше');
    } else if (r.err === 'Empty') txt = state.edit && state.edit.id !== null ? 'Порожнє поле й «Зберегти» — видалити суму' : (dayEntries(state.sel).length ? 'Нова сума додасться до записів вище' : '');
    h.textContent = txt; h.className = cls;
    amt.classList.toggle('bad', !!state.error);
  }

  function renderYear() {
    var y = state.y, disp = settings.display, yt = yearTotals(y);
    $('yLabel').textContent = 'За ' + y + ' рік';
    $('yTotal').textContent = complete(yt, disp) ? whole(yt[disp], disp) : '—' + NB + SIGN[disp];
    var vals = [], full = [], has = [], max = 0;
    for (var m = 1; m <= 12; m++) {
      var t = monthTotals(y, m);
      has.push(t.count > 0); full.push(complete(t, disp)); vals.push(t[disp]);
      if (complete(t, disp) && t[disp] > max) max = t[disp];
    }
    var html = '';
    for (var k = 0; k < 12; k++) {
      var en = monthStart(y, k + 1) <= today || has[k];
      var h = has[k] && full[k] && max > 0 ? Math.max(4, Math.round(vals[k] / max * 100)) : (has[k] ? 4 : 0);
      html += '<button class="bar' + (k + 1 === state.m ? ' cur' : '') + '" data-m="' + (k + 1) + '"' + (en ? '' : ' disabled') + ' aria-label="' + MONTHS[k] + '">' +
        '<div class="col">' + (h ? '<i style="height:' + h + '%"></i>' : '') + '</div><span>' + MONTH_LETTER[k] + '</span></button>';
    }
    $('bars').innerHTML = html;
    $('yNote').textContent = yt.noRate > 0 ? 'Без курсу: ' + yt.noRate + ' ' + plural(yt.noRate, 'запис', 'записи', 'записів') : '';
  }

  function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function renderBanner() {
    var b = $('banner'), html = '', cls = 'banner';
    if (!storageOk) { html = 'Записи не зберігаються: браузер не дає програмі пам’яті. Вимкніть «Приватний доступ» у Safari.'; cls += ' err'; }
    else if (!isStandalone() && !settings.hideInstall) {
      html = '<b>Додайте програму на екран «Додому»</b>, щоб вона відкривалася значком і працювала без інтернету: у Safari кнопка «Поділитися» → «На екран “Додому”». ' +
        'Записи, внесені тут, у браузері, у значку видно не буде — вносьте суми вже там.<button class="x" id="hideInstall" aria-label="Закрити">×</button>';
    }
    b.innerHTML = html; b.className = cls + (html ? '' : ' hidden');
  }

  // ================= тост із «Повернути» =================
  var toastTimer = null, toastSnap = null;
  function toast(text, snap) {
    toastSnap = snap || null;
    $('toastText').textContent = text;
    $('toastUndo').classList.toggle('hidden', !toastSnap);
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6500);
  }
  function hideToast() { $('toast').classList.add('hidden'); toastSnap = null; }

  // ================= файл даних (той самий формат, що й zarobitok.txt на комп'ютері) =================
  function fmtRate(v) { if (!v) return '0'; var s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s; }
  function fmtCents(c) { return Math.floor(c / 100) + '.' + pad(c % 100); }
  function cleanNote(n) { var s = String(n || '').replace(/[\t\r\n]/g, ' ').trim(); return s.length > 120 ? s.slice(0, 120) : s; }
  function serialize() {
    var out = '# Заробіток — дані програми. Не редагуйте цей файл, поки програма відкрита.\r\n' +
      '# E <таб> дата <таб> сума <таб> валюта <таб> грн за 1 USD <таб> грн за 1 EUR <таб> дата курсу <таб> 1 = курс саме цієї дати <таб> примітка\r\n';
    var list = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : a.id - b.id); });
    list.forEach(function (e) {
      var ok = validRate(e.usd, e.eur);
      out += 'E\t' + e.date + '\t' + fmtCents(e.cents) + '\t' + e.cur + '\t' + fmtRate(ok ? e.usd : 0) + '\t' + fmtRate(ok ? e.eur : 0) + '\t' +
        (ok ? e.rateDate : '-') + '\t' + (e.exact ? '1' : '0') + '\t' + cleanNote(e.note) + '\r\n';
    });
    out += '#end\t' + list.length + '\r\n';
    return out;
  }
  /** Розбирає файл. {list, skipped, damaged} або кидає помилку з поясненням. */
  function parseFile(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var lines = text.split('\n'), list = [], skipped = 0, endCount = -1, hasHeader = false;
    lines.forEach(function (raw) {
      var line = raw.replace(/\r$/, '');
      if (!line.trim()) return;
      if (line.indexOf('#') === 0) {
        if (line.indexOf('# Заробіток') === 0) hasHeader = true;
        var m = /^#end\t(\d+)/.exec(line); if (m) endCount = +m[1];
        return;
      }
      var p = line.split('\t');
      if (p[0] === 'S') return;
      if (p[0] !== 'E' || p.length < 8) { skipped++; return; }
      var date = p[1].trim(), a = p[2].trim(), cur = p[3].trim(), u = p[4].trim(), r = p[5].trim(), rd = p[6].trim(), ex = p[7].trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ymd(toDate(date)) !== date || !/^\d+(\.\d+)?$/.test(a) || CURS.indexOf(cur) < 0 ||
        !/^\d+(\.\d+)?$/.test(u) || !/^\d+(\.\d+)?$/.test(r) || !/^\d+$/.test(ex)) { skipped++; return; }
      var cents = Math.round(Number(a) * 100);
      if (!(cents >= 0) || cents >= LIMIT_CENTS) { skipped++; return; }
      var e = { date: date, cents: cents, cur: cur, usd: Number(u), eur: Number(r), rateDate: /^\d{4}-\d{2}-\d{2}$/.test(rd) ? rd : '', exact: false,
        note: p.length > 8 ? cleanNote(p.slice(8).join(' ')) : '' };
      e.exact = ex === '1' && validRate(e.usd, e.eur) && e.rateDate === e.date;
      if (!validRate(e.usd, e.eur)) { e.usd = 0; e.eur = 0; e.rateDate = ''; }
      list.push(e);
    });
    if (!hasHeader && !list.length) throw new Error('Це не файл програми «Заробіток».');
    if (endCount >= 0 && endCount !== list.length + skipped && endCount !== list.length) throw new Error('Файл пошкоджений: у ньому не всі записи. Надішліть його ще раз.');
    return { list: list, skipped: skipped, damaged: endCount < 0 };
  }
  function keyOf(e) { return e.date + '|' + e.cents + '|' + e.cur + '|' + (e.note || ''); }

  function exportFile() {
    closeSheet();
    var text = serialize(), name = 'zarobitok.txt';
    var done = function () { settings.lastExport = today; saveSettings(); };
    var file = null;
    try { file = new File([text], name, { type: 'text/plain' }); } catch (x) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Заробіток' }).then(function () { done(); toast('Файл записів передано'); }, function (err) {
        if (err && err.name === 'AbortError') return;
        download(text, name); done();
      });
    } else { download(text, name); done(); }
  }
  function download(text, name) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function importFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var res;
      try { res = parseFile(rd.result); } catch (x) { openSheet('<h2>Не вдалося відкрити файл</h2><p>' + esc(x.message) + '</p><button class="item" data-act="close"><b>Зрозуміло</b></button>'); return; }
      var have = {}, fresh = [];
      entries.forEach(function (e) { var k = keyOf(e); have[k] = (have[k] || 0) + 1; });
      res.list.forEach(function (e) { var k = keyOf(e); if (have[k]) have[k]--; else fresh.push(e); });
      pendingImport = { res: res, fresh: fresh };
      var warn = (res.skipped ? '<p>Не вдалося прочитати рядків: ' + res.skipped + ' — їх буде пропущено.</p>' : '') +
        (res.damaged ? '<p>У файлі немає позначки кінця — можливо, він надісланий не повністю.</p>' : '');
      openSheet('<h2>Записи з файлу</h2><p>У файлі ' + res.list.length + ' ' + plural(res.list.length, 'запис', 'записи', 'записів') +
        ', на телефоні зараз ' + entries.length + '.</p>' + warn +
        '<button class="item main" data-act="merge"><b>Додати нові з файлу</b><span>' + (fresh.length ? 'Додасться ' + fresh.length + ' ' + plural(fresh.length, 'запис', 'записи', 'записів') + ', яких тут ще немає' : 'Нових записів у файлі немає') + '</span></button>' +
        '<button class="item" data-act="replace"><b>Замінити все записами з файлу</b><span>Записи на телефоні стануть такими, як у файлі</span></button>' +
        '<button class="item" data-act="close"><b>Скасувати</b></button>');
    };
    rd.onerror = function () { openSheet('<h2>Не вдалося прочитати файл</h2><button class="item" data-act="close"><b>Зрозуміло</b></button>'); };
    rd.readAsText(file, 'utf-8');
  }
  var pendingImport = null;
  function applyImport(replace) {
    if (!pendingImport) return;
    var snap = snapshot(), add = replace ? pendingImport.res.list : pendingImport.fresh;
    writeRaw(KEY.prev, snap);
    leaveEdit();
    if (replace) { entries = []; nextId = 1; }
    add.forEach(function (x) {
      var e = { id: nextId++, date: x.date, cents: x.cents, cur: x.cur, usd: x.usd, eur: x.eur, rateDate: x.rateDate, exact: x.exact, note: x.note };
      if (e.exact) putRate(e.date, e.usd, e.eur);
      entries.push(e);
    });
    rebuildKeys(); saveRates();
    entries.forEach(function (e) { if (!e.exact) applyRate(e); });
    touch(); saveEntries();
    pendingImport = null; closeSheet();
    ensureNeeded(); render();
    toast(replace ? 'Записи замінено записами з файлу' : (add.length ? 'Додано ' + add.length + ' ' + plural(add.length, 'запис', 'записи', 'записів') : 'Нових записів не було'), add.length || replace ? snap : null);
  }

  // ================= меню =================
  function openSheet(html) { $('sheet').innerHTML = html; $('shade').classList.remove('hidden'); }
  function closeSheet() { $('shade').classList.add('hidden'); $('sheet').innerHTML = ''; }
  function openMenu() {
    leaveEdit(); render();
    var last = settings.lastExport ? dmy(settings.lastExport) : 'ще не було';
    openSheet('<h2>Заробіток</h2><p>Записів: ' + entries.length + ' · остання копія у файл: ' + last + '</p>' +
      '<button class="item main" data-act="export"><b>Зберегти копію у файл</b><span>Надішліть файл собі в Telegram — так записи не загубляться, і їх можна відкрити на комп’ютері</span></button>' +
      '<button class="item" data-act="import"><b>Завантажити записи з файлу</b><span>Файл zarobitok.txt з комп’ютера чи збережена копія</span></button>' +
      '<button class="item" data-act="help"><b>Як перенести записи</b><span>Телефон ↔ комп’ютер через Telegram</span></button>' +
      '<button class="item" data-act="close"><b>Закрити</b></button>' +
      '<div class="foot">Версія ' + VERSION + ' · курси: Національний банк України</div>');
  }
  function openHelp() {
    openSheet('<h2>Як перенести записи</h2>' +
      '<p><b>З телефона на комп’ютер</b></p><ol><li>Меню ⋯ → «Зберегти копію у файл» → Telegram → «Збережене».</li>' +
      '<li>На комп’ютері перетягніть файл із Telegram у вікно програми «Заробіток» (або Ctrl+O) і виберіть, додати чи замінити.</li></ol>' +
      '<p><b>З комп’ютера на телефон</b></p><ol><li>У програмі на комп’ютері натисніть Ctrl+E — відкриється папка з файлом zarobitok.txt. Перетягніть його в Telegram, у «Збережене».</li>' +
      '<li>На телефоні в Telegram відкрийте файл → «Поділитися» → «Зберегти у Файли».</li>' +
      '<li>Тут: меню ⋯ → «Завантажити записи з файлу» → виберіть zarobitok.txt.</li></ol>' +
      '<p>Записи зберігаються в самому телефоні. Якщо видалити значок програми, вони зникнуть — тож час від часу зберігайте копію у файл.</p>' +
      '<button class="item" data-act="close"><b>Зрозуміло</b></button>');
  }

  // ================= події =================
  function init() {
    amt = $('amt');
    loadAll();
    state.inCur = settings.input;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (x) { }

    $('prev').onclick = function () { shiftMonth(-1); };
    $('next').onclick = function () { shiftMonth(1); };
    $('menuBtn').onclick = openMenu;
    $('dispSeg').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      settings.display = b.getAttribute('data-c'); saveSettings(); render();
    };
    $('inSeg').onmousedown = function (ev) { ev.preventDefault(); };   // не ховати клавіатуру
    $('inSeg').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.inCur = b.getAttribute('data-c'); setSeg($('inSeg'), state.inCur); updateHint();
      if (state.edit === null) state.edit = { id: null };
    };
    $('grid').onclick = function (ev) {
      var b = ev.target.closest('button[data-d]'); if (!b || b.disabled) return;
      selectDay(b.getAttribute('data-d'));
    };
    $('rows').onclick = function (ev) {
      var b = ev.target.closest('button[data-id]'); if (!b) return;
      var id = +b.getAttribute('data-id'), e = entries.filter(function (x) { return x.id === id; })[0];
      if (e) startEdit(e);
    };
    $('bars').onclick = function (ev) { var b = ev.target.closest('button[data-m]'); if (b && !b.disabled) goMonth(+b.getAttribute('data-m')); };
    $('addMore').onclick = startAdd;
    $('save').onmousedown = function (ev) { ev.preventDefault(); };
    $('save').onclick = function () { if (state.edit === null) state.edit = { id: null }; commit(false); };
    $('cancel').onclick = function () { endEdit(); render(); };
    $('del').onclick = function () {
      var id = state.edit && state.edit.id, e = entries.filter(function (x) { return x.id === id; })[0];
      endEdit(); if (e) deleteEntry(e); else render();
    };
    amt.addEventListener('input', function () { state.dirty = true; if (state.edit === null) state.edit = { id: null }; updateHint(); });
    amt.addEventListener('focus', function () { if (state.edit === null) state.edit = { id: null }; });
    amt.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(false); }
      else if (ev.key === 'Escape') { endEdit(); render(); }
    });
    $('rateLine').onclick = function (ev) { if (ev.target.id === 'retry') retryRates(); };
    $('banner').onclick = function (ev) { if (ev.target.id === 'hideInstall') { settings.hideInstall = true; saveSettings(); renderBanner(); } };
    $('toastUndo').onclick = function () {
      if (!toastSnap) return;
      var s = toastSnap; hideToast();
      endEdit(); restoreSnapshot(s); ensureNeeded(); render();
    };
    $('shade').onclick = function (ev) {
      if (ev.target === $('shade')) { closeSheet(); return; }
      var b = ev.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'close') { pendingImport = null; closeSheet(); }
      else if (act === 'export') exportFile();
      else if (act === 'import') { closeSheet(); $('file').value = ''; $('file').click(); }
      else if (act === 'help') openHelp();
      else if (act === 'merge') applyImport(false);
      else if (act === 'replace') applyImport(true);
    };
    $('file').onchange = function () { var f = $('file').files[0]; if (f) importFile(f); };

    // гортання місяців пальцем по календарю
    var sx = 0, sy = 0, st = 0;
    $('grid').addEventListener('touchstart', function (ev) { var t = ev.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    $('grid').addEventListener('touchend', function (ev) {
      var t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40 && Date.now() - st < 600) shiftMonth(dx < 0 ? 1 : -1);
    }, { passive: true });

    // набрану правильну суму зберігаємо, коли програму згортають (iOS може її потім закрити)
    document.addEventListener('visibilitychange', function () { if (document.hidden) commitPending(); else { checkDate(); ensureNeeded(); } });
    window.addEventListener('pagehide', commitPending);
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { lastInput = Date.now(); }, true); });
    amt.addEventListener('input', function () { lastInput = Date.now(); });
    window.addEventListener('online', function () { retryRates(); });
    setInterval(function () { checkDate(); if (!net.busy) ensureNeeded(); }, 60000);

    render();
    ensureNeeded();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  }

  // для перевірки (тести у браузері)
  window.__zb = { parseMoney: parseMoney, money: money, compact: compact, short: short, num: num, serialize: serialize, parseFile: parseFile,
    nearest: nearest, state: state, entries: function () { return entries; }, rates: function () { return rates; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
