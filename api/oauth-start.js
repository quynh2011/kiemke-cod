/* Buoc 1 lay refresh token (dung 1 lan): mo https://<domain>/api/oauth-start bang tai khoan chu script (@ghn.vn).
 * Tu khoa khi GOOGLE_OAUTH_REFRESH_TOKEN da duoc cau hinh. */
'use strict';
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) { res.statusCode = 403; res.end('Đã cấu hình GOOGLE_OAUTH_REFRESH_TOKEN — không cần lấy lại.'); return; }
  if (!id || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) { res.statusCode = 500; res.end('Chưa cấu hình GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET trên Vercel.'); return; }
  const redirect = 'https://' + req.headers.host + '/api/oauth-callback';
  const u = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.readonly'
  });
  res.writeHead(302, { Location: u }); res.end();
};
