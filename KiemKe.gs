/**
 * ================================================================
 * KiemKe.gs — BACKEND APP KIEM KE DON COD (Apps Script Web App)
 * ================================================================
 * Dat chung project voi COD_check.gs (doc sheet Data do CODScan tao).
 *
 * SHEET (script tu tao khi chay KKSetup):
 *   KK_NguoiDung : tai khoan + phan quyen (sua bang form "Quan tri" trong app hoac sua tay)
 *   KK_DanhSach  : danh sach don CAN KIEM chot theo tung ngay (lich su)
 *   KK_KetQua    : moi lan quet = 1 dong, ghi NGAY khi quet (kem link anh)
 *   KK_BaoCao    : tong hop cuoi ngay (ham KKTongHopNgay, trigger 21h)
 * Anh luu o Google Drive: thu muc "KiemKe_AnhDonHang/<ngay>" (rieng tu, chi xem qua app).
 *
 * VAI TRO:
 *   NV       : chi thay don co "Ma NV giao" = ma NV cua minh
 *   BUU_CUC  : thay don cua cac buu cuc ghi o cot "Buu cuc" cua tai khoan
 *   AM       : thay don cac buu cuc co "ID AM" = ma NV cua minh (sheet Cauhinh) + buu cuc ghi them
 *   QUAN_LY  : thay tat ca, xem bao cao, quan tri tai khoan
 *   (BUU_CUC, AM, QUAN_LY xem duoc bao cao + anh trong pham vi cua minh)
 *
 * TRIEN KHAI (1 lan):
 *   1. Chay ham KKSetup() -> tao sheet + tai khoan QUAN_LY dau tien (ma KK_ADMIN.ma)
 *      Dang nhap = Ma NV + ma 6 so tren Google/Microsoft Authenticator. Lan dau: tu kich hoat (quay mat + quet QR).
 *   2. Deploy > New deployment > Web app | Execute as: Me | Who has access: Anyone
 *   3. Copy URL .../exec -> dan vao file config.js cua web app
 *   Sua code: Deploy > Manage deployments > Edit > Version: New version (URL giu nguyen)
 * ================================================================
 */

// ---- Ten sheet nguon (trung voi COD_check.gs) ----
const KK_SRC_DATA = 'Data';
const KK_SRC_CAUHINH = 'Cauhinh';
const KK_SRC_MAIN = 'Main';
// Danh sach nhan su (IMPORTRANGE) - dung de: kich hoat Authenticator, chan nguoi nghi viec, lay ho ten, chuc vu
const KK_SRC_NHANSU = 'Nhansu';
const KK_NHANSU_ACTIVE = 'Đang làm việc';   // gia tri cot "Trạng thái" cua nguoi dang lam

const KK_SH_USERS = 'KK_NguoiDung';
const KK_SH_LIST = 'KK_DanhSach';
const KK_SH_RESULT = 'KK_KetQua';
const KK_SH_REPORT = 'KK_BaoCao';
const KK_SH_VERIFY = 'KK_XacMinh';      // nhat ky kich hoat Authenticator + anh khuon mat
const KK_VERIFY_HEADERS = ['Thời gian', 'Mã NV', 'Họ tên', 'Chức vụ', 'Bưu cục', 'Sự kiện', 'Ảnh xác minh', 'File ảnh', 'Thiết bị', 'Thực hiện bởi'];
const KK_TOTP_ISSUER = 'Kiem ke COD';    // ten hien trong app Authenticator
const KK_ENROLL_MIN = 15;                // phien kich hoat het han sau 15 phut
const KK_PHOTO_ROOT = 'KiemKe_AnhDonHang';

// Tai khoan QUAN_LY tao khi chay KKSetup (tu kich hoat Authenticator lan dau)
const KK_ADMIN = { ma: '3172684', ten: 'Phạm Văn Quỳnh' };

const KK_ROLES = ['NV', 'BUU_CUC', 'AM', 'QUAN_LY'];
// Vai tro luu trong sheet: '' / TU_DONG = tu xac dinh (AM neu co ID AM trong Cauhinh, con lai NV giao)
const KK_ROLE_AUTO = 'TU_DONG';
const KK_HTML_FILE = 'KiemKeApp';   // ten file HTML giao dien trong project Apps Script
// Tram chuyen tiep (Apps Script tren Gmail CA NHAN, deploy "Bat ky ai") - de nhan vien KHONG co Gmail cong ty dung duoc app.
// Dan link /exec cua tram (file KiemKeRelay.gs) vao day, roi chay ham KKCaiRelay 1 lan.
const KK_RELAY_URL = '';
const KK_ROLE_VN = { NV: 'Nhân viên giao', BUU_CUC: 'Nhân viên bưu cục', AM: 'AM', QUAN_LY: 'Quản lý' };
const KK_TOKEN_HOURS = 14;
const KK_MAX_LOGIN_FAIL = 5;

const KK_RES = { OK: 'Đúng danh sách', OUT: 'Ngoài danh sách', DUP: 'Quét lại' };

const KK_USER_HEADERS = ['Mã NV', 'Họ tên', 'Vai trò', 'Bưu cục', 'PIN (mã hoá)', 'Trạng thái', 'Cập nhật lúc', 'Cập nhật bởi',
  'Authenticator', 'Ảnh xác minh'];
const KK_LIST_HEADERS = ['Ngày', 'Bưu cục', 'Mã đơn', 'COD', 'Mã NV giao', 'Tên NV giao', 'SĐT NV giao', 'Mã chuyến',
  'Trạng thái', 'Số lần giao', 'Tên hàng', 'Phường giao', 'Chốt lúc', 'Loại khỏi DS', 'Quận/Huyện giao', 'Tỉnh giao',
  'Lý do giao thất bại'];
// Trang thai GHN (partnerStatus) -> don da xong, loai khoi danh sach can kiem. Lay theo COD_CFG.FINAL_STATUSES neu co.
const KK_DONE_STATUSES = ['delivered', 'returned', 'cancel'];
const KK_STATUS_EVERY_MIN = 10;   // trigger cap nhat trang thai don (phut) - du phong khi khong ai mo app
const KK_STATUS_FRESH_SEC = 180;  // don vua tra GHN trong 3 phut -> khong tra lai (giam tai)
const KK_STATUS_MAX_PER_CALL = 120; // so don toi da tra trong 1 lan goi tu app (tranh qua 60s); app tu goi tiep
const KK_RESULT_HEADERS = ['Thời gian', 'Ngày', 'Bưu cục', 'Mã đơn', 'Kết quả', 'COD', 'Mã NV giao', 'Tên NV giao',
  'Mã chuyến', 'Mã người kiểm', 'Tên người kiểm', 'Vai trò', 'Ảnh', 'File ảnh', 'File ảnh nhỏ', 'Số lần đọc khớp',
  'Thiết bị', 'Nội dung mã quét'];
const KK_REPORT_HEADERS = ['Ngày', 'Nhóm', 'Mã', 'Tên', 'Cần kiểm', 'Đã kiểm', 'Thiếu', 'Tỉ lệ', 'COD thiếu',
  'Ngoài danh sách', 'Quét lại', 'Người kiểm'];

// Chi so cot (0-index)
const L = {}; KK_LIST_HEADERS.forEach(function (h, i) { L[h] = i; });
const R = {}; KK_RESULT_HEADERS.forEach(function (h, i) { R[h] = i; });
const U = {}; KK_USER_HEADERS.forEach(function (h, i) { U[h] = i; });

// ================================================================
// WEB APP
// ================================================================
// Mo link /exec tren dien thoai -> chay thang app kiem ke (file HTML "KiemKeApp" trong project).
// Tai khoan Google noi bo (vd ghn.vn) chi deploy duoc "Bat ky ai trong to chuc" -> app phai chay tu link nay.
// ?ping=1 -> tra JSON kiem tra backend
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return kkJson_({ ok: true, app: 'KiemKe COD', time: new Date().toISOString() });
  return HtmlService.createHtmlOutputFromFile(KK_HTML_FILE)
    .setTitle('Kiểm kê COD')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
  return kkJson_(kkHandle_(b));
}

// Goi tu trang app (google.script.run.kkApi) - cung xu ly nhu doPost
function kkApi(json) {
  let b = {};
  try { b = JSON.parse(json || '{}'); } catch (x) {}
  return JSON.stringify(kkHandle_(b));
}

function kkHandle_(b) {
  try {
    const a = b.action;
    if (a === 'login') return kkLogin_(b);
    if (a === 'enrollStart') return kkEnrollStart_(b);
    if (a === 'enrollFinish') return kkEnrollFinish_(b);
    const me = kkAuth_(b.token);
    if (a === 'me') return { ok: true, user: kkPublicUser_(me) };
    if (a === 'list') return kkList_(me);
    if (a === 'refresh') return kkRefreshMine_(me, b);
    if (a === 'scan') return kkScan_(me, b);
    if (a === 'report') return kkReport_(me, b);
    if (a === 'photo') return kkPhoto_(me, b);
    if (a === 'users') return kkUsers_(me);
    if (a === 'saveUser') return kkSaveUser_(me, b);
    return { ok: false, error: 'Thao tác không hợp lệ' };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), auth: !!(err && err.auth), needSetup: !!(err && err.needSetup) };
  }
}

