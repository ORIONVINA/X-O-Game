# XO Game

Web game caro cho campaign Tayo X-O. HTML/CSS/JS thuần, không cần build. Link chơi là `index.html` ở thư mục gốc.

## Có gì trong game
- **Chọn phe X hoặc O.** Giao diện đổi màu theo phe, thắng thì cộng điểm cho phe.
- **Sân đấu:** Cổ điển (chạm để đặt quân) và Bắn cung (canh tâm ngắm rồi bắn que bánh vào ô).
- **Bàn 3×3 không hòa:** mỗi người chỉ giữ 3 quân, quân cũ nhất biến mất. Có thêm bàn 5×5 và 7×7.
- **Bàn 8×8 mở rộng:** nối 5 quân để thắng. Có 4 quân liên tiếp vướng mép thì bàn tự thêm 1 ô ở cả bốn phía (8×8 → 10×10 → … tối đa 14×14).
- **Chơi với máy** (Dễ, Khó) hoặc **chơi với bạn**: mời qua link, nhập mã phòng 4 ký tự, hoặc chơi chung 1 máy.
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
