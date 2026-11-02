// ============================================
// Club Management System — Shared Frontend JS
// ============================================

const API_BASE = 'http://localhost:3000/api';

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Sidebar toggle (mobile)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// Theme Toggle
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}
initTheme(); // run immediately

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'light' ? 'dark' : 'light';
    
    if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    }
}

// Show a toast notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || '📢'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3200);
}

// Generic fetch wrapper
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (err) {
        showToast(err.message, 'error');
        throw err;
    }
}

// Format date for display (YYYY-MM-DD → readable)
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format currency
function formatCurrency(amount) {
    return `₹ ${parseFloat(amount).toFixed(2)}`;
}

// ============================================
// DASHBOARD
// ============================================

function checkAdminAuth() {
    if (!localStorage.getItem('adminToken')) {
        window.location.href = 'admin-login.html';
        throw new Error('Not authenticated');
    }
}

async function loadDashboard() {
    checkAdminAuth();
    try {
        const data = await apiFetch('/dashboard');
        document.getElementById('studentCount').textContent = data.students;
        document.getElementById('clubCount').textContent = data.clubs;
        document.getElementById('eventCount').textContent = data.events;
        document.getElementById('regCount').textContent = data.registrations;
    } catch {
        // Toast already shown
    }

    // Load recent students (last 5)
    try {
        const students = await apiFetch('/students');
        const tbody = document.getElementById('recentStudentsBody');
        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">👩‍🎓</div><p>No students yet</p></div></td></tr>`;
        } else {
            tbody.innerHTML = students.slice(-5).reverse().map(s => `
                <tr>
                    <td>${s.student_id}</td>
                    <td>${s.fname} ${s.lname}</td>
                    <td><span class="badge badge-purple">Year ${s.year}</span></td>
                    <td>${s.branch}</td>
                </tr>
            `).join('');
        }
    } catch { /* handled */ }

    // Load recent events (last 5)
    try {
        const events = await apiFetch('/events');
        const tbody = document.getElementById('recentEventsBody');
        if (events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🎉</div><p>No events yet</p></div></td></tr>`;
        } else {
            tbody.innerHTML = events.slice(-5).reverse().map(e => `
                <tr>
                    <td>${e.event_id}</td>
                    <td>${e.event_name}</td>
                    <td>${formatDate(e.event_date)}</td>
                    <td>${e.location}</td>
                    <td><span class="badge badge-green">${e.club_name}</span></td>
                </tr>
            `).join('');
        }
    } catch { /* handled */ }
}

// ============================================
// STUDENTS — CRUD
// ============================================

async function loadStudents() {
    try {
        const students = await apiFetch('/students');
        const tbody = document.getElementById('studentsTableBody');
        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👩‍🎓</div><p>No students found. Add one above!</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = students.map(s => `
            <tr>
                <td>${s.student_id}</td>
                <td>${s.fname}</td>
                <td>${s.lname}</td>
                <td><span class="badge badge-purple">Year ${s.year}</span></td>
                <td>${s.branch}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-edit btn-sm" onclick="editStudent(${s.student_id}, '${escapeStr(s.fname)}', '${escapeStr(s.lname)}', ${s.year}, '${escapeStr(s.branch)}')">✏️ Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteStudent(${s.student_id})">🗑️ Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch { /* handled */ }
}

async function handleStudentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editStudentId').value;
    const payload = {
        fname: document.getElementById('studentFname').value.trim(),
        lname: document.getElementById('studentLname').value.trim(),
        year: parseInt(document.getElementById('studentYear').value),
        branch: document.getElementById('studentBranch').value.trim(),
    };

    try {
        if (id) {
            await apiFetch(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('Student updated successfully');
            cancelStudentEdit();
        } else {
            await apiFetch('/students', { method: 'POST', body: JSON.stringify(payload) });
            showToast('Student added successfully');
        }
        document.getElementById('studentForm').reset();
        loadStudents();
    } catch { /* handled */ }
}

function editStudent(id, fname, lname, year, branch) {
    document.getElementById('editStudentId').value = id;
    document.getElementById('studentFname').value = fname;
    document.getElementById('studentLname').value = lname;
    document.getElementById('studentYear').value = year;
    document.getElementById('studentBranch').value = branch;
    document.getElementById('studentFormTitle').innerHTML = '<span class="icon">✏️</span> Edit Student';
    document.getElementById('studentSubmitBtn').textContent = '💾 Update Student';
    document.getElementById('studentCancelBtn').style.display = 'inline-flex';
    document.getElementById('studentForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelStudentEdit() {
    document.getElementById('editStudentId').value = '';
    document.getElementById('studentForm').reset();
    document.getElementById('studentFormTitle').innerHTML = '<span class="icon">➕</span> Add New Student';
    document.getElementById('studentSubmitBtn').textContent = '➕ Add Student';
    document.getElementById('studentCancelBtn').style.display = 'none';
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;
    try {
        await apiFetch(`/students/${id}`, { method: 'DELETE' });
        showToast('Student deleted');
        loadStudents();
    } catch { /* handled */ }
}

// ============================================
// CLUBS — CRUD
// ============================================

async function loadClubs() {
    checkAdminAuth();
    try {
        const clubs = await apiFetch('/clubs');
        const tbody = document.getElementById('clubsTableBody');
        if (clubs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">🏛️</div><p>No clubs found. Create one above!</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = clubs.map(c => `
            <tr>
                <td>${c.club_id}</td>
                <td>${c.club_name}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-edit btn-sm" onclick="editClub(${c.club_id}, '${escapeStr(c.club_name)}')">✏️ Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteClub(${c.club_id})">🗑️ Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch { /* handled */ }
}

async function handleClubSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editClubId').value;
    const payload = {
        club_name: document.getElementById('clubName').value.trim(),
    };

    try {
        if (id) {
            await apiFetch(`/clubs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('Club updated successfully');
            cancelClubEdit();
        } else {
            await apiFetch('/clubs', { method: 'POST', body: JSON.stringify(payload) });
            showToast('Club added successfully');
        }
        document.getElementById('clubForm').reset();
        loadClubs();
    } catch { /* handled */ }
}

function editClub(id, name) {
    document.getElementById('editClubId').value = id;
    document.getElementById('clubName').value = name;
    document.getElementById('clubFormTitle').innerHTML = '<span class="icon">✏️</span> Edit Club';
    document.getElementById('clubSubmitBtn').textContent = '💾 Update Club';
    document.getElementById('clubCancelBtn').style.display = 'inline-flex';
    document.getElementById('clubForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelClubEdit() {
    document.getElementById('editClubId').value = '';
    document.getElementById('clubForm').reset();
    document.getElementById('clubFormTitle').innerHTML = '<span class="icon">➕</span> Add New Club';
    document.getElementById('clubSubmitBtn').textContent = '➕ Add Club';
    document.getElementById('clubCancelBtn').style.display = 'none';
}

async function deleteClub(id) {
    if (!confirm('Are you sure you want to delete this club? All associated events will also be removed.')) return;
    try {
        await apiFetch(`/clubs/${id}`, { method: 'DELETE' });
        showToast('Club deleted');
        loadClubs();
    } catch { /* handled */ }
}

// ============================================
// EVENTS — CRUD
// ============================================

async function loadEvents() {
    checkAdminAuth();
    try {
        const events = await apiFetch('/events');
        const tbody = document.getElementById('eventsTableBody');
        if (events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🎉</div><p>No events found. Create one above!</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = events.map(e => `
            <tr>
                <td>${e.event_id}</td>
                <td>${e.event_name}</td>
                <td>${formatDate(e.event_date)}</td>
                <td>${e.location}</td>
                <td><span class="badge badge-green">${e.club_name}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-edit btn-sm" onclick="editEvent(${e.event_id}, '${escapeStr(e.event_name)}', '${e.event_date ? e.event_date.split('T')[0] : ''}', '${escapeStr(e.location)}', ${e.club_id})">✏️ Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteEvent(${e.event_id})">🗑️ Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch { /* handled */ }
}

async function handleEventSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editEventId').value;
    const payload = {
        event_name: document.getElementById('eventName').value.trim(),
        event_date: document.getElementById('eventDate').value,
        location: document.getElementById('eventLocation').value.trim(),
        club_id: parseInt(document.getElementById('eventClubId').value),
    };

    try {
        if (id) {
            await apiFetch(`/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('Event updated successfully');
            cancelEventEdit();
        } else {
            await apiFetch('/events', { method: 'POST', body: JSON.stringify(payload) });
            showToast('Event added successfully');
        }
        document.getElementById('eventForm').reset();
        loadEvents();
    } catch { /* handled */ }
}

function editEvent(id, name, date, location, clubId) {
    document.getElementById('editEventId').value = id;
    document.getElementById('eventName').value = name;
    document.getElementById('eventDate').value = date;
    document.getElementById('eventLocation').value = location;
    document.getElementById('eventClubId').value = clubId;
    document.getElementById('eventFormTitle').innerHTML = '<span class="icon">✏️</span> Edit Event';
    document.getElementById('eventSubmitBtn').textContent = '💾 Update Event';
    document.getElementById('eventCancelBtn').style.display = 'inline-flex';
    document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelEventEdit() {
    document.getElementById('editEventId').value = '';
    document.getElementById('eventForm').reset();
    document.getElementById('eventFormTitle').innerHTML = '<span class="icon">➕</span> Add New Event';
    document.getElementById('eventSubmitBtn').textContent = '➕ Add Event';
    document.getElementById('eventCancelBtn').style.display = 'none';
}

async function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
        await apiFetch(`/events/${id}`, { method: 'DELETE' });
        showToast('Event deleted');
        loadEvents();
    } catch { /* handled */ }
}

// ============================================
// REGISTRATIONS — CRUD
// ============================================

async function loadRegistrations() {
    try {
        const regs = await apiFetch('/registrations');
        const tbody = document.getElementById('registrationsTableBody');
        if (regs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📝</div><p>No registrations found. Create one above!</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = regs.map(r => `
            <tr>
                <td>${r.reg_id}</td>
                <td>${r.student_name}</td>
                <td>${r.event_name}</td>
                <td><span class="badge badge-blue">${r.club_name}</span></td>
                <td>${formatCurrency(r.entry_fee)}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-danger btn-sm" onclick="deleteRegistration(${r.reg_id})">🗑️ Cancel</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch { /* handled */ }
}

async function handleRegistrationSubmit(e) {
    e.preventDefault();
    const payload = {
        student_id: parseInt(document.getElementById('regStudentId').value),
        event_id: parseInt(document.getElementById('regEventId').value),
        entry_fee: parseFloat(document.getElementById('regEntryFee').value),
    };

    try {
        await apiFetch('/registrations', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Registration added successfully');
        document.getElementById('registrationForm').reset();
        loadRegistrations();
    } catch { /* handled */ }
}

async function deleteRegistration(id) {
    if (!confirm('Are you sure you want to cancel this registration?')) return;
    try {
        await apiFetch(`/registrations/${id}`, { method: 'DELETE' });
        showToast('Registration cancelled');
        loadRegistrations();
    } catch { /* handled */ }
}

// ============================================
// DROPDOWN LOADERS
// ============================================

async function loadClubsDropdown(selectId) {
    try {
        const clubs = await apiFetch('/clubs');
        const select = document.getElementById(selectId);
        // Keep the first default option
        const defaultOption = select.querySelector('option');
        select.innerHTML = '';
        select.appendChild(defaultOption);
        clubs.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.club_id;
            opt.textContent = c.club_name;
            select.appendChild(opt);
        });
    } catch { /* handled */ }
}

async function loadStudentsDropdown() {
    try {
        const students = await apiFetch('/students');
        const select = document.getElementById('regStudentId');
        const defaultOption = select.querySelector('option');
        select.innerHTML = '';
        select.appendChild(defaultOption);
        students.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.student_id;
            opt.textContent = `${s.fname} ${s.lname} (Year ${s.year})`;
            select.appendChild(opt);
        });
    } catch { /* handled */ }
}

async function loadEventsDropdown() {
    try {
        const events = await apiFetch('/events');
        const select = document.getElementById('regEventId');
        const defaultOption = select.querySelector('option');
        select.innerHTML = '';
        select.appendChild(defaultOption);
        events.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.event_id;
            opt.textContent = `${e.event_name} — ${formatDate(e.event_date)}`;
            select.appendChild(opt);
        });
    } catch { /* handled */ }
}

// ============================================
// AUTHENTICATION
// ============================================

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    try {
        const data = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ password }) });
        if (data.success) {
            localStorage.setItem('adminToken', data.token);
            window.location.href = 'admin.html';
        }
    } catch {
        // error already shown via toast
    }
}

function logoutAdmin() {
    localStorage.removeItem('adminToken');
    window.location.href = 'index.html';
}

// ============================================
// HELPERS
// ============================================

// Escape single quotes for inline onclick handlers
function escapeStr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
