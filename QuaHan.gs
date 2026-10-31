/**
 * ================================================================
 * MODULE: DON QUA HAN  (dat cung project voi KiemKe.gs + COD_check.gs)
 * ----------------------------------------------------------------
 * Nguon: sheet "Quahan" (Ma buu cuc | Ma don hang | Khach hang | Nhom don | Backlog | Cap nhat) - tim cot theo tieu de
 * Chi tiet don: tra cuu noi bo GHN (tracking-logs, token o sheet Token!A1) -> luu sheet QH_ChiTiet
 *   (chua co token thi dung du phong: common-info + lich su + get-delivery-info cua nhanh.ghn.vn)
 *   trang thai, kho hien tai, kho giao, gia tri hang, so lan giao, ly do giao that bai, NV giao gan nhat, thao tac cuoi
 * Xu ly: NV buu cuc / AM chon tinh trang xu ly -> ghi sheet QH_XuLy (moi lan 1 dong, giu lich su)
 * Quyen: theo bang KK_PhanQuyen (module "quahan"); pham vi buu cuc giong module Kiem ke
 * ================================================================
 */
const QH_SRC = 'Quahan';
const QH_SH_DETAIL = 'QH_ChiTiet';
const QH_SH_LOG = 'QH_XuLy';
const QH_DETAIL_HEADERS = ['Mã đơn', 'Mã bưu cục', 'Trạng thái', 'Kho hiện tại', 'Kho giao', 'Giá trị hàng', 'Số lần giao',
  'Lý do giao thất bại', 'NV giao gần nhất', 'Thao tác cuối', 'Cập nhật GHN lúc', 'Mã NV giao', 'SĐT NV giao', 'Mã chuyến',
  'COD', 'Phường/Xã giao', 'Địa chỉ giao', 'Xuất giao lần cuối lúc'];
// NV giao that cua don (ma NV, ten, SDT, ma chuyen) - chuan hon doan tu lich su
const QH_URL_DELIVERY = 'https://nhanh-api.ghn.vn/api/lastmile/delivery/get-delivery-info';
const QH_LOG_HEADERS = ['Thời gian', 'Mã bưu cục', 'Mã đơn', 'Tình trạng xử lý', 'Hẹn ngày', 'Ghi chú', 'Mã người cập nhật',
  'Tên người cập nhật', 'Vai trò'];
// Tinh trang xu ly NVXL chon (need: 'date' = bat buoc chon ngay hen, 'note' = bat buoc ghi chu)
const QH_STATUSES = [
  { code: 'GAN_LAI', name: 'Đã gán lại cho NV giao', tone: 'go' },
  { code: 'DANG_GIAO', name: 'Đang giao lại hôm nay', tone: 'go' },
  { code: 'DA_GIAO', name: 'Đã giao thành công', tone: 'ok' },
  { code: 'HEN_NGAY', name: 'Khách hẹn ngày giao', tone: 'wait', need: 'date' },
  { code: 'KHONG_LIEN_LAC', name: 'Không liên lạc được khách', tone: 'bad' },
  { code: 'SAI_DIA_CHI', name: 'Sai / thiếu địa chỉ - chờ xác nhận', tone: 'bad' },
  { code: 'KHACH_TU_CHOI', name: 'Khách từ chối nhận - chờ chuyển hoàn', tone: 'bad' },
  { code: 'CHO_SHOP', name: 'Chờ shop / khách xử lý', tone: 'wait' },
  { code: 'DA_DUYET_HOAN', name: 'Đã duyệt hoàn / đang trả hàng', tone: 'ok' },
  { code: 'HU_HONG', name: 'Hàng hư hỏng / thất lạc - đã báo cáo', tone: 'bad', need: 'note' },
  { code: 'KHAC', name: 'Khác', tone: 'wait', need: 'note' }
];
const QH_FRESH_SEC = 300;      // don vua tra GHN trong 5 phut -> khong tra lai (trigger chay 5 phut/lan)
const QH_MAX_PER_CALL = 300;   // so don toi da tra trong 1 lan goi tu app
const QH_CONC = 30;            // so request goi song song toi GHN (gap 429 se tu giam va thu lai)
const QH_TRIGGER_MIN = 5;      // trigger tu cap nhat: 1 / 5 / 10 / 15 / 30 phut