// ================================================================
// DANG NHAP + TOKEN
// ================================================================
// Dang nhap: Ma NV + ma 6 so tren app Authenticator (TOTP, 30 giay/ma)
function kkLogin_(b) {
  const ma = String(b.ma || '').trim();
  const code = String(b.code || b.pin || '').replace(/\s/g, '');
  if (!ma || !code) throw new Error('Nhập mã NV và mã 6 số trên Authenticator');
  const cache = CacheService.getScriptCache();
  const failKey = 'kkfail_' + ma;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= KK_MAX_LOGIN_FAIL) throw new Error('Nhập sai quá ' + KK_MAX_LOGIN_FAIL + ' lần. Thử lại sau 15 phút.');
  const u = kkFindUser_(ma);
  kkCheckActive_(u, ma);
  const secret = kkTotpSecret_(ma);
  if (!u.auth || !secret) {
    const e = new Error('Mã NV ' + ma + ' chưa kích hoạt Authenticator. Bấm "Lần đầu dùng app? Kích hoạt Authenticator".');
    e.needSetup = true; throw e;
  }
  if (!kkTotpCheck_(secret, code, ma)) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Mã Authenticator không đúng hoặc đã hết hạn. Nhập mã đang hiện trên app.');
  }
  cache.remove(failKey);
  return { ok: true, token: kkSign_({ u: u.ma, a: u.auth, exp: Date.now() + KK_TOKEN_HOURS * 3600000 }), user: kkPublicUser_(u) };
}

function kkAuth_(token) {
  const p = kkVerify_(token);
  const u = p && kkFindUser_(p.u);
  // Quan ly dat lai Authenticator -> u.auth doi -> moi phien cu bi huy ngay
  if (!u || !u.auth || p.a !== u.auth) { const e = new Error('Phiên đăng nhập hết hạn, đăng nhập lại'); e.auth = true; throw e; }
  try { kkCheckActive_(u, u.ma); } catch (err) { err.auth = true; throw err; }
  return u;
}

function kkSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('KK_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('KK_SECRET', s); }
  return s;
}
function kkB64_(bytesOrStr) { return Utilities.base64EncodeWebSafe(bytesOrStr).replace(/=+$/, ''); }
function kkSign_(payload) {
  const body = kkB64_(JSON.stringify(payload));
  return body + '.' + kkB64_(Utilities.computeHmacSha256Signature(body, kkSecret_()));
}
function kkVerify_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  if (kkB64_(Utilities.computeHmacSha256Signature(parts[0], kkSecret_())) !== parts[1]) return null;
  let p;
  try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0] + '==='.slice((parts[0].length + 3) % 4))).getDataAsString()); }
  catch (e) { return null; }
  return p && p.exp > Date.now() ? p : null;
}
function kkHash_(ma, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'kk|' + ma + '|' + pin, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

// ================================================================
// NGUOI DUNG + PHAM VI
// ================================================================
function kkReadUsers_() {
  const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, KK_USER_HEADERS.length).getDisplayValues().map(function (r, i) {
    return { row: i + 2, ma: String(r[U['Mã NV']]).trim(), ten: r[U['Họ tên']], role: String(r[U['Vai trò']]).trim().toUpperCase(),
      hubs: kkSplit_(r[U['Bưu cục']]), hash: r[U['PIN (mã hoá)']], status: String(r[U['Trạng thái']]).trim() || 'Hoạt động',
      auth: String(r[U['Authenticator']] || '').trim(), selfie: String(r[U['Ảnh xác minh']] || '').trim() };
  }).filter(function (u) { return u.ma; });
}
// Tai khoan hieu luc = dong trong KK_NguoiDung (neu co) + thong tin Nhansu + vai tro tu dong
function kkFindUser_(ma) {
  ma = String(ma || '').trim();
  if (!ma) return null;
  const row = kkReadUsers_().filter(function (u) { return u.ma === ma; })[0] || null;
  const ns = kkNhansu_(ma);
  if (!row && !ns) return null;
  const u = row ? Object.assign({}, row) : { row: 0, ma: ma, ten: '', role: '', hubs: [], hash: '', status: 'Hoạt động', auth: '', selfie: '' };
  u.storedRole = u.role;
  u.ten = u.ten || (ns ? ns.ten : '');
  u.ns = ns;
  if (!u.role || u.role === KK_ROLE_AUTO) u.role = kkAutoRole_(ma, ns);
  return u;
}

// Vai tro tu dong theo CHUC VU trong sheet Nhansu:
//   Area Manager / Acting Area Manager -> AM (cac buu cuc trong khu vuc AM quan ly)
//   Operations Executive               -> BUU_CUC (don can kiem cua buu cuc minh)
//   Business Development Field Executive -> NV (don cua chinh nhan vien giao)
// Chuc vu khac: la AM neu ma NV la ID AM trong Cauhinh, con lai NV giao
const KK_TITLE_ROLE = [
  ['acting area manager', 'AM'], ['area manager', 'AM'],
  ['operations executive', 'BUU_CUC'], ['business development field executive', 'NV']
];
function kkTitleRole_(chucvu) {
  const t = String(chucvu || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < KK_TITLE_ROLE.length; i++) if (t === KK_TITLE_ROLE[i][0]) return KK_TITLE_ROLE[i][1];
  return '';
}
function kkAutoRole_(ma, ns) {
  if (ns === undefined) ns = kkNhansu_(ma);
  const byTitle = ns ? kkTitleRole_(ns.chucvu) : '';
  if (byTitle) return byTitle;
  const hubs = kkHubs_();
  return Object.keys(hubs).some(function (c) { return hubs[c].amId === ma; }) ? 'AM' : 'NV';
}

// Cac buu cuc ma AM (theo ten) quan ly trong sheet Nhansu (cot AM), cache 10 phut
function kkNsAmHubs_(amName) {
  const name = String(amName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!name) return [];
  const cache = CacheService.getScriptCache();
  const key = 'kkamh_' + Utilities.base64EncodeWebSafe(name).slice(0, 200);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_NHANSU);
  const out = {};
  if (sh && sh.getLastRow() >= 2) {
    const v = sh.getDataRange().getDisplayValues();
    const head = v[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const cAm = head.indexOf('am'), cHub = head.findIndex(function (h) { return h.indexOf('bưu cục') === 0; });
    if (cAm >= 0 && cHub >= 0) v.slice(1).forEach(function (r) {
      const hub = String(r[cHub]).split(' - ')[0].trim();
      if (/^\d+$/.test(hub) && String(r[cAm]).trim().toLowerCase().replace(/\s+/g, ' ') === name) out[hub] = true;
    });
  }
  const list = Object.keys(out);
  cache.put(key, JSON.stringify(list), 600);
  return list;
}

// Chan: tai khoan bi khoa trong KK_NguoiDung, hoac da NGHI VIEC theo sheet Nhansu
function kkCheckActive_(u, ma) {
  if (!u) throw new Error('Mã NV ' + ma + ' không có trong danh sách nhân sự');
  if (u.status === 'Khoá') throw new Error('Tài khoản đã bị khoá');
  if (u.ns && !u.ns.active) throw new Error('Mã NV ' + ma + ' đã nghỉ việc / không còn làm việc - không được dùng app');
}

// Tra 1 nhan vien trong sheet Nhansu (tim cot theo tieu de), cache 10 phut
function kkNhansu_(ma) {
  const cache = CacheService.getScriptCache();
  const key = 'kkns_' + ma;
  const hit = cache.get(key);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_NHANSU);
  if (!sh || sh.getLastRow() < 2) return null;
  const width = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const col = function (prefix) { for (let i = 0; i < head.length; i++) if (head[i].indexOf(prefix) === 0) return i; return -1; };
  const cId = Math.max(0, col('id'));
  const cell = sh.getRange(2, cId + 1, sh.getLastRow() - 1, 1).createTextFinder(String(ma)).matchEntireCell(true).findNext();
  if (!cell) { cache.put(key, '-', 600); return null; }
  const r = sh.getRange(cell.getRow(), 1, 1, width).getDisplayValues()[0];
  const g = function (prefix) { const i = col(prefix); return i >= 0 ? String(r[i]).trim() : ''; };
  const quit = g('ngày nghỉ');
  const status = g('trạng thái');
  const ns = {
    ma: String(ma), ten: g('tên'), chucvu: g('chức vụ'), start: kkDayStr_(g('ngày vào')),
    quit: /^(null|-)?$/i.test(quit) ? '' : quit, status: status, hub: g('bưu cục').split(' - ')[0].trim(), am: g('am')
  };
  ns.active = status === KK_NHANSU_ACTIVE && !ns.quit;
  cache.put(key, JSON.stringify(ns), 600);
  return ns;
}

