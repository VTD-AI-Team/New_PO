/**
 * app.js
 * Quản lý DOM Event, UI States, và logic ứng dụng.
 * Phiên bản Phase 3: Tích hợp IndexedDB Offline Storage và Multi-Tab.
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. DOM Elements
    const els = {
        // Extractor Tab
        fileInput: document.getElementById('po-file-input'),
        dropZone: document.getElementById('po-drop-zone'),
        btnExtract: document.getElementById('btn-extract'),
        btnExport: document.getElementById('btn-export-excel'),
        btnRefresh: document.getElementById('btn-refresh'),
        dataBody: document.getElementById('po-data-body'),
        fileInfoContainer: document.getElementById('file-info-container'),
        fileNameDisplay: document.getElementById('po-filename'),
        extractIcon: document.getElementById('extractIcon'),
        extractBtnText: document.getElementById('extractBtnText'),
        rowCountBadge: document.getElementById('row-count-badge'),
        
        // Navigation
        navExtractor: document.getElementById('nav-btn-extractor'),
        navReports: document.getElementById('nav-btn-reports'),
        tabExtractor: document.getElementById('tab-extractor'),
        tabReports: document.getElementById('tab-reports'),
        
        // Reports Tab
        kpiSessions: document.getElementById('kpi-sessions'),
        kpiQty: document.getElementById('kpi-qty'),
        kpiRows: document.getElementById('kpi-rows'),
        kpiSessionsCard: document.querySelector('#kpi-sessions').parentElement,
        kpiQtyCard: document.querySelector('#kpi-qty').parentElement,
        kpiRowsCard: document.querySelector('#kpi-rows').parentElement,
        historyBody: document.getElementById('history-data-body'),
        filterBtns: document.querySelectorAll('.filter-btn'),
        
        // Toasts
        toastSuccess: document.getElementById('toastSuccess'),
        toastSuccessMsg: document.getElementById('toastSuccessMsg'),
        toastError: document.getElementById('toastError'),
        toastErrorMsg: document.getElementById('toastErrorMsg')
    };

    // Global State
    let currentPdfFiles = []; // Mảng chứa { name, buffer } của 1 hoặc nhiều file
    let isExtracting = false;
    let hasData = false; 

    const LOADING_SKELETON_HTML = Array(3).fill(`
        <tr>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-20"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-20"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-32"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-20"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-48"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-16 mx-auto"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-16 mx-auto"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-48"></div></td>
            <td class="px-4 py-4 border-b border-slate-100"><div class="h-4 bg-slate-100 skeleton-cell w-8 mx-auto"></div></td>
        </tr>
    `).join('');

    // --- DANH MỤC ĐIỀU HƯỚNG ---
    els.navExtractor.addEventListener('click', () => switchTab('extractor'));
    els.navReports.addEventListener('click', () => switchTab('reports'));

    function switchTab(tabName) {
        if (tabName === 'extractor') {
            els.navExtractor.classList.add('active', 'border-white', 'text-white');
            els.navExtractor.classList.remove('border-transparent');
            els.navReports.classList.remove('active', 'border-white', 'text-white');
            els.navReports.classList.add('border-transparent');
            
            els.tabExtractor.classList.remove('hidden');
            els.tabReports.classList.add('hidden');
        } else {
            els.navReports.classList.add('active', 'border-white', 'text-white');
            els.navReports.classList.remove('border-transparent');
            els.navExtractor.classList.remove('active', 'border-white', 'text-white');
            els.navExtractor.classList.add('border-transparent');
            
            els.tabReports.classList.remove('hidden');
            els.tabExtractor.classList.add('hidden');
            
            loadReportData('all'); // Tự động tải dữ liệu Báo cáo khi nhấn Tab
        }
    }


    // --- TẢI LÊN & KÉO THẢ ---
    els.dropZone.addEventListener('click', () => {
        if (!isExtracting) els.fileInput.click();
    });

    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.classList.add('border-primary', 'bg-primary/10');
    });

    els.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('border-primary', 'bg-primary/10');
    });

    els.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('border-primary', 'bg-primary/10');
        if (isExtracting) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) processSelectedFiles(files);
    });

    els.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) processSelectedFiles(e.target.files);
    });

    async function processSelectedFiles(files) {
        if (hasData) {
            const isConfirm = confirm("Dữ liệu hiện tại sẽ bị xóa. Bạn có chắc muốn tải lên mẻ tệp mới?");
            if (!isConfirm) return;
        }

        currentPdfFiles = [];
        let pdfCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type === "application/pdf") {
                const buffer = await readFileAsArrayBuffer(file);
                currentPdfFiles.push({ name: file.name, buffer: buffer });
                pdfCount++;
            }
        }

        if (pdfCount === 0) {
            showToast('error', "Không tìm thấy tệp PDF hợp lệ.");
            return;
        }

        els.fileNameDisplay.textContent = `Chuẩn bị xử lý mẻ ${pdfCount} tệp PDF`;
        els.fileInfoContainer.classList.remove('hidden');
        els.btnExtract.disabled = false;
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    // --- XỬ LÝ TRÍCH XUẤT ---
    els.btnExtract.addEventListener('click', async () => {
        if (currentPdfFiles.length === 0) return;

        const oldBodyHTML = els.dataBody.innerHTML;

        isExtracting = true;
        els.btnExtract.disabled = true;
        els.btnExtract.classList.add('opacity-80', 'cursor-wait');
        els.extractIcon.textContent = 'hourglass_empty';
        els.extractIcon.classList.add('animate-spin'); 
        
        els.btnExport.disabled = true;
        els.dataBody.innerHTML = LOADING_SKELETON_HTML;

        try {
            let allJsonResults = [];
            let successCount = 0;
            let errorCount = 0;

            // Chạy tuần tự từng file qua Web Worker của pdf.js
            for (let i = 0; i < currentPdfFiles.length; i++) {
                els.extractBtnText.textContent = `Đang xử lý ${i+1}/${currentPdfFiles.length}...`;
                try {
                    const jsonResult = await extractPOData(currentPdfFiles[i].buffer);
                    allJsonResults = allJsonResults.concat(jsonResult);
                    successCount++;
                } catch (err) {
                    console.error(`Lỗi trích xuất file ${currentPdfFiles[i].name}:`, err);
                    errorCount++;
                }
            }
            
            if (allJsonResults.length === 0) {
                throw new Error("Toàn bộ file đều thất bại (Hãy kiểm tra lại định dạng tệp PDF).");
            }
            
            // Xử lý thành công
            renderDataToTable(allJsonResults);
            hasData = true;
            els.btnExport.disabled = false;
            
            // LƯU TRỮ LỊCH SỬ NỀN (TỰ ĐỘNG)
            try {
                let totalQty = 0;
                allJsonResults.forEach(r => {
                    let q = parseFloat(String(r.quantity).replace(/[,.]/g, '')) || 0;
                    totalQty += q;
                });

                const todayStr = window.dbManager.getLocalDateString(new Date());
                await window.dbManager.saveSession({
                    id: Date.now(),
                    date: todayStr,
                    files: currentPdfFiles.map(f => f.name),
                    totalRows: allJsonResults.length,
                    totalQty: totalQty,
                    records: allJsonResults 
                });
            } catch(dbErr) {
                console.warn("Không thể lưu vào cơ sở dữ liệu nền", dbErr);
            }
            
            // Thông báo người dùng
            let msg = `✓ Trích xuất thành công ${successCount} tệp (${allJsonResults.length} dòng dữ liệu).`;
            if (errorCount > 0) msg += ` Cảnh báo: Có ${errorCount} tệp bị lỗi.`;
            showToast(errorCount > 0 ? 'error' : 'success', msg);
            
            if(els.rowCountBadge) {
                 els.rowCountBadge.textContent = `${allJsonResults.length} dòng`;
                 els.rowCountBadge.classList.remove('hidden');
            }

        } catch (error) {
            showToast('error', `✕ Lỗi hệ thống: ${error.message}`);
            els.dataBody.innerHTML = oldBodyHTML;
            els.btnExport.disabled = !hasData; 
        } finally {
            isExtracting = false;
            els.extractIcon.textContent = 'auto_awesome';
            els.extractIcon.classList.remove('animate-spin');
            els.extractBtnText.textContent = 'BẮT ĐẦU TRÍCH XUẤT';
            els.btnExtract.classList.remove('opacity-80', 'cursor-wait');
        }
    });

    // Hàm render JSON từ Parser vào DOM table hiện tại
    function renderDataToTable(dataArray) {
        els.dataBody.innerHTML = ""; 
        dataArray.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-row-index', index);
            tr.className = "po-row hover:bg-sky-50 transition-colors group border-b border-slate-100";

            tr.innerHTML = `
                <td data-field="poDate" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-slate-700 font-bold text-[10px] hover:bg-white">${row.poDate || 'Chưa rõ'}</td>
                <td data-field="orderNo" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-slate-700 font-bold text-[10px] hover:bg-white">${row.orderNo || 'Chưa rõ'}</td>
                <td data-field="deliveryDateToStore" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-slate-700 font-bold text-[10px] hover:bg-white">${row.deliveryDateToStore || 'Chưa rõ'}</td>
                <td data-field="deliveredTo" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-slate-700 font-semibold text-[10px] leading-relaxed hover:bg-white break-words" title="${row.deliveredTo || ''}">${row.deliveredTo || ''}</td>
                <td data-field="barcode" contenteditable="true" class="px-4 py-3 border-r border-slate-100 font-mono font-bold text-indigo-700 text-[11px] hover:bg-white">${row.barcode || ''}</td>
                <td data-field="skuName" contenteditable="true" class="px-4 py-3 border-r border-slate-100 font-bold text-slate-900 text-[11px] hover:bg-white">${row.skuName || ''}</td>
                <td data-field="quantity" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-center font-black text-slate-900 text-[11px] hover:bg-white">${row.quantity || '0'}</td>
                <td data-field="unit" contenteditable="true" class="px-4 py-3 border-r border-slate-100 text-center font-bold text-slate-500 text-[11px] hover:bg-white">${row.unit || ''}</td>
                <td data-field="note" contenteditable="true" class="px-4 py-3 text-emerald-700 font-medium text-[10px] hover:bg-white line-clamp-2" title="${row.note || ''}">${row.note || ''}</td>
                <td class="px-4 py-3 text-center">
                    <button class="text-red-400 hover:text-red-600 transition-colors" onclick="this.closest('tr').remove();" title="Xóa dòng này">
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                </td>
            `;
            els.dataBody.appendChild(tr);
        });
    }

    // --- LOGIC BÁO CÁO & LỊCH SỬ ---
    [els.kpiSessionsCard, els.kpiQtyCard, els.kpiRowsCard].forEach(card => {
        card.classList.add('cursor-pointer');
        card.addEventListener('click', () => {
            // Đặt lại tất cả các thẻ
            [els.kpiSessionsCard, els.kpiQtyCard, els.kpiRowsCard].forEach(c => c.classList.remove('ring-2', 'ring-primary'));
            // Làm nổi bật thẻ được nhấn
            card.classList.add('ring-2', 'ring-primary');
            // TODO: Triển khai logic lọc dữ liệu tại đây
        });
    });
    els.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Thay đổi trạng thái Nút đang hoạt động (Active)
            els.filterBtns.forEach(b => {
                b.classList.remove('active', 'bg-slate-100', 'text-slate-800');
                b.classList.add('text-slate-500', 'hover:bg-slate-50');
            });
            e.target.classList.add('active', 'bg-slate-100', 'text-slate-800');
            e.target.classList.remove('text-slate-500', 'hover:bg-slate-50');

            const filterType = e.target.getAttribute('data-filter');
            loadReportData(filterType);
        });
    });

    async function loadReportData(filterType) {
        if(!window.dbManager) return;
        try {
            const sessions = await window.dbManager.getSessions(filterType);
            
            let totalQty = 0;
            let totalRows = 0;
            
            els.historyBody.innerHTML = '';
            
            if (sessions.length === 0) {
                 els.historyBody.innerHTML = `<tr><td colspan="5" class="p-12 text-center"><div class="flex flex-col items-center gap-4"><span class="material-symbols-outlined text-6xl text-slate-300">history_toggle_off</span><h4 class="font-bold text-slate-600">Chưa có lịch sử bóc tách</h4><p class="text-sm text-slate-500 max-w-xs">Hãy qua tab 'Trích xuất PDF' để bắt đầu xử lý tệp và xem lại lịch sử tại đây.</p></div></td></tr>`;
            } else {
                sessions.forEach(s => {
                    totalQty += (s.totalQty || 0);
                    totalRows += (s.totalRows || 0);

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white border-b border-slate-100 transition-colors";
                    
                    const timeStr = new Date(s.id).toLocaleString('vi-VN');
                    const fileTooltip = s.files ? s.files.join('&#10;') : '';
                    const fileLen = s.files ? s.files.length : 0;
                    
                    tr.innerHTML = `
                        <td class="px-5 py-3 font-medium text-slate-800">${timeStr}</td>
                        <td class="px-5 py-3 text-slate-500 text-xs truncate max-w-[150px] cursor-help" title="${fileTooltip}">${fileLen} tệp</td>
                        <td class="px-5 py-3 font-mono font-bold text-slate-700 text-right">${s.totalRows}</td>
                        <td class="px-5 py-3 font-mono font-bold text-emerald-600 text-right">${s.totalQty.toLocaleString()}</td>
                        <td class="px-5 py-3 text-center">
                            <button data-id="${s.id}" class="btn-history-export px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-[11px] font-bold transition-colors shadow-sm inline-flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">download</span> Tải Excel
                            </button>
                        </td>
                    `;
                    els.historyBody.appendChild(tr);
                });
            }

            // Gắn số liệu KPI
            els.kpiSessions.textContent = sessions.length;
            els.kpiQty.textContent = totalQty.toLocaleString();
            els.kpiRows.textContent = totalRows.toLocaleString();

            // Lắng nghe nút Tải Excel trên dòng lịch sử
            document.querySelectorAll('.btn-history-export').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.currentTarget.getAttribute('data-id'));
                    const targetSession = sessions.find(x => x.id === id);
                    if(targetSession && targetSession.records) {
                        doExportExcel(targetSession.records, `LichSu_PO_${targetSession.date}.xlsx`);
                    } else {
                        showToast('error', 'Không tìm thấy dữ liệu chi tiết của mẻ này.');
                    }
                });
            });

        } catch(e) {
            console.error("Lỗi tải Báo cáo:", e);
        }
    }


    // --- CỐT LÕI XUẤT EXCEL ---
    // Xuất Excel trực tiếp từ lưới dữ liệu trên màn hình Trích xuất 
    els.btnExport.addEventListener('click', () => {
        if (!hasData) return;

        // Cập nhật lại allData từ DOM trước khi xuất
        document.querySelectorAll('.po-row').forEach((tr, index) => {
            const originalData = allData[index];
            allData[index] = {
                ...originalData,
                poDate: tr.querySelector('td[data-field="poDate"]').textContent.trim(),
                orderNo: tr.querySelector('td[data-field="orderNo"]').textContent.trim(),
                deliveryDateToStore: tr.querySelector('td[data-field="deliveryDateToStore"]').textContent.trim(),
                deliveredTo: tr.querySelector('td[data-field="deliveredTo"]').textContent.trim(),
                barcode: tr.querySelector('td[data-field="barcode"]').textContent.trim(),
                skuName: tr.querySelector('td[data-field="skuName"]').textContent.trim(),
                quantity: tr.querySelector('td[data-field="quantity"]').textContent.trim(),
                unit: tr.querySelector('td[data-field="unit"]').textContent.trim(),
                note: tr.querySelector('td[data-field="note"]').textContent.trim()
            };
        });

        doExportExcel(allData, `Trich_Xuat_PO_${currentPdfFiles.length}_Tep.xlsx`);
    });

    // Hàm xuất dữ liệu ra tệp Excel
    function doExportExcel(dataArray, filename) {
        const exportMap = dataArray.map(item => {
            // Chuyển đổi số lượng thành kiểu số
            let qty = parseFloat(String(item.quantity).replace(',', '.'));
            if(isNaN(qty)) qty = item.quantity;

            return {
                "Order Date": item.poDate,
                "Order No": item.orderNo,
                "Giao Trước Ngày": item.deliveryDateToStore,
                "Nơi Giao (Delivered To)": item.deliveredTo,
                "Barcode Mã vạch": item.barcode,
                "Tên Sku": item.skuName,
                "Order Quantity": qty,
                "Unit": item.unit,
                "Ghi Chú": item.note
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportMap);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "PO_Data");

        worksheet['!cols'] = [ 
            {wch: 15}, // Order No
            {wch: 15}, // Delivery Date
            {wch: 60}, // Delivered To
            {wch: 20}, // Barcode
            {wch: 60}, // Tên SKU
            {wch: 15}, // Số lượng
            {wch: 10}, // Unit
            {wch: 40}  // Note
        ];

        XLSX.writeFile(workbook, filename);
    }

    // --- REFRESH SCREEN ---
    els.btnRefresh.addEventListener('click', () => {
        if (hasData && !confirm("Mọi dữ liệu trích xuất trên màn hình sẽ bị xóa. Bạn có chắc không?")) return;
        
        hasData = false;
        currentPdfFiles = [];
        els.fileInput.value = "";
        
        // Reset giao diện màn hình Trích xuất
        els.fileInfoContainer.classList.add('hidden');
        els.fileNameDisplay.textContent = "";
        els.btnExtract.disabled = true;
        els.btnExport.disabled = true;
        els.dataBody.innerHTML = `
            <tr id="idle-state-row" class="h-full">
                <td class="p-20 text-center bg-slate-50/50" colspan="9">
                    <div class="flex flex-col items-center justify-center text-slate-400 gap-3">
                        <span class="material-symbols-outlined text-6xl opacity-30">inbox_customize</span>
                        <p class="text-[13px] font-semibold tracking-wide">Lưới dữ liệu trống. Chọn mẻ file để bắt đầu.</p>
                    </div>
                </td>
            </tr>
        `;
        if(els.rowCountBadge) els.rowCountBadge.classList.add('hidden');
    });

    // --- Utils: Toast Handler ---
    let errorTimer, successTimer;
    function showToast(type, message) {
        els.toastSuccess.classList.add('hidden');
        els.toastError.classList.add('hidden');

        if (type === 'error') {
            els.toastErrorMsg.textContent = message;
            els.toastError.classList.remove('hidden');
            clearTimeout(errorTimer);
            errorTimer = setTimeout(() => els.toastError.classList.add('hidden'), 5000);
        } else if (type === 'success') {
            els.toastSuccessMsg.textContent = message;
            els.toastSuccess.classList.remove('hidden');
            clearTimeout(successTimer);
            successTimer = setTimeout(() => els.toastSuccess.classList.add('hidden'), 5000);
        }
    }
});
