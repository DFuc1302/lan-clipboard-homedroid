# Chuyền — LAN Clipboard + QR Transfer

Chuyển văn bản và tệp giữa laptop, điện thoại và tablet trong cùng mạng LAN. Dữ liệu đi qua điện thoại HomeDroid, không dùng dịch vụ đám mây.

## Tính năng

- Clipboard chung, tối đa 30 mục và 8.000 ký tự mỗi mục.
- Upload/download tệp tối đa 25 MB; kéo thả trên desktop.
- Ghép thiết bị bằng QR hoặc mã ngẫu nhiên 96-bit.
- API yêu cầu Bearer token; server chỉ lưu SHA-256 của mã ghép nối.
- Đổi mã để ngắt toàn bộ thiết bị cũ.
- Dữ liệu nằm ngoài Git checkout nên không bị xóa khi auto-deploy.

## Chạy thử

```bash
npm install
npm test
npm start
```

Mở `http://localhost:4175`. Thiết bị đầu tiên chọn **Khởi tạo an toàn**, sau đó dùng QR để ghép thiết bị khác.

## Deploy bằng HomeDroid

| Trường | Giá trị |
| --- | --- |
| Repository | URL HTTPS của repository này |
| Branch | `main` |
| Port | `4175` |
| Runtime | `Node.js` hoặc `Auto` |
| Build command | để trống |
| Start command | để trống (`npm start`) |

HomeDroid truyền `$PORT` và `$HOST` cho server. Dữ liệu mặc định được lưu cạnh checkout tại `/srv/<deployment>-data`.

## An toàn

Chỉ dùng trên Wi‑Fi tin cậy hoặc qua Tailscale. Không public cổng `4175` trực tiếp ra Internet. Người có mã ghép nối có thể đọc, gửi và xóa mọi nội dung trong không gian này.