function qhHandle_(me, a, b) {
  if (a === 'qhList') { kkNeed_(me, 'quahan', 'view'); return qhList_(me); }
  if (a === 'qhRefresh') { kkNeed_(me, 'quahan', 'view'); return qhRefresh_(me, b); }
  if (a === 'qhSave') { kkNeed_(me, 'quahan', 'edit'); return qhSave_(me, b); }
  return { ok: false, error: 'Thao tác không hợp lệ' };
}

function QHSetup() {
  kkEnsureHeaders_(kkSheet_(QH_SH_DETAIL, QH_DETAIL_HEADERS), QH_DETAIL_HEADERS);
  kkEnsureHeaders_(kkSheet_(QH_SH_LOG, QH_LOG_HEADERS), QH_LOG_HEADERS);
  QHCaiTrigger();
  console.log('[QuaHan] Da tao sheet ' + QH_SH_DETAIL + ', ' + QH_SH_LOG);
}

// Doc sheet Quahan (tim cot theo tieu de, khong co dinh vi tri)
function qhSource_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QH_SRC);
  if (!sh || sh.getLastRow() < 2) return { rows: [], at: '' };
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const col = function (names) { for (let i = 0; i < names.length; i++) { const k = head.indexOf(names[i]); if (k >= 0) return k; } return -1; };
  const c = { hub: col(['mã bưu cục', 'bưu cục']), order: col(['mã đơn hàng', 'mã đơn']), cust: col(['khách hàng']),
    group: col(['nhóm đơn']), backlog: col(['backlog']), at: col(['cập nhật']) };
  if (c.order < 0 || c.hub < 0) throw new Error('Sheet Quahan thiếu cột "Mã bưu cục" / "Mã đơn hàng"');
  const g = function (r, k) { return c[k] >= 0 ? String(r[c[k]]).trim() : ''; };
  const seen = {}, rows = [];
  let at = '';
  v.slice(1).forEach(function (r) {
    const order = g(r, 'order').toUpperCase(), hub = g(r, 'hub');
    if (!order || seen[hub + '|' + order]) return;
    seen[hub + '|' + order] = true;
    if (g(r, 'at') > at) at = g(r, 'at');
    rows.push({ hub: hub, order: order, customer: g(r, 'cust'), group: g(r, 'group'), backlog: g(r, 'backlog'), srcAt: g(r, 'at') });
  });
  return { rows: rows, at: at };
}

function qhDetailMap_() {
  const sh = kkSheet_(QH_SH_DETAIL, QH_DETAIL_HEADERS), out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, QH_DETAIL_HEADERS.length).getValues().forEach(function (r, i) {
    out[String(r[0]).trim()] = { row: i + 2, status: r[2], cur: String(r[3]), deliver: String(r[4]), value: Number(r[5]) || 0,
      attempts: r[6], fails: String(r[7] || ''), driver: String(r[8] || ''), last: String(r[9] || ''), at: kkTime_(r[10]),
      driverId: String(r[11] || '').trim(), driverPhone: String(r[12] || ''), trip: String(r[13] || ''),
      cod: r[14] === '' ? '' : Number(r[14]) || 0, ward: String(r[15] || ''), address: String(r[16] || ''), driverAt: String(r[17] || '') };
  });
  return out;
}

