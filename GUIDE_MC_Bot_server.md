# Hướng dẫn sử dụng MC-Bot-server (Bản truyền thống)

`MC-Bot-server.js` là phiên bản bot Minecraft sử dụng các lệnh chat trực tiếp (không thông qua AI). Bot này phù hợp cho các tác vụ treo máy (AFK) ổn định và lặp đi lặp lại.

## 1. Cấu hình (Trước khi chạy)

Mở file `MC-Bot-server.js` và chỉnh sửa các dòng đầu :

- **BOT_USERNAME**: Tên bot hiển thị trong game.
- **BOT_PASSWORD**: Mật khẩu để tự động login/register trên server.
- **host / port**: Địa chỉ và cổng của server Minecraft.

## 2. Cách Chạy Bot

Yêu cầu máy đã cài đặt Node.js.
```bash
node MC-Bot-server.js
```

## 3. Danh sách lệnh chat (Điều khiển bot)

Bạn có thể nhắn tin trực tiếp cho bot hoặc chat công khai để ra lệnh.

### Di chuyển & Hành động cơ bản
- `follow [tên_người_chơi]`: Bot sẽ đi theo bạn.
- `stop`: Dừng mọi hành động hiện tại.
- `goto [x] [y] [z]`: Di chuyển đến tọa độ cụ thể.
- `sleep`: Tìm giường gần đó và đi ngủ.
- `wake`: Thức dậy.

### Chiến đấu & Bảo vệ
- `attack [tên_quái_vật/người_chơi]`: Săn đuổi mục tiêu cụ thể. (Bot sẽ tự dùng cung hoặc đinh ba ném nếu ở xa).
- `guard`: Bot đứng gác tại vị trí hiện tại, tự động đánh quái vật xâm nhập.
- `protect [tên_người_chơi]`: Chế độ vệ sĩ, đi theo và bảo vệ bạn khỏi quái vật.

### Lao động & Túi đồ
- `farm`: Bật chế độ làm ruộng tự động (tự gặt cây chín và trồng lại).
- `dig [tên_khối]`: Tự động tìm và đào khối đó (ví dụ: `dig dirt`, `dig oak_log`).
- `store`: Tự động tìm rương gần đó và cất các vật phẩm linh tinh vào.
- `drop [tên_item] [số_lượng]`: Vứt vật phẩm cụ thể ra đất.
- `dropall`: Xả sạch túi đồ.
- `armor`: Tự động tìm và mặc bộ giáp tốt nhất có trong túi đồ.
- `eat`: Ăn thức ăn để hồi HP và độ đói.

### Tiện ích
- `status`: Kiểm tra máu (HP) và độ đói của bot.
- `scan`: Quét và liệt kê các thực thể (mobs/players) xung quanh.
- `idle on/off`: Bật/tắt chế độ tự do (tự đi dạo, nhảy nhót, chat bâng quơ khi rảnh).

## 4. Các tính năng tự động (Robot tự xử lý)

- **Phản xạ Sneak**: Nếu bạn đứng trước mặt bot và nhấn Phím Shift (Sneak) 2 lần, bot sẽ nhún nhảy lại để chào bạn.
- **Tự động mở cửa**: Bot sẽ tự mở cửa gỗ hoặc cổng hàng rào khi đang di chuyển.
- **Tự nhặt đồ**: Bot tự động đi nhặt các vật phẩm rơi vãi quanh mình trong phạm vi 10 khối.
- **Phản công (Counter-Attack)**: Khi bị quái vật tấn công, bot sẽ tự động đánh trả cho đến khi mục tiêu bị tiêu diệt.
- **Né Creeper**: Bot biết lùi lại và chạy nhanh khi thấy Creeper sắp nổ.
