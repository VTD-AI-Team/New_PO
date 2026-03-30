/**
 * parser.js
 * Nhiệm vụ: Đọc ArrayBuffer từ trình duyệt bằng PDF.js, nhóm các text theo hàng ngang,
 * và đối chiếu với TẬP LUẬT (TEMPLATES) của từng siêu thị để bóc đúng 4 cột.
 */

// =========================================================================
// KHU VỰC CẤU HÌNH (CHO DEV / ADMIN)
// Bạn có hơn 20 nhà cung cấp (siêu thị)? Hãy copy một block {} và dán xuống dưới, 
// sau đó sửa lại 'regex' và 'map' sao cho khớp với số thứ tự cụm dữ liệu.
// =========================================================================
const PO_TEMPLATES = [
    {
        // === 1. Template dành cho: BIG C / GO! ===
        // Định dạng cột: Article | Article Desc | OU Type | LV | SKU/OU | OU Qty | Free Qty | Net Price | Unit | Total
        // Ví dụ: 8936170701862 TH6 SPDD COLOS HT 800G Pack 1 6 1 0 541.785 Cai 3.250.710
        name: "Big C / GO!",
        regex: /^([A-Z0-9-]{8,15})\s+(.+?)\s+([A-Za-z]+)\s+(\d+)\s+(\d+)\s+(\d+(?:[.,]\d+)*)\s+(\d+(?:[.,]\d+)*)\s+(\d+(?:[.,]\d+)*)\s+([A-Za-zÀ-ỹ]+)\s+(\d+(?:[.,]\d+)*)$/i,
        map: {
            barcode: 1,    // Cụm bắt thứ 1 là Article
            skuName: 2,    // Cụm bắt thứ 2 là Article Desc
            quantity: 6,   // Cụm bắt thứ 6 là OU Qty
            freeQty: 7,    // Cụm bắt thứ 7 là Free Qty
            price: 8,      // Cụm bắt thứ 8 là Net Price
            unit: 9,       // Cụm bắt thứ 9 là Unit
            total: 10      // Cụm bắt thứ 10 là Total
        }
    },
    {
        // === 2. Template Chung 1: Đơn vị đi SAU Số lượng ===
        // Ví dụ: 8931234567890 Sua Colosbaby 800g 50 Thùng
        name: "Mẫu Phổ Thông (SL -> Đơn Vị)",
        regex: /^([A-Z0-9-]{4,20})\s+(.+?)\s+(\d{1,7}(?:[.,]\d+)*)\s+(Thùng|Hộp|CS|EA|Lon|Gói|Chai|Bình|Lốc|Bịch|Dây|PCS|Cái|Kg|Gram|Túi|Bao|Kiện|Block)$/i,
        map: {
            barcode: 1,
            skuName: 2,
            quantity: 3,
            unit: 4
        }
    },
    {
        // === 3. Template Chung 2: Đơn vị đi TRƯỚC Số lượng ===
        // Ví dụ: 8931234567890 Sua Colosbaby 800g Thùng 50
        name: "Mẫu Phổ Thông (Đơn Vị -> SL)",
        regex: /^([A-Z0-9-]{4,20})\s+(.+?)\s+(Thùng|Hộp|CS|EA|Lon|Gói|Chai|Bình|Lốc|Bịch|Dây|PCS|Cái|Kg|Gram|Túi|Bao|Kiện|Block)\s+(\d{1,7}(?:[.,]\d+)*)$/i,
        map: {
            barcode: 1,
            skuName: 2,
            quantity: 4,
            unit: 3
        }
    }
];
// =========================================================================