// Tinh trang xu ly moi nhat + lich su (doc toi da 5000 dong cuoi)
function qhLogs_() {
  const sh = kkSheet_(QH_SH_LOG, QH_LOG_HEADERS), last = sh.getLastRow(), by = {};
  if (last < 2) return by;
  const start = Math.max(2, last - 4999);
  sh.getRange(start, 1, last - start + 1, QH_LOG_HEADERS.length).getValues().forEach(function (r) {
    const k = String(r[2]).trim();
    (by[k] = by[k] || []).push({ time: kkTime_(r[0]), status: String(r[3]), date: r[4] ? String(r[4]) : '', note: String(r[5] || ''),
      byMa: String(r[6]), by: String(r[7]), role: String(r[8]), day: Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'dd/MM/yyyy') });
  });
  return by;
}

// Pham vi: quan ly tat ca; NV buu cuc / AM theo buu cuc; NV giao = don co Ma NV giao (get-delivery-info) la minh
function qhInScope_(sc, o, det) {
  return sc.all || !!sc.hubs[o.hub] || (!!sc.driver && ((det[o.order] || {}).driverId === sc.driver));
}

function qhList_(me) {
  const sc = kkScope_(me), hubs = kkHubs_();
  const src = qhSource_(), det = qhDetailMap_(), logs = qhLogs_();
  const orders = src.rows.filter(function (o) { return qhInScope_(sc, o, det); }).map(function (o) {
    const d = det[o.order] || {}, lg = logs[o.order] || [];
    return Object.assign(o, { hubName: (hubs[o.hub] || {}).name || '', status: d.status || '', cur: d.cur || '', deliver: d.deliver || '',
      value: d.value || 0, attempts: d.attempts === undefined ? '' : d.attempts, fails: d.fails || '', driver: d.driver || '', last: d.last || '',
      driverId: d.driverId || '', driverPhone: d.driverPhone || '', trip: d.trip || '',
      cod: d.cod === undefined ? '' : d.cod, ward: d.ward || '', address: d.address || '', driverAt: d.driverAt || '',
      ghnAt: d.at || '', handle: lg.length ? lg[lg.length - 1] : null, logs: lg.slice(-10).reverse() });
  });
  return { ok: true, srcAt: src.at, orders: orders, statuses: QH_STATUSES, canEdit: kkMods_(me).quahan === 'edit',
    today: kkToday_(), statusAt: PropertiesService.getScriptProperties().getProperty('QH_STATUS_AT') || '', trig: qhTrigInfo_() };
}
function qhTrigInfo_() {
  let t = {}; try { t = JSON.parse(PropertiesService.getScriptProperties().getProperty('QH_TRIG') || '{}'); } catch (e) { t = {}; }
  t.on = ScriptApp.getProjectTriggers().some(function (x) { return x.getHandlerFunction() === 'QHCapNhat'; });
  t.min = QH_TRIGGER_MIN;
  return t;
}

// Tra GHN cho don qua han trong pham vi. b.order = 1 don (popup, tra ngay). Con lai: bo qua don vua tra trong 3 phut.
function qhRefresh_(me, b) {
  const sc = kkScope_(me), one = String(b.order || '').trim().toUpperCase();
  const det0 = qhDetailMap_();
  const info = qhRefreshCore_(function (o) { return qhInScope_(sc, o, det0) && (!one || o.order === one); }, one ? 1 : QH_MAX_PER_CALL, !!one);
  if (one) return { ok: true, order: info.recs[0] || null, logs: (qhLogs_()[one] || []).slice(-10).reverse(), refresh: info.info };
  return Object.assign(qhList_(me), { refresh: info.info });
}

