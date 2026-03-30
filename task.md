# Offline PO Extractor Execution Plan - Phase 3

- [x] 1. Tái cấu trúc Giao diện (`index.html` & CSS)
  - Chuyển sang Sidebar Layout (2 Tabs: Bóc Tách / Báo Cáo)
  - Làm đẹp UX/UI tổng thể theo hướng SaaS (Glassmorphism, Shadow, Colors)
- [x] 2. Xây dựng Database Mức Trình duyệt (`database.js`)
  - Khởi tạo IndexedDB (Bảng `sessions`)
  - Hàm `saveSession`, `getSessions(filterDate)`
- [x] 3. Tích hợp Logic Báo Cáo (`app.js`)
  - Tự động lưu mẻ bóc tách thành công vào IndexedDB
  - Logic chuyển Tab (Menu điều hướng)
  - Tính toán và hiển thị Top Metrics (Tổng PO, Tổng Hàng) trong Tab Báo Cáo
  - Render History Table và Date Filters
- [ ] 4. Nghiệm thu & Walkthrough
