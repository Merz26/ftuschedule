import { t, setLang, getLang } from './i18n.js';
import { getSessionToken, clearSessionToken, verifyTkbTuanAccess, extractClassesFromSchedule } from './portalService.js';
import { authorizeGoogle, checkAuth, logoutGoogle, syncWeekToGoogleCalendar } from './calendarService.js';
import { parseExcel, generateICS } from './excelParser.js';

// DOM Elements
const els = {
    title: document.getElementById('ui_title'),
    btnToggleLang: document.getElementById('btn_toggle_lang'),
    btnToggleTheme: document.getElementById('btn_toggle_theme'),
    btnToggleAccounts: document.getElementById('btn_toggle_accounts'),
    btnCollapseAccounts: document.getElementById('btn_collapse_accounts'),
    accountMenuCard: document.getElementById('account_menu_card'),
    accountMenuBody: document.getElementById('account_menu_body'),
    uiAccountMenu: document.getElementById('ui_account_menu'),
    
    // Google elements
    uiGoogleAccount: document.getElementById('ui_google_account'),
    googleUserEmail: document.getElementById('google_user_email'),
    googleUserName: document.getElementById('google_user_name'),
    badgeGoogle: document.getElementById('badge_google'),
    btnGoogleAuth: document.getElementById('btn_google_auth'),
    btnGoogleSwitch: document.getElementById('btn_google_switch'),
    btnGoogleLogout: document.getElementById('btn_google_logout'),

    // Portal elements
    uiPortalAccount: document.getElementById('ui_portal_account'),
    portalStudentName: document.getElementById('portal_student_name'),
    portalStudentDetails: document.getElementById('portal_student_details'),
    portalStudentIdVal: document.getElementById('portal_student_id_val'),
    portalStudentEmailVal: document.getElementById('portal_student_email_val'),
    badgePortal: document.getElementById('badge_portal'),
    btnDiagnostic: document.getElementById('btn_diagnostic'),
    btnPortalLogout: document.getElementById('btn_portal_logout'),
    
    // /tkb-tuan banner
    tkbVerificationBanner: document.getElementById('tkb_verification_banner'),
    tkbStatusIcon: document.getElementById('tkb_status_icon'),
    tkbStatusTitle: document.getElementById('tkb_status_title'),
    badgeTkb: document.getElementById('badge_tkb'),
    tkbStatusDesc: document.getElementById('tkb_status_desc'),

    // Credentials drawer
    uiPortalCredentials: document.getElementById('ui_portal_credentials'),
    btnToggleCredsView: document.getElementById('btn_toggle_creds_view'),
    credsFormBody: document.getElementById('creds_form_body'),
    inputStudentId: document.getElementById('input_student_id'),
    inputPassword: document.getElementById('input_password'),
    btnSaveCreds: document.getElementById('btn_save_creds'),

    // Week Sync controls
    uiSyncWeekTitle: document.getElementById('ui_sync_week_title'),
    uiLabelSelectWeek: document.getElementById('ui_label_select_week'),
    selectSyncWeek: document.getElementById('select_sync_week'),
    btnSyncWeekCalendar: document.getElementById('btn_sync_week_calendar'),
    syncResultBox: document.getElementById('sync_result_box'),
    syncResultStatus: document.getElementById('sync_result_status'),
    syncResultDetails: document.getElementById('sync_result_details'),

    // Today's classes
    uiTodayClasses: document.getElementById('ui_today_classes'),
    todayDateBadge: document.getElementById('today_date_badge'),
    todayAgenda: document.getElementById('today_agenda'),
    noClasses: document.getElementById('ui_no_classes'),

    // Manual tools
    uiManualTools: document.getElementById('ui_manual_tools'),
    dropZone: document.getElementById('drop_zone'),
    uiDropExcel: document.getElementById('ui_drop_excel'),
    btnExportSemester: document.getElementById('btn_export_semester'),
    btnExportMakeup: document.getElementById('btn_export_makeup'),
    versionDisplay: document.getElementById('version_display')
};

let isAccountsCollapsed = false;