// Trigger QH_TRIGGER_MIN phut/lan: tra GHN tat ca don qua han (de NV giao, bang tong hop luon co du lieu moi)
// Trigger luon tra lai TAT CA don (khong bo qua don vua tra) va ghi lai ket qua lan chay de app hien thi
function QHCapNhat() {
  const P = PropertiesService.getScriptProperties(), at = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm dd/MM/yyyy');
  try {
    const r = qhRefreshCore_(function () { return true; }, 0, false, true);
    P.setProperty('QH_TRIG', JSON.stringify({ at: at, n: r.info.checked, fail: r.info.fail }));
    console.log('[QuaHan] Tra GHN ' + r.info.checked + ' don' + (r.info.fail ? ', loi ' + r.info.fail : '') + '.');
  } catch (e) {
    P.setProperty('QH_TRIG', JSON.stringify({ at: at, err: String(e && e.message || e).slice(0, 200) }));
    throw e;
  }
}
function QHCaiTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'QHCapNhat') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('QHCapNhat').timeBased().everyMinutes(QH_TRIGGER_MIN).create();
  console.log('[QuaHan] Da cai trigger cap nhat don qua han ' + QH_TRIGGER_MIN + ' phut/lan.');
}

// pick(o): chon don; limit: so don toi da (0 = khong gioi han); one: popup 1 don (tra ngay, ke ca vua tra)
function qhRefreshCore_(pick, limit, one, force) {
  if (typeof codFetchBatch_ !== 'function' || typeof codReadConfig_ !== 'function') throw new Error('Cần file COD_check.gs trong cùng project để tra GHN');
  const cache = CacheService.getScriptCache();
  let todo = qhSource_().rows.filter(pick);
  if (!one && !force && todo.length) {
    const keys = todo.map(function (o) { return 'qho_' + o.order; }), hit = {};
    for (let i = 0; i < keys.length; i += 500) Object.assign(hit, cache.getAll(keys.slice(i, i + 500)));
    todo = todo.filter(function (o, i) { return !hit[keys[i]]; });
  }
  const remain = limit && todo.length > limit ? todo.length - limit : 0;
  if (limit) todo = todo.slice(0, limit);
  if (!todo.length) return { recs: [], info: { checked: 0, remain: 0, fail: 0 } };
  const tz = Session.getScriptTimeZone(), now = new Date();
  const tok = qhTrackToken_();
  const got = tok ? qhByTracking_(todo, tok) : qhByNhanh_(todo, one, cache);
  const recs = got.recs, newSig = got.newSig || {}, fresh = {};
  recs.forEach(function (r) { fresh['qho_' + r.order] = '1'; });
  // Ghi QH_ChiTiet: cap nhat dong cu, them dong moi
  const lock = kkLock_();
  lock.waitLock(30000);
  try {
    const sh = kkSheet_(QH_SH_DETAIL, QH_DETAIL_HEADERS), cur = qhDetailMap_(), add = [];
    kkEnsureHeaders_(sh, QH_DETAIL_HEADERS);
    recs.forEach(function (r) {
      const old = cur[r.order] || {};
      const row = [r.order, r.hub, r.status, r.cur, r.deliver, r.value, r.attempts, String(r.fails).slice(0, 2000), r.driver, String(r.last).slice(0, 300), now,
        r.driverId, r.driverPhone, r.trip, r.cod === undefined ? (old.cod === undefined ? '' : old.cod) : r.cod,
        r.ward === undefined ? (old.ward || '') : r.ward, String(r.address === undefined ? (old.address || '') : r.address).slice(0, 300),
        r.driverAt === undefined ? (old.driverAt || '') : r.driverAt];
      if (cur[r.order]) sh.getRange(cur[r.order].row, 1, 1, row.length).setValues([row]);
      else add.push(row);
    });
    if (add.length) {
      const at = sh.getLastRow() + 1;
      sh.getRange(at, 1, add.length, 2).setNumberFormat('@');
      sh.getRange(at, 12, add.length, 2).setNumberFormat('@');
      sh.getRange(at, 18, add.length, 1).setNumberFormat('@');
      sh.getRange(at, 1, add.length, QH_DETAIL_HEADERS.length).setValues(add);
    }
  } finally { lock.releaseLock(); }
  if (Object.keys(newSig).length) cache.putAll(newSig, 21600);
  if (Object.keys(fresh).length) cache.putAll(fresh, QH_FRESH_SEC);
  const at = Utilities.formatDate(now, tz, 'HH:mm dd/MM/yyyy');
  PropertiesService.getScriptProperties().setProperty('QH_STATUS_AT', at);
  return { recs: recs, info: { checked: todo.length, remain: remain, fail: todo.length - recs.length, at: at } };
}

