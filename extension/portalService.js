// Portal APIs and Token Extraction
const BASE_URL = 'https://qldt.hcmc.ftu.edu.vn';

export async function loginToPortal(studentId, password) {
  console.log(`[Login Flow] Initiating login for student ID: ${studentId}`);
  
  const body = new URLSearchParams();
  body.append('username', studentId);
  body.append('password', password);
  body.append('grant_type', 'password');

  const endpoint = `${BASE_URL}/api/auth/login`;
  console.log(`[Login Flow] Sending POST request to: ${endpoint}`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    
    console.log(`[Login Flow] HTTP Status Code: ${res.status} ${res.statusText}`);
    
    const responseText = await res.text();
    console.log(`[Login Flow] Response Body Raw:`, responseText);

    if (!res.ok) {
      console.error(`[Login Flow] Request failed with status ${res.status}`);
      throw new Error(`HTTP ${res.status}: ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
      console.log(`[Login Flow] Response JSON parsed successfully:`, data);
    } catch (e) {
      console.error(`[Login Flow] Failed to parse JSON from response.`);
      throw new Error("Invalid JSON response from portal.");
    }
    
    if (data.access_token) {
      console.log(`[Login Flow] Authentication successful! Access token received.`);
      const studentProfile = {
        name: data.name || 'Sinh viên',
        studentId: data.userName || studentId,
        email: data.principal || `${studentId}@ftu.edu.vn`,
        role: data.roles === 'SINHVIEN' ? 'Sinh viên' : (data.roles || 'Sinh viên')
      };
      return {
        token: data.access_token,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        expiresAt: Date.now() + Math.max(300, (Number(data.expires_in) || 1800) - 60) * 1000,
        refreshToken: data.refresh_token,
        profile: studentProfile,
        success: true
      };
    } else {
      console.warn(`[Login Flow] Authentication failed! Server message: ${data.message || 'Unknown error'}`);
      return { error: data.message || 'Login failed', success: false };
    }
  } catch (err) {
    console.error(`[Login Flow] Network or fatal error during fetch:`, err);
    throw err;
  }
}

/**
 * Retrieves a valid session token.
 * Automatically re-logs in to the FTU portal using saved credentials
 * if the session token is expired, missing, or was signed out by the system.
 */
export async function getSessionToken(forceRefresh = false) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve({ error: 'chrome.storage is not available', success: false });
      return;
    }

    chrome.storage.local.get(['studentId', 'password', 'portalToken', 'portalTokenExpiresAt', 'studentProfile'], async (res) => {
      const studentId = res.studentId ? String(res.studentId).trim() : '';
      const password = res.password ? String(res.password).trim() : '';

      if (!studentId || !password) {
        resolve({
          error: 'Vui lòng nhập Mã sinh viên và Mật khẩu trong phần Thông tin Cổng Đào Tạo',
          success: false
        });
        return;
      }

      const isExpired = !res.portalTokenExpiresAt || Date.now() >= res.portalTokenExpiresAt;

      // Return cached token if still valid and not forcing a re-login
      if (!forceRefresh && !isExpired && res.portalToken && res.studentProfile) {
        resolve({ token: res.portalToken, success: true, profile: res.studentProfile });
        return;
      }
      
      // Automatically authenticate using user-provided credentials
      try {
        console.log('[Login Flow] Authenticating to FTU portal with user-saved credentials...');
        const result = await loginToPortal(studentId, password);
        if (result.success) {
          chrome.storage.local.set({
            portalToken: result.token,
            portalTokenExpiresAt: result.expiresAt,
            studentProfile: result.profile
          });
          console.log('[Login Flow] Authentication successful! Fresh session token acquired.');
          resolve({ token: result.token, success: true, profile: result.profile });
        } else {
          console.warn('[Login Flow] Authentication failed:', result.error);
          resolve({ error: result.error, success: false });
        }
      } catch (e) {
        console.error('[Login Flow] Login threw an exception:', e);
        resolve({ error: e.message, success: false });
      }
    });
  });
}

export function clearSessionToken() {
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    chrome.storage.local.remove(['portalToken', 'portalTokenExpiresAt', 'portalVerification']);
  }
}

const COMMON_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'ua': '0%MTcwOTMyODcwNjIxMQ==%U2FsdGVkX1+zRTzkjt/0w7va9zBWypT1sAkHxi/Y/PU='
});

/**
 * Fetch wrapper with automatic session recovery:
 * If FTU portal returns HTTP 401/403 or PSC JSON payload { code: 401, message: 'notallowed-' },
 * automatically re-authenticates with stored credentials and retries once.
 */
async function fetchWithAutoRelogin(url, body, currentToken) {
  let token = currentToken;
  let res = await fetch(url, {
    method: 'POST',
    headers: COMMON_HEADERS(token),
    body: JSON.stringify(body)
  });

  // PSC Edusoft server can return HTTP 200 with { result: false, code: 401, message: 'notallowed-' }
  let isUnauthorized = res.status === 401 || res.status === 403;
  if (!isUnauthorized && res.ok) {
    try {
      const clone = res.clone();
      const testJson = await clone.json();
      if (testJson && (testJson.code === 401 || testJson.code === 403 || (testJson.result === false && String(testJson.message || '').includes('notallowed')))) {
        isUnauthorized = true;
      }
    } catch (e) {}
  }

  // If session was signed out by the system, auto re-login and retry
  if (isUnauthorized) {
    console.warn(`[Portal API] Session expired or unauthorized for ${url}. Attempting automatic re-login...`);
    const session = await getSessionToken(true);
    if (session && session.success && session.token) {
      token = session.token;
      console.log(`[Portal API] Re-authenticated successfully. Retrying request to ${url}...`);
      res = await fetch(url, {
        method: 'POST',
        headers: COMMON_HEADERS(token),
        body: JSON.stringify(body)
      });
    }
  }

  return { res, token };
}

export async function getActiveSemesterInfo(token) {
  const { res } = await fetchWithAutoRelogin(`${BASE_URL}/api/sch/w-locdshockytkbuser`, {}, token);
  if (!res.ok) throw new Error(`Failed to fetch semester info (HTTP ${res.status})`);
  const json = await res.json();
  const semData = json.data || json;
  if (!semData) {
    if (json.code === 401 || String(json.message || '').includes('notallowed')) {
      throw new Error('Phiên đăng nhập Cổng Đào Tạo đã hết hạn. Vui lòng xác thực lại.');
    }
    throw new Error(json.message || 'Không tìm thấy dữ liệu học kỳ');
  }

  const currentHk = semData.hoc_ky_theo_ngay_hien_tai || semData.hoc_ky || 20261;
  const list = Array.isArray(semData.ds_hoc_ky) ? semData.ds_hoc_ky : (Array.isArray(semData.list_hoc_ky) ? semData.list_hoc_ky : []);
  
  let found = list.find(hk => hk.hoc_ky === currentHk);
  if (!found && list.length > 0) {
    found = list[0];
  }
  return {
    hoc_ky: currentHk || found?.hoc_ky || 20261,
    ten_hoc_ky: found?.ten_hoc_ky || `Học kỳ ${currentHk || 20261}`,
    list
  };
}

export async function getActiveSemester(token) {
  const info = await getActiveSemesterInfo(token);
  return info.hoc_ky;
}

export async function getSchedule(token, hoc_ky) {
  const { res } = await fetchWithAutoRelogin(`${BASE_URL}/api/sch/w-locdstkbtuanusertheohocky`, {
    filter: { hoc_ky },
    additional: { paging: { limit: 1000, page: 1 } }
  }, token);

  if (!res.ok) throw new Error(`Failed to fetch /tkb-tuan schedule (HTTP ${res.status})`);
  const data = await res.json();
  const scheduleObj = data.data || data;
  if (!scheduleObj) {
    if (data.code === 401 || String(data.message || '').includes('notallowed')) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng kết nối lại tài khoản FTU.');
    }
    throw new Error(data.message || 'No schedule data returned from /tkb-tuan');
  }

  if (!scheduleObj.ds_tuan_tkb && scheduleObj.ds_tuan) {
    scheduleObj.ds_tuan_tkb = scheduleObj.ds_tuan;
  }
  if (!scheduleObj.ds_tuan_tkb && scheduleObj.list_tuan) {
    scheduleObj.ds_tuan_tkb = scheduleObj.list_tuan;
  }

  if (Array.isArray(scheduleObj.ds_tuan_tkb)) {
    scheduleObj.ds_tuan_tkb.forEach(week => {
      if (!week.ngay_bat_dau) week.ngay_bat_dau = week.ngay_bd || week.tu_ngay || '';
      if (!week.ngay_ket_thuc) week.ngay_ket_thuc = week.ngay_kt || week.den_ngay || '';
      if (!week.ds_thoi_khoa_bieu) week.ds_thoi_khoa_bieu = week.ds_tkb || week.tkb || [];
    });
  }

  return scheduleObj;
}

/**
 * Generates a realistic FTU semester schedule spanning 20 academic weeks.
 * Used for development previews and offline fallback when student credentials aren't configured yet.
 */
export function generateDefaultFtuSchedule() {
  const weeks = [];
  const baseStart = new Date(2026, 8, 7); // Monday, September 7, 2026

  const standardScheduleTemplate = [
    {
      ma_mon: 'ESP341',
      ten_mon: 'Tiếng Anh thương mại 1',
      ma_lop: 'ESP341.1_LT',
      ten_lop: 'K62.KDQT',
      ma_phong: 'B301',
      ten_giang_vien: 'ThS. Nguyễn Thu Hằng',
      dayOfWeekOffset: 0, // Thứ 2
      tiet_bat_dau: 1,
      so_tiet: 3
    },
    {
      ma_mon: 'TMA408',
      ten_mon: 'Thanh toán Quốc tế',
      ma_lop: 'TMA408.2_LT',
      ten_lop: 'K62.TCDN',
      ma_phong: 'B205',
      ten_giang_vien: 'PGS.TS Trần Thị Phương',
      dayOfWeekOffset: 2, // Thứ 4
      tiet_bat_dau: 7,
      so_tiet: 3
    },
    {
      ma_mon: 'KTE306',
      ten_mon: 'Kinh tế lượng',
      ma_lop: 'KTE306.4_LT',
      ten_lop: 'K62.KTQT',
      ma_phong: 'A204',
      ten_giang_vien: 'TS. Lê Hoàng Phúc',
      dayOfWeekOffset: 3, // Thứ 5
      tiet_bat_dau: 4,
      so_tiet: 3
    },
    {
      ma_mon: 'MKT401',
      ten_mon: 'Marketing Quốc tế',
      ma_lop: 'MKT401.1_LT',
      ten_lop: 'K62.KDQT',
      ma_phong: 'B102',
      ten_giang_vien: 'ThS. Phạm Thu Trang',
      dayOfWeekOffset: 4, // Thứ 6
      tiet_bat_dau: 1,
      so_tiet: 3
    }
  ];

  for (let w = 0; w < 20; w++) {
    const weekStart = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate() + w * 7);
    const weekEnd = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate() + w * 7 + 6);
    const pad = (n) => String(n).padStart(2, '0');

    const startIso = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}T00:00:00`;
    const endIso = `${weekEnd.getFullYear()}-${pad(weekEnd.getMonth() + 1)}-${pad(weekEnd.getDate())}T23:59:59`;

    const weekClasses = [];

    standardScheduleTemplate.forEach((tpl, idx) => {
      const classDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + tpl.dayOfWeekOffset);
      const classDateIso = `${classDate.getFullYear()}-${pad(classDate.getMonth() + 1)}-${pad(classDate.getDate())}T00:00:00`;

      weekClasses.push({
        id_tkb: 100000 + w * 100 + idx,
        ma_mon: tpl.ma_mon,
        ten_mon: tpl.ten_mon,
        ma_lop: tpl.ma_lop,
        ten_lop: tpl.ten_lop,
        ma_phong: tpl.ma_phong,
        ten_giang_vien: tpl.ten_giang_vien,
        ngay_hoc: classDateIso,
        tiet_bat_dau: tpl.tiet_bat_dau,
        so_tiet: tpl.so_tiet,
        is_day_bu: false,
        ghi_chu: ''
      });
    });

    // Add a makeup class in Week 2 and Week 5
    if (w === 1 || w === 4) {
      const makeupDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 5); // Saturday
      const makeupDateIso = `${makeupDate.getFullYear()}-${pad(makeupDate.getMonth() + 1)}-${pad(makeupDate.getDate())}T00:00:00`;
      weekClasses.push({
        id_tkb: 200000 + w * 100,
        ma_mon: 'TMA408',
        ten_mon: 'Thanh toán Quốc tế (Dạy bù)',
        ma_lop: 'TMA408.2_LT',
        ten_lop: 'K62.TCDN',
        ma_phong: 'B205',
        ten_giang_vien: 'PGS.TS Trần Thị Phương',
        ngay_hoc: makeupDateIso,
        tiet_bat_dau: 7,
        so_tiet: 3,
        is_day_bu: true,
        ghi_chu: 'Dạy bù theo kế hoạch khoa'
      });
    }

    weeks.push({
      id_tuan: w + 1,
      tuan_hoc_ky: w + 1,
      ten_tuan: `Tuần ${w + 1}`,
      ngay_bat_dau: startIso,
      ngay_ket_thuc: endIso,
      ds_thoi_khoa_bieu: weekClasses
    });
  }

  return {
    ds_tuan_tkb: weeks,
    hoc_ky: 20261
  };
}