// ================================================================
// AUTHENTICATOR (TOTP RFC 6238) + XAC MINH KHUON MAT
// ================================================================
// Buoc 1: nhap ma NV -> tao khoa bi mat (chua luu), tra QR / link otpauth
function kkEnrollStart_(b) {
  const ma = String(b.ma || '').trim();
  if (!/^\d{3,10}$/.test(ma)) throw new Error('Nhập mã nhân viên (chỉ gồm số)');
  const cache = CacheService.getScriptCache();
  const rk = 'kkenrs_' + ma, n = Number(cache.get(rk) || 0);
  if (n >= 10) throw new Error('Thử kích hoạt quá nhiều lần. Thử lại sau 30 phút.');
  cache.put(rk, String(n + 1), 1800);
  const u = kkFindUser_(ma);
  kkCheckActive_(u, ma);
  if (u.auth && kkTotpSecret_(ma)) {
    throw new Error('Mã NV ' + ma + ' đã kích hoạt Authenticator. Đổi máy / mất mã thì nhờ quản lý bấm "Đặt lại Authenticator".');
  }
  const secret = kkB32Encode_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + Date.now() + ma).slice(0, 20));
  const id = Utilities.getUuid();
  cache.put('kkenr_' + id, JSON.stringify({ ma: ma, secret: secret }), KK_ENROLL_MIN * 60);
  const ns = u.ns || {};
  const label = encodeURIComponent(KK_TOTP_ISSUER + ':' + ma + (u.ten ? ' ' + u.ten : ''));
  return { ok: true, enrollId: id, ma: ma, ten: u.ten || '', chucvu: ns.chucvu || '', hub: ns.hub || (u.hubs || [])[0] || '',
    uri: 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(KK_TOTP_ISSUER) + '&algorithm=SHA1&digits=6&period=30' };
}

// Buoc 2: anh khuon mat + ma 6 so dau tien -> luu khoa, ghi nhat ky xac minh, dang nhap luon
function kkEnrollFinish_(b) {
  const ma = String(b.ma || '').trim(), code = String(b.code || '').replace(/\s/g, '');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('kkenr_' + String(b.enrollId || ''));
  const pend = raw ? JSON.parse(raw) : null;
  if (!pend || pend.ma !== ma) throw new Error('Phiên kích hoạt đã hết hạn (' + KK_ENROLL_MIN + ' phút). Làm lại từ đầu.');
  const selfie = kkStripB64_(b.selfie || '');
  if (selfie.length < 2000) throw new Error('Thiếu ảnh xác minh khuôn mặt. Quay lại bước chụp khuôn mặt.');
  if (selfie.length > 3000000) throw new Error('Ảnh xác minh quá lớn');
  const fk = 'kkenrf_' + b.enrollId, f = Number(cache.get(fk) || 0);
  if (f >= 5) { cache.remove('kkenr_' + b.enrollId); throw new Error('Nhập sai mã quá 5 lần. Làm lại từ đầu.'); }
  if (!kkTotpCheck_(pend.secret, code, ma)) {
    cache.put(fk, String(f + 1), KK_ENROLL_MIN * 60);
    throw new Error('Mã 6 số chưa đúng. Kiểm tra đã thêm đúng tài khoản vào Authenticator và giờ điện thoại đặt tự động.');
  }
  const u = kkFindUser_(ma);
  kkCheckActive_(u, ma);
  const tz = Session.getScriptTimeZone(), now = new Date();
  const authAt = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm:ss');
  const lock = kkLock_();
  lock.waitLock(20000);
  let file;
  try {
    const again = kkFindUser_(ma);
    if (again.auth && kkTotpSecret_(ma)) throw new Error('Mã NV ' + ma + ' vừa được kích hoạt trên máy khác. Nhờ quản lý kiểm tra.');
    file = kkVerifyFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(selfie), 'image/jpeg',
      ma + '_' + Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss') + '_kichhoat.jpg'));
    PropertiesService.getScriptProperties().setProperty('kktotp_' + ma, pend.secret);
    kkWriteAuth_(u, authAt, file.getId(), 'Tự kích hoạt');
    kkLogVerify_(now, u, 'Kích hoạt Authenticator', file, String(b.device || '').slice(0, 120), u.ten || ma);
  } finally { lock.releaseLock(); }
  cache.remove('kkenr_' + b.enrollId);
  const fresh = kkFindUser_(ma);
  return { ok: true, token: kkSign_({ u: ma, a: fresh.auth, exp: Date.now() + KK_TOKEN_HOURS * 3600000 }), user: kkPublicUser_(fresh) };
}

// Ghi cot Authenticator + Anh xac minh (tao dong moi neu nguoi nay chua co trong KK_NguoiDung)
function kkWriteAuth_(u, authAt, fileId, by) {
  const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
  kkEnsureHeaders_(sh, KK_USER_HEADERS);
  if (u.row) {
    sh.getRange(u.row, U['Authenticator'] + 1, 1, 2).setNumberFormat('@').setValues([[authAt, fileId]]);
    sh.getRange(u.row, U['PIN (mã hoá)'] + 1).setValue('');
    sh.getRange(u.row, U['Cập nhật lúc'] + 1, 1, 2).setValues([[new Date(), by]]);
    return;
  }
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 1).setNumberFormat('@');
  sh.getRange(at, U['Authenticator'] + 1, 1, 2).setNumberFormat('@');
  sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([[u.ma, u.ten || '', u.storedRole || KK_ROLE_AUTO, (u.hubs || []).join(', '), '',
    'Hoạt động', new Date(), by, authAt, fileId]]);
}

function kkLogVerify_(when, u, event, file, device, by) {
  const sh = kkSheet_(KK_SH_VERIFY, KK_VERIFY_HEADERS);
  const ns = u.ns || {};
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 2).setNumberFormat('@');
  sh.getRange(at, 1, 1, KK_VERIFY_HEADERS.length).setValues([[when, u.ma, u.ten || '', ns.chucvu || '', ns.hub || (u.hubs || []).join(', '),
    event, file ? file.getUrl() : '', file ? file.getId() : '', device || '', by || '']]);
}

function kkVerifyFolder_() {
  const root = kkRootFolder_();
  const it = root.getFoldersByName('XacMinh_KhuonMat');
  return it.hasNext() ? it.next() : root.createFolder('XacMinh_KhuonMat');
}

function kkTotpSecret_(ma) { return PropertiesService.getScriptProperties().getProperty('kktotp_' + ma) || ''; }

// Kiem tra ma 6 so: cho lech +-1 buoc (30s) do gio dien thoai; moi ma chi dung 1 lan
function kkTotpCheck_(secret, code, ma) {
  if (!/^\d{6}$/.test(code)) return false;
  const c = Math.floor(Date.now() / 30000), cache = CacheService.getScriptCache();
  for (let d = -1; d <= 1; d++) {
    if (kkTotp_(secret, c + d) !== code) continue;
    const used = 'kkotpu_' + ma + '_' + (c + d);
    if (cache.get(used)) return false;
    cache.put(used, '1', 180);
    return true;
  }
  return false;
}
function kkTotp_(secret, counter) {
  const key = kkB32Decode_(secret).map(function (x) { return x > 127 ? x - 256 : x; });
  const msg = [];
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c % 256; c = Math.floor(c / 256); }
  const h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg.map(function (x) { return x > 127 ? x - 256 : x; }), key)
    .map(function (x) { return x & 255; });
  const o = h[19] & 15;
  const bin = ((h[o] & 127) * 16777216) + (h[o + 1] << 16) + (h[o + 2] << 8) + h[o + 3];
  return ('000000' + (bin % 1000000)).slice(-6);
}
const KK_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function kkB32Encode_(bytes) {
  let bits = 0, val = 0, out = '';
  bytes.forEach(function (b) {
    val = (val << 8) | (b & 255); bits += 8;
    while (bits >= 5) { out += KK_B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  });
  if (bits > 0) out += KK_B32[(val << (5 - bits)) & 31];
  return out;
}
function kkB32Decode_(s) {
  let bits = 0, val = 0;
  const out = [];
  String(s).toUpperCase().replace(/[^A-Z2-7]/g, '').split('').forEach(function (ch) {
    val = (val << 5) | KK_B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  });
  return out;
}

function kkPublicUser_(u) {
  const sc = kkScope_(u);
  return { ma: u.ma, ten: u.ten, role: u.role, roleVN: KK_ROLE_VN[u.role] || u.role,
    hubs: sc.all ? [] : Object.keys(sc.hubs), all: sc.all, canReport: u.role !== 'NV', canAdmin: u.role === 'QUAN_LY',
    authAt: u.auth || '', selfie: u.selfie || '' };
}

// Danh sach buu cuc tu Cauhinh: { code: {name, amId, amName} } (tim cot theo tieu de)
function kkHubs_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_CAUHINH);
  if (!sh || sh.getLastRow() < 2) return {};
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const col = function (names, def) {
    for (let i = 0; i < names.length; i++) { const k = head.indexOf(names[i]); if (k >= 0) return k; }
    return def;
  };
  const cName = col(['tên đơn vị *', 'tên đơn vị', 'tên bưu cục'], 1);
  const cAmId = col(['id am', 'mã am'], 2);
  const cAm = col(['am', 'tên am'], 3);
  const out = {};
  v.slice(1).forEach(function (r) {
    const code = String(r[0]).trim();
    if (/^\d+$/.test(code) && !out[code]) out[code] = { name: r[cName], amId: String(r[cAmId] || '').trim(), amName: r[cAm] };
  });
  return out;
}

