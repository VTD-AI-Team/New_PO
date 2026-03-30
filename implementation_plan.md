# Kế hoạch Triển khai (Giai đoạn 3): Hệ thống Báo Cáo & Đại tu Giao Diện Người Dùng

Chào bạn, tôi đã nhận được cả 2 yêu cầu cực kỳ giá trị của bạn:
1. Thiết kế lại Trải nghiệm & Giao diện (UX/UI) đẹp mắt, chuyên nghiệp hơn.
2. Thêm tính năng lưu trữ, báo cáo và bộ lọc thống kê theo Ngày/Tuần/Tháng.

Vì công cụ của chúng ta chạy **100% Nội bộ (Offline)**, dữ liệu trích xuất hiện tại sẽ mất đi khi bạn Làm mới (F5) trang. Để làm được việc "Báo cáo", chúng ta cần tích hợp một **Cơ sở dữ liệu cục bộ ẩn trong trình duyệt (IndexedDB)**. 

Dưới đây là kế hoạch chi tiết để "lột xác" phần mềm của bạn thành một ứng dụng dịch vụ (SaaS) chuyên nghiệp:

## Yêu cầu Xác nhận từ Người dùng

> [!CAUTION]
> **Giới hạn lưu trữ Nội bộ (Offline)**: Tất cả dữ liệu lịch sử bóc tách sẽ được lưu vào bộ nhớ của trình duyệt (trên chính phần cứng máy tính của Nhân viên kinh doanh). Điều này đáp ứng tiêu chí bảo mật 100%, nhưng nếu người dùng chủ động thao tác xóa sạch lịch sử lướt web (Xóa toàn bộ Bộ nhớ đệm / Tập tin vệt Web - Cache/Cookie), một phần dữ liệu Báo cáo sẽ bị mất. Bạn có xác nhận rủi ro này là chấp nhận được cho một phiên bản phần mềm hoạt động cắt đứt hoàn toàn với Internet không?

## Đề xuất Thay đổi

Tôi sẽ tái cấu trúc toàn diện tập tin `index.html` và thiết lập thêm tập tin `database.js` để quản lý logic lịch sử báo cáo.

### 1. Nâng cấp Kiến trúc & Giao diện (Mới)
- Biến giao diện hiện tại thành dạng **Bảng Điều Khiển với Bố cục 2 Thẻ chức năng**:
  - **Trình đơn Trái (Thanh điều hướng bên)**: Cố định, chứa Biểu trưng (Logo) VitaDairy sắc nét, kèm 2 tùy chọn (Chức năng "Trích xuất PDF" và "Lịch sử & Báo Cáo").
  - **Khu vực Hiển thị chính**:
    - Bo góc các thẻ mềm mại hơn, thêm hiệu ứng nổi khối, phủ màu sắc chủ đạo xanh biển đồng bộ với thương hiệu VitaDairy.
    - Nâng cấp phần thao tác kéo thả tệp PDF bằng các hiệu ứng tương tác (chuyển động màu sắc, mũi tên động) hiện đại.

### 2. Tập tin `database.js` (Lưu Trữ Nội Bộ)
Sử dụng công nghệ cơ sở dữ liệu IndexedDB (bền vững và không bị giới hạn 5MB như thông thường) để lưu trữ mọi mẻ bóc tách:
- `Mã định danh (ID)`: Thời điểm bóc tách.
- `Thời điểm`: Ngày tháng và Giờ phút tạo tác.
- `Tệp tin`: Danh sách tên các tệp PDF đã xử lý.
- `Tổng dòng`: Số hàng hóa lấy được.
- `Tổng số lượng`: Cộng dồn toàn bộ số lượng hàng.
- `Dữ liệu chi tiết`: Lưu trữ y nguyên bảng số liệu 5 cột để có thể soi chiếu về sau.

### 3. Thẻ "Lịch sử & Báo Cáo" (Mô-đun Báo Cáo Định kỳ)
- **Chỉ số hàng đầu (Bảng số liệu nhanh)**: Thống kê số lượng Sản Phẩm, Tổng Số đơn hàng đã xử lý, Tổng khối lượng theo con số đếm ngược sống động.
- **Bộ Lọc**: Các phím cứng thao tác siêu tốc: "Tất cả", "Hôm nay", "7 ngày qua", "Tháng này".
- **Lưới Lịch Sử (Danh sách Báo cáo)**: Hiển thị mạch lạc toàn bộ các mẻ PDF bạn đã quét trong khung thời gian, cho phép ấn nút **Tải lại Báo cáo Excel** các mẻ của ngày hôm qua, tuần trước mà không cần thao tác đọc file PDF cực nhọc thêm một lần nào nữa!

## Câu hỏi Mở

> [!IMPORTANT]
> 1. **Tiêu chí "Ngày"**: Bạn muốn thống kê theo "Ngày mà nhân viên dùng hệ thống để quét" hay là phải viết thuật toán để dò bằng được "Ngày in lịch đặt hàng" giấu ngẫu nhiên trong mỗi file PDF? *(Tôi khuyến nghị: Dùng "Ngày làm thao tác quét" trên máy tính sẽ mang lại sự trơn tru và chính xác 100% nhờ việc tránh được các đặc tả vị trí lộn xộn từ 20 loại phiếu khác nhau).*
> 2. Bạn đã thỏa mãn với các bảng dữ liệu đơn thuần, hay có cần tôi vẽ thêm một **Biểu đồ Cột** phân tích trực quan khối lượng xử lý hay không?
