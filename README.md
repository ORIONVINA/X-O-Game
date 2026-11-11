# XO Game

Web game caro cho campaign Tayo X-O. HTML/CSS/JS thuần, không cần build. Link chơi là `index.html` ở thư mục gốc.

## Có gì trong game
- **Teaser mở đầu 15 giây:** chạm để vào, rồi 6 cảnh tự chạy (đối đầu X vs O, Tayo X, Tayo O, giương cung bắn, nối quân thắng, bảng vàng và nút Chơi ngay). Có nút "Bỏ qua" ở góc trên. Chữ quảng cáo sửa trong `index.html` (khối `#intro`), mốc giây sửa ở `Intro.CUES` trong `js/app.js`.
- **Sảnh 3 bước:** Hình thức chơi (Với máy, Với bạn) → Mức độ (Dễ, Vừa, Khó) → Sân và bàn cờ → Vào trận. Chơi với bạn thì mức độ đổi luật ở sân bắn cung: gió mạnh dần, mức Khó bia quay 2 mặt.
- **Bảng vàng X vs O:** số trận thắng của mỗi phe trong ngày, làm mới mỗi ngày, đọc từ Google Sheet (tab `bang_vang`).
- **Nhạc nền** cho teaser và sảnh: đặt file MP3 vào `assets/` rồi ghi đường dẫn vào `CONFIG.music` trong `js/app.js`.
- **Khảo sát:** mỗi lần vào game hỏi 1 lần sau ván đầu; ai đã trả lời thì không hỏi lại.
- **Chọn phe X hoặc O.** Giao diện đổi màu theo phe, thắng thì cộng điểm cho phe.
- **Sân bắn cung (sân chính):** góc nhìn người bắn, bàn cờ dựng ở xa. Chạm giữ rồi kéo xuống để giương cung, kéo trái phải canh hướng, kéo sâu để bắn cao, thả tay để bắn. Có gió và tay rung nhẹ. Ra ngoài hoặc trúng ô đã có quân là mất lượt.
- **Sân cổ điển:** chạm để đặt quân.
- **Không có hòa:** bàn 3×3 mỗi người chỉ giữ 3 quân, quân cũ nhất biến mất. Bàn 5×5, 7×7 kín bàn thì tự thêm 1 ô ở cả bốn phía.
- **Bàn 8×8 mở rộng:** nối 5 quân để thắng. Có 4 quân liên tiếp vướng mép (hoặc kín bàn) thì bàn tự mở rộng.
- **Chơi với máy** (Dễ, Vừa, Khó; cấp Khó tính trước nhiều nước, và ở sân bắn cung thì bia quay tròn, chơi được cả 2 mặt) hoặc **chơi với bạn**: mời qua link, nhập mã phòng 4 ký tự, hoặc chơi chung 1 máy.
- **Màn thắng:** chữ X hoặc O của bên thắng phóng to, rồi thu nhỏ bay vào gói bánh của phe đó, sau đó hiện kết quả.
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