async function init() {
    // Set version
    els.versionDisplay.textContent = `v${chrome.runtime.getManifest().version}`;

    // Load preferences & stored credentials
    chrome.storage.local.get(['theme', 'lang', 'studentId', 'password', 'googleAccount', 'studentProfile', 'portalVerification', 'cachedSchedule'], (res) => {
        if (res.theme === 'dark') document.body.className = 'theme-dark';
        if (res.lang) setLang(res.lang);
        
        // Populate credentials ONLY from storage (no hardcoding)
        els.inputStudentId.value = res.studentId || '';
        els.inputPassword.value = res.password || '';

        // Check if accounts collapsed state was stored
        if (res.accountsCollapsed) {
            isAccountsCollapsed = true;
            els.accountMenuBody.style.display = 'none';
            els.btnCollapseAccounts.textContent = 'Show ▼';
        }

        updateUIStrings();

        // Restore Google account view if stored
        if (res.googleAccount && res.googleAccount.email) {
            renderGoogleAccount(res.googleAccount);
        }

        // Restore Portal profile view if stored
        if (res.studentProfile) {
            renderPortalProfile(res.studentProfile);
        }

        // Restore verification banner if stored
        if (res.portalVerification) {
            renderTkbVerification(res.portalVerification);
        }

        // Restore schedule if cached
        if (res.cachedSchedule) {
            renderScheduleClasses(res.cachedSchedule);
            populateWeekSelector(res.cachedSchedule);
        }

        // If credentials are not present, open form to invite user to enter credentials
        if (!res.studentId || !res.password) {
            els.credsFormBody.style.display = 'block';
            els.btnToggleCredsView.textContent = 'Close';
            els.badgePortal.className = 'badge badge-neutral';
            els.badgePortal.textContent = 'Credentials Needed';
            renderTkbVerification({
                success: false,
                error: t('enter_credentials_msg')
            });
        } else {
            // Run diagnostic check using saved credentials
            runDiagnostic();
        }
    });

    // Check Auth State for Google
    const googleAccount = await checkAuth();
    renderGoogleAccount(googleAccount);

    // Setup Listeners
    els.btnToggleLang.addEventListener('click', toggleLang);
    els.btnToggleTheme.addEventListener('click', toggleTheme);
    els.btnToggleAccounts.addEventListener('click', toggleAccountsDrawer);
    els.btnCollapseAccounts.addEventListener('click', toggleAccountsDrawer);
    els.btnToggleCredsView.addEventListener('click', toggleCredsForm);
    
    els.btnGoogleAuth.addEventListener('click', doGoogleAuth);
    els.btnGoogleSwitch.addEventListener('click', doGoogleAuth);
    els.btnGoogleLogout.addEventListener('click', doGoogleLogout);

    els.btnDiagnostic.addEventListener('click', runDiagnostic);
    els.btnPortalLogout.addEventListener('click', doPortalLogout);
    els.btnSaveCreds.addEventListener('click', saveCreds);

    // Week Sync Listener
    if (els.btnSyncWeekCalendar) {
        els.btnSyncWeekCalendar.addEventListener('click', handleSyncWeek);
    }
    
    // Drop zone
    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.classList.add('dragover');
    });
    els.dropZone.addEventListener('dragleave', () => {
        els.dropZone.classList.remove('dragover');
    });
    els.dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleExcelDrop(file);
    });

    // ICS Buttons
    els.btnExportSemester.addEventListener('click', exportFullSemester);
    els.btnExportMakeup.addEventListener('click', exportMakeup);
}

function toggleAccountsDrawer() {
    isAccountsCollapsed = !isAccountsCollapsed;
    els.accountMenuBody.style.display = isAccountsCollapsed ? 'none' : 'block';
    els.btnCollapseAccounts.textContent = isAccountsCollapsed ? 'Show ▼' : 'Hide ▲';
    chrome.storage.local.set({ accountsCollapsed: isAccountsCollapsed });
}

function toggleCredsForm() {
    const isHidden = els.credsFormBody.style.display === 'none';
    els.credsFormBody.style.display = isHidden ? 'block' : 'none';
    els.btnToggleCredsView.textContent = isHidden ? 'Close' : 'Edit';
}