// Pham vi xem du lieu cua 1 tai khoan
function kkScope_(u) {
  if (u.role === 'QUAN_LY') return { all: true, hubs: {}, driver: '' };
  const hubs = {};
  u.hubs.forEach(function (h) { hubs[h] = true; });
  // Buu cuc cua chinh nhan vien trong Nhansu (Operations Executive / AM)
  if ((u.role === 'BUU_CUC' || u.role === 'AM') && u.ns && /^\d+$/.test(u.ns.hub)) hubs[u.ns.hub] = true;
  if (u.role === 'AM') {
    const all = kkHubs_();
    Object.keys(all).forEach(function (c) { if (all[c].amId === u.ma) hubs[c] = true; });
    kkNsAmHubs_(u.ten).forEach(function (h) { hubs[h] = true; });
  }
  if (u.role === 'NV') return { all: false, hubs: {}, driver: u.ma };
  return { all: false, hubs: hubs, driver: '' };
}
function kkInScope_(sc, hub, driverId) {
  if (sc.all) return true;
  if (sc.driver) return String(driverId).trim() === sc.driver;
  return !!sc.hubs[String(hub).trim()];
}

// ================================================================
// DANH SACH CAN KIEM THEO NGAY (KK_DanhSach)
// ================================================================
// Chot danh sach hom nay tu sheet Data (thay the danh sach hom nay neu da co). Goi sau moi lan CODScan.
function KKChotDanhSach() {
  const lock = kkLock_();
  lock.waitLock(30000);
  try { return kkSnapshot_(true); } finally { lock.releaseLock(); }
}

function kkSnapshot_(replace) {
  const day = kkToday_();
  const sh = kkSheet_(KK_SH_LIST, KK_LIST_HEADERS);
  const last = sh.getLastRow();
  // Dong cua hom nay nam o cuoi sheet (ghi theo thu tu ngay)
  let firstToday = 0;
  if (last > 1) {
    const days = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = days.length - 1; i >= 0 && days[i][0] === day; i--) firstToday = i + 2;
  }
  if (firstToday && !replace) return 0;
  // Giu lai danh dau "Loai khoi DS" cua lan chot truoc trong ngay (don da giao/hoan)
  const keepDone = {};
  if (firstToday) {
    sh.getRange(firstToday, 1, last - firstToday + 1, KK_LIST_HEADERS.length).getValues().forEach(function (r) {
      if (r[L['Loại khỏi DS']]) keepDone[String(r[L['Bưu cục']]) + '|' + String(r[L['Mã đơn']])] = [r[L['Trạng thái']], r[L['Loại khỏi DS']]];
    });
  }
  const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_DATA);
  if (!src || src.getLastRow() < 2) return 0;
  const v = src.getDataRange().getValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const c = function (name) { return head.indexOf(name); };
  const map = { hub: c('Bưu cục'), order: c('Mã đơn'), cod: c('COD'), dId: c('Mã NV giao'), dName: c('Tên NV giao'),
    dPhone: c('SĐT NV giao'), trip: c('Mã chuyến'), status: c('Trạng thái hiện tại'), att: c('Số lần giao'),
    goods: c('Tên hàng'), ward: c('Phường giao'), dist: c('Quận/Huyện giao'), prov: c('Tỉnh giao'),
    fails: c('Lý do giao thất bại (theo lần)') >= 0 ? c('Lý do giao thất bại (theo lần)') : c('Lý do lỗi (lần cuối trong chuyến)') };
  if (map.order < 0 || map.hub < 0) throw new Error('Sheet Data thiếu cột "Mã đơn" / "Bưu cục"');
  const g = function (r, k) { return map[k] >= 0 ? r[map[k]] : ''; };
  const now = new Date();
  const seen = {};
  const rows = [];
  v.slice(1).forEach(function (r) {
    const order = String(g(r, 'order')).trim().toUpperCase();
    const hub = String(g(r, 'hub')).trim();
    if (!order || seen[hub + '|' + order]) return;
    seen[hub + '|' + order] = true;
    const kd = keepDone[hub + '|' + order];
    rows.push([day, hub, order, Number(g(r, 'cod')) || 0, String(g(r, 'dId')).trim(), g(r, 'dName'), String(g(r, 'dPhone')),
      g(r, 'trip'), kd ? kd[0] : g(r, 'status'), g(r, 'att'), String(g(r, 'goods')).slice(0, 500), g(r, 'ward'), now, kd ? kd[1] : '',
      g(r, 'dist'), g(r, 'prov'), String(g(r, 'fails')).slice(0, 2000)]);
  });
  kkEnsureHeaders_(sh, KK_LIST_HEADERS);
  if (firstToday) sh.deleteRows(firstToday, last - firstToday + 1);
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, 3).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, KK_LIST_HEADERS.length).setValues(rows);
  }
  console.log('[KiemKe] Chot danh sach ' + day + ': ' + rows.length + ' don');
  return rows.length;
}

// Lay Ten hang / So lan giao / Phuong-Quan-Tinh / Ly do giao that bai tu sheet Data theo ma don
function kkFillFromData_(list) {
  const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_DATA);
  if (!src || src.getLastRow() < 2) return;
  const v = src.getDataRange().getValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const c = function (n) { return head.indexOf(n); };
  const ci = { order: c('Mã đơn'), hub: c('Bưu cục'), goods: c('Tên hàng'), att: c('Số lần giao'), ward: c('Phường giao'),
    dist: c('Quận/Huyện giao'), prov: c('Tỉnh giao'), fails: c('Lý do giao thất bại (theo lần)'), last: c('Lý do lỗi (lần cuối trong chuyến)') };
  if (ci.order < 0) return;
  const g = function (r, k) { return ci[k] >= 0 ? r[ci[k]] : ''; };
  const by = {};
  v.slice(1).forEach(function (r) { const k = String(g(r, 'order')).trim().toUpperCase(); if (k && !by[k]) by[k] = r; });
  list.forEach(function (o) {
    const r = by[o.order]; if (!r) return;
    o.goods = o.goods || String(g(r, 'goods'));
    // Chi bo sung truong con trong; ket qua tra GHN (realtime) da ghi vao danh sach thi luon duoc uu tien
    if (o.attempts === '' || o.attempts == null) o.attempts = g(r, 'att');
    o.fails = o.fails || String(g(r, 'fails') || g(r, 'last') || '');
    o.ward = o.ward || String(g(r, 'ward'));
    o.district = o.district || String(g(r, 'dist'));
    o.province = o.province || String(g(r, 'prov'));
  });
}

// Doc cac dong co cot ngay trong khoang [fromNum, toNum] (yyyymmdd), doc tu CUOI sheet len
function kkReadDays_(name, headers, fromNum, toNum) {
  const sh = kkSheet_(name, headers);
  const last = sh.getLastRow();
  const out = [];
  const CH = 3000;
  for (let end = last; end >= 2; end -= CH) {
    const start = Math.max(2, end - CH + 1);
    const v = sh.getRange(start, 1, end - start + 1, headers.length).getValues();
    let older = false;
    for (let i = v.length - 1; i >= 0; i--) {
      const d = kkDayNum_(v[i][headers === KK_LIST_HEADERS ? L['Ngày'] : R['Ngày']]);
      if (d > toNum) continue;
      if (d < fromNum) { older = true; continue; }
      out.push(v[i]);
    }
    if (older) break;
  }
  return out.reverse();
}