// Du phong: API nhanh.ghn.vn (common-info + lich su + get-delivery-info) khi chua co token tra cuu noi bo
function qhByNhanh_(todo, one, cache) {
  const cfg = codReadConfig_(SpreadsheetApp.getActiveSpreadsheet());
  if (typeof COD_CONC_ !== 'undefined' && !one) COD_CONC_ = Math.max(COD_CONC_ || 0, 12);
  const ci = codFetchBatch_(todo.map(function (o) {
    return { label: 'common-info ' + o.order, apiUrl: COD_CFG.URL_COMMON_INFO, headers: codHeaders_(cfg, o.hub), payload: { order_code: o.order } };
  }));
  // Lich su: chi hoi khi don thay doi (chu ky trang thai) hoac khi mo popup 1 don
  const sig = {}, prev = cache.getAll(todo.map(function (o) { return 'qhsig_' + o.order; }));
  todo.forEach(function (o, i) {
    const d = ci[i].json && ci[i].json.data;
    if (d) sig[o.order] = ['v3', d.partnerStatus, d.partnerAction, d.status, d.currentId].join('|'); // v3: lay NV giao tu get-delivery-info
  });
  const det = qhDetailMap_();
  const needH = todo.filter(function (o) { return sig[o.order] && (one || prev['qhsig_' + o.order] !== sig[o.order] || !det[o.order] || !det[o.order].driverId); });
  // NV giao that: get-delivery-info (ma NV, ten, SDT, ma chuyen)
  const dr = needH.length ? codFetchBatch_(needH.map(function (o) {
    return { label: 'get-delivery-info ' + o.order, apiUrl: QH_URL_DELIVERY, headers: codHeaders_(cfg, o.hub), payload: { orderCode: o.order } };
  })) : [];
  const drv = {};
  needH.forEach(function (o, i) { const x = dr[i] && dr[i].json && dr[i].json.data; if (x && (x.driverId || x.driverName)) drv[o.order] = x; });
  const hr = needH.length ? codFetchBatch_(needH.map(function (o) {
    return { label: 'get-order-history ' + o.order, apiUrl: COD_CFG.URL_HISTORY, headers: codHeaders_(cfg, o.hub),
      payload: { orderCode: o.order, paging: { offset: 0, limit: 1000 } } };
  })) : [];
  const hist = {};
  needH.forEach(function (o, i) { if (!hr[i].error && hr[i].json) hist[o.order] = ((hr[i].json.data || {}).data || []); });

  const tz = Session.getScriptTimeZone(), now = new Date();
  const recs = [], newSig = {}, fresh = {};
  todo.forEach(function (o, i) {
    const d = ci[i].json && ci[i].json.data;
    if (!d) return;
    const old = det[o.order] || {};
    const rec = { order: o.order, hub: o.hub, status: kkStatusVN_(String(d.partnerStatus || '').toLowerCase()), cur: String(d.currentId || ''),
      deliver: String(d.deliverId || ''), value: Number(d.orderValue) || 0, attempts: old.attempts === undefined ? '' : old.attempts,
      fails: old.fails || '', driver: old.driver || '', last: old.last || '',
      driverId: old.driverId || '', driverPhone: old.driverPhone || '', trip: old.trip || '' };
    const x = drv[o.order];
    if (x) { rec.driverId = String(x.driverId || ''); rec.driver = String(x.driverName || ''); rec.driverPhone = String(x.driverPhone || ''); rec.trip = String(x.tripCode || '');
      if (x.startedAt) rec.driverAt = Utilities.formatDate(new Date(x.startedAt), Session.getScriptTimeZone(), 'dd/MM HH:mm'); }
    const ev = hist[o.order];
    if (ev && ev.length) {
      const a = typeof codDeliveryAttempts_ === 'function' ? codDeliveryAttempts_(ev) : { count: '', fails: '' };
      rec.attempts = a.count; rec.fails = a.fails;
      const sorted = ev.slice().sort(function (x, y) { return new Date(x.createdTime) - new Date(y.createdTime); });
      // NV giao = nguoi thuc hien LAN GIAO THAT (action DELIVER_FAIL / DELIVER_SUCCESS), giong cach dem so lan giao.
      // Khong lay thao tac cap nhat khac (doi kho giao, sua thong tin...) vi do co the la quan ly / NV xu ly.
      const act = function (e) { try { return String((JSON.parse(e.data || 'null') || {}).action || ''); } catch (x) { return ''; } };
      const dl = sorted.filter(function (e) { return e.historyType === 'UPDATE_ITEM' && /^DELIVER_(FAIL|SUCCESS)$/i.test(act(e)); }).pop();
      // Chi dung khi get-delivery-info khong tra duoc NV giao
      if (!x) rec.driver = dl ? String(dl.createdByName || '') : (rec.driverId ? rec.driver : '');
      const le = sorted[sorted.length - 1];
      rec.last = typeof codEventText_ === 'function' ? codEventText_(le) : String(le.historyType || '');
      newSig['qhsig_' + o.order] = sig[o.order];
    } else if (!needH.some(function (x) { return x.order === o.order; })) newSig['qhsig_' + o.order] = sig[o.order];
    rec.ghnAt = Utilities.formatDate(now, tz, 'dd/MM HH:mm');
    recs.push(rec);
    fresh['qho_' + o.order] = '1';
  });
  return { recs: recs, newSig: newSig };
}

