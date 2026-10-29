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
 *   1. Chay ham KKSetup() -> tao sheet + tai khoan QUAN_LY dau tien (ma KK_ADMIN.ma, PIN = Main!A3)
 *   2. Deploy > New deployment > Web app | Execute as: Me | Who has access: Anyone
 *   3. Copy URL .../exec -> dan vao file config.js cua web app
 *   Sua code: Deploy > Manage deployments > Edit > Version: New version (URL giu nguyen)
 * ================================================================
 */

// ---- Ten sheet nguon (trung voi COD_check.gs) ----
const KK_SRC_DATA = 'Data';
const KK_SRC_CAUHINH = 'Cauhinh';
const KK_SRC_MAIN = 'Main';
// Danh sach nhan su (IMPORTRANGE) - dung de: tu dang ky PIN, chan nguoi nghi viec, lay ho ten
const KK_SRC_NHANSU = 'Nhansu';
const KK_NHANSU_ACTIVE = 'Đang làm việc';   // gia tri cot "Trạng thái" cua nguoi dang lam

const KK_SH_USERS = 'KK_NguoiDung';
const KK_SH_LIST = 'KK_DanhSach';
const KK_SH_RESULT = 'KK_KetQua';
const KK_SH_REPORT = 'KK_BaoCao';
const KK_PHOTO_ROOT = 'KiemKe_AnhDonHang';

// Tai khoan QUAN_LY tao khi chay KKSetup (PIN ban dau = Main!A3, doi ngay trong app)
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

const KK_USER_HEADERS = ['Mã NV', 'Họ tên', 'Vai trò', 'Bưu cục', 'PIN (mã hoá)', 'Trạng thái', 'Cập nhật lúc', 'Cập nhật bởi'];
const KK_LIST_HEADERS = ['Ngày', 'Bưu cục', 'Mã đơn', 'COD', 'Mã NV giao', 'Tên NV giao', 'SĐT NV giao', 'Mã chuyến',
  'Trạng thái', 'Số lần giao', 'Tên hàng', 'Phường giao', 'Chốt lúc'];
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
    if (a === 'register') return kkRegister_(b);
    const me = kkAuth_(b.token);
    if (a === 'me') return { ok: true, user: kkPublicUser_(me) };
    if (a === 'list') return kkList_(me);
    if (a === 'scan') return kkScan_(me, b);
    if (a === 'report') return kkReport_(me, b);
    if (a === 'photo') return kkPhoto_(me, b);
    if (a === 'changePin') return kkChangePin_(me, b);
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
function kkLogin_(b) {
  const ma = String(b.ma || '').trim();
  const pin = String(b.pin || '').trim();
  if (!ma || !pin) throw new Error('Nhập mã NV và mã PIN');
  const cache = CacheService.getScriptCache();
  const failKey = 'kkfail_' + ma;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= KK_MAX_LOGIN_FAIL) throw new Error('Sai PIN quá ' + KK_MAX_LOGIN_FAIL + ' lần. Thử lại sau 15 phút.');
  const u = kkFindUser_(ma);
  kkCheckActive_(u, ma);
  if (!u.hash) { const e = new Error('Bạn chưa tạo mã PIN. Bấm "Lần đầu dùng app? Tạo mã PIN"'); e.needSetup = true; throw e; }
  if (u.hash !== kkHash_(ma, pin)) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Sai mã NV hoặc PIN');
  }
  cache.remove(failKey);
  return { ok: true, token: kkSign_({ u: u.ma, exp: Date.now() + KK_TOKEN_HOURS * 3600000 }), user: kkPublicUser_(u) };
}