// ================================================================
// DANH SACH KIEM HOM NAY (theo pham vi)
// ================================================================
function kkList_(me) {
  kkSnapshot_(false); // dam bao hom nay da co danh sach
  const sc = kkScope_(me);
  const day = kkToday_(), dn = kkDayNum_(day);
  const hubs = kkHubs_();
  const all = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, dn, dn)
    .filter(function (r) { return kkInScope_(sc, r[L['Bưu cục']], r[L['Mã NV giao']]); })
    .map(function (r) {
      return { hub: String(r[L['Bưu cục']]), hubName: (hubs[r[L['Bưu cục']]] || {}).name || '', order: String(r[L['Mã đơn']]),
        cod: Number(r[L['COD']]) || 0, driverId: String(r[L['Mã NV giao']]), driverName: r[L['Tên NV giao']],
        driverPhone: String(r[L['SĐT NV giao']]), trip: r[L['Mã chuyến']], status: r[L['Trạng thái']],
        attempts: r[L['Số lần giao']], goods: r[L['Tên hàng']], ward: r[L['Phường giao']], closed: String(r[L['Loại khỏi DS']] || ''),
        district: r[L['Quận/Huyện giao']] || '', province: r[L['Tỉnh giao']] || '', fails: String(r[L['Lý do giao thất bại']] || '') };
    });
  // Bo sung chi tiet tu sheet Data cho don chot tu ban cu (chua co cot Quan/Tinh/Ly do that bai)
  if (all.some(function (o) { return !o.district || !o.province || !o.fails || o.attempts === '' || o.attempts == null; })) kkFillFromData_(all);
  // Don da giao thanh cong / hoan thanh cong -> khong con can kiem
  const orders = all.filter(function (o) { return !o.closed; });
  const closed = all.filter(function (o) { return o.closed; });
  const inList = {};
  orders.forEach(function (o) { inList[o.order] = true; });
  const checked = {}, extra = [];
  kkReadDays_(KK_SH_RESULT, KK_RESULT_HEADERS, dn, dn).forEach(function (r) {
    const code = String(r[R['Mã đơn']]);
    if (r[R['Kết quả']] === KK_RES.OK && inList[code] && !checked[code]) {
      checked[code] = { time: kkTime_(r[R['Thời gian']]), by: r[R['Tên người kiểm']], thumb: r[R['File ảnh nhỏ']], photo: r[R['File ảnh']] };
    } else if (r[R['Kết quả']] === KK_RES.OUT && (sc.all || String(r[R['Mã người kiểm']]) === me.ma ||
               kkInScope_(sc, r[R['Bưu cục']], ''))) {
      extra.push({ order: code, hub: String(r[R['Bưu cục']] || ''), hubName: (hubs[r[R['Bưu cục']]] || {}).name || '', time: kkTime_(r[R['Thời gian']]),
        by: r[R['Tên người kiểm']], thumb: r[R['File ảnh nhỏ']], photo: r[R['File ảnh']] });
    }
  });
  return { ok: true, day: day, user: kkPublicUser_(me), orders: orders, checked: checked, extra: extra, closed: closed,
    statusAt: PropertiesService.getScriptProperties().getProperty('KK_STATUS_AT') || '' };
}

// ================================================================
// QUET 1 DON (ghi ngay + luu anh)
// ================================================================
function kkScan_(me, b) {
  const code = String(b.order || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(code)) throw new Error('Mã đơn không hợp lệ: ' + code);
  if (!b.photo) throw new Error('Thiếu ảnh chụp đơn hàng');
  const sc = kkScope_(me);
  const day = kkToday_(), dn = kkDayNum_(day);
  // Tra GHN ngay don vua quet (realtime): da giao / hoan / roi buu cuc -> loai truoc khi ghi ket qua. Loi GHN thi bo qua.
  try { kkRefreshStatus_(function (r) { return String(r[L['Mã đơn']]) === code; }, 5, true); }
  catch (e) { console.log('[KiemKe] Khong tra duoc trang thai ' + code + ': ' + e.message); }

  const lock = kkLock_();
  lock.waitLock(30000);
  try {
    kkSnapshot_(false);
    const sameAll = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, dn, dn).filter(function (r) { return String(r[L['Mã đơn']]) === code; });
    const closedRow = sameAll.filter(function (r) { return r[L['Loại khỏi DS']]; })[0] || null;
    const sameCode = sameAll.filter(function (r) { return !r[L['Loại khỏi DS']]; });
    const row = sameCode.filter(function (r) { return kkInScope_(sc, r[L['Bưu cục']], r[L['Mã NV giao']]); })[0];
    // Don co trong danh sach chung nhung KHONG thuoc pham vi nguoi quet (vd don cua NV khac)
    const other = row ? null : sameCode[0] || closedRow;

    let prev = null;
    if (row) {
      kkReadDays_(KK_SH_RESULT, KK_RESULT_HEADERS, dn, dn).some(function (r) {
        if (String(r[R['Mã đơn']]) === code && r[R['Kết quả']] === KK_RES.OK) {
          prev = { time: kkTime_(r[R['Thời gian']]), by: r[R['Tên người kiểm']] };
          return true;
        }
        return false;
      });
    }
    const result = !row ? KK_RES.OUT : prev ? KK_RES.DUP : KK_RES.OK;
    const src = row || other; // thong tin don that (ke ca khi ngoai pham vi) de quan ly doi chieu
    const hub = src ? String(src[L['Bưu cục']]) : String(b.hub || (me.hubs[0] || ''));

    // Luu anh vao Drive
    const now = new Date();
    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HHmmss');
    const folder = kkDayFolder_(day);
    const base = (hub || 'NA') + '_' + code + '_' + stamp + '_' + me.ma;
    const full = folder.createFile(Utilities.newBlob(Utilities.base64Decode(kkStripB64_(b.photo)), 'image/jpeg', base + '.jpg'));
    const thumb = b.thumb ? folder.createFile(Utilities.newBlob(Utilities.base64Decode(kkStripB64_(b.thumb)), 'image/jpeg', base + '_nho.jpg')) : null;

    const rec = [now, day, hub, code, result, src ? src[L['COD']] : '', src ? src[L['Mã NV giao']] : '',
      src ? src[L['Tên NV giao']] : '', src ? src[L['Mã chuyến']] : '', me.ma, me.ten, KK_ROLE_VN[me.role] || me.role,
      full.getUrl(), full.getId(), thumb ? thumb.getId() : '', Number(b.reads) || 1,
      String(b.device || '').slice(0, 120), String(b.raw || '').slice(0, 300)];
    const sh = kkSheet_(KK_SH_RESULT, KK_RESULT_HEADERS);
    const at = sh.getLastRow() + 1;
    sh.getRange(at, 2, 1, 3).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_RESULT_HEADERS.length).setValues([rec]);
    return { ok: true, result: result, order: code, prev: prev, time: kkTime_(now), thumb: thumb ? thumb.getId() : full.getId(),
      photo: full.getId(), info: src ? { cod: src[L['COD']], driverName: src[L['Tên NV giao']], trip: src[L['Mã chuyến']],
        status: src[L['Trạng thái']], hub: hub } : null,
      note: other && other === closedRow ? 'Đơn đã ' + String(closedRow[L['Loại khỏi DS']]).replace(/^Đã /, '').toLowerCase() + ' - đã loại khỏi danh sách cần kiểm'
        : other ? 'Đơn thuộc ' + (other[L['Tên NV giao']] || 'NV khác') + ' - BC ' + other[L['Bưu cục']] + ', không thuộc danh sách của bạn' : '' };
  } finally {
    lock.releaseLock();
  }
}

function kkRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('KK_FOLDER_ID'), root = null;
  try { root = rootId ? DriveApp.getFolderById(rootId) : null; } catch (e) { root = null; }
  if (!root) { root = DriveApp.createFolder(KK_PHOTO_ROOT); props.setProperty('KK_FOLDER_ID', root.getId()); }
  return root;
}
function kkDayFolder_(day) {
  const root = kkRootFolder_();
  const name = day.split('/').reverse().join('-'); // yyyy-MM-dd
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// ================================================================
// XEM ANH (kiem tra quyen theo pham vi)
// ================================================================
function kkPhoto_(me, b) {
  const ids = (b.ids || [b.id]).filter(Boolean).slice(0, 40);
  const sc = kkScope_(me);
  const allowed = {};
  // Tim cac anh trong 62 ngay gan nhat de kiem tra quyen
  const to = kkDayNum_(kkToday_()), from = kkDayNum_(kkShiftDay_(-62));
  const want = {}; ids.forEach(function (i) { want[i] = true; });
  kkReadDays_(KK_SH_RESULT, KK_RESULT_HEADERS, from, to).forEach(function (r) {
    [r[R['File ảnh']], r[R['File ảnh nhỏ']]].forEach(function (id) {
      if (!want[id]) return;
      if (sc.all || String(r[R['Mã người kiểm']]) === me.ma || kkInScope_(sc, r[R['Bưu cục']], r[R['Mã NV giao']])) allowed[id] = true;
    });
  });
  // Anh xac minh khuon mat: quan ly xem tat ca; AM xem trong khu vuc minh; nguoi dung chi xem anh cua chinh minh
  const vsh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SH_VERIFY);
  if (vsh && vsh.getLastRow() > 1 && ids.some(function (i) { return !allowed[i]; })) {
    vsh.getRange(2, 1, vsh.getLastRow() - 1, KK_VERIFY_HEADERS.length).getValues().forEach(function (r) {
      const id = String(r[7]);
      if (!want[id]) return;
      if (sc.all || String(r[1]) === me.ma || (me.role === 'AM' && kkSplit_(r[4]).some(function (h) { return sc.hubs[h]; }))) allowed[id] = true;
    });
  }
  const out = {};
  ids.forEach(function (id) {
    if (!allowed[id]) return;
    try { out[id] = 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); }
    catch (e) { /* bo qua anh loi */ }
  });
  return { ok: true, photos: out };
}