function updateUIStrings() {
    els.title.textContent = t('title');
    if (els.uiAccountMenu) els.uiAccountMenu.textContent = t('account_menu');
    if (els.uiGoogleAccount) els.uiGoogleAccount.textContent = t('google_account');
    if (els.uiPortalAccount) els.uiPortalAccount.textContent = t('portal_account');
    
    els.uiPortalCredentials.textContent = t('portal_credentials');
    els.uiTodayClasses.textContent = t('today_classes');
    els.uiManualTools.textContent = t('manual_tools');
    els.btnDiagnostic.textContent = t('verify_now');
    els.inputStudentId.placeholder = t('student_id');
    els.inputPassword.placeholder = t('password');
    els.btnSaveCreds.textContent = t('save');
    els.noClasses.textContent = t('no_classes');
    els.btnGoogleAuth.textContent = t('connect_google');
    els.btnGoogleSwitch.textContent = t('switch_account');
    els.btnGoogleLogout.textContent = t('disconnect');
    els.uiDropExcel.textContent = t('drop_excel');
    els.btnExportSemester.textContent = t('export_semester');
    els.btnExportMakeup.textContent = t('export_makeup');

    if (els.uiSyncWeekTitle) els.uiSyncWeekTitle.textContent = t('sync_week_title');
    if (els.uiLabelSelectWeek) els.uiLabelSelectWeek.textContent = t('label_select_week');
    if (els.btnSyncWeekCalendar) els.btnSyncWeekCalendar.textContent = t('btn_sync_week');
}

function toggleLang() {
    const newLang = getLang() === 'vi' ? 'en' : 'vi';
    setLang(newLang);
    chrome.storage.local.set({ lang: newLang });
    updateUIStrings();
}

function toggleTheme() {
    const isDark = document.body.className === 'theme-dark';
    document.body.className = isDark ? 'theme-light' : 'theme-dark';
    chrome.storage.local.set({ theme: isDark ? 'light' : 'dark' });
}

async function doGoogleAuth() {
    try {
        const account = await authorizeGoogle();
        renderGoogleAccount(account);
    } catch(e) {
        console.error('[Google Auth Error]', e);
        renderGoogleAccount(null);
    }
}

async function doGoogleLogout() {
    await logoutGoogle();
    renderGoogleAccount(null);
}

function renderGoogleAccount(account) {
    if (account && account.email) {
        els.badgeGoogle.className = 'badge badge-green';
        els.badgeGoogle.textContent = t('connected');
        els.googleUserEmail.textContent = account.email;
        els.googleUserEmail.style.color = 'var(--text-main)';
        els.googleUserName.textContent = account.name ? `Account: ${account.name}` : '';
        els.googleUserName.style.display = account.name ? 'block' : 'none';

        els.btnGoogleAuth.style.display = 'none';
        els.btnGoogleSwitch.style.display = 'inline-block';
        els.btnGoogleLogout.style.display = 'inline-block';
    } else {
        els.badgeGoogle.className = 'badge badge-amber';
        els.badgeGoogle.textContent = t('not_authorized');
        els.googleUserEmail.textContent = 'Not connected';
        els.googleUserEmail.style.color = 'var(--text-gray)';
        els.googleUserName.style.display = 'none';

        els.btnGoogleAuth.style.display = 'inline-block';
        els.btnGoogleSwitch.style.display = 'none';
        els.btnGoogleLogout.style.display = 'none';
    }
}

function renderPortalProfile(profile) {
    if (profile && profile.name) {
        els.portalStudentName.textContent = profile.name;
        els.portalStudentName.style.color = 'var(--text-main)';
        els.portalStudentDetails.style.display = 'block';
        els.portalStudentIdVal.textContent = `ID: ${profile.studentId || ''}`;
        els.portalStudentEmailVal.textContent = profile.email || `${profile.studentId}@ftu.edu.vn`;
        els.btnPortalLogout.style.display = 'inline-block';
    } else {
        els.portalStudentName.textContent = 'Not authenticated';
        els.portalStudentName.style.color = 'var(--text-gray)';
        els.portalStudentDetails.style.display = 'none';
        els.btnPortalLogout.style.display = 'none';
    }
}

