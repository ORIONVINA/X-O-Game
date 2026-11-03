# X-O Game – Tic Tac Toe

Web game Xo Caro 1 trang (HTML/CSS/JS thuần, không cần build).

## Tính năng
- 2 người chơi / Đấu máy (Dễ, Khó – minimax bất bại ở 3×3)
- Bàn 3×3, 5×5, 7×7
- Bảng điểm lưu trên trình duyệt, Đi lại, Ván mới

## Cấu trúc code (trong `index.html`)
1. `CONFIG` – tuỳ chỉnh luật, tên người chơi
2. `Rules` – luật thắng/hòa cho mọi kích thước bàn
3. `AI` – các bot; thêm cấp độ mới vào `AI.bots`
4. `Store` – lưu điểm
5. `Game` – trạng thái ván, lịch sử nước đi
6. `UI` – vẽ bàn cờ
7. `Events` – hook mở rộng: `Events.on('win', fn)`

## Chạy
Mở `index.html` bằng trình duyệt, hoặc bật GitHub Pages (branch `main`, thư mục `/root`).
