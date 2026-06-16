/* ============================================================
   LEGO-LAND · Sumit charge Worker (Cloudflare Workers)
   ------------------------------------------------------------
   Receives the single-use card token (og-token) produced client-side
   by Sumit's payments.js, plus the ORDER amount, and performs the real
   charge server-side via Sumit's Transaction/Charge API — so the amount
   ALWAYS matches the order and the secret API key never reaches the browser.

   Secrets (set in Cloudflare, NOT in code):
     SUMIT_COMPANY_ID   - your Sumit Company ID (number)
     SUMIT_API_KEY      - your Sumit PRIVATE API key
   Optional:
     ALLOW_ORIGIN       - allowed site origin for CORS (default "*")
   ============================================================ */

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, cors);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400, cors); }

    const { token, amount, customerName, citizenId, email, orderId } = body || {};
    const amt = Number(amount);
    if (!token || !(amt > 0)) return json({ ok: false, error: 'missing token or amount' }, 400, cors);

    // Sumit "Charge" — charges the card and issues a document/receipt.
    const payload = {
      Credentials: { CompanyID: Number(env.SUMIT_COMPANY_ID), APIKey: env.SUMIT_API_KEY },
      Customer: { Name: customerName || 'לקוח', EmailAddress: email || '', SearchMode: 0 },
      Items: [{
        Quantity: 1,
        UnitPrice: amt,
        Description: 'הזמנה ' + (orderId || ''),
        Item: { Name: 'הזמנה ' + (orderId || 'LEGO-LAND'), Price: amt },
      }],
      SingleUseToken: token,
      VATIncluded: true,
      SendDocumentByEmail: !!email,
      ExternalIdentifier: orderId || '',
      ...(citizenId ? { Payment: { CitizenID: citizenId } } : {}),
    };

    let res, data;
    try {
      res = await fetch('https://api.sumit.co.il/billing/payments/charge/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    } catch (e) {
      return json({ ok: false, error: 'upstream ' + String(e) }, 502, cors);
    }

    // OfficeGuy/Sumit convention: Status === 0 means success.
    const ok = data && (data.Status === 0 || data.Status === 'Success');
    return json({
      ok,
      status: data && data.Status,
      message: (data && (data.UserErrorMessage || data.TechnicalErrorDetails)) || null,
      documentUrl: ok && data.Data ? (data.Data.DocumentDownloadURL || null) : null,
      data,
    }, ok ? 200 : 402, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