function renderTkbVerification(verification) {
    if (verification && verification.success) {
        els.tkbVerificationBanner.className = 'tkb-verification-banner verified';
        els.tkbStatusIcon.textContent = '✅';
        els.badgeTkb.className = 'badge badge-green';
        els.badgeTkb.textContent = t('tkb_tuan_verified');
        els.tkbStatusDesc.innerHTML = `
            <strong>Connection Confirmed!</strong> Access to <code>/tkb-tuan</code> verified.<br>
            ${verification.semesterName || 'Học kỳ hiện tại'} &bull; ${verification.totalWeeks || 0} tuần &bull; ${verification.totalClasses || 0} buổi học
        `;
    } else {
        els.tkbVerificationBanner.className = 'tkb-verification-banner failed';
        els.tkbStatusIcon.textContent = '⚠️';
        els.badgeTkb.className = 'badge badge-red';
        els.badgeTkb.textContent = t('tkb_tuan_failed');
        els.tkbStatusDesc.textContent = verification?.error 
            ? `Connection not confirmed: ${verification.error}`
            : 'Connection requires successful access to /tkb-tuan schedule data.';
    }
}

function doPortalLogout() {
    clearSessionToken();
    chrome.storage.local.remove(['studentProfile', 'portalVerification', 'cachedSchedule'], () => {
        els.badgePortal.className = 'badge badge-red';
        els.badgePortal.textContent = t('session_expired');
        renderPortalProfile(null);
        renderTkbVerification({ success: false, error: 'User logged out' });
        els.todayAgenda.innerHTML = `<p id="ui_no_classes" class="text-sm text-gray">${t('no_classes')}</p>`;
    });
}

/**
 * Diagnostic login & verification:
 * Only indicates connection as SUCCESSFUL if the app can access /tkb-tuan.
 */
async function runDiagnostic() {
    els.btnDiagnostic.disabled = true;
    els.btnDiagnostic.textContent = 'Checking /tkb-tuan...';

    try {
        const studentId = els.inputStudentId.value.trim();
        const password = els.inputPassword.value.trim();
        
        if (!studentId || !password) {
            els.badgePortal.className = 'badge badge-neutral';
            els.badgePortal.textContent = 'Credentials Needed';
            renderPortalProfile(null);
            renderTkbVerification({
                success: false,
                error: t('enter_credentials_msg')
            });
            els.credsFormBody.style.display = 'block';
            els.btnToggleCredsView.textContent = 'Close';
            return;
        }

        chrome.storage.local.set({ studentId, password });

        const session = await getSessionToken();
        if (!session || !session.success || !session.token) {
            els.badgePortal.className = 'badge badge-red';
            els.badgePortal.textContent = t('session_expired');
            renderPortalProfile(null);
            renderTkbVerification({
                success: false,
                error: session?.error || 'Authentication failed'
            });
            return;
        }

        // Display authenticated student info
        if (session.profile) {
            renderPortalProfile(session.profile);
        }

        // CRITICAL: Now verify actual access to /tkb-tuan!
        const verification = await verifyTkbTuanAccess(session.token);

        if (verification && verification.success) {
            // Success ONLY when /tkb-tuan is accessible!
            els.badgePortal.className = 'badge badge-green';
            els.badgePortal.textContent = t('connected');
            renderTkbVerification(verification);

            if (verification.scheduleData) {
                renderScheduleClasses(verification.scheduleData);
                populateWeekSelector(verification.scheduleData);
            }
        } else {
            // If /tkb-tuan failed, mark connection as NOT successful
            els.badgePortal.className = 'badge badge-red';
            els.badgePortal.textContent = 'TKB Inaccessible';
            renderTkbVerification(verification);
        }
    } catch (err) {
        console.error('[runDiagnostic Error]', err);
        els.badgePortal.className = 'badge badge-red';
        els.badgePortal.textContent = 'Error';
        renderTkbVerification({
            success: false,
            error: err.message || 'Error communicating with portal'
        });
    } finally {
        els.btnDiagnostic.disabled = false;
        els.btnDiagnostic.textContent = t('verify_now');
    }
}

function saveCreds() {
    const studentId = els.inputStudentId.value.trim();
    const password = els.inputPassword.value.trim();
    
    if (!studentId || !password) {
        alert(t('enter_credentials_msg'));
        return;
    }

    chrome.storage.local.set({
        studentId,
        password
    }, () => {
        clearSessionToken();
        runDiagnostic();
    });
    
    const orig = els.btnSaveCreds.textContent;
    els.btnSaveCreds.textContent = "✓ Saved & Verifying";
    setTimeout(() => els.btnSaveCreds.textContent = orig, 1500);
}

