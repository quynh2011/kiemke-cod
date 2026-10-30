/* Buoc 2 lay refresh token (dung 1 lan): doi code lay refresh_token va CHI HIEN THI ra man hinh
 * de dan vao bien GOOGLE_OAUTH_REFRESH_TOKEN (khong luu, khong log). Tu khoa khi bien do da co. */
'use strict';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) { res.statusCode = 403; res.end('Đã cấu hình GOOGLE_OAUTH_REFRESH_TOKEN — endpoint này đã khóa.'); return; }
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret } = process.env;
  const q = new URL(req.url, 'https://x').searchParams;
  if (q.get('error')) { res.statusCode = 400; res.end('Google báo lỗi: ' + esc(q.get('error'))); return; }
  if (!q.get('code')) { res.statusCode = 400; res.end('Thiếu code — mở /api/oauth-start trước.'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code'), client_id: id, client_secret: secret, redirect_uri: 'https://' + req.headers.host + '/api/oauth-callback', grant_type: 'authorization_code' })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.refresh_token) { res.statusCode = 502; res.end('<pre>Không lấy được refresh token: ' + esc(JSON.stringify(d)) + '\nThử gỡ quyền app tại https://myaccount.google.com/permissions rồi mở lại /api/oauth-start.</pre>'); return; }
  res.statusCode = 200;
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:15px system-ui;padding:24px;max-width:760px">
<h2>Lấy refresh token thành công</h2>
<p>Copy chuỗi dưới đây, dán vào Vercel → project <b>kiemke-cod</b> → Settings → Environment Variables → biến <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>, bấm Save, rồi Redeploy.</p>
<textarea readonly style="width:100%;height:110px;font:13px monospace" onclick="this.select()">${esc(d.refresh_token)}</textarea>
<p style="color:#888">Trang này không lưu token ở đâu. Sau khi đã cấu hình, endpoint tự khóa.</p></body>`);
};