async function extractPOData(arrayBuffer) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDocument = await loadingTask.promise;
        const totalPages = pdfDocument.numPages;
        
        const extractedData = [];
        const debugLines = []; // Nhật ký gỡ lỗi
        let sharedPoNote = ""; // Lưu trữ Ghi chú chung của toàn bộ file PDF này
        let supermarket = "Chưa rõ";
        let poNumber = "Chưa rõ";
        let poDate = "Chưa rõ";
        
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();
            const items = content.items;

            // Gom chữ về cùng 1 dòng với dung sai 8px
            items.sort((a, b) => {
                const yDiff = Math.abs(b.transform[5] - a.transform[5]);
                if (yDiff > 8) {
                    return b.transform[5] - a.transform[5]; 
                }
                return a.transform[4] - b.transform[4];
            });

            let currentY = null;
            let lines = [];
            let currentLine = "";

            items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (currentY === null || Math.abs(currentY - y) > 8) {
                    if (currentLine.trim()) lines.push(currentLine.trim());
                    currentLine = item.str;
                    currentY = y;
                } else {
                    currentLine += " " + item.str;
                }
            });
            if (currentLine.trim()) lines.push(currentLine.trim());

            debugLines.push(...lines); // Lưu dòng tự nhiên để kiểm tra

            lines.forEach(line => {
                const cleanLine = line.replace(/\s+/g, ' ').trim(); 
                
                // 1. Kiểm tra xem dòng này có phải là Header của PO không
                // Trích xuất Số PO
                const poNumMatch = cleanLine.match(/(?:Số đơn hàng|Số PO|PO No|PO Number)[:\s]+([A-Z0-9-]+)/i);
                if (poNumMatch && poNumber === "Chưa rõ") poNumber = poNumMatch[1].trim();

                // Trích xuất Ngày PO
                const poDateMatch = cleanLine.match(/(?:Ngày|Ngày đặt hàng|Date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
                if (poDateMatch && poDate === "Chưa rõ") poDate = poDateMatch[1].trim();

                // Nhận diện siêu thị (Dựa trên từ khóa phổ biến)
                if (supermarket === "Chưa rõ") {
                    if (/EB SERVICES|Big C|GO!|BigC/i.test(cleanLine)) supermarket = "Big C / GO!";
                    else if (/SAIGON CO.OP|Coop Mart|CoopMart/i.test(cleanLine)) supermarket = "Co.op Mart";
                    else if (/WINCOMMERCE|VinMart|WinMart/i.test(cleanLine)) supermarket = "WinMart";
                    else if (/AEON/i.test(cleanLine)) supermarket = "AEON";
                    else if (/LOTTE/i.test(cleanLine)) supermarket = "Lotte Mart";
                    else if (/BACH HOA XANH|BHX/i.test(cleanLine)) supermarket = "Bách Hóa Xanh";
                }

                // Kiểm tra xem dòng này có phải là Notes chung của PO không
                const noteMatch = cleanLine.match(/^(?:Lưu ý|Luu y|Ghi chú|Ghi chu|Note)[\s:,-]+(.*)$/i);
                if (noteMatch && noteMatch[1].trim()) {
                    sharedPoNote = (sharedPoNote ? sharedPoNote + " | " : "") + noteMatch[1].trim();
                }

                // 2. QUAN TRỌNG: Quét qua TẤT CẢ các template định dạng dòng hàng
                for (let k = 0; k < PO_TEMPLATES.length; k++) {
                    const template = PO_TEMPLATES[k];
                    const match = cleanLine.match(template.regex);
                    
                    if (match) {
                        let freeQty = 0;
                        if (template.map.freeQty && match[template.map.freeQty]) {
                            // Chuyển string thành số để kiểm tra xem có lớn hơn 0 không
                            freeQty = parseFloat(match[template.map.freeQty].replace(/[,.]/g, '')) || 0;
                        }

                        // Push dòng hàng chính
                        extractedData.push({
                            supermarket: supermarket,
                            poNumber: poNumber,
                            poDate: poDate,
                            barcode: match[template.map.barcode],
                            skuName: match[template.map.skuName].trim(),
                            quantity: match[template.map.quantity],
                            price: match[template.map.price] || "0",
                            total: match[template.map.total] || "0",
                            unit: match[template.map.unit].charAt(0).toUpperCase() + match[template.map.unit].slice(1).toLowerCase(),
                            note: "" 
                        });

                        // Nếu có Free Qty > 0, tạo thêm một object tách biệt thứ 2
                        if (freeQty > 0) {
                            extractedData.push({
                                supermarket: supermarket,
                                poNumber: poNumber,
                                poDate: poDate,
                                barcode: match[template.map.barcode],
                                skuName: match[template.map.skuName].trim() + " (Hàng Mẫu / Tặng)",
                                quantity: match[template.map.freeQty], 
                                price: "0",
                                total: "0",
                                unit: match[template.map.unit].charAt(0).toUpperCase() + match[template.map.unit].slice(1).toLowerCase(),
                                note: "Khuyến mại/Hàng Tặng"
                            });
                        }
                        
                        return; // Khi đã khớp 1 template cho Dòng này, ngưng và chuyển qua dòng tiếp theo
                    }
                }
            });
        }
        
        // Bước cuối: Trộn Ghi chú chung (sharedPoNote) vào từng dòng của mảng extractedData
        if (sharedPoNote || supermarket !== "Chưa rõ" || poNumber !== "Chưa rõ" || poDate !== "Chưa rõ") {
            extractedData.forEach(row => {
                if (sharedPoNote) row.note = row.note ? (row.note + " | " + sharedPoNote) : sharedPoNote;
                if (row.supermarket === "Chưa rõ") row.supermarket = supermarket;
                if (row.poNumber === "Chưa rõ") row.poNumber = poNumber;
                if (row.poDate === "Chưa rõ") row.poDate = poDate;
            });
        }

        if (extractedData.length === 0) {
            console.warn("==== TOÀN BỘ VĂN BẢN TỪ PDF (PHỤC VỤ KIỂM TRA) ====");
            console.warn(debugLines.join("\n"));
            console.warn("=================================================");
            throw new Error("Không thể trích xuất. Có thể file là ảnh quét (scan) hoặc định dạng bảng chưa được hệ thống hỗ trợ.");
        }
        
        return extractedData;
    } catch (error) {
        console.error("Lỗi xử lý PDF:", error);
        throw error;
    }
}
