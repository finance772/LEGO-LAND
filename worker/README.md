# Sumit Charge Worker — הוראות הקמה (Cloudflare Workers)

ה-Worker הזה מבצע את **החיוב האמיתי** בצד שרת מול Sumit, כך שהסכום תמיד נגזר מההזמנה
והמפתח הסודי לעולם לא נחשף בדפדפן.

## מה צריך ממך
1. **Company ID** (מזהה חברה) — מתוך Sumit.
2. **Public API Key** (מפתח ציבורי) — לטופס באפליקציה (יימסר לי בצ'אט, זה ציבורי).
3. **Private API Key** (מפתח סודי) — **רק** כאן כסוד ב-Cloudflare. אל תשלחי אותו בצ'אט.

## הקמה מהירה (דרך הדפדפן, ללא התקנות)
1. היכנסי ל-https://dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Create Worker**.
2. תני שם (למשל `lego-land-pay`) ← **Deploy**.
3. **Edit code** ← הדביקי את כל התוכן של `sumit-charge.js` ← **Deploy**.
4. **Settings → Variables and Secrets** ← הוסיפי:
   - `SUMIT_COMPANY_ID` (Secret) = מזהה החברה.
   - `SUMIT_API_KEY` (Secret) = המפתח הסודי.
   - `ALLOW_ORIGIN` (Variable, אופציונלי) = כתובת האתר (או `*` לבדיקות).
5. העתיקי את כתובת ה-Worker (למשל `https://lego-land-pay.<חשבון>.workers.dev`) **ושלחי לי אותה**.

## בדיקה
לאחר שתשלחי לי את ה-Public Key וכתובת ה-Worker, אחבר את טופס התשלום באפליקציה.
נבדוק עם **פריט הטסט (1₪)** — חיוב אמיתי של שקל אחד שמאמת שהכל עובד מקצה לקצה.

## הערה טכנית
ה-Worker קורא ל-`https://api.sumit.co.il/billing/payments/charge/` עם ה-`SingleUseToken`
שהתקבל מ-`payments.js`. אם מבנה הבקשה/תשובה שונה אצלך, נראה זאת מיד בתגובת השגיאה
של חיוב הטסט ונכוונן (הקובץ בנוי לכך שקל לעדכן את ה-endpoint/השדות).
