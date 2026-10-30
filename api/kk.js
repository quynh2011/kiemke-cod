/* ============================================================================
 * API kiem ke COD tren Vercel: chuyen tiep yeu cau tu app vao Web App Apps Script cong ty.
 *
 *   POST /api/kk   body JSON { action, token, ... }  ->  JSON tu Apps Script
 *
 * Web App cong ty chi mo cho tai khoan @ghn.vn ("Bat ky ai trong to chuc"), nen ham nay
 * goi kem access token cua tai khoan chu script (lay tu OAuth refresh token, scope drive.readonly).
 * Nhan vien KHONG can tai khoan Google: dang nhap bang Ma NV + PIN cua app (kiem tra trong Apps Script).
 *
 * Bien moi truong (Vercel -> Project -> Settings -> Environment Variables):
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN  (bat buoc)
 *   KK_GAS_URL   link /exec cua Web App Apps Script (bat buoc)
 * ========================================================================== */
'use strict';
const ACTIONS = new Set(['login', 'enrollStart', 'enrollFinish', 'me', 'list', 'refresh', 'scan', 'report', 'photo', 'users', 'saveUser']);
const MAX_BODY = 4 * 1024 * 1024;

let cachedToken = null;
async function accessToken(force) {
  const now = Date.now();
  if (!force && cachedToken && cachedToken.exp > now + 60000) return cachedToken.token;
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, GOOGLE_OAUTH_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) throw Object.assign(new Error('Máy chủ chưa cấu hình GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN'), { status: 500 });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' })
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.access_token) throw Object.assign(new Error('Không lấy được quyền Google (' + r.status + ' ' + (d && d.error || '') + ')'), { status: 502 });
  cachedToken = { token: d.access_token, exp: now + (Number(d.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

async function callGas(url, body, force) {
  const r = await fetch(url, { method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', Authorization: 'Bearer ' + await accessToken(force) }, body });
  return { status: r.status, text: await r.text() };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  try {
    const url = process.env.KK_GAS_URL;
    if (!url) return send(500, { ok: false, error: 'Máy chủ chưa cấu hình KK_GAS_URL' });
    if (req.method === 'GET') return send(200, { ok: true, app: 'KiemKe COD proxy', configured: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    if (req.method !== 'POST') return send(405, { ok: false, error: 'Chỉ nhận POST' });
    const body = await readBody(req);
    if (body.length > MAX_BODY) return send(413, { ok: false, error: 'Dữ liệu gửi lên quá lớn' });
    let b; try { b = JSON.parse(body); } catch (e) { return send(400, { ok: false, error: 'Dữ liệu không hợp lệ' }); }
    if (!b || !ACTIONS.has(b.action)) return send(400, { ok: false, error: 'Thao tác không hợp lệ' });
    let g = await callGas(url, body, false);
    if (g.status === 401 || g.status === 403) g = await callGas(url, body, true); // token het han giua chung -> lay moi, thu 1 lan
    if (g.status !== 200 || g.text.charAt(0) !== '{') {
      const hint = g.status === 401 || g.status === 403 ? ' — tài khoản trong GOOGLE_OAUTH_REFRESH_TOKEN không mở được Web App (cần tài khoản @ghn.vn chủ script, scope drive.readonly)' : '';
      return send(502, { ok: false, error: 'Apps Script không trả lời đúng (HTTP ' + g.status + ')' + hint });
    }
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(g.text);
  } catch (e) {
    send(e.status || 500, { ok: false, error: e.message || String(e) });
  }
};