// ================================================================
// NGUON CHINH: TRA CUU NOI BO (fe-online-gateway tracking-logs) - giong file tra cuu GHN dang dung
//   NV giao lan cuoi = nguoi thuc hien "xuat chuyen di giao" (START_DELIVERY_TRIP) cuoi cung
//   + COD, phuong/xa (ward-detail), dia chi, so lan giao, ly do giao that bai tung lan, buu cuc hien tai
// Token: sheet "Token" o A1 (header "token" cua tracuunoibo.ghn.vn)
// ================================================================
const QH_TRACK_URL = 'https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/tracking-logs';
const QH_WARD_URL = 'https://fe-online-gateway.ghn.vn/order-tracking/public-api/master-data/ward-detail';
const QH_TOKEN_SHEET = 'Token';

function qhTrackToken_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QH_TOKEN_SHEET);
  return sh ? String(sh.getRange('A1').getDisplayValue() || '').trim() : '';
}
function qhTrackHeaders_(tok) {
  return { 'accept': 'application/json', 'content-type': 'application/json', 'origin': 'https://tracuunoibo.ghn.vn',
    'referer': 'https://tracuunoibo.ghn.vn/', 'token': tok, 'user-agent': COD_CFG.USER_AGENT };
}
// Goi nhieu request qua proxy (fetchAll theo dot), tu cho lai khi bi 429. Tra ve [json | null]
function qhProxyAll_(reqs) {
  const out = new Array(reqs.length);
  let pending = reqs.map(function (_, i) { return i; }), wait = 3000;
  for (let attempt = 0; attempt < 4 && pending.length; attempt++) {
    const limited = [];
    const step = attempt ? Math.max(4, Math.floor(QH_CONC / (attempt * 2))) : QH_CONC;
    for (let k = 0; k < pending.length; k += step) {
      const chunk = pending.slice(k, k + step);
      let resps;
      try {
        resps = UrlFetchApp.fetchAll(chunk.map(function (i) {
          return { url: COD_CFG.PROXY_URL, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
            payload: JSON.stringify({ api_url: reqs[i].url, headers: reqs[i].headers, payload: reqs[i].payload }) };
        }));
      } catch (e) { chunk.forEach(function (i) { out[i] = null; }); continue; }
      resps.forEach(function (r, j) {
        const i = chunk[j];
        let js = null;
        try { js = JSON.parse(r.getContentText()); } catch (e) { /* bo qua */ }
        if (r.getResponseCode() === 429 || (js && Number(js.code) === 429)) { limited.push(i); return; }
        out[i] = js && (!js.code || Number(js.code) === 200) ? js : null;
      });
      if (limited.length) Utilities.sleep(300);
    }
    pending = limited;
    if (pending.length) { Utilities.sleep(wait); wait = Math.min(wait * 2, 20000); }
  }
  return out;
}
function qhLogDate_(l) { const d = new Date(l.action_at || l.created_at || l.time || l.created_date || 0); return isNaN(d.getTime()) ? new Date(0) : d; }