function populateWeekSelector(scheduleData) {
    if (!els.selectSyncWeek || !scheduleData?.ds_tuan_tkb) return;
    window.currentScheduleData = scheduleData;
    const weeks = scheduleData.ds_tuan_tkb;
    els.selectSyncWeek.innerHTML = '';

    const today = new Date();
    // UTC+7 timestamp
    const todayVn = new Date(today.getTime() + (7 * 60 + today.getTimezoneOffset()) * 60000).getTime();

    let currentWeekIndex = -1;

    weeks.forEach((w, index) => {
        const opt = document.createElement('option');
        opt.value = String(index);

        let label = w.thong_tin_tuan || `Tuần ${index + 1} (${w.ngay_bat_dau} - ${w.ngay_ket_thuc})`;

        // Determine if today falls in this week
        if (w.ngay_bat_dau && w.ngay_ket_thuc) {
            const [d1, m1, y1] = w.ngay_bat_dau.split('/').map(Number);
            const [d2, m2, y2] = w.ngay_ket_thuc.split('/').map(Number);
            const startTime = new Date(y1, m1 - 1, d1, 0, 0, 0).getTime();
            const endTime = new Date(y2, m2 - 1, d2, 23, 59, 59).getTime();

            if (todayVn >= startTime && todayVn <= endTime) {
                currentWeekIndex = index;
                label = `⭐ ${label} (Tuần hiện tại)`;
            }
        }

        const classCount = w.ds_thoi_khoa_bieu ? w.ds_thoi_khoa_bieu.length : 0;
        opt.textContent = `${label} [${classCount} buổi]`;
        els.selectSyncWeek.appendChild(opt);
    });

    if (currentWeekIndex !== -1) {
        els.selectSyncWeek.value = String(currentWeekIndex);
    } else if (weeks.length > 0) {
        els.selectSyncWeek.value = "0";
    }
}

async function handleSyncWeek() {
    if (!els.btnSyncWeekCalendar) return;

    // 1. Verify Google authentication
    let googleAccount = await checkAuth();
    if (!googleAccount || !googleAccount.token) {
        try {
            googleAccount = await doGoogleAuth();
        } catch (e) {
            showSyncResult(false, '⚠️ Chưa kết nối Google Calendar', 'Vui lòng kết nối tài khoản Google trước khi đồng bộ.');
            return;
        }
    }

    if (!googleAccount || !googleAccount.token) {
        showSyncResult(false, '⚠️ Chưa kết nối Google Calendar', 'Vui lòng kết nối tài khoản Google trước khi đồng bộ.');
        return;
    }

    // 2. Verify schedule data is available
    const schedule = window.currentScheduleData;
    if (!schedule || !schedule.ds_tuan_tkb || schedule.ds_tuan_tkb.length === 0) {
        showSyncResult(false, '⚠️ Chưa có dữ liệu thời khóa biểu', 'Vui lòng nhấn "Kiểm tra /tkb-tuan" để tải thời khóa biểu tuần từ Cổng Đào Tạo trước.');
        return;
    }

    const weekIdx = parseInt(els.selectSyncWeek.value, 10);
    const selectedWeek = schedule.ds_tuan_tkb[weekIdx] || schedule.ds_tuan_tkb[0];

    if (!selectedWeek) {
        showSyncResult(false, '⚠️ Tuần không hợp lệ', 'Không tìm thấy dữ liệu cho tuần đã chọn.');
        return;
    }

    const origText = els.btnSyncWeekCalendar.textContent;
    els.btnSyncWeekCalendar.disabled = true;
    els.btnSyncWeekCalendar.textContent = '⏳ Đang đồng bộ vào nhãn "FTU Schedule"...';

    try {
        const result = await syncWeekToGoogleCalendar(googleAccount.token, selectedWeek);

        let detailsHtml = `
            &bull; Thêm mới vào Google Calendar: <strong>${result.insertedCount}</strong> buổi học<br>
            &bull; Ghi đè/cập nhật thông tin mới: <strong>${result.updatedCount}</strong> buổi học (đồng bộ phòng học/thông tin từ Cổng Đào Tạo)<br>
            &bull; Đã có sẵn & khớp hoàn toàn: <strong>${result.skippedCount}</strong> buổi học
        `;

        if (result.changes && result.changes.length > 0) {
            const updatedItems = result.changes.filter(c => c.type === 'updated');
            if (updatedItems.length > 0) {
                detailsHtml += `<div style="margin-top:6px; padding-top:4px; border-top:1px dashed rgba(0,0,0,0.15);"><strong style="color:var(--primary);">Chi tiết ghi đè thông tin:</strong><ul style="margin:2px 0 0 16px; padding:0;">`;
                updatedItems.forEach(u => {
                    detailsHtml += `<li><strong>${u.subject}</strong>: ${u.reason}</li>`;
                });
                detailsHtml += `</ul></div>`;
            }
        }

        showSyncResult(true, `✓ Đồng bộ thành công vào lịch <strong>"${result.calendarName}"</strong>!`, detailsHtml);
    } catch (err) {
        console.error('[handleSyncWeek Error]', err);
        showSyncResult(false, '✗ Đồng bộ thất bại', err.message || 'Lỗi khi giao tiếp với Google Calendar API');
    } finally {
        els.btnSyncWeekCalendar.disabled = false;
        els.btnSyncWeekCalendar.textContent = origText;
    }
}