// ================================================================
// BAO CAO KIEM KE (theo khoang ngay, trong pham vi)
// ================================================================
function kkReport_(me, b) {
  if (me.role === 'NV') throw new Error('Tài khoản nhân viên giao không xem báo cáo');
  const sc = kkScope_(me);
  const from = kkDayNum_(b.from || kkToday_()), to = kkDayNum_(b.to || kkToday_());
  if (from > to) throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
  const hubFilter = String(b.hub || '').trim();
  const hubs = kkHubs_();
  const okHub = function (h) { return (!hubFilter || String(h) === hubFilter) && (sc.all || sc.hubs[String(h)]); };

  const expected = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, from, to)
    .filter(function (r) { return okHub(r[L['Bưu cục']]) && !r[L['Loại khỏi DS']]; });
  const results = kkReadDays_(KK_SH_RESULT, KK_RESULT_HEADERS, from, to).filter(function (r) { return okHub(r[R['Bưu cục']]); });

  // Ket qua dau tien "Dung danh sach" cua moi (ngay, don)
  const firstOk = {}, rescans = {}, extras = [];
  results.forEach(function (r) {
    const k = kkDayStr_(r[R['Ngày']]) + '|' + r[R['Mã đơn']];
    if (r[R['Kết quả']] === KK_RES.OK && !firstOk[k]) firstOk[k] = r;
    else if (r[R['Kết quả']] === KK_RES.DUP) rescans[k] = (rescans[k] || 0) + 1;
    else if (r[R['Kết quả']] === KK_RES.OUT) extras.push(r);
  });

  const details = [];
  const groups = {};
  const bump = function (key, name, kind, field, n) {
    const g = groups[kind + '|' + key] = groups[kind + '|' + key] ||
      { kind: kind, key: key, name: name, need: 0, done: 0, miss: 0, codMiss: 0, extra: 0, rescan: 0, checkers: {} };
    g[field] += n;
    return g;
  };
  expected.forEach(function (r) {
    const day = kkDayStr_(r[L['Ngày']]), code = String(r[L['Mã đơn']]), hub = String(r[L['Bưu cục']]);
    const ok = firstOk[day + '|' + code];
    const cod = Number(r[L['COD']]) || 0;
    const driverKey = String(r[L['Mã NV giao']]) || '(không rõ)';
    [['hub', hub, (hubs[hub] || {}).name || ''], ['driver', driverKey, r[L['Tên NV giao']]], ['day', day, day],
     ['am', (hubs[hub] || {}).amId || '(không rõ)', (hubs[hub] || {}).amName || '']].forEach(function (x) {
      const g = bump(x[1], x[2], x[0], 'need', 1);
      if (ok) { g.done++; g.checkers[ok[R['Tên người kiểm']]] = 1; } else { g.miss++; g.codMiss += cod; }
      if (rescans[day + '|' + code]) g.rescan += rescans[day + '|' + code];
    });
    details.push({ day: day, hub: hub, order: code, cod: cod, driverId: String(r[L['Mã NV giao']]), driverName: r[L['Tên NV giao']],
      trip: r[L['Mã chuyến']], status: r[L['Trạng thái']], done: !!ok, time: ok ? kkTime_(ok[R['Thời gian']]) : '',
      by: ok ? ok[R['Tên người kiểm']] : '', thumb: ok ? ok[R['File ảnh nhỏ']] || ok[R['File ảnh']] : '',
      photo: ok ? ok[R['File ảnh']] : '', rescan: rescans[day + '|' + code] || 0 });
  });
  // Nguoi kiem: so don kiem dung / ngoai DS / quet lai
  results.forEach(function (r) {
    const key = String(r[R['Mã người kiểm']]);
    const g = groups['checker|' + key] = groups['checker|' + key] ||
      { kind: 'checker', key: key, name: r[R['Tên người kiểm']], need: 0, done: 0, miss: 0, codMiss: 0, extra: 0, rescan: 0, checkers: {} };
    if (r[R['Kết quả']] === KK_RES.OK) g.done++;
    if (r[R['Kết quả']] === KK_RES.OUT) g.extra++;
    if (r[R['Kết quả']] === KK_RES.DUP) g.rescan++;
  });
  extras.forEach(function (r) {
    const hub = String(r[R['Bưu cục']]), day = kkDayStr_(r[R['Ngày']]);
    if (groups['hub|' + hub]) groups['hub|' + hub].extra++;
    if (groups['day|' + day]) groups['day|' + day].extra++;
  });

  const list = Object.keys(groups).map(function (k) {
    const g = groups[k];
    g.checkers = Object.keys(g.checkers).join(', ');
    g.rate = g.need ? Math.round(g.done / g.need * 1000) / 10 : null;
    return g;
  });
  const extraList = extras.map(function (r) {
    return { day: kkDayStr_(r[R['Ngày']]), hub: String(r[R['Bưu cục']]), order: String(r[R['Mã đơn']]), time: kkTime_(r[R['Thời gian']]),
      by: r[R['Tên người kiểm']], thumb: r[R['File ảnh nhỏ']] || r[R['File ảnh']], photo: r[R['File ảnh']] };
  });
  const total = { need: details.length, done: details.filter(function (d) { return d.done; }).length };
  total.miss = total.need - total.done;
  total.codMiss = details.filter(function (d) { return !d.done; }).reduce(function (s, d) { return s + d.cod; }, 0);
  total.extra = extraList.length;
  return { ok: true, from: kkNumToDay_(from), to: kkNumToDay_(to), total: total, groups: list,
    details: details.slice(0, 3000), extras: extraList.slice(0, 1000),
    hubs: Object.keys(hubs).filter(function (h) { return sc.all || sc.hubs[h]; }).map(function (h) { return { code: h, name: hubs[h].name }; }) };
}

// Tong hop cuoi ngay -> KK_BaoCao (gan trigger hang ngay ~21h bang KKCaiTrigger)
function KKTongHopNgay() {
  const admin = { ma: '_system', ten: 'Hệ thống', role: 'QUAN_LY', hubs: [] };
  const day = kkToday_();
  const rep = kkReport_(admin, { from: day, to: day });
  const sh = kkSheet_(KK_SH_REPORT, KK_REPORT_HEADERS);
  const kindVN = { hub: 'Bưu cục', driver: 'NV giao', am: 'AM', checker: 'Người kiểm' };
  const rows = rep.groups.filter(function (g) { return g.kind !== 'day'; }).map(function (g) {
    return [day, kindVN[g.kind], g.key, g.name, g.need, g.done, g.miss, g.rate === null ? '' : g.rate / 100, g.codMiss, g.extra, g.rescan, g.checkers];
  });
  if (rows.length) {
    const at = sh.getLastRow() + 1;
    sh.getRange(at, 1, rows.length, 3).setNumberFormat('@');
    sh.getRange(at, 1, rows.length, KK_REPORT_HEADERS.length).setValues(rows);
    sh.getRange(at, 8, rows.length, 1).setNumberFormat('0.0%');
    sh.getRange(at, 9, rows.length, 1).setNumberFormat('#,##0');
  }
  console.log('[KiemKe] Tong hop ' + day + ': ' + rows.length + ' dong');
}

// ================================================================
// QUAN TRI TAI KHOAN
// ================================================================
function kkUsers_(me) {
  if (me.role !== 'QUAN_LY') throw new Error('Chỉ quản lý được quản trị tài khoản');
  const hubs = kkHubs_();
  return { ok: true, roles: [{ code: KK_ROLE_AUTO, name: 'Tự động theo chức vụ (Nhansu)' }]
      .concat(KK_ROLES.map(function (r) { return { code: r, name: KK_ROLE_VN[r] }; })),
    hubs: Object.keys(hubs).map(function (h) { return { code: h, name: hubs[h].name, amId: hubs[h].amId, amName: hubs[h].amName }; }),
    users: kkReadUsers_().map(function (u) {
      const ns = kkNhansu_(u.ma);
      const eff = !u.role || u.role === KK_ROLE_AUTO ? kkAutoRole_(u.ma, ns) : u.role;
      return { ma: u.ma, ten: u.ten || (ns ? ns.ten : ''), role: u.role || KK_ROLE_AUTO, effRole: eff, effRoleVN: KK_ROLE_VN[eff],
        hubs: u.hubs, status: u.status, hasAuth: !!(u.auth && kkTotpSecret_(u.ma)), authAt: u.auth, selfie: u.selfie,
        chucvu: ns ? ns.chucvu : '', nsStatus: ns ? (ns.active ? 'Đang làm việc' : 'Đã nghỉ / ' + (ns.status || '')) : 'Không có trong Nhansu' };
    }) };
}