function qhByTracking_(todo, tok) {
  const H = qhTrackHeaders_(tok), tz = Session.getScriptTimeZone();
  const res = qhProxyAll_(todo.map(function (o) { return { url: QH_TRACK_URL, headers: H, payload: { order_code: o.order, source: 'inside_system' } }; }));
  // Ten phuong/xa theo ma (cache 6 gio)
  const cache = CacheService.getScriptCache(), wards = {};
  todo.forEach(function (o, i) { const oi = ((res[i] || {}).data || {}).order_info || {}; if (oi.to_ward_code) wards[String(oi.to_ward_code)] = ''; });
  const wcodes = Object.keys(wards), hit = wcodes.length ? cache.getAll(wcodes.map(function (w) { return 'qhw_' + w; })) : {};
  const miss = wcodes.filter(function (w) { return !hit['qhw_' + w]; });
  if (miss.length) {
    const wr = qhProxyAll_(miss.map(function (w) { return { url: QH_WARD_URL + '?ward_code=' + encodeURIComponent(w), headers: H, payload: { ward_code: w } }; }));
    const put = {};
    miss.forEach(function (w, i) { const n = wr[i] && wr[i].data && wr[i].data.ward_name; if (n) put['qhw_' + w] = String(n).trim(); });
    if (Object.keys(put).length) { cache.putAll(put, 21600); Object.assign(hit, put); }
  }
  const recs = [];
  todo.forEach(function (o, i) {
    const data = res[i] && res[i].data; if (!data) return;
    const oi = data.order_info || data.order || {};
    const logs = (data.tracking_logs || data.logs || []).slice().sort(function (a, b) { return qhLogDate_(a) - qhLogDate_(b); });
    const txt = function (l) { return [l.status_name, l.action_name, l.reason, l.note].filter(Boolean).join(' ').toLowerCase(); };
    const failed = logs.filter(function (l) { return String(l.action_code || '').toUpperCase() === 'DELIVER_FAILED' || txt(l).indexOf('giao hàng không thành công') >= 0; });
    const trips = logs.filter(function (l) {
      return (String(l.action_code || '').toUpperCase() === 'START_DELIVERY_TRIP' || String(l.status_name || '').toLowerCase().indexOf('đang giao hàng') >= 0) &&
        l.executor && l.executor.employee_id;
    });
    const lastTrip = trips[trips.length - 1];
    // Gio xuat giao gan nhat: lay ca log chuyen giao khong co nguoi thuc hien (de phan loai Da gan cho dung)
    const tripsAll = logs.filter(function (l) { return String(l.action_code || '').toUpperCase() === 'START_DELIVERY_TRIP' || String(l.status_name || '').toLowerCase().indexOf('đang giao hàng') >= 0; });
    const lastTripAt = tripsAll.length ? tripsAll[tripsAll.length - 1] : lastTrip;
    const drvId = lastTrip ? String(lastTrip.executor.employee_id).trim() : '';
    const ns = drvId ? kkNhansu_(drvId) : null;
    const fails = failed.map(function (l, k) {
      let d = String(l.reason || l.note || '').replace(/Lý do:\s*Lý do:/gi, 'Lý do:').trim();
      return 'Lần ' + (k + 1) + ' (' + Utilities.formatDate(qhLogDate_(l), tz, 'dd/MM HH:mm') + '): ' + (d || l.status_name || 'Giao hàng không thành công');
    }).join('\n');
    let cur = '';
    for (let k = logs.length - 1; k >= 0 && !cur; k--) { const w = logs[k].location && logs[k].location.warehouse_id; if (w) cur = String(w); }
    if (!cur && oi.current_warehouse_id) cur = String(oi.current_warehouse_id);
    const addrOk = function (a) { return a && !/\*\*\*|^x+$/i.test(String(a).trim()); };
    let addr = addrOk(oi.to_address) ? String(oi.to_address).trim() : '';
    for (let k = logs.length - 1; k >= 0 && !addr; k--) {
      const a = String((logs[k].location || {}).address || '');
      if (a.indexOf('giao đến') >= 0 && addrOk(a)) addr = a.replace(/Đơn hàng đang giao đến\s*/gi, '').trim();
    }
    const le = logs[logs.length - 1] || {};
    recs.push({ order: o.order, hub: o.hub, status: String(oi.status_name || le.status_name || '').trim(), cur: cur, deliver: String(oi.deliver_warehouse_id || ''),
      value: Number(oi.order_value) || 0, cod: oi.cod_amount === undefined || oi.cod_amount === null ? '' : Number(oi.cod_amount) || 0,
      attempts: failed.length, fails: fails,
      driver: drvId ? ((ns && ns.ten) || ('NV ' + drvId)) : '', driverId: drvId, driverPhone: '',
      driverAt: lastTripAt ? Utilities.formatDate(qhLogDate_(lastTripAt), tz, 'dd/MM HH:mm') : '',
      trip: '', ward: hit['qhw_' + oi.to_ward_code] || '', address: addr,
      last: le.status_name ? String(le.status_name) + ' | ' + Utilities.formatDate(qhLogDate_(le), tz, 'dd/MM HH:mm') : '',
      ghnAt: Utilities.formatDate(new Date(), tz, 'dd/MM HH:mm') });
  });
  return { recs: recs };
}

