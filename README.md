# 🤖 MC-Bot — Multi-Functional Minecraft AFK & Companion Bot

Một bot Minecraft thông minh, mạnh mẽ được xây dựng trên nền tảng `mineflayer`, hỗ trợ cả **Bản Thuần Lệnh (0ms latency, chạy 24/7 không tốn API)** và **Bản Tích Hợp AI Google Gemini** (đàm thoại tự nhiên). Tương thích hoàn hảo với **Minecraft 26.2** và các phiên bản hiện đại.

---

## 🌟 Tính năng nổi bật

* ⚡ **Điều khiển trực tiếp qua Terminal (CLI)**: Ra lệnh cho bot ngay tại màn hình console mà **không cần đăng nhập tài khoản phụ vào game**.
* 🔍 **Nhận diện người chơi thông minh (`findPlayerSmart`)**: Tự động nhận diện người chơi qua UUID/khoảng cách gần nhất, tự động thông báo tọa độ XYZ khi người chơi ở xa ngoài tầm nhìn.
* 🌾 **Làm ruộng tự động nâng cao (Auto Farm)**: Tự động quét theo cụm, thu hoạch cây chín (lúa mì, cà rốt, khoai tây, củ dền, bướu nether) và tự động trồng lại hạt giống vào các ô đất trống.
* ⚔️ **Chiến đấu & Vệ sĩ thông minh**: 
  * Tự động dùng Kiếm khi cận chiến hoặc Cung / Đinh ba khi mục tiêu ở xa.
  * Tự động lùi lại né khi Creeper chuẩn bị phát nổ.
  * Tự động phản công khi bị quái vật đánh lén.
* 🎒 **Quản lý rương & Trang bị**: Tự tìm rương cất đồ thừa (`store`), tự tìm và mặc bộ giáp tốt nhất (`armor`), tự xả đồ (`drop`/`dropall`).
* 🧠 **Tự động sinh tồn ngầm**:
  * Tự động ăn thức ăn khi máu tụt hoặc đói.
  * Tự mở cửa gỗ và cổng hàng rào khi di chuyển.
  * Tự động chạy lại nhặt các vật phẩm rơi dưới đất trong phạm vi 10 ô.
  * Cúi chào đáp lễ (nhún nhảy khi người chơi nhấn Shift 2 lần trước mặt).
* 🧹 **Lọc sạch Log Console**: Tự động khử bỏ các tin nhắn HUD tọa độ `XYZ:...` và thời tiết lặp lại từ Server.
* 🔇 **Chế độ yên lặng**: Không tự động spam chat bâng quơ khi rảnh rỗi.

---

## 🛠️ Cài đặt & Cấu hình

### 1. Cài đặt mã nguồn
```bash
git clone https://github.com/sweetvn04/mc-bot.git
cd mc-bot
npm install
```

### 2. Cấu hình biến môi trường (`.env`)
Tạo file `.env` (hoặc sao chép từ `.env.example`):
```env
BOT_HOST=sv.lelam.net
BOT_PORT=25565
BOT_USERNAME=conca
BOT_PASSWORD=MatKhauCuaBan123
BOT_VERSION=26.2
GEMINI_API_KEY=AIzaSy... (Chỉ cần nếu dùng bản AI)
```

