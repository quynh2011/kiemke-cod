// CAU HINH WEB APP KIEM KE
// Chay tren Vercel: goi /api/kk (ham chuyen tiep vao Apps Script cong ty, xem api/kk.js).
// Chay tren GitHub Pages: khong co /api -> CHE DO DEMO (du lieu mau, khong ghi Google Sheet).
window.KK_CONFIG = {
  api: /github\.io$/.test(location.hostname) ? '' : '/api/kk'
};