function kkSaveUser_(me, b) {
  if (me.role !== 'QUAN_LY') throw new Error('Chỉ quản lý được quản trị tài khoản');
  const ma = String(b.ma || '').trim(), ten = String(b.ten || '').trim(), role = String(b.role || '').trim().toUpperCase();
  if (!/^\d{3,10}$/.test(ma)) throw new Error('Mã NV phải là số');
  if (!ten) throw new Error('Nhập họ tên');
  if (KK_ROLES.indexOf(role) < 0 && role !== KK_ROLE_AUTO) throw new Error('Vai trò không hợp lệ');
  const hubs = kkSplit_(b.hubs);
  if (role === 'BUU_CUC' && !hubs.length) throw new Error('Nhân viên bưu cục phải chọn ít nhất 1 bưu cục');
  const status = b.status === 'Khoá' ? 'Khoá' : 'Hoạt động';
  if (ma === me.ma && (status === 'Khoá' || role !== 'QUAN_LY')) throw new Error('Không tự khoá hoặc hạ quyền chính mình');

  const lock = kkLock_();
  lock.waitLock(20000);
  try {
    const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
    const old = kkReadUsers_().filter(function (x) { return x.ma === ma; })[0] || null;
    kkEnsureHeaders_(sh, KK_USER_HEADERS);
    // Dat lai Authenticator: xoa khoa + ngay kich hoat -> phien cu bi huy, nhan vien tu kich hoat lai (kem anh khuon mat)
    const reset = !!(b.resetAuth || b.resetPin);
    if (reset) PropertiesService.getScriptProperties().deleteProperty('kktotp_' + ma);
    const row = [ma, ten, role, hubs.join(', '), '', status, new Date(), me.ten,
      reset || !old ? '' : old.auth, reset || !old ? '' : old.selfie];
    const at = old ? old.row : sh.getLastRow() + 1; // old.row = dong that trong sheet
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, U['Authenticator'] + 1, 1, 2).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([row]);
    if (reset && old && old.auth) kkLogVerify_(new Date(), Object.assign({ ns: kkNhansu_(ma) }, old), 'Quản lý đặt lại Authenticator', null, '', me.ten);
    return { ok: true, created: !old };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// CAI DAT 1 LAN
// ================================================================
function KKSetup() {
  [[KK_SH_USERS, KK_USER_HEADERS], [KK_SH_LIST, KK_LIST_HEADERS], [KK_SH_RESULT, KK_RESULT_HEADERS], [KK_SH_REPORT, KK_REPORT_HEADERS],
    [KK_SH_VERIFY, KK_VERIFY_HEADERS]].forEach(function (x) { kkEnsureHeaders_(kkSheet_(x[0], x[1]), x[1]); });
  kkSecret_();
  if (!kkReadUsers_().some(function (u) { return u.ma === KK_ADMIN.ma; })) {
    const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
    const at = sh.getLastRow() + 1;
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([[KK_ADMIN.ma, KK_ADMIN.ten, 'QUAN_LY', '', '', 'Hoạt động', new Date(), 'KKSetup', '', '']]);
    console.log('[KiemKe] Da tao tai khoan QUAN_LY ' + KK_ADMIN.ma + '. Mo app -> "Kich hoat Authenticator" de dang nhap.');
  }
  kkSnapshot_(true);
  KKCaiTrigger();
  console.log('[KiemKe] Cai dat xong.');
}

// Trigger: tong hop bao cao 21h hang ngay + cap nhat trang thai don moi KK_STATUS_EVERY_MIN phut
function KKCaiTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'KKTongHopNgay' || f === 'KKCapNhatTrangThai') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('KKTongHopNgay').timeBased().everyDays(1).atHour(21).inTimezone(Session.getScriptTimeZone()).create();
  ScriptApp.newTrigger('KKCapNhatTrangThai').timeBased().everyMinutes(KK_STATUS_EVERY_MIN).create();
  console.log('[KiemKe] Da cai trigger: tong hop 21h + cap nhat trang thai don ' + KK_STATUS_EVERY_MIN + ' phut/lan.');
}

// ================================================================
// CAP NHAT TRANG THAI DON (GHN common-info) -> loai don da giao / da hoan khoi danh sach can kiem
// Dung lai ham goi API cua COD_check.gs (cung project): codReadConfig_, codHeaders_, codFetchBatch_
// ================================================================
function KKCapNhatTrangThai() {
  const r = kkRefreshStatus_(function () { return true; }, 0, false, false);
  console.log('[KiemKe] Cap nhat trang thai ' + r.checked + ' don: loai ' + r.closed + ' don (da giao/hoan/roi buu cuc)' +
    (r.fail ? ', ' + r.fail + ' don chua tra duoc' : '') + '.');
  return r.closed;
}

// Tu app: tra GHN ngay cac don trong pham vi cua nguoi dung (bo qua don vua tra trong KK_STATUS_FRESH_SEC giay)
function kkRefreshMine_(me, b) {
  const sc = kkScope_(me);
  const one = String((b && b.order) || '').trim().toUpperCase(); // mo popup 1 don -> tra GHN ngay don do
  const r = kkRefreshStatus_(function (row) { return kkInScope_(sc, row[L['Bưu cục']], row[L['Mã NV giao']]) && (!one || String(row[L['Mã đơn']]) === one); },
    one ? 3 : KK_STATUS_MAX_PER_CALL, !one, !!one);
  // 1 don (popup): chi tra ve dung don do -> nhanh, khong tai lai ca danh sach
  if (one) return { ok: true, refresh: { checked: r.checked, closed: r.closed, fail: r.fail, remain: 0, at: r.at }, order: r.rows[0] || null };
  const out = kkList_(me);
  delete r.rows;
  out.refresh = r;
  return out;
}