| Biến | Ý nghĩa | Mặc định |
| :--- | :--- | :--- |
| `BOT_HOST` | Địa chỉ máy chủ Minecraft (có thể kèm port, ví dụ `sv.lelam.net:25565`) | `localhost` |
| `BOT_PORT` | Cổng kết nối server | `25565` |
| `BOT_USERNAME` | Tên nhân vật của bot trong game | `AFK_Bot` |
| `BOT_PASSWORD` | Mật khẩu để tự động `/login` và `/register` | `password123` |
| `BOT_VERSION` | Phiên bản Minecraft cụ thể (ví dụ `26.2`, `1.20.4`...) | `false` (Auto) |
| `GEMINI_API_KEY` | API Key Google Gemini (lấy tại [Google AI Studio](https://aistudio.google.com/)) | `none` |

---

## 🚀 Khởi động Bot

Dự án cung cấp **2 phiên bản** tùy theo nhu cầu:

### ⚡ Phiên bản 1: Thuần Lệnh (Khuyên dùng cho Treo máy AFK / Farm 24/7)
* **Ưu điểm**: Phản hồi tức thì (0ms), cực nhẹ, không cần API Key, chạy cả tháng ổn định 100%.
```bash
node MC-Bot-JS.js
```

### 🧠 Phiên bản 2: Kết Hợp AI Gemini (Làm bạn đồng hành / Chém gió)
* **Ưu điểm**: Vừa nhận lệnh trực tiếp, vừa có thể trò chuyện tự nhiên bằng AI.
```bash
node MC-Bot-Combined.js
```

---

## 📖 Bảng danh sách lệnh điều khiển

Bạn có thể gửi lệnh qua **khung chat trong game** (không cần gõ `/`) hoặc **gõ trực tiếp vào Terminal**:

### 🛡️ 1. Chiến đấu & Bảo vệ
| Lệnh | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- |
| `protect [tên]` | **Chế độ Vệ sĩ**: Đi theo bảo vệ bạn, tiêu diệt quái vật lại gần trong phạm vi 16 ô. | `protect`<br>`protect sweetvn2004` |
| `guard` | **Canh gác tại chỗ**: Canh giữ vị trí hiện tại, săn quái trong bán kính 32 ô và tự quay về điểm gác. | `guard` |
| `attack [mục_tiêu]` | Săn lùng quái/người chỉ định (tự né Creeper, dùng Cung/Đinh ba hoặc Kiếm). | `attack zombie`<br>`attack skeleton` |

### 🌾 2. Nông trại & Khai thác tài nguyên
| Lệnh | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- |
| `farm` | **Làm ruộng tự động**: Tự tìm gặt cây chín (lúa mì, cà rốt, khoai tây, củ dền...) và tự gieo hạt vào đất trống. | `farm` |
| `dig [tên_khối]` | Tự tìm và đào loại khối đó liên tục trong phạm vi 32 ô. | `dig oak_log`<br>`dig iron_ore`<br>`dig stone` |

### 🎒 3. Túi đồ & Trang bị
| Lệnh | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- |
| `store` | Tự tìm rương gần đó (phạm vi 8 ô) và cất đồ thừa vào (giữ lại thức ăn & công cụ). | `store` |
| `armor` | Tự tìm và mặc bộ giáp tốt nhất có trong túi đồ. | `armor` |
| `drop [item] [số_lượng]` | Vứt vật phẩm cụ thể ra đất. | `drop diamond 5`<br>`drop bread 10` |
| `dropall` | Xả sạch toàn bộ túi đồ ra đất. | `dropall` |

### 🚶 4. Di chuyển & Hành động cơ bản
| Lệnh | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- |
| `follow [tên]` | Đi theo bạn (hoặc người chỉ định). Tự báo tọa độ XYZ nếu ở xa ngoài tầm nhìn. | `follow`<br>`follow sweetvn2004` |
| `stop` | **Dừng khẩn cấp**: Hủy ngay lập tức mọi hành động đang làm (hủy đào, đánh, đi theo). | `stop` |
| `goto [x] [y] [z]` | Tự tìm đường đi đến tọa độ cụ thể. | `goto 120 64 -350` |

### 🩺 5. Sinh tồn & Tiện ích
| Lệnh | Ý nghĩa | Ví dụ |
| :--- | :--- | :--- |
| `status` | Kiểm tra lượng Máu (HP), Độ đói (Food) và Tọa độ XYZ hiện tại của bot. | `status` |
| `scan` | Quét xem có người chơi hay sinh vật nào quanh bot trong bán kính 10 ô. | `scan` |
| `eat` | Lấy đồ ăn trong túi ra ăn để hồi máu và độ đói. | `eat` |
| `sleep` / `wake` | Tự tìm giường ngủ / thức dậy. | `sleep`<br>`wake` |
| `idle on` / `idle off` | Bật / Tắt chế độ tự do đi dạo lúc rảnh rỗi. | `idle off` *(đứng yên cố định)* |
| `api` | Kiểm tra và kết nối lại AI (chỉ có trên bản Combined). | `api` |
| `help` | Hiển thị bảng trợ giúp lệnh tóm tắt. | `help` |

---

## 🖥️ Điều khiển độc quyền từ Terminal (CLI)

Khi chạy bot trên Terminal, bạn có thể gõ các lệnh sau:

1. **Gõ trực tiếp từ khóa**: `status`, `farm`, `guard`, `stop`, `armor`, `store`, `dig oak_log`...
2. **Gửi tin nhắn chat vào Server**:
   ```text
   say Xin chào mọi người!
   chat Mình đang AFK làm ruộng nha
   ```
3. **Gửi lệnh Server Minecraft (Bắt đầu bằng `/`)**:
   ```text
   /spawn
   /home
   /tpa sweetvn2004
   ```

---

## ⚠️ Lưu ý an toàn & Bảo mật

* **Bảo mật file `.env`**: Tuyệt đối không commit file `.env` lên GitHub hoặc chia sẻ API Key cho người khác.
* **Server Rules**: Hãy tuân thủ quy định về bot và tài khoản AFK của server bạn tham gia để tránh bị cấm chơi.

---
*Phát triển và duy trì bởi [sweetvn04](https://github.com/sweetvn04)*
