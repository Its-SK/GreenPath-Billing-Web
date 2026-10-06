const SUPABASE_URL = "https://pceglqkfvjwayhcuffkx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjZWdscWtmdmp3YXloY3VmZmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODA1NDMsImV4cCI6MjEwNjQ1NjU0M30.94PMzQ3j10LQUVDuPuwO7R3HFsSAmT4BO7eqN2nwVzc";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTests = [];
let nextBillNumber = "GPDL1000";
let clinicProfile = { name: "GREENPATH Diagnostic", address: "Lowada, Paschim Medinipur", contact: "Mobile: 9876543210 | Email: clinic@gmail.com" };

// ==========================================
// 2. AUTHENTICATION & REGISTRATION LOGIC
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            showApp();
        } else {
            document.getElementById('auth-screen').classList.add('active');
        }
    } catch (err) {
        console.error("Session check error:", err);
        document.getElementById('auth-screen').classList.add('active');
    }

    const today = new Date().toLocaleDateString('en-GB'); 
    document.getElementById('display-date').innerText = `Date: ${today.replace(/\//g, '-')}`;
});

// Normal Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    
    btn.innerText = "Connecting...";
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
            alert("Login Failed: " + error.message);
            btn.innerText = "Login securely";
        } else {
            showApp();
        }
    } catch (err) {
        alert("Network Error occurred.");
        btn.innerText = "Login securely";
        console.error(err);
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
});

async function showApp() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    await loadInitialData();
    await loadClinicSettings();
}
window.studioProfile = {}; 
window.clinicLogoBase64 = null; 

async function loadClinicSettings() {
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        
        // 1. Fetch Profile Data
        const { data: profData } = await db.storage.from('templates').download(`${user.id}/clinic_profile.json`);
        if (profData) {
            const text = await profData.text();
            window.studioProfile = JSON.parse(text);
        }
        
        // 2. Fetch Logo and convert to Base64 (Required for jsPDF)
        const { data: logoData } = await db.storage.from('templates').download(`${user.id}/clinic_logo.png`);
        if (logoData) {
            const reader = new FileReader();
            reader.onloadend = () => { window.clinicLogoBase64 = reader.result; };
            reader.readAsDataURL(logoData);
        }
    } catch(e) { console.error("Error loading clinic settings:", e); }
}

// --- NEW REGISTRATION LOGIC ---
window.openRegisterModal = () => {
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('register-card').style.display = 'block';
};

window.closeRegisterModal = () => {
    document.getElementById('register-card').style.display = 'none';
    document.getElementById('login-card').style.display = 'block';
};

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('reg-submit-btn');
    
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const cName = document.getElementById('reg-name').value.trim();
    const cAddress = document.getElementById('reg-address').value.trim();
    const cPhone = document.getElementById('reg-phone').value.trim();
    const cInvEmail = document.getElementById('reg-inv-email').value.trim();
    const logoFile = document.getElementById('reg-logo').files[0];
    
    btn.innerText = "Generating Workspace...";
    btn.disabled = true;

    try {
        // 1. Register User in Supabase Auth
        const { data: authData, error: authError } = await db.auth.signUp({ email, password });
        if (authError) throw new Error(authError.message);
        if (!authData.user) throw new Error("Failed to register. Email may already exist.");
        
        const newUserId = authData.user.id;

        // 2. Build Profile JSON
        const profileData = {
            clinic_name: cName,
            address: cAddress,
            phone: cPhone,
            email: cInvEmail
        };

        // 3. Upload Profile JSON to Cloud Storage
        const profileBlob = new Blob([JSON.stringify(profileData)], { type: 'application/json' });
        await db.storage.from('templates').upload(`${newUserId}/clinic_profile.json`, profileBlob, { upsert: true });

        // 4. Upload Logo (If Selected)
        if (logoFile) {
            await db.storage.from('templates').upload(`${newUserId}/clinic_logo.png`, logoFile, { upsert: true });
        }

        // 5. Instantly login after registration
        const { error: loginErr } = await db.auth.signInWithPassword({ email, password });
        if (loginErr) {
            alert("Registration successful, but auto-login failed. Please log in manually.");
            closeRegisterModal();
        } else {
            alert("Registration & Workspace Generation Successful!");
            closeRegisterModal();
            showApp();
        }
    } catch (err) {
        alert("Registration Failed:\n" + err.message);
    } finally {
        btn.innerText = "Register & Setup Workspace";
        btn.disabled = false;
    }
});
// ==========================================
// 3. NAVIGATION LOGIC
// ==========================================
const navButtons = document.querySelectorAll('.nav-btn[data-target]');
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        navButtons.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        const targetId = btn.dataset.target;
        const targetView = document.getElementById(`${targetId}-view`);
        if(targetView) targetView.classList.add('active');

        // Refresh data when specific tabs are opened
        if(targetId === 'manage-tests') loadManageTests();
        if(targetId === 'manage-doctors') loadManageDoctors();
        if(targetId === 'manage-agents') loadManageAgents();
        if(targetId === 'history') loadHistory();
        if(targetId === 'profile') loadProfile(); // <--- ADD THIS LINE
    });
});

// ==========================================
// DASHBOARD LOGIC (AUTOCOMPLETE & BILL NO)
// ==========================================
async function loadInitialData() {
    try {
        const { data: tests } = await db.from('tests').select('test_name, amount');
        if (tests) {
            const testList = document.getElementById('test-list');
            testList.innerHTML = '';
            tests.forEach(t => {
                const option = document.createElement('option');
                option.value = t.test_name;
                option.dataset.price = t.amount; 
                testList.appendChild(option);
            });
        }

        const { data: doctors } = await db.from('doctors').select('doctor_name');
        if (doctors) {
            const docList = document.getElementById('doctor-list');
            docList.innerHTML = '';
            doctors.forEach(d => docList.appendChild(new Option(d.doctor_name)));
        }

        const { data: agents } = await db.from('agents').select('agent_name');
        if (agents) {
            const agentList = document.getElementById('agent-list');
            agentList.innerHTML = '';
            agents.forEach(a => agentList.appendChild(new Option(a.agent_name)));
        }
        await fetchNextBillNumber();
    } catch (err) { console.error("Error loading initial data:", err); }
}

document.getElementById('test-name').addEventListener('input', (e) => {
    const selectedTest = e.target.value;
    const options = document.getElementById('test-list').options;
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === selectedTest) {
            document.getElementById('test-amount').value = options[i].dataset.price;
            break;
        }
    }
});

async function fetchNextBillNumber() {
    const { data, error } = await db.from('bills').select('bill_number');
    let maxNum = 0;
    if (data) {
        data.forEach(bill => {
            if (bill.bill_number) {
                const numPart = parseInt(bill.bill_number.replace(/\D/g, ''));
                if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
            }
        });
    }
    const nextNum = maxNum === 0 ? 1000 : maxNum + 1;
    nextBillNumber = `GPDL${nextNum.toString().padStart(4, '0')}`;
    document.getElementById('display-bill-no').innerText = `Next Bill: ${nextBillNumber}`;
}

document.getElementById('add-test-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('test-name');
    const amountInput = document.getElementById('test-amount');
    const name = nameInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (!name || isNaN(amount)) { alert("Please enter a valid test name and amount."); return; }
    if (currentTests.length >= 10) { alert("Maximum 10 tests allowed."); return; }

    currentTests.push({ name, amount });
    nameInput.value = ''; amountInput.value = ''; nameInput.focus();
    updateUI();
});