function showSyncResult(isSuccess, title, detailsHtml) {
    if (!els.syncResultBox) return;
    els.syncResultBox.style.display = 'block';
    els.syncResultBox.className = isSuccess ? 'sync-result-box' : 'sync-result-box error';
    els.syncResultStatus.innerHTML = title;
    els.syncResultDetails.innerHTML = detailsHtml;
}

function renderScheduleClasses(scheduleData) {
    if (!scheduleData) return;
    
    const { classes, dateStr } = extractClassesFromSchedule(scheduleData, new Date());
    els.todayDateBadge.textContent = dateStr;

    if (!classes || classes.length === 0) {
        els.todayAgenda.innerHTML = `
            <p id="ui_no_classes" class="text-sm text-gray" style="margin:0;">
                No classes scheduled for today (${dateStr}) 🎉
            </p>
        `;
        return;
    }

    let html = '';
    classes.forEach(c => {
        const periodStart = Number(c.tiet_bat_dau) || 1;
        const periodsCount = Number(c.so_tiet) || 1;
        const periodEnd = periodStart + periodsCount - 1;
        
        // Approximate time
        const periodTimes = {
            1: '06:45', 2: '07:30', 3: '08:15',
            4: '09:15', 5: '10:00', 6: '10:45',
            7: '12:45', 8: '13:30', 9: '14:15',
            10: '15:15', 11: '16:00', 12: '16:45'
        };
        const periodEndTimes = {
            1: '07:30', 2: '08:15', 3: '09:00',
            4: '10:00', 5: '10:45', 6: '11:30',
            7: '13:30', 8: '14:15', 9: '15:00',
            10: '16:00', 11: '16:45', 12: '17:30'
        };
        const startTime = periodTimes[periodStart] || `Tiết ${periodStart}`;
        const endTime = periodEndTimes[periodEnd] || `Tiết ${periodEnd}`;

        html += `
            <div class="agenda-item">
                <div class="agenda-title">
                    ${c.ten_mon || 'Môn học'}
                    <span class="tag">Tiết ${periodStart}-${periodEnd}</span>
                    ${c.ma_phong ? `<span class="tag tag-room">${c.ma_phong}</span>` : ''}
                </div>
                <div class="agenda-details">
                    ⏰ ${startTime} - ${endTime} &bull; 👤 ${c.ten_giang_vien || 'Chưa xếp GV'}
                </div>
            </div>
        `;
    });

    els.todayAgenda.innerHTML = html;
}

async function handleExcelDrop(file) {
    try {
        els.uiDropExcel.textContent = "Parsing...";
        const data = await parseExcel(file);
        els.uiDropExcel.textContent = `Parsed ${data.length} rows!`;
        window.cachedExcelData = data;
    } catch(e) {
        els.uiDropExcel.textContent = "Error parsing Excel";
    }
}

function exportFullSemester() {
    if(window.cachedExcelData) {
        const icsString = generateICS(window.cachedExcelData);
        const blob = new Blob([icsString], {type: 'text/calendar'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'semester.ics';
        a.click();
    } else {
        alert(t('no_classes'));
    }
}

function exportMakeup() {
    alert("Select Excel file first or verify /tkb-tuan to export makeup classes.");
}

init();

