/* ============================================================
   LEGO-LAND · Data layer
   Self-contained store (localStorage) that links:
   Inventory  ⇄  Orders/Billing  ⇄  Packing  ⇄  Shipping  ⇄  Reports
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'legoland.db.v1';
  // Bump SEED_VERSION whenever the demo dataset changes so returning
  // visitors automatically get the refreshed demo instead of stale data.
  const SEED_VERSION = 3;

  // ---- status model -------------------------------------------------
  const STATUS = {
    new:       { label: 'ממתין לתשלום', chip: 'new',       order: 0 },
    approved:  { label: 'תשלום אושר',   chip: 'approved',  order: 1 },
    packing:   { label: 'באריזה',       chip: 'packing',   order: 2 },
    packed:    { label: 'נארז',         chip: 'packed',    order: 3 },
    shipping:  { label: 'במשלוח',       chip: 'shipping',  order: 4 },
    shipped:   { label: 'נשלח',         chip: 'shipped',   order: 5 },
    delivered: { label: 'נמסר',         chip: 'delivered', order: 6 },
  };

  const nowISO = () => new Date().toISOString();
  const clone  = (o) => JSON.parse(JSON.stringify(o));
  const uid    = (p) => p + Math.random().toString(36).slice(2, 8);

  // ---- seed (demo data) --------------------------------------------
  function seed() {
    const t = Date.now();
    const ago = (min) => new Date(t - min * 60000).toISOString();

    const items = [
      { sku: 'LG-10311', name: 'סחלב (Orchid)',            barcode: '5702016915990', price: 199, qty: 40 },
      { sku: 'LG-21318', name: 'בית העץ (Tree House)',      barcode: '5702016368314', price: 899, qty: 12 },
      { sku: 'LG-42143', name: 'פרארי דייטונה',            barcode: '5702017156897', price: 1499, qty: 6 },
      { sku: 'LG-31203', name: 'מפת העולם',                barcode: '5702017153124', price: 749, qty: 9 },
      { sku: 'LG-75313', name: 'AT-AT מלחמת הכוכבים',       barcode: '5702017155142', price: 2799, qty: 4 },
      { sku: 'LG-10497', name: 'רכבת גלקסיה',              barcode: '5702017415086', price: 599, qty: 18 },
      { sku: 'LG-21330', name: 'הבית הבודד (Home Alone)',  barcode: '5702017153131', price: 1099, qty: 7 },
      { sku: 'LG-40524', name: 'חמניות',                   barcode: '5702017183152', price: 89,  qty: 60 },
      { sku: 'LG-71043', name: 'טירת הוגוורטס',            barcode: '5702016667071', price: 3499, qty: 3 },
      { sku: 'LG-10307', name: 'עץ בונסאי',               barcode: '5702017152646', price: 219, qty: 22 },
      { sku: 'LG-21034', name: 'נוף לונדון',              barcode: '5702016368031', price: 199, qty: 15 },
      { sku: 'LG-42115', name: 'למבורגיני סיאן',          barcode: '5702016617441', price: 1399, qty: 5 },
      { sku: 'LG-10294', name: 'טיטאניק',                 barcode: '5702016852448', price: 2599, qty: 4 },
      { sku: 'LG-40747', name: 'נרקיסים',                 barcode: '5702017369884', price: 69,  qty: 80 },
      { sku: 'LG-21341', name: 'הוקוס פוקוס',             barcode: '5702017153308', price: 899, qty: 8 },
      { sku: 'TEST-1',   name: '★ פריט טסט - תשלום בדיקה', barcode: '9999999999999', price: 1,  qty: 999 },
    ];

    const db = {
      user: { name: 'דוד' },
      items,
      movements: [],
      orders: [],
      shifts: [
        { id: 'morning',   name: 'משמרת בוקר',   from: '08:00', to: '14:00' },
        { id: 'afternoon', name: 'משמרת צהריים', from: '14:00', to: '18:00' },
      ],
      employees: [
        { empNo: 'A-201', name: 'ורה',   shift: 'morning',   shiftStart: ago(180) },
        { empNo: 'A-203', name: 'אורי',  shift: 'morning',   shiftStart: ago(168) },
        { empNo: 'A-205', name: 'נועה',  shift: 'morning',   shiftStart: ago(120) },
        { empNo: 'A-202', name: 'מירי',  shift: 'afternoon', shiftStart: ago(95) },
        { empNo: 'A-204', name: 'טל',    shift: 'afternoon', shiftStart: ago(82) },
        { empNo: 'A-206', name: 'רון',   shift: 'afternoon', shiftStart: ago(40) },
      ],
      creditReport: [],          // uploaded from the credit-card company
      counters: { order: 1000, receipt: 5000, movement: 1, txn: 70000 },
      settings: { lowStock: 5 },
      _seededAt: nowISO(),
      _seedVersion: SEED_VERSION,
    };

    // opening inventory movements
    items.forEach((it) => {
      db.movements.push({
        id: 'M' + db.counters.movement++, ts: db._seededAt, sku: it.sku,
        type: 'in', qty: it.qty, balanceAfter: it.qty, reason: 'יתרת פתיחה', ref: 'OPENING',
      });
    });

    // sample orders across the pipeline
    const mk = (mins, status, cust, addr, phone, lines, card) => {
      const id = 'ORD-' + db.counters.order++;
      const created = ago(mins + 8);
      const o = {
        id, createdAt: created, customer: cust, address: addr, phone,
        lines, status, courier: 'דואר שליחים', tracking: null,
        paymentApprovedAt: null, creditTxn: null, receiptNo: null,
        packedAt: null, packedBy: null, shippedAt: null, deliveredAt: null,
      };
      // approve payment for everything beyond "new"
      if (STATUS[status].order >= 1) {
        o.paymentApprovedAt = ago(mins);
        o.creditTxn = { id: 'TX' + db.counters.txn++, amount: linesTotal(lines, items), card, last4: String(1000 + Math.floor(Math.random()*8999)).slice(-4) };
      }
      if (STATUS[status].order >= 2) { o.packedBy = db.employees[mins % 2]; }
      if (STATUS[status].order >= 3) { o.packedAt = ago(Math.max(1, mins - 22)); }
      if (STATUS[status].order >= 4) { o.shippedAt = ago(Math.max(1, mins - 35)); o.tracking = 'IL' + uid('').toUpperCase(); o.receiptNo = 'R-' + db.counters.receipt++; }
      if (STATUS[status].order >= 6) { o.deliveredAt = ago(Math.max(1, mins - 80)); }
      return o;
    };

    db.orders.push(
      mk(4,   'new',       'אבי ישראלי', 'הרצל 14, תל אביב',     '050-1112233', [{ sku: 'LG-40524', qty: 3 }], 'ויזה'),
      mk(12,  'approved',  'מרים גולן',  'ויצמן 8, רעננה',       '052-2223344', [{ sku: 'LG-10311', qty: 1 }, { sku: 'LG-40524', qty: 2 }], 'מאסטרקארד'),
      mk(33,  'packing',   'רון אבידן',  'בן גוריון 22, חיפה',   '054-3334455', [{ sku: 'LG-42143', qty: 1 }], 'ויזה'),
      mk(58,  'packed',    'נועה ברק',   'סוקולוב 3, הרצליה',    '053-4445566', [{ sku: 'LG-21330', qty: 1 }, { sku: 'LG-40524', qty: 1 }], 'אמריקן אקספרס'),
      mk(95,  'shipping',  'דני פרץ',    'הנשיא 51, נתניה',      '058-5556677', [{ sku: 'LG-10497', qty: 2 }], 'ויזה'),
      mk(160, 'shipped',   'ליאת שמש',   'אלנבי 90, תל אביב',    '050-6667788', [{ sku: 'LG-31203', qty: 1 }], 'מאסטרקארד'),
      mk(240, 'delivered', 'עומר טל',    'הגליל 7, כרמיאל',      '052-7778899', [{ sku: 'LG-75313', qty: 1 }], 'ויזה'),
    );

    // post inventory deductions for every approved order
    db.orders.forEach((o) => { if (o.paymentApprovedAt) postOrderOut(db, o); });

    // a credit-company collection report that mostly matches (with one mismatch + one missing)
    db.orders.filter(o => o.creditTxn).forEach((o, i) => {
      let amount = o.creditTxn.amount;
      if (i === 1) amount = amount - 5;        // amount mismatch
      if (i === 3) return;                      // missing from collection report
      db.creditReport.push({ txnId: o.creditTxn.id, amount, date: o.paymentApprovedAt, ref: 'SETTLE-' + (8800 + i) });
    });

    return db;
  }

  function linesTotal(lines, items) {
    return lines.reduce((s, l) => s + (l.price != null ? l.price : priceOf(l.sku, items)) * l.qty, 0);
  }
  function priceOf(sku, items) {
    const db = items ? { items } : load();
    const it = db.items.find(i => i.sku === sku);
    return it ? it.price : 0;
  }

  // deduct stock for an order (idempotent via ref check)
  function postOrderOut(db, o) {
    o.lines.forEach((l) => {
      const ref = 'OUT:' + o.id + ':' + l.sku;
      if (db.movements.some(m => m.ref === ref)) return;
      const it = db.items.find(i => i.sku === l.sku);
      if (!it) return;
      it.qty -= l.qty;
      db.movements.push({
        id: 'M' + db.counters.movement++, ts: o.paymentApprovedAt || nowISO(), sku: l.sku,
        type: 'out', qty: l.qty, balanceAfter: it.qty, reason: 'הזמנה ' + o.id, ref,
      });
    });
  }

  // ---- persistence --------------------------------------------------
  // Safe storage: falls back to in-memory when localStorage is blocked
  // (e.g. opening the file directly via file:// on some browsers / iOS).
  let _cache = null;
  const _mem = {};
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return k in _mem ? _mem[k] : null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { _mem[k] = v; } }

  function load() {
    if (_cache) return _cache;
    try {
      const raw = safeGet(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // re-seed if missing or from an older demo dataset version
      _cache = (parsed && parsed._seedVersion === SEED_VERSION) ? parsed : seed();
    } catch (e) { _cache = seed(); }
    save();
    return _cache;
  }
  function save() { if (_cache) safeSet(KEY, JSON.stringify(_cache)); emit(); }
  function reset() { _cache = seed(); save(); return _cache; }

  // ---- change events ------------------------------------------------
  const listeners = new Set();
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach(fn => { try { fn(_cache); } catch (e) {} }); }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  // -- inventory ------------------------------------------------------
  function items() { return load().items.slice(); }

  function reserved(sku) {
    // qty on approved-but-not-yet-shipped orders is already deducted from stock,
    // but we also surface "reserved" = approved & not delivered for visibility.
    return load().orders
      .filter(o => o.paymentApprovedAt && STATUS[o.status].order < STATUS.shipped.order)
      .reduce((s, o) => s + o.lines.filter(l => l.sku === sku).reduce((a, l) => a + l.qty, 0), 0);
  }

  /* Apply an inventory list update.
     rows: [{sku, name?, barcode?, price?, qty, mode:'add'|'set'}] */
  function applyInventoryList(rows, note) {
    const db = load();
    const result = { added: 0, created: 0, movements: 0 };
    rows.forEach((r) => {
      if (!r.sku) return;
      let it = db.items.find(i => i.sku === r.sku);
      if (!it) {
        it = { sku: r.sku, name: r.name || r.sku, barcode: r.barcode || '', price: +r.price || 0, qty: 0 };
        db.items.push(it); result.created++;
      } else {
        if (r.name)    it.name = r.name;
        if (r.barcode) it.barcode = r.barcode;
        if (r.price)   it.price = +r.price;
      }
      const delta = r.mode === 'set' ? (+r.qty - it.qty) : (+r.qty || 0);
      if (delta === 0) return;
      it.qty += delta;
      db.movements.push({
        id: 'M' + db.counters.movement++, ts: nowISO(), sku: it.sku,
        type: delta >= 0 ? 'in' : 'out', qty: Math.abs(delta), balanceAfter: it.qty,
        reason: note || (r.mode === 'set' ? 'התאמת ספירה' : 'הוספת מלאי מרשימה'), ref: 'LIST',
      });
      result.added += delta; result.movements++;
    });
    save();
    return result;
  }

  function movements() { return load().movements.slice().reverse(); }

  // -- orders ---------------------------------------------------------
  function orders() { return load().orders.slice(); }
  function ordersInProcess() {
    return load().orders
      .filter(o => STATUS[o.status].order >= 1 && STATUS[o.status].order < STATUS.delivered.order)
      .sort((a, b) => new Date(a.paymentApprovedAt || a.createdAt) - new Date(b.paymentApprovedAt || b.createdAt));
  }

  function createOrder({ customer, address, phone, courier, lines, cardHolder }) {
    const db = load();
    const o = {
      id: 'ORD-' + db.counters.order++, createdAt: nowISO(), customer,
      cardHolder: cardHolder || customer, address: address || '-', phone: phone || '',
      courier: courier || 'דואר שליחים', tracking: null,
      lines: lines.map(l => ({ sku: l.sku, qty: +l.qty, price: priceOf(l.sku) })),
      status: 'new', paymentApprovedAt: null, creditTxn: null, receiptNo: null,
      packedAt: null, packedBy: null, shippedAt: null, deliveredAt: null,
    };
    db.orders.push(o); save();
    return o;
  }

  function approvePayment(orderId, card) {
    const db = load();
    const o = db.orders.find(x => x.id === orderId);
    if (!o || o.paymentApprovedAt) return o;
    // stock guard
    for (const l of o.lines) {
      const it = db.items.find(i => i.sku === l.sku);
      if (!it || it.qty < l.qty) throw new Error('אין מספיק מלאי לפריט ' + l.sku);
    }
    o.paymentApprovedAt = nowISO();
    o.status = 'approved';
    o.creditTxn = { id: 'TX' + db.counters.txn++, amount: linesTotal(o.lines, db.items), card: card || 'ויזה', last4: String(1000 + Math.floor(Math.random()*8999)).slice(-4) };
    postOrderOut(db, o);
    save();
    return o;
  }

  function setStatus(orderId, status, extra) {
    const db = load();
    const o = db.orders.find(x => x.id === orderId);
    if (!o) return;
    o.status = status;
    if (status === 'packing' && extra && extra.packedBy) o.packedBy = extra.packedBy;
    if (status === 'packed')  { o.packedAt = nowISO(); if (extra && extra.packedBy) o.packedBy = extra.packedBy; }
    if (status === 'shipping') {
      o.shippedAt = nowISO();
      o.tracking = 'IL' + uid('').toUpperCase();
      if (!o.receiptNo) o.receiptNo = 'R-' + db.counters.receipt++;   // receipt issued as order leaves
      if (extra && extra.courier) o.courier = extra.courier;
    }
    if (status === 'shipped' && !o.receiptNo) o.receiptNo = 'R-' + db.counters.receipt++;
    if (status === 'delivered') o.deliveredAt = nowISO();
    save();
    return o;
  }

  function receiptFor(orderId) {
    const o = load().orders.find(x => x.id === orderId);
    if (!o) return null;
    const its = load().items;
    return {
      no: o.receiptNo, date: o.shippedAt || nowISO(), order: o,
      lines: o.lines.map(l => { const it = its.find(i => i.sku === l.sku) || {}; return { sku: l.sku, name: it.name || l.sku, qty: l.qty, price: l.price != null ? l.price : it.price, total: (l.price != null ? l.price : it.price) * l.qty }; }),
      total: linesTotal(o.lines, its),
    };
  }

  // -- employees / packing / shifts ----------------------------------
  function employees() { return load().employees.slice(); }
  function shifts() { return load().shifts.slice(); }

  // all employees assigned to a given shift
  function shiftRoster(shiftId) { return load().employees.filter(e => e.shift === shiftId); }

  // which shift covers a given time (default: now). null if outside hours.
  function currentShift(at) {
    const d = at ? new Date(at) : new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    return load().shifts.find(s => mins >= toMin(s.from) && mins < toMin(s.to)) || null;
  }

  // first employee on the active shift (default packer), if any
  function onShiftEmployee(at) {
    const sh = currentShift(at);
    if (!sh) return null;
    return load().employees.filter(e => e.shift === sh.id)[0] || null;
  }

  function startShift(empNo, name, shiftId) {
    const db = load();
    let e = db.employees.find(x => x.empNo === empNo);
    if (e) { e.shiftStart = nowISO(); if (name) e.name = name; if (shiftId) e.shift = shiftId; }
    else { e = { empNo, name: name || empNo, shift: shiftId || null, shiftStart: nowISO() }; db.employees.push(e); }
    save();
    return e;
  }

  // -- reports --------------------------------------------------------
  // inventory balance + sales (approved credit transactions) per item
  function inventoryReport() {
    const db = load();
    return db.items.map((it) => {
      const moves = db.movements.filter(m => m.sku === it.sku);
      const totalIn  = moves.filter(m => m.type === 'in').reduce((s, m) => s + m.qty, 0);
      const totalOut = moves.filter(m => m.type === 'out').reduce((s, m) => s + m.qty, 0);
      // sales = approved orders containing this sku
      const sales = db.orders.filter(o => o.creditTxn).flatMap(o =>
        o.lines.filter(l => l.sku === it.sku).map(l => ({
          orderId: o.id, txnId: o.creditTxn.id, date: o.paymentApprovedAt,
          qty: l.qty, price: l.price != null ? l.price : it.price,
          amount: (l.price != null ? l.price : it.price) * l.qty, card: o.creditTxn.card,
        })));
      return {
        sku: it.sku, name: it.name, barcode: it.barcode, price: it.price,
        balance: it.qty, totalIn, totalOut, reserved: reserved(it.sku),
        soldUnits: sales.reduce((s, x) => s + x.qty, 0),
        soldAmount: sales.reduce((s, x) => s + x.amount, 0),
        sales,
      };
    });
  }

  // credit collection report for a date range + reconciliation vs uploaded settlement
  function creditCollectionReport(fromISO, toISO) {
    const db = load();
    const from = fromISO ? new Date(fromISO) : new Date(0);
    const to   = toISO ? new Date(new Date(toISO).getTime() + 86399000) : new Date(8e15);
    const sales = db.orders.filter(o => o.creditTxn && o.paymentApprovedAt)
      .filter(o => { const d = new Date(o.paymentApprovedAt); return d >= from && d <= to; })
      .map(o => ({
        orderId: o.id, txnId: o.creditTxn.id, date: o.paymentApprovedAt,
        customer: o.customer, card: o.creditTxn.card, last4: o.creditTxn.last4,
        amount: o.creditTxn.amount, receiptNo: o.receiptNo,
      }));

    // reconciliation against creditReport (settlement file from credit company)
    const byTxn = {}; db.creditReport.forEach(r => { byTxn[r.txnId] = r; });
    const matchedTxns = new Set();
    const recon = sales.map((s) => {
      const c = byTxn[s.txnId];
      if (c) matchedTxns.add(s.txnId);
      const diff = c ? (s.amount - c.amount) : null;
      return {
        ...s, collected: c ? c.amount : null, settleRef: c ? c.ref : null,
        diff,
        match: c ? (Math.abs(diff) < 0.005 ? 'match' : 'amount') : 'missing',
      };
    });
    // collected lines that have no matching sale
    const orphan = db.creditReport.filter(r => !sales.some(s => s.txnId === r.txnId))
      .map(r => ({ txnId: r.txnId, collected: r.amount, settleRef: r.ref, date: r.date, match: 'orphan' }));

    const totals = {
      salesCount: sales.length,
      salesAmount: sales.reduce((s, x) => s + x.amount, 0),
      collectedAmount: db.creditReport.filter(r => sales.some(s => s.txnId === r.txnId)).reduce((s, r) => s + r.amount, 0),
      mismatches: recon.filter(r => r.match !== 'match').length + orphan.length,
    };
    return { recon, orphan, totals, hasSettlement: db.creditReport.length > 0 };
  }

  function uploadCreditSettlement(rows) {
    const db = load();
    db.creditReport = rows.map(r => ({ txnId: r.txnId, amount: +r.amount, date: r.date || nowISO(), ref: r.ref || '' }));
    save();
    return db.creditReport.length;
  }

  // ---- expose -------------------------------------------------------
  global.DB = {
    STATUS, on, save, reset, load,
    items, reserved, applyInventoryList, movements,
    orders, ordersInProcess, createOrder, approvePayment, setStatus, receiptFor,
    employees, startShift, shifts, shiftRoster, currentShift, onShiftEmployee,
    inventoryReport, creditCollectionReport, uploadCreditSettlement,
    user: () => load().user,
    settings: () => load().settings,
  };
})(window);
