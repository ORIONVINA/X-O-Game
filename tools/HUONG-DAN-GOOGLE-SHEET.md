# Nối game với Google Sheet (làm 1 lần, khoảng 5 phút)

1. Tạo một Google Sheet mới, đặt tên ví dụ `XO Game data`.
2. Trong sheet, vào **Tiện ích mở rộng → Apps Script**.
3. Xóa hết code mẫu, dán toàn bộ nội dung file `tools/google-sheet.gs` vào, bấm **Lưu**.
4. Bấm **Triển khai → Tùy chọn triển khai mới**.
   - Loại: **Ứng dụng web**
   - Thực thi dưới dạng: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
5. Bấm **Triển khai**, cho phép quyền khi được hỏi, rồi sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).
6. Mở `js/app.js`, dán URL vào dòng `sheetUrl: ''` ở đầu file, ví dụ:
   `sheetUrl: 'https://script.google.com/macros/s/XXXX/exec',`

Xong. Chơi thử 1 ván, sheet sẽ tự có 3 tab:

| Tab | Mỗi dòng là | Cột chính |
|---|---|---|
| `khao_sat` | 1 người trả lời | nhóm tuổi, giới tính, điểm Tayo X, điểm Tayo O, phe, nguồn vào |
| `van_dau` | 1 ván chơi | kiểu chơi, sân, bàn, thắng/thua, số nước, số giây, ván thứ mấy, chuỗi ngày |
| `khac` | chọn phe, đổi phe, vào phòng | |

Ghi chú:
- `uid` là mã ngẫu nhiên của từng máy, không phải tên hay số điện thoại. Dùng để đếm người chơi và tính tỉ lệ quay lại.
- Người chọn "Dưới 16" chỉ được ghi 1 dòng nhóm tuổi, không kèm `uid`, và game ngừng gửi data của máy đó.
- `src` lấy từ `?utm_source=` hoặc `?src=` trên link (nếu có), không thì là trang giới thiệu hoặc `direct`.

## Dashboard
Vào [Looker Studio](https://lookerstudio.google.com) → Tạo → Nguồn dữ liệu → Google Sheets → chọn sheet trên.
Biểu đồ gợi ý: người chơi theo nhóm tuổi × giới tính, điểm trung bình Tayo X và Tayo O, tỉ lệ phe X/O, số ván mỗi người, số người chơi theo ngày.
