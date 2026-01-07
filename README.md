# MC-Bot - Minecraft AFK Bot with Gemini AI

Một bot Minecraft thông minh được phát triển bằng `mineflayer`, bao gồm bản dùng lệnh chat JS thuần và bản tích hợp AI Gemini để có thể trò chuyện và thực hiện các hành động tự động như làm ruộng, bảo vệ người chơi, và đi dạo.

## 🚀 Tính năng chính

- **Trò chuyện thông minh**: Sử dụng Google Gemini AI để giao tiếp tự nhiên với người chơi qua chat.
- **Làm ruộng tự động (Auto Farm)**: Tự động gặt hái và trồng lại lúa mì, cà rốt, khoai tây...
- **Vệ sĩ (Bodyguard Mode)**: Đi theo và bảo vệ một người chơi cụ thể khỏi quái vật.
- **Canh gác (Guard Area)**: Bảo vệ một khu vực cố định.
- **Tự động đăng nhập**: Hỗ trợ các server có plugin đăng ký/đăng nhập (/login, /register).
- **Idle Mode**: Có các hành động ngẫu nhiên khi rảnh rỗi dể tránh bị kick AFK.

## 🛠 Cài đặt

1. **Clone project:**
   ```bash
   git clone https://github.com/sweetvn04/mc-bot.git
   cd mc-bot
   ```

2. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```

3. **Cấu hình biến môi trường:**
   - Copy file `.env.example` thành `.env`:
     ```bash
     cp .env.example .env
     ```
   - Mở file `.env` và điền thông tin của bạn:
     - `GEMINI_API_KEY`: Lấy tại [Google AI Studio](https://aistudio.google.com/).
     - `BOT_USERNAME`: Tên bot muốn đặt.
     - `BOT_PASSWORD`: Mật khẩu dể login vào server.
     - `BOT_HOST`: Địa chỉ server Minecraft.

## 🎮 Cách sử dụng

Chạy bot bằng lệnh:
```bash
node MC-Bot-Combined.js
```

## Các câu lệnh chat cơ bản:
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

## ⚠️ Lưu ý bảo mật

- **KHÔNG BAO GIỜ** đẩy file `.env` lên GitHub. File này đã được đưa vào `.gitignore`.
- Nếu bạn vô tình làm lộ API Key, hãy generate key mới ngay lập tức.

---
Phát triển bởi sweetvn