// Tra trang thai GHN (common-info) cho cac don hom nay thoa pick(row), ghi vao KK_DanhSach.
// limit: so don toi da (0 = khong gioi han); skipFresh: bo qua don vua tra gan day
function kkRefreshStatus_(pick, limit, skipFresh, forceHistory) {
  if (typeof codFetchBatch_ !== 'function' || typeof codReadConfig_ !== 'function') {
    throw new Error('Cần file COD_check.gs trong cùng project để tra trạng thái đơn');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = codReadConfig_(ss);
  const day = kkToday_(), dn = kkDayNum_(day);
  const cache = CacheService.getScriptCache();
  let todo = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, dn, dn).filter(function (r) { return !r[L['Loại khỏi DS']] && pick(r); });
  if (skipFresh && todo.length) {
    const keys = todo.map(function (r) { return 'kko_' + r[L['Bưu cục']] + '_' + r[L['Mã đơn']]; });
    const hit = {};
    for (let i = 0; i < keys.length; i += 500) Object.assign(hit, cache.getAll(keys.slice(i, i + 500)));
    todo = todo.filter(function (r, i) { return !hit[keys[i]]; });
  }
  // Uu tien don COD cao
  todo.sort(function (a, b) { return (Number(b[L['COD']]) || 0) - (Number(a[L['COD']]) || 0); });
  const remain = limit && todo.length > limit ? todo.length - limit : 0;
  if (limit) todo = todo.slice(0, limit);
  if (!todo.length) return { checked: 0, closed: 0, fail: 0, remain: 0, rows: [], at: PropertiesService.getScriptProperties().getProperty('KK_STATUS_AT') || '' };
  if (typeof COD_CONC_ !== 'undefined' && skipFresh) COD_CONC_ = Math.max(COD_CONC_ || 0, 12); // nguoi dung dang cho -> chay nhanh hon
  const doneSt = (typeof COD_CFG !== 'undefined' && COD_CFG.FINAL_STATUSES) || KK_DONE_STATUSES;
  const atHub = (typeof COD_CFG !== 'undefined' && COD_CFG.AT_HUB_STATUSES) || ['delivering', 'delivery_fail', 'waiting_to_return', 'money_collect_delivering', 'storing'];
  const res = codFetchBatch_(todo.map(function (r) {
    return { label: 'common-info ' + r[L['Mã đơn']], apiUrl: COD_CFG.URL_COMMON_INFO,
      headers: codHeaders_(cfg, String(r[L['Bưu cục']])), payload: { order_code: String(r[L['Mã đơn']]) } };
  }));
  const upd = {}; // hub|order -> [trang thai VN, loai]
  let fail = 0;
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
  todo.forEach(function (r, i) {
    const d = res[i].json && res[i].json.data;
    if (res[i].error || !d) { fail++; return; }
    const st = String(d.partnerStatus || '').toLowerCase();
    const vn = kkStatusVN_(st);
    const hub = String(r[L['Bưu cục']]).trim();
    const cur = String(d.currentId || '').trim(), deliver = String(d.deliverId || '').trim();
    let why = '';
    if (doneSt.indexOf(st) >= 0) why = vn + ' lúc ' + now;
    // Kho hien tai khac buu cuc: chi giu khi trang thai o buu cuc giao VA kho giao van la buu cuc nay (GHN cap nhat kho cham)
    else if (cur && cur !== hub && !(atHub.indexOf(st) >= 0 && deliver === hub)) {
      why = 'Đã rời bưu cục - kho hiện tại ' + cur + (deliver && deliver !== hub ? ', kho giao ' + deliver : '') + ' (' + now + ')';
    }
    upd[hub + '|' + String(r[L['Mã đơn']])] = [vn, why, null, null, st + '|' + (d.partnerAction || '') + '|' + (d.status || '') + '|' + cur];
  });
  // Lich su don (get-order-history): so lan giao + ly do giao that bai MOI NHAT cho don con can kiem
  // Chi hoi lich su khi don co thay doi so voi lan tra truoc (chu ky trang thai / thao tac cuoi) -> giam ~1 nua so lan goi GHN
  const sigKey = function (r) { return 'kksig_' + String(r[L['Bưu cục']]).trim() + '_' + String(r[L['Mã đơn']]); };
  const cand = todo.filter(function (r) { const u = upd[String(r[L['Bưu cục']]).trim() + '|' + String(r[L['Mã đơn']])]; return u && !u[1]; });
  const prevSig = cand.length ? cache.getAll(cand.map(sigKey)) : {};
  const live = cand.filter(function (r) {
    const u = upd[String(r[L['Bưu cục']]).trim() + '|' + String(r[L['Mã đơn']])];
    return forceHistory || prevSig[sigKey(r)] !== u[4] || !String(r[L['Lý do giao thất bại']] || '') && Number(r[L['Số lần giao']]) > 0;
  });
  const newSig = {};
  if (live.length && typeof codDeliveryAttempts_ === 'function' && COD_CFG.URL_HISTORY) {
    const hr = codFetchBatch_(live.map(function (r) {
      return { label: 'get-order-history ' + r[L['Mã đơn']], apiUrl: COD_CFG.URL_HISTORY,
        headers: codHeaders_(cfg, String(r[L['Bưu cục']])), payload: { orderCode: String(r[L['Mã đơn']]), paging: { offset: 0, limit: 1000 } } };
    }));
    live.forEach(function (r, i) {
      if (hr[i].error || !hr[i].json) return;
      const ev = ((hr[i].json.data || {}).data || []);
      if (!ev.length) return;
      const a = codDeliveryAttempts_(ev);
      const u = upd[String(r[L['Bưu cục']]).trim() + '|' + String(r[L['Mã đơn']])];
      u[2] = a.count; u[3] = a.fails;
      newSig[sigKey(r)] = u[4];
    });
  }
  cand.forEach(function (r) { if (live.indexOf(r) < 0) newSig[sigKey(r)] = upd[String(r[L['Bưu cục']]).trim() + '|' + String(r[L['Mã đơn']])][4]; });
  if (Object.keys(newSig).length) cache.putAll(newSig, 21600);
  // Ghi lai (doc lai vi tri dong trong khoa, vi danh sach co the vua duoc chot lai)
  let closed = 0;
  const rows = [];
  const lock = kkLock_();
  lock.waitLock(30000);
  try {
    const sh = kkSheet_(KK_SH_LIST, KK_LIST_HEADERS);
    kkEnsureHeaders_(sh, KK_LIST_HEADERS);
    const last = sh.getLastRow();
    let first = 0;
    if (last > 1) {
      const days = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (let i = days.length - 1; i >= 0 && days[i][0] === day; i--) first = i + 2;
    }
    if (first) {
      const n = last - first + 1;
      const v = sh.getRange(first, 1, n, KK_LIST_HEADERS.length).getValues();
      const stCol = v.map(function (r) { return [r[L['Trạng thái']]]; });
      const doneCol = v.map(function (r) { return [r[L['Loại khỏi DS']]]; });
      const attCol = v.map(function (r) { return [r[L['Số lần giao']]]; });
      const failCol = v.map(function (r) { return [r[L['Lý do giao thất bại']]]; });
      const touched = [];
      v.forEach(function (r, i) {
        const u = upd[String(r[L['Bưu cục']]) + '|' + String(r[L['Mã đơn']])];
        if (!u || r[L['Loại khỏi DS']]) return;
        stCol[i][0] = u[0];
        if (u[1]) { doneCol[i][0] = u[1]; closed++; }
        if (u[2] !== null) { attCol[i][0] = u[2]; failCol[i][0] = String(u[3] || '').slice(0, 2000); }
        touched.push(i);
        rows.push({ order: String(r[L['Mã đơn']]), hub: String(r[L['Bưu cục']]), status: stCol[i][0], closed: doneCol[i][0] || '',
          attempts: attCol[i][0], fails: String(failCol[i][0] || '') });
      });
      const cols = [['Trạng thái', stCol], ['Loại khỏi DS', doneCol], ['Số lần giao', attCol], ['Lý do giao thất bại', failCol]];
      if (touched.length <= 5) {
        // It don (popup / quet): chi ghi dung dong do
        touched.forEach(function (i) { cols.forEach(function (c) { sh.getRange(first + i, L[c[0]] + 1).setValue(c[1][i][0]); }); });
      } else cols.forEach(function (c) { sh.getRange(first, L[c[0]] + 1, n, 1).setValues(c[1]); });
    }
  } finally { lock.releaseLock(); }
  PropertiesService.getScriptProperties().setProperty('KK_STATUS_AT', now + ' ' + day);
  const fresh = {};
  todo.forEach(function (r, i) { if (!res[i].error) fresh['kko_' + r[L['Bưu cục']] + '_' + r[L['Mã đơn']]] = '1'; });
  if (Object.keys(fresh).length) cache.putAll(fresh, KK_STATUS_FRESH_SEC);
  return { checked: todo.length, closed: closed, fail: fail, remain: remain, rows: rows, at: now + ' ' + day };
}

function kkStatusVN_(st) {
  const extra = { storing: 'Lưu kho', ready_to_pick: 'Chờ lấy hàng', picking: 'Đang lấy hàng', picked: 'Đã lấy hàng',
    transporting: 'Đang luân chuyển', sorting: 'Đang phân loại', cancel: 'Đã huỷ' };
  if (typeof COD_STATUS_VN !== 'undefined' && COD_STATUS_VN[st]) return COD_STATUS_VN[st];
  return extra[st] || (typeof codStatusVN_ === 'function' ? codStatusVN_(st) : st);
}

// Them tieu de cot moi (vd "Loai khoi DS") vao sheet da tao tu ban cu
function kkEnsureHeaders_(sh, headers) {
  const cur = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  headers.forEach(function (h, i) {
    if (cur[i] !== h) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#F26522').setFontColor('#FFFFFF');
  });
}

// ================================================================
// TRAM CHUYEN TIEP (cho nhan vien khong co tai khoan Google cong ty)
// ================================================================
// Link /exec cua cong ty chi mo cho tai khoan trong to chuc. Tram tren Gmail ca nhan nhan yeu cau tu app
// va chuyen vao day kem "khoa truy cap" tam thoi (het han sau ~1 gio) cua chu script.
// Ham nay gui khoa moi sang tram; trigger chay 30 phut/lan de khoa luon con han. Du lieu van nam o tai khoan cong ty.
function KKGuiKhoaRelay() {
  if (!KK_RELAY_URL) throw new Error('Chưa dán link trạm chuyển tiếp vào KK_RELAY_URL (đầu file KiemKe)');
  DriveApp.getRootFolder(); // giu quyen Drive trong khoa (bat buoc de goi duoc Web App)
  const r = UrlFetchApp.fetch(KK_RELAY_URL, { method: 'post', contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({ action: '__token', token: ScriptApp.getOAuthToken() }), muteHttpExceptions: true });
  const t = r.getContentText();
  let j = {};
  try { j = JSON.parse(t); } catch (x) {}
  if (!j.ok) throw new Error('Trạm chuyển tiếp không nhận khoá: ' + (j.error || ('HTTP ' + r.getResponseCode() + ' ' + t.slice(0, 200))));
  console.log('[KiemKe] Tram chuyen tiep da nhan khoa moi.');
}
function KKCaiRelay() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'KKGuiKhoaRelay') ScriptApp.deleteTrigger(t);
  });
  KKGuiKhoaRelay();
  ScriptApp.newTrigger('KKGuiKhoaRelay').timeBased().everyMinutes(30).create();
  console.log('[KiemKe] Da cai trigger gui khoa 30 phut/lan. Nhan vien dung link GitHub cua app.');
}

// ================================================================
// TIEN ICH
// ================================================================
// Khoa RIENG cua app kiem ke (khoa tai lieu), khong tranh khoa voi CODScan (khoa script)
function kkLock_() { return LockService.getDocumentLock() || LockService.getScriptLock(); }

function kkSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#F26522').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function kkSplit_(s) {
  return (Array.isArray(s) ? s : String(s || '').split(/[,;\s]+/)).map(function (x) { return String(x).trim(); }).filter(Boolean);
}
function kkStripB64_(s) { return String(s).replace(/^data:image\/\w+;base64,/, ''); }
function kkToday_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'); }
function kkShiftDay_(n) { return Utilities.formatDate(new Date(Date.now() + n * 86400000), Session.getScriptTimeZone(), 'dd/MM/yyyy'); }
function kkTime_(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM HH:mm:ss') : String(d || '');
}
// 'dd/MM/yyyy' | 'yyyy-MM-dd' | Date -> 'dd/MM/yyyy'
function kkDayStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : s;
}
function kkDayNum_(v) {
  const m = kkDayStr_(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}
function kkNumToDay_(n) { const s = String(n); return s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4); }
function kkJson_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
