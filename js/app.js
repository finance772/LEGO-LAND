/* ============================================================
   LEGO-LAND · App / UI
   ============================================================ */
(function () {
  'use strict';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S  = DB.STATUS;

  // Real payment (Sumit) checkout page
  const SUMIT_PAY_URL = 'https://pay.sumit.co.il/e1wv4v/a/doc/qv05t1-d52df400f4-xbi67c/';

  // ---- helpers ------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const nis = (n) => '₪' + (Math.round(n * 100) / 100).toLocaleString('he-IL');
  const dt  = (iso) => iso ? new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

  function elapsed(iso) {
    if (!iso) return { txt: '-', cls: '' };
    let s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const txt = h > 0 ? `${h}ש ${pad(m)}ד` : m > 0 ? `${m}:${pad(s)} דק׳` : `${s} שנ׳`;
    const mins = (Date.now() - new Date(iso)) / 60000;
    const cls = mins > 180 ? 'elapsed--bad' : mins > 60 ? 'elapsed--warn' : '';
    return { txt, cls };
  }
  const chip = (st) => `<span class="chip chip--${S[st].chip}">${S[st].label}</span>`;
  const itemName = (sku) => (DB.items().find(i => i.sku === sku) || {}).name || sku;
  const linesText = (o) => o.lines.map(l => `${itemName(l.sku)}×${l.qty}`).join('، ');
  const orderTotal = (o) => o.lines.reduce((s, l) => s + (l.price != null ? l.price : (DB.items().find(i => i.sku === l.sku) || {}).price || 0) * l.qty, 0);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---- modal --------------------------------------------------------
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modal').addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ============================================================
  //  HOME DASHBOARD (live)
  // ============================================================
  function renderKPIs() {
    const orders = DB.orders();
    const inProc = DB.ordersInProcess();
    const items = DB.items();
    const low = items.filter(i => i.qty <= (DB.settings().lowStock || 5)).length;
    const todaySales = orders.filter(o => o.creditTxn).reduce((s, o) => s + o.creditTxn.amount, 0);
    const hint = '<div class="muted" style="font-size:.72rem;margin-top:4px">לחץ לפירוט לפי ברקוד ›</div>';
    $('#kpis').innerHTML = `
      <div class="kpi kpi--a" data-kpi="orders" style="cursor:pointer"><h4>הזמנות בתהליך</h4><div class="v">${inProc.length}</div>${hint}</div>
      <div class="kpi kpi--b" data-kpi="sales" style="cursor:pointer"><h4>מכירות מאושרות</h4><div class="v">${nis(todaySales)}</div>${hint}</div>
      <div class="kpi kpi--c" data-kpi="stock" style="cursor:pointer"><h4>פריטים במלאי</h4><div class="v">${items.reduce((s, i) => s + i.qty, 0)}</div>${hint}</div>
      <div class="kpi kpi--d" data-kpi="low" style="cursor:pointer"><h4>פריטים במלאי נמוך</h4><div class="v">${low}</div>${hint}</div>`;
  }

  // ---- KPI drill-down: data per barcode ----------------------------
  function openKpiDrill(kind) {
    const items = DB.items();
    const low = DB.settings().lowStock || 5;
    const wrap = (head, body) => `<div class="table-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;

    if (kind === 'stock') {
      const total = items.reduce((s, i) => s + i.qty, 0);
      const rows = items.slice().sort((a, b) => b.qty - a.qty).map(it =>
        `<tr><td>${it.barcode || '-'}</td><td>${it.name}</td><td class="num">${it.sku}</td><td class="num">${nis(it.price)}</td><td><span class="chip ${it.qty <= low ? 'chip--low' : 'chip--ok'}">${it.qty}</span></td></tr>`).join('');
      openModal('פריטים במלאי - לפי ברקוד', `<div class="hint">סה"כ ${total} יחידות ב-${items.length} פריטים.</div>` +
        wrap('<th>ברקוד</th><th>שם</th><th>מק"ט</th><th>מחיר</th><th>כמות</th>', rows));

    } else if (kind === 'low') {
      const lowItems = items.filter(i => i.qty <= low).sort((a, b) => a.qty - b.qty);
      const rows = lowItems.map(it =>
        `<tr><td>${it.barcode || '-'}</td><td>${it.name}</td><td class="num">${it.sku}</td><td><span class="chip chip--low">${it.qty}</span></td></tr>`).join('')
        || `<tr><td colspan="4" class="empty">אין פריטים במלאי נמוך</td></tr>`;
      openModal('מלאי נמוך - לפי ברקוד', `<div class="hint">פריטים עם יתרה ≤ ${low} - מומלץ להזמין מהספק.</div>` +
        wrap('<th>ברקוד</th><th>שם</th><th>מק"ט</th><th>יתרה</th>', rows));

    } else if (kind === 'sales') {
      const rep = DB.inventoryReport().filter(r => r.soldUnits > 0).sort((a, b) => b.soldAmount - a.soldAmount);
      const total = rep.reduce((s, r) => s + r.soldAmount, 0);
      const rows = rep.map(r =>
        `<tr><td>${r.barcode || '-'}</td><td>${r.name}</td><td class="num">${r.sku}</td><td class="num">${r.soldUnits}</td><td class="num">${nis(r.soldAmount)}</td></tr>`).join('')
        || `<tr><td colspan="5" class="empty">אין מכירות מאושרות</td></tr>`;
      openModal('מכירות מאושרות - לפי ברקוד', `<div class="hint">סה"כ מכירות שאושרו ע"י חברת האשראי: ${nis(total)}.</div>` +
        wrap('<th>ברקוד</th><th>שם</th><th>מק"ט</th><th>יח\' שנמכרו</th><th>סכום</th>', rows));

    } else if (kind === 'orders') {
      const inProc = DB.ordersInProcess();
      const map = {};
      inProc.forEach(o => o.lines.forEach(l => {
        const it = items.find(i => i.sku === l.sku) || {};
        const m = map[l.sku] || (map[l.sku] = { barcode: it.barcode, name: it.name || l.sku, sku: l.sku, units: 0, orders: new Set() });
        m.units += l.qty; m.orders.add(o.id);
      }));
      const rows = Object.values(map).sort((a, b) => b.units - a.units).map(r =>
        `<tr><td>${r.barcode || '-'}</td><td>${r.name}</td><td class="num">${r.sku}</td><td class="num">${r.units}</td><td class="num">${r.orders.size}</td></tr>`).join('')
        || `<tr><td colspan="5" class="empty">אין הזמנות בתהליך</td></tr>`;
      openModal('הזמנות בתהליך - לפי ברקוד', `<div class="hint">${inProc.length} הזמנות פעילות. פירוט היחידות התפוסות לפי ברקוד:</div>` +
        wrap('<th>ברקוד</th><th>שם</th><th>מק"ט</th><th>יח\' בהזמנות</th><th>מס\' הזמנות</th>', rows));
    }
  }

  function renderLiveOrders() {
    const rows = DB.ordersInProcess().map((o) => {
      const e = elapsed(o.paymentApprovedAt);
      return `<tr>
        <td class="num">${o.id}</td>
        <td>${o.customer}</td>
        <td>${linesText(o)}</td>
        <td>${chip(o.status)}</td>
        <td><span class="elapsed ${e.cls}" data-elapsed="${o.paymentApprovedAt || ''}">${e.txt}</span></td>
        <td>${o.receiptNo ? `<button class="btn btn--tiny btn--line" data-receipt="${o.id}">${o.receiptNo}</button>` : '-'}</td>
      </tr>`;
    }).join('');
    $('#liveOrdersTbl tbody').innerHTML = rows || `<tr><td colspan="6" class="empty">אין הזמנות פעילות כרגע</td></tr>`;
  }

  function renderLiveStock() {
    const low = DB.settings().lowStock || 5;
    const rows = DB.items().sort((a, b) => a.qty - b.qty).map((it) => {
      const lowCls = it.qty <= low ? 'chip chip--low' : 'chip chip--ok';
      return `<tr>
        <td>${it.name}</td>
        <td class="num">${it.sku}</td>
        <td>${it.barcode || '-'}</td>
        <td><span class="${lowCls}">${it.qty}</span></td>
        <td class="num">${DB.reserved(it.sku)}</td>
      </tr>`;
    }).join('');
    $('#liveStockTbl tbody').innerHTML = rows;
    $('#stockUpdated').textContent = 'עודכן ' + new Date().toLocaleTimeString('he-IL');
  }

  function renderHome() {
    $('#greetUser').textContent = DB.user().name;
    renderKPIs(); renderLiveOrders(); renderLiveStock();
  }

  // tick: update only elapsed counters + clock every second (cheap)
  function tick() {
    $('#liveClock').textContent = new Date().toLocaleTimeString('he-IL');
    $$('[data-elapsed]').forEach((el) => {
      const iso = el.getAttribute('data-elapsed'); if (!iso) return;
      const e = elapsed(iso); el.textContent = e.txt;
      el.className = 'elapsed ' + e.cls;
    });
  }

  // ============================================================
  //  VIEW: INVENTORY (עדכון מלאי)
  // ============================================================
  function viewInventory() {
    const items = DB.items();
    const tbl = items.map(it => `<tr>
      <td>${it.name}</td><td class="num">${it.sku}</td><td>${it.barcode || '-'}</td>
      <td class="num">${nis(it.price)}</td><td class="num">${it.qty}</td></tr>`).join('');

    openModal('עדכון מלאי', `
      <div class="hint">העלה רשימת פריטים למכירה - כמות לכל פריט. אפשר להדביק טקסט/CSV, או לטעון קובץ.
      עמודות נתמכות: <b>sku, name, barcode, price, qty</b> (גם בעברית: מק"ט, שם, ברקוד, מחיר, כמות).
      פורמט מהיר: <code>מק"ט,כמות</code> בכל שורה.</div>

      <div class="grid2">
        <div class="field">
          <label>הדבקת רשימת פריטים</label>
          <textarea id="invText" class="mono" placeholder="LG-10311,10&#10;LG-42143,5"></textarea>
        </div>
        <div>
          <div class="field"><label>טעינת קובץ CSV</label><input type="file" id="invFile" accept=".csv,.txt"></div>
          <div class="field"><label>אופן עדכון</label>
            <select id="invMode">
              <option value="add">הוספה לכמות הקיימת (תנועת כניסה)</option>
              <option value="set">קביעת כמות מדויקת (ספירת מלאי)</option>
            </select>
          </div>
          <div class="field"><label>הערה לתנועה</label><input id="invNote" placeholder="קליטת משלוח מספק / ספירה"></div>
          <div class="actions">
            <button class="btn btn--ok" id="invApply">עדכן מלאי</button>
          </div>
        </div>
      </div>

      <div class="actions" style="margin:14px 0">
        <button class="btn" id="invXls">⬇ דוח תנועות ויתרות מלאי (Excel)</button>
        <button class="btn btn--line" id="invCsv">⬇ ייצוא יתרות (CSV)</button>
      </div>

      <h4>מלאי נוכחי</h4>
      <div class="table-wrap"><table class="tbl"><thead>
        <tr><th>פריט</th><th>מק"ט</th><th>ברקוד</th><th>מחיר</th><th>יתרה</th></tr>
        </thead><tbody>${tbl}</tbody></table></div>
    `);

    $('#invFile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { $('#invText').value = r.result; toast('הקובץ נטען - בדוק ולחץ "עדכן מלאי"'); };
      r.readAsText(f, 'utf-8');
    });

    $('#invApply').addEventListener('click', () => {
      const rows = XL.parseInventoryText($('#invText').value);
      if (!rows.length) { toast('לא זוהו שורות תקינות'); return; }
      const mode = $('#invMode').value;
      rows.forEach(r => r.mode = mode);
      const res = DB.applyInventoryList(rows, $('#invNote').value.trim());
      toast(`עודכנו ${res.movements} תנועות · ${res.created} פריטים חדשים · שינוי נטו ${res.added > 0 ? '+' : ''}${res.added}`);
      viewInventory();
    });

    $('#invXls').addEventListener('click', exportInventoryExcel);
    $('#invCsv').addEventListener('click', () => {
      XL.exportCSV('יתרות_מלאי', ['מק"ט', 'שם', 'ברקוד', 'מחיר', 'יתרה', 'שמור'],
        DB.items().map(i => [i.sku, i.name, i.barcode, i.price, i.qty, DB.reserved(i.sku)]));
    });
  }

  function exportInventoryExcel() {
    const balances = {
      name: 'יתרות מלאי',
      headers: ['מק"ט', 'שם פריט', 'ברקוד', 'מחיר', 'יתרה זמינה', 'שמור להזמנות', 'סה"כ נכנס', 'סה"כ יצא'],
      rows: DB.inventoryReport().map(r => [r.sku, r.name, r.barcode, r.price, r.balance, r.reserved, r.totalIn, r.totalOut]),
    };
    const moves = {
      name: 'תנועות מלאי',
      headers: ['תאריך', 'מק"ט', 'שם', 'סוג', 'כמות', 'יתרה אחרי', 'סיבה', 'אסמכתא'],
      rows: DB.movements().map(m => [dt(m.ts), m.sku, itemName(m.sku), m.type === 'in' ? 'כניסה' : 'יציאה', m.qty, m.balanceAfter, m.reason, m.ref]),
    };
    XL.exportExcel('דוח_תנועות_ויתרות_מלאי', [balances, moves]);
    toast('הדוח הופק לאקסל');
  }

  // ============================================================
  //  VIEW: ORDERS (מצב הזמנות) - live
  // ============================================================
  const NEXT = { approved: 'packing', packing: 'packed', packed: 'shipping', shipping: 'shipped', shipped: 'delivered' };
  function viewOrders() {
    const rows = DB.orders().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((o) => {
      const e = elapsed(o.paymentApprovedAt);
      const skus = o.lines.map(l => {
        const av = (DB.items().find(i => i.sku === l.sku) || {}).qty;
        return `${l.sku} (כ:${l.qty} · זמין:${av != null ? av : '-'})`;
      }).join('<br>');
      let act = '';
      if (o.status === 'new') act = `<button class="btn btn--tiny btn--ok" data-approve="${o.id}">אשר תשלום</button>`;
      else if (NEXT[o.status]) act = `<button class="btn btn--tiny" data-next="${o.id}">→ ${S[NEXT[o.status]].label}</button>`;
      return `<tr>
        <td class="num">${o.id}</td>
        <td>${o.customer}</td>
        <td style="white-space:normal">${skus}</td>
        <td>${chip(o.status)}</td>
        <td><span class="elapsed ${e.cls}" data-elapsed="${o.paymentApprovedAt || ''}">${o.paymentApprovedAt ? e.txt : 'טרם אושר'}</span></td>
        <td>${o.receiptNo ? `<button class="btn btn--tiny btn--line" data-receipt="${o.id}">${o.receiptNo}</button>` : '-'}</td>
        <td>${act}</td>
      </tr>`;
    }).join('');

    openModal('מצב הזמנות - לייב', `
      <div class="hint">סטטוס וזמן מאישור התשלום מתעדכנים בזמן אמת. לכל פריט מוצגים מק"ט, כמות בהזמנה וכמות זמינה במלאי.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>הזמנה</th><th>לקוח</th><th>פריטים (מק"ט · כמות · זמין)</th><th>סטטוס</th>
        <th>זמן מאישור</th><th>קבלה</th><th>פעולה</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    `);
  }

  // ============================================================
  //  VIEW: PACKING (אריזה)
  // ============================================================
  function viewPacking() {
    const emps = DB.employees();
    const active = DB.currentShift();
    const current = packing._emp || DB.onShiftEmployee() || emps[0];
    const queue = DB.orders().filter(o => o.status === 'approved' || o.status === 'packing');

    const shiftCards = DB.shifts().map(s => {
      const on = active && active.id === s.id;
      const team = DB.shiftRoster(s.id);
      return `<div class="kpi ${on ? 'kpi--b' : ''}" data-shift="${s.id}" style="cursor:pointer;border-inline-start-color:${on ? 'var(--green)' : 'var(--line)'}">
        <h4>${s.name} ${on ? '· <span style="color:var(--green)">פעילה כעת</span>' : ''}</h4>
        <div class="v" style="font-size:1.05rem">${team.length} עובדים</div>
        <div class="muted">${s.from}-${s.to}</div>
        <div class="muted" style="font-size:.74rem;margin-top:4px">${team.map(e => e.name).join(', ') || '-'} · לחץ לפירוט ›</div></div>`;
    }).join('');
    const rows = queue.map((o) => {
      const e = elapsed(o.paymentApprovedAt);
      return `<tr>
        <td class="num">${o.id}</td><td>${o.customer}</td>
        <td style="white-space:normal">${linesText(o)}</td>
        <td>${chip(o.status)}</td>
        <td><span class="elapsed ${e.cls}" data-elapsed="${o.paymentApprovedAt || ''}">${e.txt}</span></td>
        <td><button class="btn btn--tiny btn--ok" data-pack="${o.id}">ארוז והדפס מדבקה</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="empty">אין הזמנות לאריזה</td></tr>`;

    const opts = emps.map(e => `<option value="${e.empNo}" ${current && e.empNo === current.empNo ? 'selected' : ''}>${e.empNo} · ${e.name}${e.shift ? ' (' + (DB.shifts().find(s=>s.id===e.shift)||{}).name + ')' : ''}</option>`).join('');
    const shiftOpts = DB.shifts().map(s => `<option value="${s.id}" ${active && active.id === s.id ? 'selected' : ''}>${s.name} (${s.from}-${s.to})</option>`).join('');

    openModal('אריזה - משמרת', `
      <h4>לוח משמרות</h4>
      <div class="kpis" style="padding:0 0 12px">${shiftCards}</div>
      ${!active ? '<div class="hint">כרגע מחוץ לשעות המשמרת (08:00-18:00). אפשר עדיין לבחור אורז ידנית.</div>' : ''}
      <div class="grid3">
        <div class="field"><label>מספר עובד</label><input id="pkEmpNo" placeholder="A-201"></div>
        <div class="field"><label>שם עובד</label><input id="pkEmpName" placeholder="שם מלא"></div>
        <div class="field"><label>משמרת</label><select id="pkShiftSel">${shiftOpts}</select></div>
      </div>
      <div class="field"><label>או בחר עובד פעיל</label><select id="pkEmpSel">${opts}</select></div>
      <div class="actions"><button class="btn" id="pkShift">כניסה למשמרת</button>
        <span class="muted" id="pkActive">${current ? `אורז פעיל: ${current.empNo} · ${current.name} · מתחילת המשמרת ${elapsed(current.shiftStart).txt}` : 'לא נבחר אורז'}</span></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <div class="hint">בעת אריזה מודפסת מדבקה הנושאת את <b>קוד האורז</b> (לטיפול בתלונות), מספר הזמנה, וזמן מאז אישור התשלום.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>הזמנה</th><th>לקוח</th><th>פריטים</th><th>סטטוס</th><th>זמן מאישור</th><th>פעולה</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    `);

    $('#pkEmpSel').addEventListener('change', (e) => {
      const emp = DB.employees().find(x => x.empNo === e.target.value);
      packing._emp = emp; viewPacking();
    });
    $('#pkShift').addEventListener('click', () => {
      const no = $('#pkEmpNo').value.trim(), nm = $('#pkEmpName').value.trim();
      const sh = $('#pkShiftSel').value;
      if (!no) { toast('הזן מספר עובד'); return; }
      packing._emp = DB.startShift(no, nm, sh);
      toast(`${packing._emp.name} נכנס/ה ל${(DB.shifts().find(s=>s.id===sh)||{}).name || 'משמרת'}`); viewPacking();
    });
  }
  function packing() { viewPacking(); }

  // shift roster drill-down: who is on each shift
  function openShiftRoster(shiftId) {
    const sh = DB.shifts().find(s => s.id === shiftId); if (!sh) return;
    const team = DB.shiftRoster(shiftId);
    const active = DB.currentShift();
    const isOn = active && active.id === shiftId;
    const rows = team.map(e => `<tr>
      <td class="num">${e.empNo}</td><td>${e.name}</td><td>${sh.from}-${sh.to}</td>
      <td><span class="elapsed" data-elapsed="${e.shiftStart || ''}">${e.shiftStart ? elapsed(e.shiftStart).txt : '-'}</span></td>
      <td>${isOn ? '<span class="chip chip--ok">במשמרת</span>' : '<span class="chip chip--new">מחוץ למשמרת</span>'}</td>
      <td><button class="btn btn--tiny btn--ok" data-setpacker="${e.empNo}">בחר כאורז</button></td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty">אין עובדים משובצים למשמרת</td></tr>`;
    openModal(`${sh.name} - צוות עובדים`, `
      <div class="hint">${sh.name} · ${sh.from}-${sh.to} · ${team.length} עובדים משובצים${isOn ? ' · המשמרת פעילה כעת' : ''}.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>מס' עובד</th><th>שם</th><th>שעות</th><th>במשמרת מ-</th><th>סטטוס</th><th>פעולה</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="actions" style="margin-top:12px"><button class="btn btn--line" id="backToPack">→ חזרה לאריזה</button></div>`);
    $('#backToPack').addEventListener('click', viewPacking);
    $$('#modalBody [data-setpacker]').forEach(b => b.addEventListener('click', () => {
      packing._emp = DB.employees().find(x => x.empNo === b.dataset.setpacker);
      toast(`${packing._emp.name} נבחר/ה כאורז פעיל`); viewPacking();
    }));
  }

  function packOrder(orderId) {
    const emp = packing._emp || DB.onShiftEmployee() || DB.employees()[0];
    if (!emp) { toast('בחר אורז למשמרת'); return; }
    const shiftName = emp.shift ? (DB.shifts().find(s => s.id === emp.shift) || {}).name : '';
    DB.setStatus(orderId, 'packing', { packedBy: emp });
    const o = DB.setStatus(orderId, 'packed', { packedBy: emp });
    const code = `${emp.empNo}-${o.id.replace('ORD-', '')}`;
    const e = elapsed(o.paymentApprovedAt);
    openModal('מדבקת אריזה', `
      <div class="sticker">
        <h4>📦 LEGO-LAND · מדבקת אריזה</h4>
        <div class="row"><span>הזמנה</span><b>${o.id}</b></div>
        <div class="row"><span>לקוח</span><b>${o.customer}</b></div>
        <div class="row"><span>פריטים</span><b>${linesText(o)}</b></div>
        <div class="row"><span>קוד אורז</span><b>${code}</b></div>
        <div class="row"><span>אורז</span><b>${emp.empNo} · ${emp.name}</b></div>
        ${shiftName ? `<div class="row"><span>משמרת</span><b>${shiftName}</b></div>` : ''}
        <div class="row"><span>זמן מאישור תשלום</span><b>${e.txt}</b></div>
        <div class="row"><span>נארז ב־</span><b>${dt(o.packedAt)}</b></div>
        <div class="bc">*${code}*</div>
        <div class="row" style="border:none"><span>כתובת</span><b>${o.address}</b></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" onclick="window.print()">🖨 הדפסה</button>
        <button class="btn btn--line" data-close>סגירה</button>
      </div>`);
    toast(`הזמנה ${o.id} נארזה ע"י ${emp.name}`);
  }

  // ============================================================
  //  VIEW: SHIPPING (משלוח)
  // ============================================================
  function viewShipping() {
    const queue = DB.orders().filter(o => ['packed', 'shipping', 'shipped'].includes(o.status));
    const rows = queue.map((o) => {
      const ref = o.shippedAt || o.packedAt || o.paymentApprovedAt;
      const e = elapsed(ref);
      let act = '';
      if (o.status === 'packed') act = `<button class="btn btn--tiny btn--ok" data-ship="${o.id}">שלח והפק קבלה</button>`;
      else if (o.status === 'shipping') act = `<button class="btn btn--tiny" data-next="${o.id}">→ נשלח</button>`;
      else act = `<button class="btn btn--tiny btn--line" data-next="${o.id}">→ נמסר</button>`;
      return `<tr>
        <td class="num">${o.id}</td><td>${o.customer}</td>
        <td style="white-space:normal">${o.address}<br><span class="muted">${o.phone || ''} · ${o.courier}</span></td>
        <td>${chip(o.status)}</td>
        <td>${o.tracking || '-'}</td>
        <td><span class="elapsed ${e.cls}" data-elapsed="${ref || ''}">${e.txt}</span></td>
        <td>${o.receiptNo ? `<button class="btn btn--tiny btn--line" data-receipt="${o.id}">${o.receiptNo}</button>` : '-'}</td>
        <td>${act}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="empty">אין משלוחים כעת</td></tr>`;

    openModal('משלוח - מערך הובלה', `
      <div class="hint">ניהול מערך ההובלה למזמין: כתובת, מוביל, מספר מעקב, וזמן מאז שההזמנה מוכנה למשלוח. הפקת קבלה מתבצעת ברגע שההזמנה יוצאת ללקוח.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>הזמנה</th><th>לקוח</th><th>כתובת ומוביל</th><th>סטטוס</th><th>מעקב</th>
        <th>זמן מההכנה</th><th>קבלה</th><th>פעולה</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    `);
  }

  function showReceipt(orderId) {
    const r = DB.receiptFor(orderId);
    if (!r || !r.no) { toast('קבלה תופק עם יציאת המשלוח'); return; }
    openModal('קבלה ' + r.no, `
      <div class="receipt">
        <h3>LEGO-LAND</h3>
        <div class="muted" style="text-align:center">קבלה / חשבונית מס · ${r.no}</div>
        <div class="ln"><span>תאריך</span><span>${dt(r.date)}</span></div>
        <div class="ln"><span>הזמנה</span><span>${r.order.id}</span></div>
        <div class="ln"><span>לקוח</span><span>${r.order.customer}</span></div>
        <div class="ln"><span>אמצעי תשלום</span><span>${r.order.creditTxn ? r.order.creditTxn.card + ' •••• ' + r.order.creditTxn.last4 : '-'}</span></div>
        <div style="margin:8px 0;border-top:1px dashed #bbb"></div>
        ${r.lines.map(l => `<div class="ln"><span>${l.name} ×${l.qty}</span><span>${nis(l.total)}</span></div>`).join('')}
        <div class="ln total"><span>סה"כ לתשלום</span><span>${nis(r.total)}</span></div>
        <div class="muted" style="text-align:center;margin-top:8px">תודה שקנית ב-LEGO-LAND 🧱</div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn" onclick="window.print()">🖨 הדפסה</button>
        <button class="btn btn--line" data-close>סגירה</button>
      </div>`);
  }

  // ============================================================
  //  VIEW: REPORTS (דוחות)
  // ============================================================
  function viewReports(tab) {
    tab = tab || viewReports._tab || 'inv';
    viewReports._tab = tab;
    openModal('דוחות', `
      <div class="subtabs">
        <button class="subtab ${tab === 'inv' ? 'is-on' : ''}" data-rtab="inv">יתרת מלאי לפי פריט</button>
        <button class="subtab ${tab === 'credit' ? 'is-on' : ''}" data-rtab="credit">גביה אשראי</button>
      </div>
      <div id="repBody"></div>
    `);
    tab === 'inv' ? renderInvReport() : renderCreditReport();
  }

  function renderInvReport() {
    const rep = DB.inventoryReport();
    const rows = rep.map((r) => `
      <tr data-drill="${r.sku}" style="cursor:pointer">
        <td>▸ ${r.name}</td><td class="num">${r.sku}</td><td>${r.barcode || '-'}</td>
        <td class="num">${r.balance}</td><td class="num">${r.soldUnits}</td><td class="num">${nis(r.soldAmount)}</td>
      </tr>
      <tr class="drill" id="drill-${r.sku}" hidden><td colspan="6">
        ${r.sales.length ? `<table class="tbl" style="min-width:auto"><thead><tr>
          <th>הזמנה</th><th>אסמכתת עסקה</th><th>תאריך</th><th>כמות</th><th>מחיר</th><th>סכום עסקה</th><th>אשראי</th></tr></thead>
          <tbody>${r.sales.map(s => `<tr><td>${s.orderId}</td><td>${s.txnId}</td><td>${dt(s.date)}</td>
            <td class="num">${s.qty}</td><td class="num">${nis(s.price)}</td><td class="num">${nis(s.amount)}</td><td>${s.card}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">אין מכירות מאושרות לפריט זה</div>'}
      </td></tr>`).join('');

    $('#repBody').innerHTML = `
      <div class="hint">לחיצה על פריט פותחת דריל-דאון למכירות לפי עסקאות שאושרו ע"י חברת האשראי.</div>
      <div class="actions" style="margin-bottom:12px">
        <button class="btn" id="repInvXls">⬇ ייצוא לאקסל</button>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>פריט</th><th>מק"ט</th><th>ברקוד</th><th>יתרה</th><th>נמכר (יח')</th><th>מכירות (₪)</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;

    $$('#repBody [data-drill]').forEach(tr => tr.addEventListener('click', () => {
      const d = $('#drill-' + tr.getAttribute('data-drill')); d.hidden = !d.hidden;
    }));
    $('#repInvXls').addEventListener('click', () => {
      const balances = { name: 'יתרת מלאי לפי פריט',
        headers: ['מק"ט', 'שם', 'ברקוד', 'יתרה', 'נמכר יח׳', 'מכירות ₪'],
        rows: rep.map(r => [r.sku, r.name, r.barcode, r.balance, r.soldUnits, r.soldAmount]) };
      const sales = { name: 'מכירות לפי עסקה',
        headers: ['מק"ט', 'שם', 'הזמנה', 'עסקת אשראי', 'תאריך', 'כמות', 'מחיר', 'סכום', 'אשראי'],
        rows: rep.flatMap(r => r.sales.map(s => [r.sku, r.name, s.orderId, s.txnId, dt(s.date), s.qty, s.price, s.amount, s.card])) };
      XL.exportExcel('דוח_מלאי_ומכירות', [balances, sales]);
      toast('הדוח הופק לאקסל');
    });
  }

  function renderCreditReport() {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
    $('#repBody').innerHTML = `
      <div class="hint">דוח גביה אשראי תקופתי לפי תאריכים. לביצוע התאמה - טען את דוח הגביה שמתקבל מחברת האשראי (ברמת עסקה),
      והמערכת תסמן כל אי-התאמה בין דוח המכירות לדוח הגביה.<br>
      פורמט קובץ ההתאמה: עמודות <b>txnId, amount</b> (אופ' <b>date, ref</b>).</div>
      <div class="grid3">
        <div class="field"><label>מתאריך</label><input type="date" id="repFrom" value="${monthAgo}"></div>
        <div class="field"><label>עד תאריך</label><input type="date" id="repTo" value="${today}"></div>
        <div class="field"><label>טעינת דוח גביה מחברת האשראי</label><input type="file" id="repSettle" accept=".csv,.txt"></div>
      </div>
      <div class="actions" style="margin-bottom:12px">
        <button class="btn" id="repRun">הצג דוח והתאמה</button>
        <button class="btn btn--line" id="repCreditXls">⬇ ייצוא לאקסל</button>
        <span class="muted" id="repSettleInfo"></span>
      </div>
      <div id="reconOut"></div>`;

    $('#repSettle').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const rows = XL.parseCSV(r.result);
        let head = rows[0].map(h => h.trim().toLowerCase());
        const has = head.includes('txnid') || head.includes('amount');
        const body = has ? rows.slice(1) : rows;
        const iT = has ? head.indexOf('txnid') : 0;
        const iA = has ? head.indexOf('amount') : 1;
        const iD = has ? head.indexOf('date') : 2;
        const iR = has ? head.indexOf('ref') : 3;
        const parsed = body.map(c => ({ txnId: (c[iT] || '').trim(), amount: +c[iA] || 0, date: iD >= 0 ? c[iD] : '', ref: iR >= 0 ? c[iR] : '' })).filter(x => x.txnId);
        const n = DB.uploadCreditSettlement(parsed);
        $('#repSettleInfo').textContent = `נטענו ${n} שורות גביה`;
        toast(`דוח גביה נטען (${n} עסקאות)`);
        runRecon();
      };
      r.readAsText(f, 'utf-8');
    });
    $('#repRun').addEventListener('click', runRecon);
    $('#repCreditXls').addEventListener('click', exportCreditExcel);
    runRecon();
  }

  function runRecon() {
    const from = $('#repFrom').value, to = $('#repTo').value;
    const R = DB.creditCollectionReport(from, to);
    const cls = (m) => m === 'match' ? 'matchok' : 'miss';
    const lbl = { match: '✔ תואם', amount: '≠ פער סכום', missing: '✘ חסר בגביה', orphan: '⚠ אין מכירה' };

    const reconRows = R.recon.map(r => `<tr class="${cls(r.match)}">
      <td>${r.orderId}</td><td>${r.txnId}</td><td>${dt(r.date)}</td><td>${r.customer}</td>
      <td class="num">${nis(r.amount)}</td>
      <td class="num">${r.collected != null ? nis(r.collected) : '-'}</td>
      <td class="num">${r.diff != null ? (r.diff === 0 ? '0' : nis(r.diff)) : '-'}</td>
      <td><span class="chip ${r.match === 'match' ? 'chip--ok' : 'chip--low'}">${lbl[r.match]}</span></td></tr>`).join('');
    const orphanRows = R.orphan.map(r => `<tr class="miss">
      <td>-</td><td>${r.txnId}</td><td>${dt(r.date)}</td><td>-</td><td class="num">-</td>
      <td class="num">${nis(r.collected)}</td><td class="num">-</td>
      <td><span class="chip chip--low">${lbl.orphan}</span></td></tr>`).join('');

    $('#reconOut').innerHTML = `
      <div class="kpis" style="padding:0 0 12px">
        <div class="kpi kpi--d"><h4>עסקאות מכירה</h4><div class="v">${R.totals.salesCount}</div></div>
        <div class="kpi kpi--b"><h4>סה"כ מכירות</h4><div class="v">${nis(R.totals.salesAmount)}</div></div>
        <div class="kpi kpi--c"><h4>סה"כ נגבה</h4><div class="v">${nis(R.totals.collectedAmount)}</div></div>
        <div class="kpi kpi--a"><h4>אי-התאמות</h4><div class="v">${R.totals.mismatches}</div></div>
      </div>
      ${!R.hasSettlement ? '<div class="hint">לא נטען דוח גביה מחברת האשראי - מוצג דוח המכירות בלבד. טען קובץ לביצוע התאמה.</div>' : ''}
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>הזמנה</th><th>עסקה</th><th>תאריך</th><th>לקוח</th><th>סכום מכירה</th><th>סכום גביה</th><th>פער</th><th>התאמה</th>
        </tr></thead><tbody>${reconRows}${orphanRows || ''}</tbody></table></div>`;
  }

  function exportCreditExcel() {
    const R = DB.creditCollectionReport($('#repFrom').value, $('#repTo').value);
    const lbl = { match: 'תואם', amount: 'פער סכום', missing: 'חסר בגביה', orphan: 'אין מכירה' };
    const sheet = { name: 'גביה אשראי - התאמה',
      headers: ['הזמנה', 'עסקה', 'תאריך', 'לקוח', 'סכום מכירה', 'סכום גביה', 'פער', 'תוצאה'],
      rows: R.recon.map(r => [r.orderId, r.txnId, dt(r.date), r.customer, r.amount, r.collected != null ? r.collected : '', r.diff != null ? r.diff : '', lbl[r.match]])
        .concat(R.orphan.map(r => ['', r.txnId, dt(r.date), '', '', r.collected, '', lbl.orphan])) };
    XL.exportExcel('דוח_גביה_אשראי', [sheet]);
    toast('דוח הגביה הופק לאקסל');
  }

  // ============================================================
  //  VIEW: ORDER LINK (לינק הזמנה)
  // ============================================================
  function viewOrderLink() {
    const itemPrice = (sku) => (DB.items().find(i => i.sku === sku) || {}).price || 0;
    const opts = DB.items().map(i => `<option value="${i.sku}">${i.name} - ${i.sku} (${nis(i.price)})</option>`).join('');
    openModal('טופס הזמנה ותשלום', `
      <div class="hint">מלא/י את פרטי ההזמנה. בלחיצה על "מעבר לתשלום" תועבר/י לדף סליקה מאובטח לתשלום אמיתי, וההזמנה תיקלט מיד במערכת.</div>
      <div class="grid2">
        <div class="field"><label>שם בעל כרטיס אשראי</label><input id="olCardHolder" placeholder="כפי שמופיע על הכרטיס"></div>
        <div class="field"><label>שם המזמין</label><input id="olName" placeholder="שם מלא"></div>
      </div>
      <h4>פריטים</h4>
      <div id="olLines"></div>
      <div class="actions"><button class="btn btn--line btn--tiny" id="olAdd">+ הוסף פריט</button></div>
      <div class="receipt" style="max-width:none;margin-top:14px">
        <div class="ln total"><span>סה"כ מחיר לתשלום</span><span id="olTotal">₪0</span></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn btn--ok" id="olPay">מעבר לתשלום ›</button>
      </div>
      <template id="olRowTpl">
        <div class="grid3 olrow" style="align-items:end">
          <div class="field" style="grid-column:span 2"><label>פריט</label><select class="olSku">${opts}</select></div>
          <div class="field"><label>כמות</label><input type="number" class="olQty" value="1" min="1"></div>
        </div>
      </template>
    `);
    const recompute = () => {
      const total = $$('#olLines .olrow').reduce((s, r) => s + itemPrice($('.olSku', r).value) * (+$('.olQty', r).value || 0), 0);
      $('#olTotal').textContent = nis(total);
      return total;
    };
    const addRow = () => { $('#olLines').appendChild($('#olRowTpl').content.cloneNode(true)); recompute(); };
    addRow();
    $('#olAdd').addEventListener('click', addRow);
    $('#olLines').addEventListener('input', recompute);
    $('#olLines').addEventListener('change', recompute);

    $('#olPay').addEventListener('click', () => {
      const lines = $$('#olLines .olrow').map(r => ({ sku: $('.olSku', r).value, qty: +$('.olQty', r).value || 0 })).filter(l => l.qty > 0);
      if (!lines.length) { toast('הוסף לפחות פריט אחד'); return; }
      const name = $('#olName').value.trim() || 'לקוח';
      const holder = $('#olCardHolder').value.trim() || name;
      const total = recompute();
      const o = DB.createOrder({ customer: name, cardHolder: holder, lines });
      toast('הזמנה ' + o.id + ' נקלטה · מעבר לתשלום ' + nis(total));
      window.open(SUMIT_PAY_URL, '_blank');
      closeModal();
    });
  }

  // ============================================================
  //  Global click delegation for dynamic action buttons
  // ============================================================
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-approve],[data-next],[data-pack],[data-ship],[data-receipt]');
    if (!t) return;
    if (t.dataset.approve) { try { DB.approvePayment(t.dataset.approve); toast('התשלום אושר · המלאי עודכן'); } catch (err) { toast(err.message); } refreshOpenView(); }
    else if (t.dataset.next) { const o = DB.orders().find(x => x.id === t.dataset.next); DB.setStatus(o.id, NEXT[o.status]); refreshOpenView(); }
    else if (t.dataset.pack) packOrder(t.dataset.pack);
    else if (t.dataset.ship) { DB.setStatus(t.dataset.ship, 'shipping'); toast('המשלוח יצא · הופקה קבלה'); showReceipt(t.dataset.ship); }
    else if (t.dataset.receipt) showReceipt(t.dataset.receipt);
  });

  // re-render whichever modal view is open after a data change
  let _openView = null;
  function refreshOpenView() {
    const map = { inventory: viewInventory, orders: viewOrders, packing: viewPacking, shipping: viewShipping, reports: () => viewReports(), orderlink: viewOrderLink };
    if (_openView && !$('#modal').hidden && map[_openView]) map[_openView]();
  }

  // ---- main nav tiles ----------------------------------------------
  $('#mainNav').addEventListener('click', (e) => {
    const b = e.target.closest('.tile'); if (!b) return;
    _openView = b.dataset.view;
    ({ inventory: viewInventory, orders: viewOrders, packing: viewPacking, shipping: viewShipping, reports: () => viewReports(), orderlink: viewOrderLink })[_openView]();
  });
  // KPI cards → per-barcode drill-down
  $('#kpis').addEventListener('click', (e) => {
    const c = e.target.closest('[data-kpi]'); if (c) { _openView = null; openKpiDrill(c.dataset.kpi); }
  });
  // sub-tab clicks inside reports + shift cards in packing
  document.body.addEventListener('click', (e) => {
    const s = e.target.closest('[data-rtab]'); if (s) { viewReports(s.dataset.rtab); return; }
    const sh = e.target.closest('[data-shift]'); if (sh) openShiftRoster(sh.dataset.shift);
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.matches('[data-close]')) _openView = null; });

  // ---- demo reset --------------------------------------------------
  $('#resetDemo').addEventListener('click', () => {
    if (confirm('לאפס את כל הנתונים לנתוני הדגמה?')) { DB.reset(); toast('הנתונים אופסו'); }
  });

  // ============================================================
  //  PWA install
  // ============================================================
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) { toast('להתקנה: תפריט הדפדפן ← "הוסף למסך הבית"'); return; }
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('האפליקציה הותקנה 🎉'); });

  // ============================================================
  //  Boot + live loop
  // ============================================================
  DB.on(() => { try { renderHome(); refreshOpenView(); } catch (e) {} });
  try {
    renderHome();
    tick();
    setInterval(tick, 1000);
    setInterval(() => { if ($('#modal').hidden) { renderLiveOrders(); renderLiveStock(); } }, 5000);
  } catch (e) {
    if (window.__legoErr) window.__legoErr(e && e.message ? e.message : String(e));
  }
})();
