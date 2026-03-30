
/**
 * filesystem_db.js
 * Quản lý lưu trữ và truy xuất lịch sử bóc tách PO.
 * Sử dụng Origin Private File System (OPFS) để lưu trữ tự động trong nền,
 * không bị mất khi xóa lịch sử web thông thường (cache), và không cần chọn file thủ công.
 */

const DB_FILE_NAME = 'vitadairy_po_history.json';

// Lấy file handle từ OPFS (Lưu trữ ẩn trong trình duyệt, bền vững hơn IndexedDB)
async function getOPFSFileHandle() {
    try {
        const root = await navigator.storage.getDirectory();
        return await root.getFileHandle(DB_FILE_NAME, { create: true });
    } catch (error) {
        console.error('Lỗi truy cập OPFS:', error);
        throw new Error('Không thể truy cập hệ thống lưu trữ nội bộ.');
    }
}

// Đọc toàn bộ dữ liệu từ OPFS
async function readDatabase() {
    try {
        const fileHandle = await getOPFSFileHandle();
        const file = await fileHandle.getFile();
        const content = await file.text();
        if (!content) return [];
        return JSON.parse(content);
    } catch (error) {
        console.error('Lỗi đọc dữ liệu nền:', error);
        return [];
    }
}

// Ghi toàn bộ dữ liệu vào OPFS
async function writeDatabase(data) {
    try {
        const fileHandle = await getOPFSFileHandle();
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        
        // Cố gắng yêu cầu trình duyệt giữ lại dữ liệu (Persistent Storage)
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Dữ liệu đã được yêu cầu lưu trữ bền vững: ${isPersisted}`);
        }
    } catch (error) {
        console.error('Lỗi ghi dữ liệu nền:', error);
    }
}

// Lưu một phiên bóc tách mới
async function saveSession(sessionData) {
    const allSessions = await readDatabase();
    allSessions.push(sessionData);
    await writeDatabase(allSessions);
}

// Lấy các phiên bóc tách với bộ lọc
async function getSessions(filterType = 'all', customStart = null, customEnd = null) {
    const allSessions = await readDatabase();
    const todayStr = getLocalDateString(new Date());

    let filtered = allSessions;

    if (filterType === 'today') {
        filtered = allSessions.filter(s => s.date === todayStr);
    } else if (filterType === 'month') {
        const currentMonth = todayStr.substring(0, 7); // YYYY-MM
        filtered = allSessions.filter(s => s.date.startsWith(currentMonth));
    } else if (filterType === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weekAgoStr = getLocalDateString(oneWeekAgo);
        filtered = allSessions.filter(s => s.date >= weekAgoStr && s.date <= todayStr);
    } else if (filterType === 'custom' && customStart && customEnd) {
        filtered = allSessions.filter(s => s.date >= customStart && s.date <= customEnd);
    }

    // Trả về dữ liệu mới nhất xếp trước
    return filtered.sort((a, b) => b.id - a.id);
}

// Hàm định dạng ngày địa phương 'YYYY-MM-DD'
function getLocalDateString(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Xuất ra đối tượng window để app.js sử dụng
window.dbManager = {
    saveSession,
    getSessions,
    getLocalDateString
};
