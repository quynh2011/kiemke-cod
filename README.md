# Kiểm kê COD — App quét đơn đối chiếu kho

Web app trên điện thoại để kiểm kê **đơn COD giá trị cao** (danh sách từ hệ thống `COD_check`):

- Chỉ quét bằng **camera**, không nhập tay. Một mã chỉ được nhận khi đọc **trùng 2 lần liên tiếp**.
- Mỗi lần quét **chụp ảnh gốc của tem đơn**, có in giờ và tên người kiểm lên ảnh. Ảnh lưu ở Google Drive.
- Kết quả ghi **ngay lập tức** vào Google Sheet. Khi mất mạng, lần quét được giữ trong hàng chờ trên máy và tự gửi lại.
- **Phân quyền**: nhân viên giao / nhân viên bưu cục / AM / quản lý.
- **Báo cáo** theo khoảng ngày: theo bưu cục, NV giao, người kiểm, AM, ngày. Xem ảnh nét, tải CSV.

## Chạy trên Vercel (khuyên dùng với tài khoản Google công ty)

Web App Apps Script của tài khoản @ghn.vn chỉ mở cho người trong công ty. `api/kk.js` trên Vercel chuyển tiếp yêu cầu
từ app vào Web App, kèm access token của tài khoản @ghn.vn (OAuth refresh token, scope `drive.readonly`).
Nhân viên chỉ cần link Vercel, đăng nhập bằng Mã NV + PIN, không cần tài khoản Google.

| Biến môi trường | Ý nghĩa |
|---|---|
| `KK_GAS_URL` | link `/exec` của Web App Apps Script |
| `GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client (Web application) trên Google Cloud |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | lấy 1 lần qua `/api/oauth-start` bằng tài khoản @ghn.vn |

OAuth client phải có Authorized redirect URI `https://<domain>/api/oauth-callback`. Đổi biến xong phải **Redeploy**.
Trên GitHub Pages (không có `/api`), app tự chạy chế độ demo.

## Tài khoản Google nội bộ – chạy thẳng từ link Apps Script (cách dự phòng)

Tài khoản công ty chỉ deploy được **"Bất kỳ ai trong tổ chức"**, nên trang GitHub Pages không gọi được backend.
Khi đó app chạy **thẳng từ link `/exec`** của Apps Script:

1. Trong project Apps Script, bấm **+** → **HTML**, đặt tên **`KiemKeApp`**, dán toàn bộ nội dung file `KiemKeApp.html`.
2. Deploy lại (Version: New version). Nhân viên mở link `/exec` bằng tài khoản Google công ty trên điện thoại.

`KiemKeApp.html` là bản gộp của `index.html` (thư viện quét lấy từ CDN). Sửa `index.html` thì tạo lại file này.

## Cấu trúc

| File | Đặt ở đâu |
|---|---|
| `KiemKe.gs` | Apps Script, **cùng project** với `COD_check.gs` |
| `index.html`, `config.js`, `html5-qrcode.min.js` | Repo này, chạy trên GitHub Pages hoặc Vercel |

## Chạy thử ngay (chế độ demo)

Khi `config.js` để trống `api`, app chạy **demo**: dữ liệu mẫu, không ghi Google Sheet.

| Vai trò | Mã NV | PIN |
|---|---|---|
| Quản lý | 3172684 | 123456 |
| NV bưu cục 22524000 | 2000001 | 1111 |
| NV giao | 3179060 | 1111 |
| AM | 4000001 | 1111 |

Mã đơn mẫu để quét (in mã vạch Code128 hoặc QR ra giấy / mở trên máy khác):
`GYMBDFP9`, `NVS871726729`, `GYMWX3B3`, `GYMPHUXG`, `GYM3D7K4`

## Cài thật (1 lần)

### 1. Backend Apps Script
1. Mở project Apps Script đang có `COD_check.gs`, thêm file `KiemKe`, dán nội dung `KiemKe.gs`.
2. Thay toàn bộ `COD_check.gs` bằng bản mới đi kèm. Bản này tự chốt lại danh sách kiểm sau mỗi lần `CODScan` chạy xong.
3. Sheet **Main!A3**: ghi **PIN ban đầu** (4-8 chữ số) cho tài khoản quản lý `3172684`.
4. Chạy hàm **`KKSetup`**. Hàm này:
   - tạo các sheet `KK_NguoiDung`, `KK_DanhSach`, `KK_KetQua`, `KK_BaoCao`;
   - tạo tài khoản quản lý;
   - chốt danh sách hôm nay;
   - đặt trigger tổng hợp lúc 21h.
5. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Copy URL `.../exec`.
6. Đăng nhập app bằng `3172684` + PIN ở A3, **đổi PIN** ở tab Tài khoản, rồi **xoá Main!A3**.

### 2. Nối web với backend
Sửa `config.js` trong repo:

```js
window.KK_CONFIG = { api: 'https://script.google.com/macros/s/XXXX/exec' };
```

Commit lên nhánh `main`. Trang tự cập nhật sau khoảng 1 phút.

Mỗi lần sửa `KiemKe.gs`: **Deploy → Manage deployments → Edit → Version: New version** (URL giữ nguyên).

## Tài khoản nhân viên (sheet Nhansu)

- Nhân viên **tự tạo PIN** ở màn đăng nhập ("Lần đầu dùng app? Tạo mã PIN"), xác minh bằng **Ngày vào làm**.
- Ai có Trạng thái khác "Đang làm việc" hoặc có Ngày nghỉ việc → **bị chặn đăng nhập ngay**, kể cả đang đăng nhập dở.
- Quyền tự động theo **Chức vụ**:

| Chức vụ | Vai trò | Thấy đơn |
|---|---|---|
| Business Development Field Executive | NV giao | Đơn của chính mình |
| Operations Executive | NV bưu cục | Đơn của bưu cục mình (cột Bưu cục) |
| Area Manager / Acting Area Manager | AM | Các bưu cục trong khu vực mình quản lý |

Quên PIN: quản lý vào tab Quản trị → chọn người → tick "Đặt lại PIN".

## Phân quyền (sheet KK_NguoiDung / tab Quản trị)

| Vai trò | Thấy đơn cần kiểm | Báo cáo + ảnh | Quản trị |
|---|---|---|---|
| Nhân viên giao (`NV`) | Đơn có **Mã NV giao = mã của mình** | – | – |
| Nhân viên bưu cục (`BUU_CUC`) | Đơn của **bưu cục được chọn** | Trong bưu cục | – |
| AM (`AM`) | Bưu cục của mình + bưu cục có NV ghi **AM = tên mình** (Nhansu) + **ID AM = mã mình** (Cauhinh) | Trong phạm vi | – |
| Quản lý (`QUAN_LY`) | Tất cả | Tất cả | Có |

Quét đơn **không thuộc phạm vi** thì app báo "Ngoài danh sách". Lần quét đó vẫn được ghi kèm ảnh, kèm bưu cục và NV giao thật của đơn, để quản lý đối chiếu.

## Dữ liệu lưu

- **KK_DanhSach**: danh sách cần kiểm **chốt theo từng ngày** (lịch sử), lấy từ sheet Data.
- **KK_KetQua**: mỗi lần quét 1 dòng gồm thời gian, bưu cục, mã đơn, kết quả (`Đúng danh sách` / `Ngoài danh sách` / `Quét lại`), COD, NV giao, người kiểm, link ảnh, số lần đọc khớp, thiết bị.
- **KK_BaoCao**: tổng hợp 21h hằng ngày theo bưu cục, NV giao, AM, người kiểm.
- Ảnh: Google Drive `KiemKe_AnhDonHang/<yyyy-MM-dd>/`, để riêng tư. Chỉ xem được qua app, đúng phạm vi.

## Đọc báo cáo để tìm sai sót

- **NV giao có nhiều đơn "Còn thiếu"**: hàng COD cao không có trong kho. Ưu tiên kiểm tra người này.
- **Người kiểm có nhiều "Ngoài DS"**: quét nhầm, hoặc đơn bị chuyển sai.
- **"Quét lại" nhiều**: kiểm trùng, tốn công.
- **Còn thiếu cuối ngày** = đơn chưa ai thấy trong kho → đối chiếu với NV giao (có SĐT trên thẻ đơn).

---
Thư viện: [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8 và [SheetJS xlsx](https://sheetjs.com) 0.18.5 (Apache-2.0), kèm trong repo.
