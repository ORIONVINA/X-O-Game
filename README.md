# XO Game

Web game caro cho campaign Tayo X-O. HTML/CSS/JS thuần, không cần build. Link chơi là `index.html` ở thư mục gốc.

## Có gì trong game
- **Chọn phe X hoặc O.** Giao diện đổi màu theo phe, thắng thì cộng điểm cho phe.
- **Sân bắn cung (sân chính):** góc nhìn người bắn, bàn cờ dựng ở xa. Chạm giữ rồi kéo xuống để giương cung, kéo trái phải canh hướng, kéo sâu để bắn cao, thả tay để bắn. Có gió và tay rung nhẹ. Ra ngoài hoặc trúng ô đã có quân là mất lượt.
- **Sân cổ điển:** chạm để đặt quân.
- **Không có hòa:** bàn 3×3 mỗi người chỉ giữ 3 quân, quân cũ nhất biến mất. Bàn 5×5, 7×7 kín bàn thì tự thêm 1 ô ở cả bốn phía.
- **Bàn 8×8 mở rộng:** nối 5 quân để thắng. Có 4 quân liên tiếp vướng mép (hoặc kín bàn) thì bàn tự mở rộng.
- **Chơi với máy** (Dễ, Khó) hoặc **chơi với bạn**: mời qua link, nhập mã phòng 4 ký tự, hoặc chơi chung 1 máy.
- **Hoạt cảnh chờ lượt:** người đang chờ ngồi ăn gói Tayo của phe mình.
- **Màn thắng:** chữ X hoặc O của bên thắng phóng to giữa màn hình rồi mới hiện kết quả.
- **Âm thanh và hiệu ứng:** tiếng đặt quân, bắn cung, thắng thua; pháo giấy, tia văng, rung bàn.
- **Khảo sát sau ván đầu:** nhóm tuổi, giới tính, chấm điểm Tayo X và Tayo O (5 emoji).
- **Data về Google Sheet:** xem `tools/HUONG-DAN-GOOGLE-SHEET.md`.

## Thư mục
| Đường dẫn | Nội dung |
|---|---|
| `index.html` | Khung trang, các màn hình |
| `css/style.css` | Giao diện. Màu chỉnh ở `:root` đầu file |
| `js/app.js` | Toàn bộ logic. Chỉnh nhanh ở `CONFIG` đầu file |
| `assets/` | Logo, slogan, quân X/O. Đổi hình: thay file cùng tên |
| `vendor/peerjs.min.js` | Thư viện kết nối 2 máy (PeerJS, giấy phép MIT) |
| `tools/` | Code nhận data cho Google Sheet và hướng dẫn |

## Chơi với bạn hoạt động thế nào
Hai máy nối trực tiếp với nhau qua PeerJS, dùng máy chủ ghép nối miễn phí của PeerJS. Không cần máy chủ riêng.
Với một số mạng công ty hoặc mạng di động chặn kết nối trực tiếp, phòng có thể không vào được; khi đó dùng "Chơi chung 1 máy".
