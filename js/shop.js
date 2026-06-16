/* ============================================================
   LEGO-LAND · Shop / landing page (customer-facing)
   Renders the catalog, manages a cart, and creates a real order
   (linked to the same operations pipeline) that leads to payment.
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const nis = (n) => '₪' + (Math.round(n * 100) / 100).toLocaleString('he-IL');

  // Sumit checkout (same as the ops app; embedded Worker payment comes next)
  const SUMIT_PAY_URL = 'https://pay.sumit.co.il/e1wv4v/xbiry4/';
  function buildPaymentUrl(total, holder, orderId) {
    const p = new URLSearchParams();
    ['Amount', 'amount', 'Sum', 'sum', 'Price', 'price'].forEach(k => p.set(k, total));
    if (holder) p.set('Name', holder);
    if (orderId) { p.set('ExternalIdentifier', orderId); p.set('order', orderId); }
    return SUMIT_PAY_URL + (SUMIT_PAY_URL.includes('?') ? '&' : '?') + p.toString();
  }

  const COLORS = ['#d01012', '#0057a8', '#1aa64b', '#e8920c', '#7b3ff2', '#0aa3a3'];
  const ICONS  = ['🧱', '🏰', '🚗', '🌸', '🚀', '🦖', '🚂', '🌍', '⭐'];

  // catalog: hide the internal payment-test item from customers
  const products = () => DB.items().filter(i => i.sku !== 'TEST-1');

  // ---- cart ---------------------------------------------------------
  const cart = {}; // sku -> qty
  const cartCount = () => Object.values(cart).reduce((s, q) => s + q, 0);
  const cartTotal = () => Object.entries(cart).reduce((s, [sku, q]) => {
    const it = DB.items().find(i => i.sku === sku) || {}; return s + (it.price || 0) * q;
  }, 0);

  function addToCart(sku) {
    const it = DB.items().find(i => i.sku === sku);
    if (!it) return;
    cart[sku] = Math.min((cart[sku] || 0) + 1, it.qty);
    toast(it.name + ' נוסף לסל');
    syncCartUI();
  }
  function setQty(sku, q) {
    const it = DB.items().find(i => i.sku === sku);
    q = Math.max(0, Math.min(q, it ? it.qty : q));
    if (q === 0) delete cart[sku]; else cart[sku] = q;
    syncCartUI();
  }

  // ---- rendering ----------------------------------------------------
  function renderGrid() {
    const low = (DB.settings && DB.settings().lowStock) || 5;
    $('#grid').innerHTML = products().map((it, idx) => {
      const c = COLORS[idx % COLORS.length], ico = ICONS[idx % ICONS.length];
      const lowStock = it.qty <= low;
      return `<div class="card">
        <div class="card__img" style="background:linear-gradient(135deg,${c},${shade(c)})">
          <div class="studs"></div>
          <span>${ico}</span>
          <span class="sku">${it.sku}</span>
          ${lowStock ? '<span class="tag">כמות אחרונה</span>' : ''}
        </div>
        <div class="card__body">
          <div class="card__name">${it.name}</div>
          <div class="stock ${lowStock ? 'stock--low' : ''}">${it.qty > 0 ? 'במלאי: ' + it.qty : 'אזל'}</div>
          <div class="card__row">
            <div class="price">${nis(it.price)}</div>
            <button class="add" data-add="${it.sku}" ${it.qty <= 0 ? 'disabled' : ''}>הוסף לסל +</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function syncCartUI() {
    $('#cartCount').textContent = cartCount();
    const items = Object.entries(cart);
    $('#cartBody').innerHTML = items.length ? items.map(([sku, q]) => {
      const it = DB.items().find(i => i.sku === sku) || {};
      return `<div class="citem">
        <div class="citem__t"><b>${it.name}</b><span>${it.sku} · ${nis(it.price)} ליח׳</span></div>
        <div class="qty">
          <button data-dec="${sku}">−</button><b>${q}</b><button data-inc="${sku}">+</button>
        </div>
        <div style="font-weight:800;min-width:64px;text-align:start">${nis((it.price || 0) * q)}</div>
      </div>`;
    }).join('') : '<div class="empty">הסל ריק - הוסיפו ערכות לגו 🧱</div>';
    $('#cartTotal').textContent = nis(cartTotal());
    $('#payBtn').disabled = items.length === 0;
  }

  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---- drawer -------------------------------------------------------
  const openDrawer = () => { syncCartUI(); $('#drawer').classList.add('open'); };
  const closeDrawer = () => $('#drawer').classList.remove('open');

  // ---- checkout -----------------------------------------------------
  function checkout() {
    const lines = Object.entries(cart).map(([sku, qty]) => ({ sku, qty }));
    if (!lines.length) { toast('הסל ריק'); return; }
    const name = $('#ckName').value.trim() || 'לקוח';
    const holder = $('#ckHolder').value.trim() || name;
    const total = cartTotal();
    const o = DB.createOrder({ customer: name, cardHolder: holder, lines });
    toast('הזמנה ' + o.id + ' נקלטה · מעבר לתשלום ' + nis(total));
    window.open(buildPaymentUrl(total, holder, o.id), '_blank');
    // reset cart
    Object.keys(cart).forEach(k => delete cart[k]);
    syncCartUI(); closeDrawer(); renderGrid();
  }

  // ---- events -------------------------------------------------------
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]'); if (add) return addToCart(add.dataset.add);
    const inc = e.target.closest('[data-inc]'); if (inc) return setQty(inc.dataset.inc, (cart[inc.dataset.inc] || 0) + 1);
    const dec = e.target.closest('[data-dec]'); if (dec) return setQty(dec.dataset.dec, (cart[dec.dataset.dec] || 0) - 1);
    if (e.target.closest('#openCart, #heroShop')) return openDrawer();
    if (e.target.closest('[data-close-drawer]')) return closeDrawer();
    if (e.target.closest('#payBtn')) return checkout();
    if (e.target.closest('#heroProducts')) { document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' }); }
  });

  // ---- boot ---------------------------------------------------------
  renderGrid();
  syncCartUI();
})();