// NV buu cuc / AM cap nhat tinh trang xu ly
function qhSave_(me, b) {
  const order = String(b.order || '').trim().toUpperCase();
  const st = QH_STATUSES.filter(function (x) { return x.code === b.status; })[0];
  if (!st) throw new Error('Chọn tình trạng xử lý');
  const note = String(b.note || '').trim().slice(0, 500), date = String(b.date || '').trim();
  if (st.need === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Chọn ngày khách hẹn giao');
  if (st.need === 'note' && !note) throw new Error('Ghi chú bắt buộc với tình trạng "' + st.name + '"');
  const src = qhSource_().rows.filter(function (o) { return o.order === order; })[0];
  if (!src) throw new Error('Đơn ' + order + ' không còn trong danh sách quá hạn');
  const sc = kkScope_(me);
  if (!qhInScope_(sc, src, qhDetailMap_())) throw new Error('Đơn thuộc bưu cục ' + src.hub + ', ngoài phạm vi của bạn');
  const dateVN = date ? date.split('-').reverse().join('/') : '';
  const lock = kkLock_();
  lock.waitLock(20000);
  try {
    const sh = kkSheet_(QH_SH_LOG, QH_LOG_HEADERS), at = sh.getLastRow() + 1;
    sh.getRange(at, 2, 1, 4).setNumberFormat('@');
    sh.getRange(at, 7, 1, 1).setNumberFormat('@');
    sh.getRange(at, 1, 1, QH_LOG_HEADERS.length).setValues([[new Date(), src.hub, order, st.name, dateVN, note, me.ma, me.ten, KK_ROLE_VN[me.role] || me.role]]);
  } finally { lock.releaseLock(); }
  const logs = (qhLogs_()[order] || []);
  return { ok: true, order: order, handle: logs[logs.length - 1], logs: logs.slice(-10).reverse() };
}
