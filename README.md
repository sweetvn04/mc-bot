# MyTrollBot - Minecraft AFK Bot with Gemini AI

Một bot Minecraft thông minh được phát triển bằng `mineflayer`, tích hợp AI Gemini để có thể trò chuyện và thực hiện các hành động tự động như làm ruộng, bảo vệ người chơi, và đi dạo.

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
   git clone <link-github-cua-ban>
   cd mytrollbot
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
node MC-Bot-server.js
```
Hoặc phiên bản có tích hợp AI:
```bash
node local-api.js
```

### Các câu lệnh chat cơ bản:
- `follow`: Bot sẽ đi theo bạn.
- `stop`: Dừng mọi hành động.
- `farm`: Bật chế độ làm ruộng.
- `protect`: Trở thành vệ sĩ cho bạn.
- `status`: Kiểm tra HP và độ đói của bot.

## ⚠️ Lưu ý bảo mật

- **KHÔNG BAO GIỜ** đẩy file `.env` lên GitHub. File này đã được đưa vào `.gitignore`.
- Nếu bạn vô tình làm lộ API Key, hãy generate key mới ngay lập tức.

---
Phát triển bởi [Tên Của Bạn]
