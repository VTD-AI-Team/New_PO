// database.js
// Quản lý cơ sở dữ liệu IndexedDB cho việc lưu Offline các mẻ bóc tách PO

const DB_NAME = 'OfflinePOExtractorDB';
const DB_VERSION = 1;
const STORE_NAME = 'po_sessions';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // keyPath: id là thời điểm bóc tách (timestamp)
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('date', 'date', { unique: false }); // string 'YYYY-MM-DD'
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('IndexedDB Error:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Lưu 1 mẻ bóc tách thành công
async function saveSession(sessionData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // sessionData = { id: Date.now(), date: '2026-03-30', files: [], totalRows: 140, totalQty: 1000, data: [...] }
        const request = store.add(sessionData);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Lọc lịch sử bóc tách
// filterType = 'all' | 'today' | 'week' | 'month' | 'custom'
async function getSessions(filterType = 'all', customStart = null, customEnd = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => {
            const allSessions = event.target.result || [];
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

            // Trả về mới nhất xếp trước
            resolve(filtered.sort((a, b) => b.id - a.id));
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

// Cố ý thêm chức năng xóa (phòng trường hợp DB đầy)
async function deleteSession(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
}

// Hàm format ngày local 'YYYY-MM-DD'
function getLocalDateString(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Export biến toàn cục
window.dbManager = {
    saveSession,
    getSessions,
    deleteSession,
    getLocalDateString
};