function kkAuth_(token) {
  const p = kkVerify_(token);
  const u = p && kkFindUser_(p.u);
  if (!u || !u.hash) { const e = new Error('Phiên đăng nhập hết hạn, đăng nhập lại'); e.auth = true; throw e; }
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
      hubs: kkSplit_(r[U['Bưu cục']]), hash: r[U['PIN (mã hoá)']], status: String(r[U['Trạng thái']]).trim() || 'Hoạt động' };
  }).filter(function (u) { return u.ma; });
}
// Tai khoan hieu luc = dong trong KK_NguoiDung (neu co) + thong tin Nhansu + vai tro tu dong
function kkFindUser_(ma) {
  ma = String(ma || '').trim();
  if (!ma) return null;
  const row = kkReadUsers_().filter(function (u) { return u.ma === ma; })[0] || null;
  const ns = kkNhansu_(ma);
  if (!row && !ns) return null;
  const u = row ? Object.assign({}, row) : { row: 0, ma: ma, ten: '', role: '', hubs: [], hash: '', status: 'Hoạt động' };
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

// Nhan vien TU TAO PIN lan dau (hoac sau khi quan ly dat lai PIN): xac minh bang ngay vao lam trong Nhansu
function kkRegister_(b) {
  const ma = String(b.ma || '').trim(), pin = String(b.pin || '').trim();
  if (!/^\d{3,10}$/.test(ma)) throw new Error('Nhập mã nhân viên (chỉ gồm số)');
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN gồm 4-8 chữ số');
  const cache = CacheService.getScriptCache();
  const failKey = 'kkreg_' + ma;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= KK_MAX_LOGIN_FAIL) throw new Error('Nhập sai quá ' + KK_MAX_LOGIN_FAIL + ' lần. Thử lại sau 30 phút hoặc nhờ quản lý.');
  const u = kkFindUser_(ma);
  kkCheckActive_(u, ma);
  if (u.hash) throw new Error('Mã NV này đã có PIN. Quên PIN thì nhờ quản lý bấm "Đặt lại PIN".');
  if (!u.ns) throw new Error('Mã NV không có trong sheet Nhansu - nhờ quản lý tạo tài khoản');
  if (!u.ns.start || kkDayStr_(b.ngayVao) !== u.ns.start) {
    cache.put(failKey, String(fails + 1), 1800);
    throw new Error('Ngày vào làm không khớp hồ sơ nhân sự');
  }
  cache.remove(failKey);
  const lock = kkLock_();
  lock.waitLock(20000);
  try {
    const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
    const at = u.row || sh.getLastRow() + 1;
    const rec = [ma, u.ten, u.storedRole || KK_ROLE_AUTO, (u.hubs || []).join(', '), kkHash_(ma, pin), 'Hoạt động', new Date(), 'Tự đăng ký'];
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([rec]);
  } finally { lock.releaseLock(); }
  return kkLogin_({ ma: ma, pin: pin });
}
function kkPublicUser_(u) {
  const sc = kkScope_(u);
  return { ma: u.ma, ten: u.ten, role: u.role, roleVN: KK_ROLE_VN[u.role] || u.role,
    hubs: sc.all ? [] : Object.keys(sc.hubs), all: sc.all, canReport: u.role !== 'NV', canAdmin: u.role === 'QUAN_LY' };
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
  const src = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_DATA);
  if (!src || src.getLastRow() < 2) return 0;
  const v = src.getDataRange().getValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const c = function (name) { return head.indexOf(name); };
  const map = { hub: c('Bưu cục'), order: c('Mã đơn'), cod: c('COD'), dId: c('Mã NV giao'), dName: c('Tên NV giao'),
    dPhone: c('SĐT NV giao'), trip: c('Mã chuyến'), status: c('Trạng thái hiện tại'), att: c('Số lần giao'),
    goods: c('Tên hàng'), ward: c('Phường giao') };
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
    rows.push([day, hub, order, Number(g(r, 'cod')) || 0, String(g(r, 'dId')).trim(), g(r, 'dName'), String(g(r, 'dPhone')),
      g(r, 'trip'), g(r, 'status'), g(r, 'att'), String(g(r, 'goods')).slice(0, 200), g(r, 'ward'), now]);
  });
  if (firstToday) sh.deleteRows(firstToday, last - firstToday + 1);
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, 3).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, KK_LIST_HEADERS.length).setValues(rows);
  }
  console.log('[KiemKe] Chot danh sach ' + day + ': ' + rows.length + ' don');
  return rows.length;
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
  const orders = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, dn, dn)
    .filter(function (r) { return kkInScope_(sc, r[L['Bưu cục']], r[L['Mã NV giao']]); })
    .map(function (r) {
      return { hub: String(r[L['Bưu cục']]), hubName: (hubs[r[L['Bưu cục']]] || {}).name || '', order: String(r[L['Mã đơn']]),
        cod: Number(r[L['COD']]) || 0, driverId: String(r[L['Mã NV giao']]), driverName: r[L['Tên NV giao']],
        driverPhone: String(r[L['SĐT NV giao']]), trip: r[L['Mã chuyến']], status: r[L['Trạng thái']],
        attempts: r[L['Số lần giao']], goods: r[L['Tên hàng']], ward: r[L['Phường giao']] };
    });
  const inList = {};
  orders.forEach(function (o) { inList[o.order] = true; });
  const checked = {}, extra = [];
  kkReadDays_(KK_SH_RESULT, KK_RESULT_HEADERS, dn, dn).forEach(function (r) {
    const code = String(r[R['Mã đơn']]);
    if (r[R['Kết quả']] === KK_RES.OK && inList[code] && !checked[code]) {
      checked[code] = { time: kkTime_(r[R['Thời gian']]), by: r[R['Tên người kiểm']], thumb: r[R['File ảnh nhỏ']], photo: r[R['File ảnh']] };
    } else if (r[R['Kết quả']] === KK_RES.OUT && (sc.all || String(r[R['Mã người kiểm']]) === me.ma ||
               kkInScope_(sc, r[R['Bưu cục']], ''))) {
      extra.push({ order: code, time: kkTime_(r[R['Thời gian']]), by: r[R['Tên người kiểm']], thumb: r[R['File ảnh nhỏ']], photo: r[R['File ảnh']] });
    }
  });
  return { ok: true, day: day, user: kkPublicUser_(me), orders: orders, checked: checked, extra: extra };
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

  const lock = kkLock_();
  lock.waitLock(30000);
  try {
    kkSnapshot_(false);
    const sameCode = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, dn, dn).filter(function (r) { return String(r[L['Mã đơn']]) === code; });
    const row = sameCode.filter(function (r) { return kkInScope_(sc, r[L['Bưu cục']], r[L['Mã NV giao']]); })[0];
    // Don co trong danh sach chung nhung KHONG thuoc pham vi nguoi quet (vd don cua NV khac)
    const other = row ? null : sameCode[0] || null;

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
      note: other ? 'Đơn thuộc ' + (other[L['Tên NV giao']] || 'NV khác') + ' - BC ' + other[L['Bưu cục']] + ', không thuộc danh sách của bạn' : '' };
  } finally {
    lock.releaseLock();
  }
}

