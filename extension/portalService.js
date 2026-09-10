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
 * If FTU portal returns HTTP 401/403 or token invalid error,
 * automatically re-authenticates with stored credentials and retries once.
 */
async function fetchWithAutoRelogin(url, body, currentToken) {
  let token = currentToken;
  let res = await fetch(url, {
    method: 'POST',
    headers: COMMON_HEADERS(token),
    body: JSON.stringify(body)
  });

  // If session was signed out by the system (HTTP 401 / 403), auto re-login and retry
  if (res.status === 401 || res.status === 403) {
    console.warn(`[Portal API] Received HTTP ${res.status} from ${url}. Session was signed out by system. Attempting automatic re-login...`);
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
  const semData = json.data;
  if (!semData) throw new Error('No semester data in response');

  const currentHk = semData.hoc_ky_theo_ngay_hien_tai;
  const list = Array.isArray(semData.ds_hoc_ky) ? semData.ds_hoc_ky : [];
  
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
  if (!data.data) throw new Error('No schedule data returned from /tkb-tuan');
  return data.data;
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