window.removeTest = function(index) {
    currentTests.splice(index, 1);
    updateUI();
};

document.getElementById('bill-advance').addEventListener('input', updateUI);
document.getElementById('bill-discount').addEventListener('input', updateUI);

function updateUI() {
    const listEl = document.getElementById('selected-tests-list');
    listEl.innerHTML = '';
    let total = 0;
    
    currentTests.forEach((t, index) => {
        total += t.amount;
        const li = document.createElement('li');
        
        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `<i class="fa-solid fa-trash text-danger" style="cursor:pointer; margin-right:8px;" onclick="removeTest(${index})"></i> `;
        nameSpan.appendChild(document.createTextNode(t.name)); // Securely handles text

        const priceSpan = document.createElement('span');
        priceSpan.innerText = `₹${t.amount.toFixed(2)}`;

        li.appendChild(nameSpan);
        li.appendChild(priceSpan);
        listEl.appendChild(li);
    });

    const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
    const advance = parseFloat(document.getElementById('bill-advance').value) || 0;
    const net = total - discount;
    const due = net - advance;

    document.getElementById('display-total').innerText = `₹${total.toFixed(2)}`;
    document.getElementById('display-due').innerText = `₹${due.toFixed(2)}`;
}
// ==========================================
// MANAGE TESTS CRUD
// ==========================================
async function loadManageTests() {
    const tbody = document.querySelector('#db-test-table tbody');
    tbody.innerHTML = '<tr><td colspan="3">⏳ Loading...</td></tr>';
    const { data, error } = await db.from('tests').select('test_name, amount');
    if (data) {
        tbody.innerHTML = '';
        data.forEach(t => {
            tbody.innerHTML += `<tr>
                <td>${t.test_name}</td>
                <td>₹${t.amount.toFixed(2)}</td>
                <td>
                    <button class="btn-icon edit" onclick="dbEditTest('${t.test_name}', ${t.amount})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="dbDeleteTest('${t.test_name}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
    }
}
async function dbAddTest() {
    const name = document.getElementById('new-test-name').value.trim();
    const amount = parseFloat(document.getElementById('new-test-amt').value);
    if (!name || isNaN(amount)) return alert("Invalid inputs.");
    await db.from('tests').insert({ test_name: name, amount: amount });
    document.getElementById('new-test-name').value = '';
    document.getElementById('new-test-amt').value = '';
    loadManageTests(); loadInitialData();
}
window.dbDeleteTest = async function(name) {
    if(confirm(`Delete test '${name}'?`)) {
        await db.from('tests').delete().eq('test_name', name);
        loadManageTests(); loadInitialData();
    }
};


// ==========================================
// MANAGE DOCTORS CRUD
// ==========================================
async function loadManageDoctors() {
    const tbody = document.querySelector('#db-doctor-table tbody');
    tbody.innerHTML = '<tr><td colspan="2">⏳ Loading...</td></tr>';
    const { data } = await db.from('doctors').select('doctor_name');
    if (data) {
        tbody.innerHTML = '';
        data.forEach(d => {
            tbody.innerHTML += `<tr>
                <td>${d.doctor_name}</td>
                <td>
                    <button class="btn-icon edit" onclick="dbEditDoctor('${d.doctor_name}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="dbDeleteDoctor('${d.doctor_name}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
    }
}
async function dbAddDoctor() {
    const name = document.getElementById('new-doctor-name').value.trim();
    if (!name) return;
    await db.from('doctors').insert({ doctor_name: name });
    document.getElementById('new-doctor-name').value = '';
    loadManageDoctors(); loadInitialData();
}
window.dbDeleteDoctor = async function(name) {
    if(confirm(`Delete doctor '${name}'?`)) {
        await db.from('doctors').delete().eq('doctor_name', name);
        loadManageDoctors(); loadInitialData();
    }
};


// ==========================================
// MANAGE AGENTS CRUD
// ==========================================
async function loadManageAgents() {
    const tbody = document.querySelector('#db-agent-table tbody');
    tbody.innerHTML = '<tr><td colspan="2">⏳ Loading...</td></tr>';
    const { data } = await db.from('agents').select('agent_name');
    if (data) {
        tbody.innerHTML = '';
        data.forEach(a => {
            tbody.innerHTML += `<tr>
                <td>${a.agent_name}</td>
                <td>
                    <button class="btn-icon edit" onclick="dbEditAgent('${a.agent_name}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="dbDeleteAgent('${a.agent_name}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
    }
}
async function dbAddAgent() {
    const name = document.getElementById('new-agent-name').value.trim();
    if (!name) return;
    await db.from('agents').insert({ agent_name: name });
    document.getElementById('new-agent-name').value = '';
    loadManageAgents(); loadInitialData();
}
window.dbDeleteAgent = async function(name) {
    if(confirm(`Delete agent '${name}'?`)) {
        await db.from('agents').delete().eq('agent_name', name);
        loadManageAgents(); loadInitialData();
    }
};


// ==========================================
// FULL HISTORY ENGINE (Timeline, Filters, Context Menu)
// ==========================================
let allHistoryData = [];
let availableMonths = [];
let activeTimelineMonth = null;
let selectedBillForContext = null;
let selectedDueForContext = 0;

let advancedFilters = {
    from: '', to: '', doctor: '', agent: '', dueOnly: false
};

async function loadHistory() {
    const tbody = document.getElementById('history-tbody');
    const thead = document.getElementById('history-thead');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">⏳ Fetching records from Cloud...</td></tr>';
    
    try {
        const { data, error } = await db.from('bills').select('*').order('id', { ascending: false });
        if (error) throw error;
        
        allHistoryData = data || [];
        
        // 1. Setup Smart Timeline
        generateTimeline();
        
        // 2. Populate Filter Dropdowns
        populateFilterDropdowns();
        
        // 3. Render the Table
        renderHistoryTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:red; text-align:center;">❌ Error: ${err.message}</td></tr>`;
    }
}

function generateTimeline() {
    const timelineContainer = document.getElementById('history-timeline');
    timelineContainer.innerHTML = '';
    
    // Extract unique MM-YYYY from "DD-MM-YYYY" dates
    const monthsSet = new Set();
    allHistoryData.forEach(row => {
        if(row.date && row.date.length >= 10) {
            const parts = row.date.split('-');
            if(parts.length === 3) monthsSet.add(`${parts[1]}-${parts[2]}`); // MM-YYYY
        }
    });
    
    // Sort months descending
    availableMonths = Array.from(monthsSet).sort((a, b) => {
        const [m1, y1] = a.split('-'); const [m2, y2] = b.split('-');
        return new Date(y2, m2-1) - new Date(y1, m1-1);
    });

    if(availableMonths.length > 0 && !activeTimelineMonth) {
        activeTimelineMonth = availableMonths[0]; // Default to newest month
    }

    availableMonths.forEach(monthStr => {
        const btn = document.createElement('button');
        btn.className = `timeline-btn ${activeTimelineMonth === monthStr ? 'active' : ''}`;
        
        // Format MM-YYYY to MMM-YY (e.g. 10-2026 -> Oct-26)
        const [m, y] = monthStr.split('-');
        const dateObj = new Date(y, m - 1);
        btn.innerText = dateObj.toLocaleString('default', { month: 'short' }) + '-' + y.slice(2);
        
        btn.onclick = () => {
            activeTimelineMonth = monthStr;
            generateTimeline(); // Re-render buttons
            renderHistoryTable();
        };
        timelineContainer.appendChild(btn);
    });
}

function populateFilterDropdowns() {
    const docSelect = document.getElementById('filter-doctor');
    const agtSelect = document.getElementById('filter-agent');
    
    // Keep the "All" option, clear the rest
    docSelect.innerHTML = '<option value="">All Doctors</option>';
    agtSelect.innerHTML = '<option value="">All Agents</option>';
    
    const docs = [...new Set(allHistoryData.map(r => r.ref_by).filter(Boolean))].sort();
    const agents = [...new Set(allHistoryData.map(r => r.agent).filter(Boolean))].sort();
    
    docs.forEach(d => docSelect.appendChild(new Option(d, d)));
    agents.forEach(a => agtSelect.appendChild(new Option(a, a)));
}

function renderHistoryTable() {
    const thead = document.getElementById('history-thead');
    const tbody = document.getElementById('history-tbody');
    
    const searchVal = document.getElementById('history-search').value.trim().toLowerCase();
    
    // Apply Filters
    let filteredData = allHistoryData.filter(row => {
        // 1. Search Filter (Text anywhere)
        if (searchVal) {
            const rowStr = Object.values(row).join(' ').toLowerCase();
            if (!rowStr.includes(searchVal)) return false;
        } else {
            // 2. Timeline Filter (Only apply if no deep search/advanced filter is active)
            const hasAdvanced = advancedFilters.from || advancedFilters.to || advancedFilters.doctor || advancedFilters.agent || advancedFilters.dueOnly;
            if (!hasAdvanced && activeTimelineMonth && row.date) {
                if (!row.date.endsWith(activeTimelineMonth)) return false;
            }
        }
        
        // 3. Advanced Filters
        if (advancedFilters.dueOnly && (parseFloat(row.due_amount) || 0) <= 0) return false;
        if (advancedFilters.doctor && row.ref_by !== advancedFilters.doctor) return false;
        if (advancedFilters.agent && row.agent !== advancedFilters.agent) return false;
        
        if (advancedFilters.from || advancedFilters.to) {
            if(!row.date) return false;
            const [d, m, y] = row.date.split('-');
            const rowDate = new Date(`${y}-${m}-${d}`);
            if (advancedFilters.from && rowDate < new Date(advancedFilters.from)) return false;
            if (advancedFilters.to && rowDate > new Date(advancedFilters.to)) return false;
        }
        
        return true;
    });

    if (filteredData.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="text-align:center;">No records found.</td></tr>';
        return;
    }

    // Define Columns to Show (Excluding id, clinic_id, created_at)
    const columnsToShow = [
        { key: 'bill_number', label: 'Bill No' },
        { key: 'date', label: 'Date' },
        { key: 'patient_name', label: 'Patient Name' },
        { key: 'age', label: 'Age' },
        { key: 'gender', label: 'Gender' },
        { key: 'ref_by', label: 'Ref By' },
        { key: 'contact', label: 'Contact' },
        { key: 'total_amount', label: 'Total' },
        { key: 'due_amount', label: 'Due' },
        { key: 'tests', label: 'Tests' }
    ];

    // Render Headers
    thead.innerHTML = columnsToShow.map(c => `<th>${c.label}</th>`).join('');

    // Render Rows
    tbody.innerHTML = '';
    filteredData.forEach(row => {
        const dueAmt = parseFloat(row.due_amount) || 0;
        const isDue = dueAmt > 0;
        const tr = document.createElement('tr');
        if(isDue) tr.className = 'due-row';
        
        // Right Click Event
        tr.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            selectedBillForContext = row;
            selectedDueForContext = dueAmt;
            
            const menu = document.getElementById('historyContextMenu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        });
        
        tr.innerHTML = columnsToShow.map(col => {
            let val = row[col.key] || '';
            if(col.key === 'total_amount' || col.key === 'due_amount') val = `₹${parseFloat(val || 0).toFixed(2)}`;
            if(col.key === 'contact' && val.toString().endsWith('.0')) val = val.toString().slice(0, -2);
            return `<td>${val}</td>`;
        }).join('');
        
        tbody.appendChild(tr);
    });
}

// Search & Refresh Inputs
document.getElementById('history-search').addEventListener('input', renderHistoryTable);
window.refreshHistory = function() {
    document.getElementById('history-search').value = '';
    clearHistoryFilters();
    loadHistory(); // Re-fetches from cloud
};

// ==========================================
// ADVANCED FILTERS
// ==========================================
window.openFilterModal = () => document.getElementById('filter-modal').style.display = 'flex';
window.closeFilterModal = () => document.getElementById('filter-modal').style.display = 'none';

window.applyHistoryFilters = function() {
    advancedFilters.from = document.getElementById('filter-from').value;
    advancedFilters.to = document.getElementById('filter-to').value;
    advancedFilters.doctor = document.getElementById('filter-doctor').value;
    advancedFilters.agent = document.getElementById('filter-agent').value;
    advancedFilters.dueOnly = document.getElementById('filter-due-only').checked;
    closeFilterModal();
    renderHistoryTable();
};

window.clearHistoryFilters = function() {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-doctor').value = '';
    document.getElementById('filter-agent').value = '';
    document.getElementById('filter-due-only').checked = false;
    advancedFilters = { from: '', to: '', doctor: '', agent: '', dueOnly: false };
    closeFilterModal();
    renderHistoryTable();
};

// ==========================================
// EXCEL EXPORT (Using SheetJS)
// ==========================================
window.exportHistoryExcel = function() {
    if(allHistoryData.length === 0) return alert("No data to export.");
    
    // Clean data for Excel (Remove IDs)
    const exportData = allHistoryData.map(row => {
        const cleanRow = { ...row };
        delete cleanRow.id;
        delete cleanRow.clinic_id;
        delete cleanRow.created_at;
        return cleanRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bills");
    
    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `GreenPath_Backup_${todayStr}.xlsx`);
};

// ==========================================
// CONTEXT MENU & PAY DUE
// ==========================================
document.addEventListener('click', (e) => {
    const menu = document.getElementById('historyContextMenu');
    if (menu) menu.style.display = 'none';
});

// ==========================================
// EDIT BILL ENGINE (Right-Click Menu)
// ==========================================
let editBillTests = [];

window.closeEditBillModal = () => document.getElementById('edit-bill-modal').style.display = 'none';

// Parses the "Blood Sugar (150), CBC (300)" string back into a workable array
function parseTestsString(testsStr) {
    if(!testsStr) return [];
    return testsStr.split(", ").map(t => {
        const match = t.match(/(.*) \(([\d.]+)\)/);
        if(match) return { name: match[1].trim(), amount: parseFloat(match[2]) };
        return { name: t, amount: 0 };
    });
}

// --- PASTE THIS EXACTLY HERE ---

window.triggerEditBill = function() {
    if(!selectedBillForContext) return;
    
    // 1. Populate standard fields
    document.getElementById('eb-bill-no').innerText = selectedBillForContext.bill_number;
    document.getElementById('eb-pat-name').value = selectedBillForContext.patient_name || '';
    document.getElementById('eb-pat-age').value = selectedBillForContext.age || '';
    document.getElementById('eb-pat-gender').value = selectedBillForContext.gender || 'Male';
    document.getElementById('eb-pat-doctor').value = selectedBillForContext.ref_by || '';
    document.getElementById('eb-pat-agent').value = selectedBillForContext.agent || '';
    document.getElementById('eb-pat-address').value = selectedBillForContext.address || '';
    document.getElementById('eb-pat-contact').value = selectedBillForContext.contact || '';
    
    // 2. Populate money fields
    document.getElementById('eb-advance').value = selectedBillForContext.advanced_payment || 0;
    document.getElementById('eb-discount').value = selectedBillForContext.discount || 0;

    // 3. Parse existing tests and render list
    editBillTests = parseTestsString(selectedBillForContext.tests);
    ebUpdateTotals();

    // Show Modal
    document.getElementById('edit-bill-modal').style.display = 'flex';
};

// Auto-fill amount when test is selected in the Edit Modal
document.getElementById('eb-test-name').addEventListener('input', (e) => {
    const selectedTest = e.target.value;
    const options = document.getElementById('test-list').options;
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === selectedTest) {
            document.getElementById('eb-test-amount').value = options[i].dataset.price;
            break;
        }
    }
});

window.ebAddTest = function() {
    const nameInput = document.getElementById('eb-test-name');
    const amtInput = document.getElementById('eb-test-amount');
    const name = nameInput.value.trim();
    const amt = parseFloat(amtInput.value);
    
    if(!name || isNaN(amt)) return alert("Please enter a valid test name and amount.");
    
    editBillTests.push({ name, amount: amt });
    nameInput.value = ''; 
    amtInput.value = '';
    nameInput.focus();
    ebUpdateTotals();
};

window.ebRemoveTest = function(index) {
    editBillTests.splice(index, 1);
    ebUpdateTotals();
};

window.ebUpdateTotals = function() {
    const listEl = document.getElementById('eb-test-list');
    listEl.innerHTML = '';
    let total = 0;
    
    editBillTests.forEach((t, index) => {
        total += t.amount;
        listEl.innerHTML += `
            <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-color); font-size: 14px;">
                <span><i class="fa-solid fa-trash text-danger" style="cursor:pointer; margin-right:8px;" onclick="ebRemoveTest(${index})"></i> ${t.name}</span>
                <span>₹${t.amount.toFixed(2)}</span>
            </li>`;
    });

    const adv = parseFloat(document.getElementById('eb-advance').value) || 0;
    const disc = parseFloat(document.getElementById('eb-discount').value) || 0;
    const due = (total - disc) - adv;

    document.getElementById('eb-total').innerText = total.toFixed(2);
    document.getElementById('eb-due').innerText = Math.max(0, due).toFixed(2);
};

// --- END OF PASTED CODE ---

window.saveAndPrintEditedBill = async function() {
    if(editBillTests.length === 0) return alert("Bill must have at least one test.");

    // 1. Gather all updated data from the Edit form
    const patName = document.getElementById('eb-pat-name').value.trim();
    const patAge = document.getElementById('eb-pat-age').value.trim();
    const patGender = document.getElementById('eb-pat-gender').value;
    const patDoctor = document.getElementById('eb-pat-doctor').value.trim();
    const patAgent = document.getElementById('eb-pat-agent').value.trim();
    const patAddress = document.getElementById('eb-pat-address').value.trim();
    const patContact = document.getElementById('eb-pat-contact').value.trim();

    if (!patName || !patAge) return alert("Please enter Patient Name and Age.");

    const testsString = editBillTests.map(t => `${t.name} (${t.amount})`).join(", ");
    const total = editBillTests.reduce((sum, t) => sum + t.amount, 0);
    const adv = parseFloat(document.getElementById('eb-advance').value) || 0;
    const disc = parseFloat(document.getElementById('eb-discount').value) || 0;
    const due = Math.max(0, (total - disc) - adv);

    const updatedData = {
        patient_name: patName,
        age: patAge,
        gender: patGender,
        ref_by: patDoctor,
        agent: patAgent,
        address: patAddress,
        contact: patContact,
        total_amount: total,
        advanced_payment: adv,
        discount: disc,
        due_amount: due,
        tests: testsString
    };

    try {
        // 2. SAVE: Update the Cloud Database FIRST
        const { error } = await db.from('bills').update(updatedData).eq('bill_number', selectedBillForContext.bill_number);
        if(error) throw error;
        
        // 3. PRINT: Generate the PDF using the original date and the Custom Layout
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const originalDate = selectedBillForContext.date; // Keeps the original billing date!

        const defaults = {
            name_text: clinicProfile.name, name_font: "Arial", name_size: 32, name_color: "#000000", name_weight: "bold", name_style: "normal", name_x: 330, name_y: 30,
            address_text: clinicProfile.address, address_font: "Arial", address_size: 13, address_color: "#000000", address_weight: "normal", address_style: "normal", address_x: 330, address_y: 70,
            contact_text: clinicProfile.contact, contact_font: "Arial", contact_size: 12, contact_color: "#000000", contact_weight: "normal", contact_style: "normal", contact_x: 330, contact_y: 100,
            logo_size: 100, logo_x: 100, logo_y: 20,
            line1_y: 150, line2_y: 270
        };
        
        const layout = { ...defaults, ...(window.studioProfile || {}) };
        const c2pX = (px) => (px / 750.0) * 210.0;
        const c2pY = (px) => (px / 1061.0) * 297.0;

        if (window.clinicLogoBase64) {
            try { doc.addImage(window.clinicLogoBase64, 'PNG', c2pX(layout.logo_x), c2pY(layout.logo_y), c2pX(layout.logo_size), c2pX(layout.logo_size)); } catch(e){}
        }

        ['name', 'address', 'contact'].forEach(key => {
            const text = layout[`${key}_text`];
            const isBold = layout[`${key}_weight`] === 'bold';
            const isItalic = layout[`${key}_style`] === 'italic';
            const style = isBold && isItalic ? 'bolditalic' : (isBold ? 'bold' : (isItalic ? 'italic' : 'normal'));
            const font = layout[`${key}_font`] === "Times New Roman" ? "times" : "helvetica";
            
            doc.setFont(font, style);
            doc.setFontSize(layout[`${key}_size`] * 0.75); 
            doc.setTextColor(layout[`${key}_color`] || "#000000");
            
            const finalY = c2pY(layout[`${key}_y`]) + (layout[`${key}_size`] * 0.25);
            doc.text(text, c2pX(layout[`${key}_x`]), finalY);
        });

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        const line1_mm = c2pY(layout.line1_y);
        const line2_mm = c2pY(layout.line2_y);
        doc.line(10, line1_mm, 200, line1_mm); 
        doc.line(10, line2_mm, 200, line2_mm); 
        doc.line(10, 248, 200, 248); 

        doc.setTextColor(0,0,0);
        doc.setFontSize(10);
        const ptStartY = line1_mm + 8;
        
        doc.setFont("helvetica", "bold"); doc.text("Bill No", 15, ptStartY); doc.setFont("helvetica", "normal"); doc.text(`:    ${selectedBillForContext.bill_number}`, 40, ptStartY);
        doc.setFont("helvetica", "bold"); doc.text("Billing Date", 130, ptStartY); doc.setFont("helvetica", "normal"); doc.text(`:    ${originalDate}`, 155, ptStartY);

        doc.setFont("helvetica", "bold"); doc.text("Name", 15, ptStartY + 8); doc.setFont("helvetica", "normal"); doc.text(`:    ${patName}`, 40, ptStartY + 8);
        doc.setFont("helvetica", "bold"); doc.text("Age", 130, ptStartY + 8); doc.setFont("helvetica", "normal"); doc.text(`:    ${patAge}`, 155, ptStartY + 8);

        doc.setFont("helvetica", "bold"); doc.text("Ref By", 15, ptStartY + 16); doc.setFont("helvetica", "normal"); doc.text(`:    ${patDoctor || "Self"}`, 40, ptStartY + 16);
        doc.setFont("helvetica", "bold"); doc.text("Sex", 130, ptStartY + 16); doc.setFont("helvetica", "normal"); doc.text(`:    ${patGender}`, 155, ptStartY + 16);

        const tStartY = line2_mm + 8;
        doc.setFont("helvetica", "bold"); doc.text("Test Name", 15, tStartY); doc.text("Amount (Rs.)", 195, tStartY, { align: "right" });
        doc.setFont("helvetica", "normal");
        
        let y = tStartY + 10;
        editBillTests.forEach(t => { doc.text(t.name, 15, y); doc.text(parseFloat(t.amount).toFixed(2), 195, y, { align: "right" }); y += 8; });

        doc.setFont("helvetica", "bold");
        doc.text("TOTAL:", 120, 255); doc.setFont("helvetica", "normal"); doc.text(total.toFixed(2), 195, 255, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.text("DISCOUNT:", 120, 262); doc.setFont("helvetica", "normal"); doc.text(disc.toFixed(2), 195, 262, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.text("ADVANCED:", 120, 269); doc.setFont("helvetica", "normal"); doc.text(adv.toFixed(2), 195, 269, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.text("DUE:", 120, 276); doc.setFont("helvetica", "normal"); doc.text(due.toFixed(2), 195, 276, { align: "right" });

        doc.setFontSize(9); doc.text("Report will not be delivered without this slip.", 10, 288); doc.text("Signature: ___________________", 195, 288, { align: "right" });

        // Generate and Open PDF
        const blob = doc.output('blob'); window.open(URL.createObjectURL(blob), '_blank'); 
        
        // 4. CLEANUP: Refresh Table and Close Modal
        closeEditBillModal();
        loadHistory(); 

    } catch(err) {
        alert("Failed to update bill: " + err.message);
    }
};

window.triggerPayDue = function() {
    if(!selectedBillForContext || selectedDueForContext <= 0) {
        alert("This bill has no pending dues.");
        return;
    }
    document.getElementById('pay-due-bill-no').innerText = selectedBillForContext.bill_number;
    document.getElementById('pay-due-current').innerText = `₹${selectedDueForContext.toFixed(2)}`;
    
    document.getElementById('pay-due-discount').value = 0;
    document.getElementById('pay-due-paid').value = selectedDueForContext.toFixed(2);
    
    updatePayDueRemaining();
    document.getElementById('pay-due-modal').style.display = 'flex';
};

window.closePayDueModal = () => document.getElementById('pay-due-modal').style.display = 'none';

function updatePayDueRemaining() {
    const disc = parseFloat(document.getElementById('pay-due-discount').value) || 0;
    const paid = parseFloat(document.getElementById('pay-due-paid').value) || 0;
    const remaining = selectedDueForContext - disc - paid;
    
    const lbl = document.getElementById('pay-due-remaining-lbl');
    if(remaining < 0) {
        lbl.innerText = `Warning: Overpayment! (₹${Math.abs(remaining).toFixed(2)} extra)`;
        lbl.style.color = "red";
    } else {
        lbl.innerText = `Remaining Due: ₹${remaining.toFixed(2)}`;
        lbl.style.color = "var(--accent-orange)";
    }
}

document.getElementById('pay-due-discount').addEventListener('input', () => {
    const disc = parseFloat(document.getElementById('pay-due-discount').value) || 0;
    const newPaid = Math.max(0, selectedDueForContext - disc);
    document.getElementById('pay-due-paid').value = newPaid.toFixed(2);
    updatePayDueRemaining();
});
document.getElementById('pay-due-paid').addEventListener('input', updatePayDueRemaining);

window.confirmDuePayment = async function() {
    const paid = parseFloat(document.getElementById('pay-due-paid').value) || 0;
    const disc = parseFloat(document.getElementById('pay-due-discount').value) || 0;
    
    if (paid < 0 || disc < 0) return alert("Amounts cannot be negative.");
    if (paid + disc > selectedDueForContext + 0.1) return alert("Total reduction cannot exceed current due.");

    try {
        const newAdv = parseFloat(selectedBillForContext.advanced_payment || 0) + paid;
        const newDisc = parseFloat(selectedBillForContext.discount || 0) + disc;
        const totalAmt = parseFloat(selectedBillForContext.total_amount || 0);
        
        const newDue = totalAmt - newDisc - newAdv;
        const duePaymentDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

        const { error } = await db.from('bills').update({
            advanced_payment: newAdv,
            discount: newDisc,
            due_amount: Math.max(0, newDue),
            due_payment_date: duePaymentDate
        }).eq('bill_number', selectedBillForContext.bill_number);

        if (error) throw error;
        
        alert("Payment Updated Successfully!");
        closePayDueModal();
        loadHistory(); // Re-fetch all data to show update
    } catch (err) {
        alert("Error updating payment: " + err.message);
    }
};


// ==========================================
// PDF GENERATION
// ==========================================
// ==========================================
// 6. SMART IN-MEMORY PDF GENERATION & SAVE
// ==========================================
document.getElementById('print-invoice-btn').addEventListener('click', async () => {
    const patName = document.getElementById('pat-name').value.trim();
    const patAge = document.getElementById('pat-age').value.trim();
    const patGender = document.getElementById('pat-gender').value;

    if (!patName || !patAge) return alert("Please enter Patient Name and Age.");
    if (currentTests.length === 0) return alert("Please add at least one test.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const dateToday = document.getElementById('display-date').innerText.replace('Date: ', '');

    // Fallback defaults if no studio profile is saved yet
    const defaults = {
        name_text: clinicProfile.name, name_font: "Arial", name_size: 32, name_color: "#000000", name_weight: "bold", name_style: "normal", name_x: 330, name_y: 30,
        address_text: clinicProfile.address, address_font: "Arial", address_size: 13, address_color: "#000000", address_weight: "normal", address_style: "normal", address_x: 330, address_y: 70,
        contact_text: clinicProfile.contact, contact_font: "Arial", contact_size: 12, contact_color: "#000000", contact_weight: "normal", contact_style: "normal", contact_x: 330, contact_y: 100,
        logo_size: 100, logo_x: 100, logo_y: 20,
        line1_y: 150, line2_y: 270
    };
    
    // Merge dragged settings with defaults
    const layout = { ...defaults, ...(window.studioProfile || {}) };

    // Math conversions: Pixels (Canvas) to Millimeters (A4 PDF)
    const c2pX = (px) => (px / 750.0) * 210.0;
    const c2pY = (px) => (px / 1061.0) * 297.0;

    // 1. Draw Custom Logo
    if (window.clinicLogoBase64) {
        try { doc.addImage(window.clinicLogoBase64, 'PNG', c2pX(layout.logo_x), c2pY(layout.logo_y), c2pX(layout.logo_size), c2pX(layout.logo_size)); } catch(e){}
    }

    // 2. Draw Custom Styled Text (Name, Address, Contact)
    ['name', 'address', 'contact'].forEach(key => {
        const text = layout[`${key}_text`];
        const isBold = layout[`${key}_weight`] === 'bold';
        const isItalic = layout[`${key}_style`] === 'italic';
        const style = isBold && isItalic ? 'bolditalic' : (isBold ? 'bold' : (isItalic ? 'italic' : 'normal'));
        const font = layout[`${key}_font`] === "Times New Roman" ? "times" : "helvetica";
        
        doc.setFont(font, style);
        doc.setFontSize(layout[`${key}_size`] * 0.75); // Convert px to pt
        doc.setTextColor(layout[`${key}_color`] || "#000000");
        
        // Offset Y slightly because jsPDF draws from the text baseline, not the top
        const finalY = c2pY(layout[`${key}_y`]) + (layout[`${key}_size`] * 0.25);
        doc.text(text, c2pX(layout[`${key}_x`]), finalY);
    });

    // 3. Draw Dynamic Lines
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    const line1_mm = c2pY(layout.line1_y);
    const line2_mm = c2pY(layout.line2_y);
    doc.line(10, line1_mm, 200, line1_mm); 
    doc.line(10, line2_mm, 200, line2_mm); 
    doc.line(10, 248, 200, 248); // Fixed Totals Line

    // 4. Draw Patient Details (Positions automatically based on Draggable Line 1)
    doc.setTextColor(0,0,0);
    doc.setFontSize(10);
    const ptStartY = line1_mm + 8;
    
    doc.setFont("helvetica", "bold"); doc.text("Bill No", 15, ptStartY); doc.setFont("helvetica", "normal"); doc.text(`:    ${nextBillNumber}`, 40, ptStartY);
    doc.setFont("helvetica", "bold"); doc.text("Billing Date", 130, ptStartY); doc.setFont("helvetica", "normal"); doc.text(`:    ${dateToday}`, 155, ptStartY);

    doc.setFont("helvetica", "bold"); doc.text("Name", 15, ptStartY + 8); doc.setFont("helvetica", "normal"); doc.text(`:    ${patName}`, 40, ptStartY + 8);
    doc.setFont("helvetica", "bold"); doc.text("Age", 130, ptStartY + 8); doc.setFont("helvetica", "normal"); doc.text(`:    ${patAge}`, 155, ptStartY + 8);

    doc.setFont("helvetica", "bold"); doc.text("Ref By", 15, ptStartY + 16); doc.setFont("helvetica", "normal"); doc.text(`:    ${document.getElementById('pat-doctor').value || "Self"}`, 40, ptStartY + 16);
    doc.setFont("helvetica", "bold"); doc.text("Sex", 130, ptStartY + 16); doc.setFont("helvetica", "normal"); doc.text(`:    ${patGender}`, 155, ptStartY + 16);

    // 5. Draw Tests Grid (Positions automatically based on Draggable Line 2)
    const tStartY = line2_mm + 8;
    doc.setFont("helvetica", "bold"); doc.text("Test Name", 15, tStartY); doc.text("Amount (Rs.)", 195, tStartY, { align: "right" });
    doc.setFont("helvetica", "normal");
    
    let y = tStartY + 10;
    currentTests.forEach(t => { doc.text(t.name, 15, y); doc.text(parseFloat(t.amount).toFixed(2), 195, y, { align: "right" }); y += 8; });

    // 6. Draw Totals
    const total = currentTests.reduce((sum, t) => sum + t.amount, 0);
    const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
    const advance = parseFloat(document.getElementById('bill-advance').value) || 0;
    const due = (total - discount) - advance;

    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", 120, 255); doc.setFont("helvetica", "normal"); doc.text(total.toFixed(2), 195, 255, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.text("DISCOUNT:", 120, 262); doc.setFont("helvetica", "normal"); doc.text(discount.toFixed(2), 195, 262, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.text("ADVANCED:", 120, 269); doc.setFont("helvetica", "normal"); doc.text(advance.toFixed(2), 195, 269, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.text("DUE:", 120, 276); doc.setFont("helvetica", "normal"); doc.text(due.toFixed(2), 195, 276, { align: "right" });

    // 7. Draw Footer
    doc.setFontSize(9); doc.text("Report will not be delivered without this slip.", 10, 288); doc.text("Signature: ___________________", 195, 288, { align: "right" });

    // 8. Output PDF
    const blob = doc.output('blob'); window.open(URL.createObjectURL(blob), '_blank'); 
    saveBillToDatabase(total, discount, advance, due, dateToday);
});

async function saveBillToDatabase(total, discount, advance, due, dateToday) {
    const testsString = currentTests.map(t => `${t.name} (${t.amount})`).join(", ");
    const billData = {
        bill_number: nextBillNumber, date: dateToday, patient_name: document.getElementById('pat-name').value.trim(),
        age: document.getElementById('pat-age').value.trim(), gender: document.getElementById('pat-gender').value,
        ref_by: document.getElementById('pat-doctor').value.trim(), agent: document.getElementById('pat-agent').value.trim(),
        address: document.getElementById('pat-address').value.trim(), contact: document.getElementById('pat-contact').value.trim(),
        total_amount: total, discount: discount, advanced_payment: advance, due_amount: due, tests: testsString
    };

    // ... (inside saveBillToDatabase) ...
    try {
        const { error } = await db.from('bills').insert([billData]);
        
        if (error) {
            console.error("DB Sync Error:", error);
            alert("Failed to save bill to cloud database: " + error.message);
        } else {
            // Reset ALL form fields for the next patient
            document.getElementById('pat-name').value = '';
            document.getElementById('pat-age').value = '';
            document.getElementById('pat-contact').value = '';
            
            // ---> ADD THESE THREE LINES <---
            document.getElementById('pat-doctor').value = '';
            document.getElementById('pat-agent').value = '';
            document.getElementById('pat-address').value = '';
            
            document.getElementById('bill-advance').value = '0';
            document.getElementById('bill-discount').value = '0';
            
            currentTests = [];
            updateUI();
            await fetchNextBillNumber(); // Increment Bill ID
        }
    } catch (err) {
        console.error("Critical DB error:", err);
    }
}

// ==========================================
// PROFILE AND TEMPLATE LOGIC
// ==========================================
async function loadProfile() {
    try {
        const { data: { user } } = await db.auth.getUser();
        if (user) {
            document.getElementById('prof-id').innerText = user.id;
            document.getElementById('prof-login').innerText = user.email;

            // Fetch custom profile details from Supabase Storage
            const { data, error } = await db.storage.from('templates').download(`${user.id}/clinic_profile.json`);
            
            if (data) {
                const text = await data.text();
                const profileData = JSON.parse(text);
                
                document.getElementById('prof-name').innerText = profileData.clinic_name || "N/A";
                document.getElementById('prof-address').innerText = profileData.address || "N/A";
                document.getElementById('prof-phone').innerText = profileData.phone || "N/A";
                document.getElementById('prof-email').innerText = profileData.email || "N/A";
                
                // Update global variable for the PDF generator
                clinicProfile.name = profileData.clinic_name || "GREENPATH Diagnostic";
                clinicProfile.address = profileData.address || "Lowada, Paschim Medinipur";
                clinicProfile.contact = `Mobile: ${profileData.phone || ''} | Email: ${profileData.email || ''}`;
            } else {
                document.getElementById('prof-name').innerText = "N/A (Default Setup)";
                document.getElementById('prof-address').innerText = "N/A";
                document.getElementById('prof-phone').innerText = "N/A";
                document.getElementById('prof-email').innerText = "N/A";
            }
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

window.factoryResetLayout = async function() {
    if (!confirm("Are you sure you want to delete your custom layout?\n\nThis will factory reset your bill to the default design.")) return;
    
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        
        // Match the exact wipe logic from the Python app
        const filesToDelete = ["clinic_profile.json", "baked_bg.png", "clinic_logo.png", "baked_header.png"].map(f => `${user.id}/${f}`);
        
        const { error } = await db.storage.from('templates').remove(filesToDelete);
        if (error) throw error;
        
        alert("Layout has been factory reset!");
        loadProfile(); // Refresh the page visually
    } catch (err) {
        alert("Failed to reset layout: " + err.message);
    }
};

// ==========================================
// DRAG AND DROP WEB STUDIO ENGINE
// ==========================================
let studioProfile = {};
let currentEditKey = null;

window.openWebStudio = async function() {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('studio-screen').classList.add('active');
    
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        
        // Download current settings from Supabase
        const { data, error } = await db.storage.from('templates').download(`${user.id}/clinic_profile.json`);
        if (data) {
            const text = await data.text();
            studioProfile = JSON.parse(text);
        } else {
            studioProfile = {};
        }
    } catch(e) { console.error(e); }

    // Setup default fallback values
    const defaults = {
        name_text: "GREENPATH Diagnostic", name_font: "Arial", name_size: 32, name_color: "#000000", name_weight: "bold", name_style: "normal", name_x: 330, name_y: 30,
        address_text: "Lowada, Paschim Medinipur", address_font: "Arial", address_size: 13, address_color: "#000000", address_weight: "normal", address_style: "normal", address_x: 330, address_y: 70,
        contact_text: "Mobile: 9876543210 | Email: clinic@gmail.com", contact_font: "Arial", contact_size: 12, contact_color: "#000000", contact_weight: "normal", contact_style: "normal", contact_x: 330, contact_y: 100,
        logo_size: 100, logo_x: 100, logo_y: 20,
        line1_y: 150, line2_y: 270
    };
    studioProfile = { ...defaults, ...studioProfile };
    
    await renderStudioCanvas();
};

window.closeWebStudio = function() {
    document.getElementById('studio-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    loadProfile(); 
};

async function renderStudioCanvas() {
    const canvas = document.getElementById('studio-canvas');
    canvas.innerHTML = '';
    
    // Load Logo URL if exists
    let logoUrl = '';
    const { data: { user } } = await db.auth.getUser();
    if(user) {
        const { data } = await db.storage.from('templates').download(`${user.id}/clinic_logo.png`);
        if(data) logoUrl = URL.createObjectURL(data);
    }

    // 1. Map Text Elements
    ['name', 'address', 'contact'].forEach(key => {
        const el = document.createElement('div');
        el.className = 'drag-text';
        el.innerText = studioProfile[`${key}_text`] || "Edit Text";
        el.style.left = (studioProfile[`${key}_x`]) + 'px';
        el.style.top = (studioProfile[`${key}_y`]) + 'px';
        el.style.fontFamily = studioProfile[`${key}_font`];
        el.style.fontSize = studioProfile[`${key}_size`] + 'px';
        el.style.color = studioProfile[`${key}_color`];
        el.style.fontWeight = studioProfile[`${key}_weight`];
        el.style.fontStyle = studioProfile[`${key}_style`];
        el.dataset.key = key;
        makeDraggable(el);
        attachContextMenu(el);
        canvas.appendChild(el);
    });

    // 2. Map Lines
    ['line1', 'line2'].forEach(lKey => {
        const line = document.createElement('div');
        line.className = 'drag-line';
        line.style.top = (studioProfile[`${lKey}_y`]) + 'px';
        line.dataset.key = lKey;
        line.innerHTML = '<div></div>';
        makeDraggable(line, true); 
        canvas.appendChild(line);
    });

    // 3. Map Logo
    const logo = document.createElement('div');
    logo.className = 'logo-placeholder';
    logo.style.left = (studioProfile.logo_x) + 'px';
    logo.style.top = (studioProfile.logo_y) + 'px';
    logo.style.width = (studioProfile.logo_size) + 'px';
    logo.style.height = (studioProfile.logo_size) + 'px';
    logo.dataset.key = 'logo';
    if(logoUrl) {
        logo.style.backgroundImage = `url(${logoUrl})`;
    } else {
        logo.innerHTML = '<span style="color:#7f8c8d; font-size:12px; display:flex; align-items:center; justify-content:center; height:100%;">Dbl-Click Logo</span>';
    }
    logo.style.backgroundSize = 'contain';
    logo.style.backgroundRepeat = 'no-repeat';
    logo.style.backgroundPosition = 'center';
    
    // Double click to upload directly to Supabase Storage
    logo.ondblclick = () => {
        const input = document.getElementById('logo-upload-input');
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            logo.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
            logo.innerHTML = '';
            const { error } = await db.storage.from('templates').upload(`${user.id}/clinic_logo.png`, file, { upsert: true });
            if(error) alert("Logo upload failed: " + error.message);
        };
        input.click();
    };

    new ResizeObserver(() => { studioProfile.logo_size = parseInt(logo.style.width); }).observe(logo);
    makeDraggable(logo);
    canvas.appendChild(logo);

    // 4. Map Previews
    const patPreview = document.createElement('div');
    patPreview.id = 'pat-preview';
    patPreview.className = 'preview-text';
    patPreview.style.top = (studioProfile.line1_y + 20) + 'px';
    patPreview.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <div style="width:45%;"><strong>Bill No</strong> : 12345</div>
            <div style="width:45%;"><strong>Billing Date</strong> : 04-10-2026</div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <div style="width:45%;"><strong>Name</strong> : John Doe</div>
            <div style="width:45%;"><strong>Age</strong> : 42</div>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <div style="width:45%;"><strong>Ref By</strong> : Dr. Smith</div>
            <div style="width:45%;"><strong>Sex</strong> : Male</div>
        </div>
    `;
    canvas.appendChild(patPreview);

    const testPreview = document.createElement('div');
    testPreview.id = 'test-preview';
    testPreview.className = 'preview-text';
    testPreview.style.top = (studioProfile.line2_y + 20) + 'px';
    testPreview.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-weight:bold;">
            <span>Test Name</span><span>Amount (Rs.)</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>Blood Sugar Fasting</span><span>150.00</span>
        </div>
    `;
    canvas.appendChild(testPreview);

    const footer = document.createElement('div');
    footer.className = 'fixed-footer';
    footer.innerHTML = `
        <div style="width: 100%; height: 2px; background: black; margin-bottom: 20px;"></div>
        <div style="display: flex; justify-content: flex-end;">
            <div style="width: 250px; font-size: 15px; font-family: Arial; font-weight: bold; line-height: 1.8;">
                <div style="display:flex; justify-content:space-between;"><span>TOTAL:</span><span style="font-weight:normal">0.00</span></div>
                <div style="display:flex; justify-content:space-between;"><span>DISCOUNT:</span><span style="font-weight:normal">0.00</span></div>
                <div style="display:flex; justify-content:space-between;"><span>ADVANCED:</span><span style="font-weight:normal">0.00</span></div>
                <div style="display:flex; justify-content:space-between;"><span>DUE:</span><span style="font-weight:normal">0.00</span></div>
            </div>
        </div>
        <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; justify-content: space-between; font-size: 13px; font-family: Arial;">
            <span>Report will not be delivered without this slip.</span>
            <span>Signature: ___________________</span>
        </div>
    `;
    canvas.appendChild(footer);
}

// Mouse dragging physics
function makeDraggable(el, isLine = false) {
    let isDown = false, startX, startY, origX, origY;
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        isDown = true;
        startX = e.clientX; startY = e.clientY;
        origX = parseInt(el.style.left || 0); origY = parseInt(el.style.top || 0);
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        if (!isLine) el.style.left = (origX + (e.clientX - startX)) + 'px';
        el.style.top = (origY + (e.clientY - startY)) + 'px';

        if(el.dataset.key === 'line1') document.getElementById('pat-preview').style.top = (parseInt(el.style.top) + 20) + 'px';
        if(el.dataset.key === 'line2') document.getElementById('test-preview').style.top = (parseInt(el.style.top) + 20) + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (isDown) {
            isDown = false;
            if(!isLine) studioProfile[`${el.dataset.key}_x`] = parseInt(el.style.left);
            studioProfile[`${el.dataset.key}_y`] = parseInt(el.style.top);
        }
    });
}

function attachContextMenu(el) {
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentEditKey = el.dataset.key;
        
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        
        document.getElementById('cmText').value = studioProfile[`${currentEditKey}_text`];
        document.getElementById('cmFont').value = studioProfile[`${currentEditKey}_font`];
        document.getElementById('cmSize').value = studioProfile[`${currentEditKey}_size`];
        document.getElementById('cmColor').value = studioProfile[`${currentEditKey}_color`];
        
        document.getElementById('cmBold').className = studioProfile[`${currentEditKey}_weight`] === 'bold' ? 'btn-style active' : 'btn-style';
        document.getElementById('cmItalic').className = studioProfile[`${currentEditKey}_style`] === 'italic' ? 'btn-style active' : 'btn-style';
    });
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('contextMenu');
    if (menu && !e.target.closest('#contextMenu') && !e.target.closest('.drag-text')) {
        menu.style.display = 'none';
    }
});

// Update Studio properties
window.updateStudioStyle = function() {
    if(!currentEditKey) return;
    studioProfile[`${currentEditKey}_text`] = document.getElementById('cmText').value;
    studioProfile[`${currentEditKey}_font`] = document.getElementById('cmFont').value;
    studioProfile[`${currentEditKey}_size`] = parseInt(document.getElementById('cmSize').value);
    studioProfile[`${currentEditKey}_color`] = document.getElementById('cmColor').value;
    renderStudioCanvas();
}

window.toggleStudioBold = function() {
    if(!currentEditKey) return;
    const isBold = studioProfile[`${currentEditKey}_weight`] === 'bold';
    studioProfile[`${currentEditKey}_weight`] = isBold ? 'normal' : 'bold';
    document.getElementById('cmBold').className = isBold ? 'btn-style' : 'btn-style active';
    renderStudioCanvas();
}

window.toggleStudioItalic = function() {
    if(!currentEditKey) return;
    const isItalic = studioProfile[`${currentEditKey}_style`] === 'italic';
    studioProfile[`${currentEditKey}_style`] = isItalic ? 'normal' : 'italic';
    document.getElementById('cmItalic').className = isItalic ? 'btn-style' : 'btn-style active';
    renderStudioCanvas();
}

// Upload configuration to Cloud
window.saveStudioLayout = async function() {
    const btn = document.getElementById('save-studio-btn');
    btn.innerText = "Syncing to Cloud...";
    
    try {
        const { data: { user } } = await db.auth.getUser();
        const jsonStr = JSON.stringify(studioProfile);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        
        const { error } = await db.storage.from('templates').upload(`${user.id}/clinic_profile.json`, blob, { upsert: true });
        if (error) throw error;
        
        clinicProfile.name = studioProfile.name_text;
        clinicProfile.address = studioProfile.address_text;
        clinicProfile.contact = studioProfile.contact_text;
        
        await loadClinicSettings();
        btn.innerText = "✅ Saved!";
        setTimeout(() => {
            btn.innerText = "💾 Save Layout";
            closeWebStudio();
        }, 1000);
    } catch (err) {
        alert("Error saving layout: " + err.message);
        btn.innerText = "💾 Save Layout";
    }
};


// ==========================================
// UNIFIED EDIT MODAL LOGIC (Tests, Doctors, Agents)
// ==========================================
let currentEditTarget = null;
let currentEditOldName = null;

window.closeEditModal = function() {
    document.getElementById('edit-modal').style.display = 'none';
};

window.dbEditTest = function(oldName, oldAmount) {
    currentEditTarget = 'tests';
    currentEditOldName = oldName;
    
    document.getElementById('edit-modal-title').innerText = "Edit Test Details";
    document.getElementById('edit-lbl-1').innerText = "Test Name:";
    document.getElementById('edit-val-1').value = oldName;
    
    document.getElementById('edit-lbl-2').style.display = "block";
    document.getElementById('edit-val-2').style.display = "block";
    document.getElementById('edit-val-2').value = oldAmount;
    
    document.getElementById('edit-modal').style.display = 'flex';
};

window.dbEditDoctor = function(oldName) {
    currentEditTarget = 'doctors';
    currentEditOldName = oldName;
    
    document.getElementById('edit-modal-title').innerText = "Edit Doctor Details";
    document.getElementById('edit-lbl-1').innerText = "Doctor Name:";
    document.getElementById('edit-val-1').value = oldName;
    
    document.getElementById('edit-lbl-2').style.display = "none";
    document.getElementById('edit-val-2').style.display = "none";
    
    document.getElementById('edit-modal').style.display = 'flex';
};

window.dbEditAgent = function(oldName) {
    currentEditTarget = 'agents';
    currentEditOldName = oldName;
    
    document.getElementById('edit-modal-title').innerText = "Edit Agent Details";
    document.getElementById('edit-lbl-1').innerText = "Agent Name:";
    document.getElementById('edit-val-1').value = oldName;
    
    document.getElementById('edit-lbl-2').style.display = "none";
    document.getElementById('edit-val-2').style.display = "none";
    
    document.getElementById('edit-modal').style.display = 'flex';
};

// Handle Saving the Edits to the Cloud
document.getElementById('save-edit-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-edit-btn');
    btn.innerText = "Saving...";
    
    const newName = document.getElementById('edit-val-1').value.trim();
    if (!newName) {
        alert("Name cannot be empty!");
        btn.innerText = "Save Changes";
        return;
    }

    try {
        if (currentEditTarget === 'tests') {
            const newAmt = parseFloat(document.getElementById('edit-val-2').value);
            if (isNaN(newAmt)) throw new Error("Invalid amount.");
            const { error } = await db.from('tests').update({ test_name: newName, amount: newAmt }).eq('test_name', currentEditOldName);
            if (error) throw error;
            loadManageTests();
        } 
        else if (currentEditTarget === 'doctors') {
            const { error } = await db.from('doctors').update({ doctor_name: newName }).eq('doctor_name', currentEditOldName);
            if (error) throw error;
            loadManageDoctors();
        } 
        else if (currentEditTarget === 'agents') {
            const { error } = await db.from('agents').update({ agent_name: newName }).eq('agent_name', currentEditOldName);
            if (error) throw error;
            loadManageAgents();
        }
        
        loadInitialData(); // Refreshes the autocomplete lists
        closeEditModal();
    } catch (err) {
        alert("Error saving data: " + err.message);
    }
    
    btn.innerText = "Save Changes";
});