function kkDayFolder_(day) {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('KK_FOLDER_ID'), root = null;
  try { root = rootId ? DriveApp.getFolderById(rootId) : null; } catch (e) { root = null; }
  if (!root) { root = DriveApp.createFolder(KK_PHOTO_ROOT); props.setProperty('KK_FOLDER_ID', root.getId()); }
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

  const expected = kkReadDays_(KK_SH_LIST, KK_LIST_HEADERS, from, to).filter(function (r) { return okHub(r[L['Bưu cục']]); });
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
        hubs: u.hubs, status: u.status, hasPin: !!u.hash, chucvu: ns ? ns.chucvu : '', nsStatus: ns ? (ns.active ? 'Đang làm việc' : 'Đã nghỉ / ' + (ns.status || '')) : 'Không có trong Nhansu' };
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
  const pin = String(b.pin || '').trim();
  if (pin && !/^\d{4,8}$/.test(pin)) throw new Error('PIN gồm 4-8 chữ số');

  const lock = kkLock_();
  lock.waitLock(20000);
  try {
    const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
    const old = kkReadUsers_().filter(function (x) { return x.ma === ma; })[0] || null;
    const ns = kkNhansu_(ma);
    // Khong dat PIN: nguoi co trong Nhansu tu tao PIN; nguoi ngoai Nhansu thi bat buoc dat
    if (!old && !pin && !ns) throw new Error('Mã NV không có trong Nhansu nên phải đặt PIN');
    const hash = b.resetPin ? '' : pin ? kkHash_(ma, pin) : (old ? old.hash : '');
    const row = [ma, ten, role, hubs.join(', '), hash, status, new Date(), me.ten];
    const at = old ? old.row : sh.getLastRow() + 1; // old.row = dong that trong sheet
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([row]);
    return { ok: true, created: !old };
  } finally {
    lock.releaseLock();
  }
}

function kkChangePin_(me, b) {
  const oldPin = String(b.oldPin || ''), pin = String(b.pin || '').trim();
  if (me.hash !== kkHash_(me.ma, oldPin)) throw new Error('PIN cũ không đúng');
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN mới gồm 4-8 chữ số');
  kkSheet_(KK_SH_USERS, KK_USER_HEADERS).getRange(me.row, U['PIN (mã hoá)'] + 1).setValue(kkHash_(me.ma, pin));
  return { ok: true };
}

// ================================================================
// CAI DAT 1 LAN
// ================================================================
function KKSetup() {
  [[KK_SH_USERS, KK_USER_HEADERS], [KK_SH_LIST, KK_LIST_HEADERS], [KK_SH_RESULT, KK_RESULT_HEADERS], [KK_SH_REPORT, KK_REPORT_HEADERS]]
    .forEach(function (x) { kkSheet_(x[0], x[1]); });
  kkSecret_();
  if (!kkReadUsers_().some(function (u) { return u.ma === KK_ADMIN.ma && u.hash; })) {
    const pin = String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KK_SRC_MAIN).getRange('A3').getDisplayValue()).trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Đặt PIN ban đầu (4-8 chữ số) vào Main!A3 rồi chạy lại KKSetup');
    const sh = kkSheet_(KK_SH_USERS, KK_USER_HEADERS);
    const at = sh.getLastRow() + 1;
    sh.getRange(at, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, KK_USER_HEADERS.length).setValues([[KK_ADMIN.ma, KK_ADMIN.ten, 'QUAN_LY', '', kkHash_(KK_ADMIN.ma, pin), 'Hoạt động', new Date(), 'KKSetup']]);
    console.log('[KiemKe] Da tao tai khoan QUAN_LY ' + KK_ADMIN.ma + ' (PIN = Main!A3). Xoa PIN o Main!A3 sau khi dang nhap.');
  }
  kkSnapshot_(true);
  KKCaiTrigger();
  console.log('[KiemKe] Cai dat xong.');
}

// Trigger: tong hop bao cao 21h hang ngay
function KKCaiTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'KKTongHopNgay') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('KKTongHopNgay').timeBased().everyDays(1).atHour(21).inTimezone(Session.getScriptTimeZone()).create();
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