/**
 * Verifies that the app can successfully access /tkb-tuan schedule data.
 * Connection is indicated as successful ONLY IF this verification passes.
 */
export async function verifyTkbTuanAccess(token) {
  try {
    const semInfo = await getActiveSemesterInfo(token);
    const scheduleData = await getSchedule(token, semInfo.hoc_ky);
    const weeks = scheduleData?.ds_tuan_tkb || [];
    let totalClasses = 0;
    weeks.forEach(w => {
      if (w.ds_thoi_khoa_bieu) totalClasses += w.ds_thoi_khoa_bieu.length;
    });

    if (weeks.length === 0) {
      return {
        success: false,
        error: 'TKB tuần rỗng hoặc không có dữ liệu tuần'
      };
    }

    const verificationResult = {
      success: true,
      hoc_ky: semInfo.hoc_ky,
      semesterName: semInfo.ten_hoc_ky,
      totalWeeks: weeks.length,
      totalClasses,
      verifiedAt: new Date().toISOString()
    };

    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.set({
        portalVerification: verificationResult,
        cachedSchedule: scheduleData
      });
    }

    return {
      ...verificationResult,
      scheduleData
    };
  } catch (err) {
    console.error('[verifyTkbTuanAccess Error]', err);
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.set({
        portalVerification: {
          success: false,
          error: err.message || 'Không thể truy cập /tkb-tuan',
          verifiedAt: new Date().toISOString()
        }
      });
    }
    return {
      success: false,
      error: err.message || 'Không thể truy cập /tkb-tuan'
    };
  }
}

/**
 * Extracts class sessions for a specific date (defaults to today Vietnam time UTC+7)
 */
export function extractClassesFromSchedule(scheduleData, targetDate = new Date()) {
  if (!scheduleData || !scheduleData.ds_tuan_tkb) return [];
  // Format targetDate in Vietnam timezone (UTC+7)
  const d = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const classes = [];
  scheduleData.ds_tuan_tkb.forEach(week => {
    (week.ds_thoi_khoa_bieu || []).forEach(item => {
      if (item.ngay_hoc && item.ngay_hoc.startsWith(dateStr)) {
        classes.push(item);
      }
    });
  });
  // Sort by start period
  classes.sort((a, b) => (Number(a.tiet_bat_dau) || 0) - (Number(b.tiet_bat_dau) || 0));
  return { classes, dateStr };
}

export const verifyPortalAccess = verifyTkbTuanAccess;
export const portalLogin = loginToPortal;

export async function getStoredPortalCredentials() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get(['studentId', 'password'], (res) => {
      resolve({
        studentId: res.studentId || '',
        password: res.password || ''
      });
    });
  });
}

export async function savePortalCredentials(studentId, password) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set({ studentId, password }, () => {
      resolve();
    });
  });
}

