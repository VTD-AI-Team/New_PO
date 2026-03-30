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
        regex: /^([A-Z0-9-]{8,15})\s+(.+?)\s+([A-Za-z]+)\s+(\d+)\s+(\d+)\s+(\d+(?:[.,]\d+)*)\s+(\d+(?:[.,]\d+)*)\s+(\d+(?:[.,]\d+)*)\s+([A-Za-zÀ-ỹ]+)\s+(\d+(?:[.,]\d+)*)/i,
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
        let orderNo = "Chưa rõ";
        let poDate = "Chưa rõ";
        let deliveryDateToStore = "Chưa rõ";
        let deliveredTo = "";
        
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();
            const items = content.items;

            // XỬ LÝ KHÔNG GIAN BẢN ĐỒ (GEOMETRY) ĐỂ TRÍCH XUẤT "DELIVERED TO" BLOCK
            if (!deliveredTo && items.length > 0) {
                const orderedItem = items.find(it => it.str.includes('Ordered By') || it.str.includes('Ordered'));
                const delivItem = items.find(it => it.str.includes('Delivered To') || it.str.includes('Delivered'));
                const forStoreItem = items.find(it => it.str.includes('For Store') || it.str.includes('For'));
                const targetArticleItem = items.find(it => it.str.includes('Article'));

                if (delivItem && forStoreItem) {
                    let xMin = delivItem.transform[4] - 150; // Fallback
                    if (orderedItem) {
                        xMin = (orderedItem.transform[4] + delivItem.transform[4]) / 2;
                    }
                    const xMax = (delivItem.transform[4] + forStoreItem.transform[4]) / 2;
                    
                    const topY = delivItem.transform[5] + 15; // Include ascenders and header
                    const bottomY = targetArticleItem ? targetArticleItem.transform[5] : topY - 150;

                    let delivItems = items.filter(it => 
                        it.transform[4] >= xMin && 
                        it.transform[4] < xMax && 
                        it.transform[5] < topY && 
                        it.transform[5] > bottomY
                    );

                    delivItems.sort((a, b) => {
                        const yDiff = Math.abs(b.transform[5] - a.transform[5]);
                        if (yDiff > 5) return b.transform[5] - a.transform[5];
                        return a.transform[4] - b.transform[4];
                    });

                    let dLines = [];
                    let currYLine = null;
                    let currStr = "";
                    delivItems.forEach(it => {
                        if (currYLine === null || Math.abs(currYLine - it.transform[5]) > 5) {
                            if (currStr.trim()) dLines.push(currStr.trim());
                            currStr = it.str;
                            currYLine = it.transform[5];
                        } else {
                            currStr += " " + it.str.trim();
                        }
                    });
                    if (currStr.trim()) dLines.push(currStr.trim());

                    // Loại bỏ dòng tiêu đề nếu nó bị lẫn vào lưới tọa độ
                    dLines = dLines.filter(line => {
                        const l = line.toLowerCase().replace(/[^a-z0-9]/g, '');
                        return l !== 'deliveredto' && l !== 'delivered' && l !== 'to';
                    });

                    if (dLines.length > 0) {
                        deliveredTo = dLines.join(" | ");
                    }
                }
            }

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

            // TÌM KIẾM THEO KIỂU BẢN ĐỒ DỮ LIỆU (Dành riêng cho Order No và Order Date của Big C)
            // Chiến thuật: Tìm vị trí của nhãn và lấy giá trị ở dòng ngay phía sau
            for (let j = 0; j < lines.length; j++) {
                const curLine = lines[j].toLowerCase();
                const nextLine = (j + 1 < lines.length ? lines[j + 1] : "").toLowerCase();
                const nextNextLine = (j + 2 < lines.length ? lines[j + 2] : "").toLowerCase();
                const timeOnlyPattern = /^([01]?\d|2[0-3]):[0-5]\d$/;
                const dateOnlyPattern = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/;
                
                // Tìm Order No
                // Trường hợp đặc biệt: "Order" và "No" không nằm sát nhau (giữa có thể có "Order Date")
                if (orderNo === "Chưa rõ" && /order/.test(curLine)) {
                    let noIndex = -1;
                    for (let k = j + 1; k <= j + 3 && k < lines.length; k++) {
                        const lk = (lines[k] || "").toLowerCase();
                        if (/(no|nr|orderno|ordernr)/.test(lk)) { noIndex = k; break; }
                    }

                    if (noIndex !== -1) {
                        // Ưu tiên: nếu ngay dòng "No" có số
                        const inlineCandidate = (lines[noIndex] || "").trim();
                        const inlineDigitsMatch = inlineCandidate.match(/\d{6,15}/);
                        if (inlineDigitsMatch) {
                            orderNo = inlineDigitsMatch[0].trim();
                        } else {
                            // Dò số dài ngay sau cụm "No"
                            for (let t = noIndex + 1; t <= noIndex + 12 && t < lines.length; t++) {
                                const v = (lines[t] || "").trim();
                                if (/[\/:]/.test(v)) continue; // Tránh nhặt nhầm ngày/giờ
                                const directMatch = v.match(/\d{10,15}/);
                                if (directMatch) {
                                    orderNo = directMatch[0].trim();
                                    break;
                                }
                            }

                            // Nếu vẫn chưa ra, ghép các mảnh số trong cửa sổ rộng hơn
                            if (orderNo === "Chưa rõ") {
                                let joined = "";
                                for (let t = noIndex + 1; t <= noIndex + 12 && t < lines.length; t++) {
                                    const v = (lines[t] || "").trim();
                                    if (/[\/:]/.test(v)) continue;
                                    const digits = v.replace(/\D/g, "");
                                    if (!digits) continue;
                                    joined += digits;
                                    if (joined.length >= 10) {
                                        orderNo = joined;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // Trường hợp label bị tách nhiều dòng: ví dụ "Order" + "No" / "Order" + "Nr"
                if (orderNo === "Chưa rõ" && /order/.test(curLine) && /(no|nr|orderno)/.test(nextLine)) {
                    // 1) Trường hợp "No <value>" nằm ngay cùng 1 dòng với nhãn "No"
                    const inlineCandidate = (lines[j + 1] || "").trim();
                    const inlineMatch = inlineCandidate.match(/((?=.*\d)[A-Z0-9-]{4,})/i);
                    if (inlineMatch && /\d/.test(inlineMatch[1])) {
                        orderNo = inlineMatch[1].trim();
                    } else {
                        // 2) Tìm trực tiếp số dài (đôi khi PDF tách dòng nhưng vẫn giữ đủ chuỗi)
                        for (let t = j + 2; t <= j + 12 && t < lines.length; t++) {
                            const v = (lines[t] || "").trim();
                            if (/[\/:]/.test(v)) continue; // Tránh nhặt nhầm ngày/giờ
                            const directMatch = v.match(/\d{10,15}/);
                            if (directMatch) {
                                orderNo = directMatch[0].trim();
                                break;
                            }
                        }

                        // 3) Nếu vẫn chưa ra, ghép các mảnh chỉ chứa chữ số trong cửa sổ rộng hơn
                        if (orderNo === "Chưa rõ") {
                            let joined = "";
                            for (let t = j + 2; t <= j + 12 && t < lines.length; t++) {
                                const v = (lines[t] || "").trim();
                                if (/[\/:]/.test(v)) continue; // Tránh nhặt nhầm ngày/giờ
                                const digits = v.replace(/\D/g, "");
                                if (!digits) continue;
                                joined += digits;
                                if (joined.length >= 10) {
                                    orderNo = joined;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (orderNo === "Chưa rõ" && (/order\s*no|order\s*nr|orderno|ordernr/i.test(curLine))) {
                    // Cố thu thập số order trên cùng một dòng. Bắt buộc kết quả phải có chữ số
                    const sameLineMatch = lines[j].match(/(?:Order\s*No|Order\s*Nr)[:\s.]*([A-Z0-9-]*\d+[A-Z0-9-]*)/i);
                    if (sameLineMatch) {
                        orderNo = sameLineMatch[1].trim();
                    } else if (j < lines.length - 1) {
                        // Nếu không có số trên cùng dòng, lấy dòng tiếp theo
                        const nextLine = lines[j+1].trim();
                        // Trích xuất chuỗi có chữ và số, đủ dài (ví dụ: 2612054838774)
                        const orderMatch = nextLine.match(/\b([A-Z0-9-]*\d[A-Z0-9-]{4,})\b/i);
                        if (orderMatch) {
                            orderNo = orderMatch[1].trim();
                        }
                    }
                }

                // Tìm Order Date
                // Trường hợp label bị tách nhiều dòng: ví dụ "Order" + "Date"
                if (poDate === "Chưa rõ" && /order/.test(curLine) && /(date|po\s*date)/.test(nextLine)) {
                    // Giá trị ngày có thể ở j+2 hoặc j+2 + (j+3 là phần giờ)
                    const dateCandidateLine = lines[j + 2] ? lines[j + 2].trim() : "";
                    const timeCandidateLine = lines[j + 3] ? lines[j + 3].trim() : "";
                    const dateMatch = dateCandidateLine.match(dateOnlyPattern);
                    if (dateMatch) {
                        if (timeCandidateLine && timeOnlyPattern.test(timeCandidateLine)) {
                            poDate = `${dateMatch[1]} ${timeCandidateLine}`;
                        } else {
                            poDate = dateMatch[1];
                        }
                    } else {
                        // Fallback: thử lấy ngày trong phạm vi j+2..j+4
                        for (let t = j + 2; t <= j + 4 && t < lines.length; t++) {
                            const v = (lines[t] || "").trim();
                            const m = v.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})(?:\s+([01]?\d|2[0-3]):[0-5]\d)?/);
                            if (m && m[1]) {
                                poDate = v.includes(':') ? m[0].trim() : m[1].trim();
                                break;
                            }
                        }
                    }
                }
                if (poDate === "Chưa rõ" && (/order\s*date|po\s*date/i.test(curLine))) {
                    const sameLineMatch = lines[j].match(/(?:Order\s*Date|PO\s*Date)[:\s.]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i);
                    if (sameLineMatch) {
                        poDate = sameLineMatch[1].trim();
                    } else if (j < lines.length - 1) {
                        const nextLine = lines[j+1].trim();
                        // Trích xuất chuỗi có định dạng ngày tháng nằm ĐÂU ĐÓ trong dòng dưới
                        const dateMatch = nextLine.match(/([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})(?:\s+[0-9]{2}:[0-9]{2})?/);
                        if (dateMatch) {
                            poDate = dateMatch[0].trim();
                        }
                    }
                }

                // Tìm Delivery Date To Store
                if (deliveryDateToStore === "Chưa rõ" && (/delivery\s*date/i.test(curLine))) {
                    const sameLineMatch = lines[j].match(/Delivery\s*Date(?:\s*To\s*Store|\s*To\s*|(?:\s*Store)?)?[:\s.]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i);
                    if (sameLineMatch) {
                        deliveryDateToStore = sameLineMatch[1].trim();
                    } else if (j < lines.length - 1) {
                        const nextLine = lines[j+1].trim();
                        const dateMatch = nextLine.match(/([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})(?:\s+[0-9]{2}:[0-9]{2})?/);
                        if (dateMatch) {
                            deliveryDateToStore = dateMatch[0].trim();
                        }
                    }
                }
            }

            debugLines.push(...lines); // Lưu dòng tự nhiên để kiểm tra

            lines.forEach(line => {
                const cleanLine = line.replace(/\s+/g, ' ').trim(); 
                
                // Trích xuất Số PO / Order No (đặc thù Big C và chung)
                const poNumMatch = cleanLine.match(/(?:Số\s*đơn\s*hàng|Số\s*PO|PO\s*No|PO\s*Number|Order\s*No)[:\s]*([A-Z0-9-]*\d+[A-Z0-9-]*)/i);
                if (poNumMatch && poNumber === "Chưa rõ") {
                    const val = poNumMatch[1].trim();
                     poNumber = val; // Bắt buộc có số nên không sợ lẫn chữ ngắn
                }
                if (poNumber !== "Chưa rõ" && orderNo === "Chưa rõ") orderNo = poNumber;

                // Trích xuất Ngày PO / Order Date
                const poDateMatch = cleanLine.match(/(?:Ngày đặt hàng|Ngày đơn hàng|Ngày|Date|Order\s*Date|PO\s*Date)[:\s]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(?:\s+\d{2}:\d{2})?)/i);
                if (poDateMatch && poDate === "Chưa rõ") poDate = poDateMatch[1].trim();
                
                // Trích xuất Delivery Date To Store (Nếu có)
                const delivDateStoreMatch = cleanLine.match(/Delivery\s*Date(?:\s*To\s*Store|\s*To\s*)?[:\s]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
                if (delivDateStoreMatch && deliveryDateToStore === "Chưa rõ") deliveryDateToStore = delivDateStoreMatch[1].trim();

                // Nếu poDate có giá trị mà deliveryDateToStore chưa có, tạm lấy poDate làm mốc
                if (poDate !== "Chưa rõ" && deliveryDateToStore === "Chưa rõ") deliveryDateToStore = poDate;

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
                            orderNo: orderNo,
                            deliveryDateToStore: deliveryDateToStore,
                            barcode: match[template.map.barcode],
                            skuName: match[template.map.skuName].trim(),
                            quantity: match[template.map.quantity],
                            price: match[template.map.price] || "0",
                            total: match[template.map.total] || "0",
                            unit: match[template.map.unit].charAt(0).toUpperCase() + match[template.map.unit].slice(1).toLowerCase(),
                            deliveredTo: deliveredTo,
                            note: "" 
                        });

                        // Nếu có Free Qty > 0, tạo thêm một object tách biệt thứ 2
                        if (freeQty > 0) {
                            extractedData.push({
                                supermarket: supermarket,
                                poNumber: poNumber,
                                poDate: poDate,
                                orderNo: orderNo,
                                deliveryDateToStore: deliveryDateToStore,
                                barcode: match[template.map.barcode],
                                skuName: match[template.map.skuName].trim() + " (Hàng Mẫu / Tặng)",
                                quantity: match[template.map.freeQty], 
                                price: "0",
                                total: "0",
                                unit: match[template.map.unit].charAt(0).toUpperCase() + match[template.map.unit].slice(1).toLowerCase(),
                                deliveredTo: deliveredTo,
                                note: "Khuyến mại/Hàng Tặng"
                            });
                        }
                        
                        return; // Khi đã khớp 1 template cho Dòng này, ngưng và chuyển qua dòng tiếp theo
                    }
                }
            });
        }
        
        // Bước cuối: Trộn Ghi chú chung (sharedPoNote) vào từng dòng của mảng extractedData
        if (sharedPoNote || supermarket !== "Chưa rõ" || poNumber !== "Chưa rõ" || poDate !== "Chưa rõ" || deliveredTo !== "" || orderNo !== "Chưa rõ" || deliveryDateToStore !== "Chưa rõ") {
            extractedData.forEach(row => {
                if (sharedPoNote) row.note = row.note ? (row.note + " | " + sharedPoNote) : sharedPoNote;
                if (row.supermarket === "Chưa rõ") row.supermarket = supermarket;
                if (row.poNumber === "Chưa rõ") row.poNumber = poNumber;
                if (row.orderNo === "Chưa rõ") row.orderNo = orderNo;
                if (row.poDate === "Chưa rõ") row.poDate = poDate;
                if (row.deliveryDateToStore === "Chưa rõ") row.deliveryDateToStore = deliveryDateToStore;
                if (!row.deliveredTo) row.deliveredTo = deliveredTo;
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
