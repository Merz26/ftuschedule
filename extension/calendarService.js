/**
 * Google Calendar Service with Universal Cross-Chromium OAuth2,
 * Pre-Insert Deduplication Engine, Smart Room Patching, Clash Detection,
 * Multi-Scope Sync, and Calendar Duplicate Cleaner.
 */

let inMemoryCalendars = [];
let inMemoryEvents = {};

function getStoredMockCalendars() {
  if (typeof localStorage !== 'undefined') {
    try { return JSON.parse(localStorage.getItem('mockGoogleCalendars') || '[]'); } catch(e) {}
  }
  return inMemoryCalendars;
}

function setStoredMockCalendars(val) {
  inMemoryCalendars = val;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('mockGoogleCalendars', JSON.stringify(val)); } catch(e) {}
  }
}

function getStoredMockEvents() {
  if (typeof localStorage !== 'undefined') {
    try { return JSON.parse(localStorage.getItem('mockGoogleEvents') || '{}'); } catch(e) {}
  }
  return inMemoryEvents;
}

function setStoredMockEvents(val) {
  inMemoryEvents = val;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('mockGoogleEvents', JSON.stringify(val)); } catch(e) {}
  }
}

/**
 * Safe fetch helper for Google Calendar / OAuth APIs.
 * Handles development preview tokens (starting with 'ya29.studio_')
 * without mutating global window.fetch, and calls native fetch in production.
 */
export async function calendarApiFetch(url, options = {}) {
  const token = (options.headers?.Authorization || options.headers?.authorization || '').replace(/^Bearer\s+/i, '');

  if (token && token.startsWith('ya29.studio_')) {
    const urlStr = String(url);

    // Mock OAuth profile
    if (urlStr.includes('googleapis.com/oauth2/v2/userinfo')) {
      let googleAccount = {};
      if (typeof localStorage !== 'undefined') {
        try { googleAccount = JSON.parse(localStorage.getItem('googleAccount') || '{}'); } catch(e) {}
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          email: googleAccount.email || 'lehoangphuc.contact@gmail.com',
          name: googleAccount.name || 'Lê Hoàng Phúc',
          picture: null
        })
      };
    }

    // Mock Primary Calendar
    if (urlStr.includes('googleapis.com/calendar/v3/users/me/calendarList/primary')) {
      let googleAccount = {};
      if (typeof localStorage !== 'undefined') {
        try { googleAccount = JSON.parse(localStorage.getItem('googleAccount') || '{}'); } catch(e) {}
      }
      const email = googleAccount.email || 'lehoangphuc.contact@gmail.com';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: email,
          summary: email
        })
      };
    }

    let mockCalendars = getStoredMockCalendars();
    let mockEvents = getStoredMockEvents();

    // GET calendar list
    if (urlStr.includes('/users/me/calendarList')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: mockCalendars })
      };
    }

    // POST create calendar
    if (urlStr.endsWith('/calendars') && options.method === 'POST') {
      let body = {};
      try { body = JSON.parse(options.body || '{}'); } catch(e) {}
      const newCal = {
        id: 'cal_' + Date.now(),
        summary: body.summary || 'FTU Schedule',
        description: body.description || '',
        timeZone: body.timeZone || 'Asia/Ho_Chi_Minh'
      };
      mockCalendars.push(newCal);
      setStoredMockCalendars(mockCalendars);
      return {
        ok: true,
        status: 200,
        json: async () => newCal
      };
    }

    // GET / POST / PATCH / DELETE events
    const eventsMatch = urlStr.match(/\/calendars\/([^/]+)\/events(?:\/([^?]+))?/);
    if (eventsMatch) {
      const calId = decodeURIComponent(eventsMatch[1]);
      const eventId = eventsMatch[2];
      if (!mockEvents[calId]) mockEvents[calId] = [];

      // DELETE event
      if (eventId && options.method === 'DELETE') {
        mockEvents[calId] = mockEvents[calId].filter(e => e.id !== eventId);
        setStoredMockEvents(mockEvents);
        return { ok: true, status: 204, json: async () => ({}) };
      }

      // GET events
      if (!eventId && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: mockEvents[calId] })
        };
      }

      // POST create event
      if (!eventId && options.method === 'POST') {
        let eventBody = {};
        try { eventBody = JSON.parse(options.body || '{}'); } catch(e) {}
        const newEvent = {
          id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          ...eventBody,
          created: new Date().toISOString()
        };
        mockEvents[calId].push(newEvent);
        setStoredMockEvents(mockEvents);
        return {
          ok: true,
          status: 200,
          json: async () => newEvent
        };
      }

      // PATCH event
      if (eventId && options.method === 'PATCH') {
        let patchBody = {};
        try { patchBody = JSON.parse(options.body || '{}'); } catch(e) {}
        const idx = mockEvents[calId].findIndex(e => e.id === eventId);
        if (idx !== -1) {
          mockEvents[calId][idx] = {
            ...mockEvents[calId][idx],
            ...patchBody,
            updated: new Date().toISOString()
          };
          setStoredMockEvents(mockEvents);
          return {
            ok: true,
            status: 200,
            json: async () => mockEvents[calId][idx]
          };
        }
      }
    }
  }

  return fetch(url, options);
}

export async function fetchGoogleProfile(token) {
  if (!token) return null;
  // 1. Try OAuth2 userinfo
  try {
    const res = await calendarApiFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        email: data.email,
        name: data.name || data.email,
        picture: data.picture,
        verified: data.verified_email
      };
    }
  } catch (e) {
    console.warn('[CalendarService] Userinfo fetch failed:', e);
  }

  // 2. Fallback to Primary Calendar metadata
  try {
    const res = await calendarApiFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const email = data.id || data.summary;
      return {
        email: email,
        name: data.summary || email,
        picture: null,
        verified: true
      };
    }
  } catch (e) {
    console.warn('[CalendarService] Calendar primary fetch failed:', e);
  }

  return null;
}

/**
 * Cross-Chromium OAuth 2.0 authorization using chrome.identity.launchWebAuthFlow
 * with fallback to chrome.identity.getAuthToken.
 */
export async function authorizeGoogle() {
  return new Promise((resolve, reject) => {
    const clientId = chrome.runtime.getManifest().oauth2?.client_id;
    if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      alert("Missing Google OAuth Client ID! Please update manifest.json with a valid Client ID.");
      return reject(new Error("Missing OAuth Client ID"));
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const scopes = chrome.runtime.getManifest().oauth2.scopes.join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (responseUrl) => {
        let token = null;
        if (chrome.runtime.lastError || !responseUrl) {
          // Fallback to getAuthToken for Google Chrome logged-in profiles
          token = await new Promise((res) => {
            chrome.identity.getAuthToken({ interactive: true }, (tok) => {
              if (chrome.runtime.lastError) res(null);
              else res(tok);
            });
          });
        } else {
          try {
            const url = new URL(responseUrl.replace('#', '?'));
            token = url.searchParams.get('access_token');
          } catch (e) {
            console.error('[CalendarService] Error parsing redirect URL:', e);
          }
        }

        if (!token) {
          return reject(new Error(chrome.runtime.lastError?.message || 'Authentication cancelled or token missing'));
        }

        const profile = await fetchGoogleProfile(token);
        const accountInfo = {
          token,
          email: profile?.email || 'Authenticated User',
          name: profile?.name || 'Google User',
          picture: profile?.picture || null,
          authorizedAt: new Date().toISOString()
        };

        chrome.storage.local.set({ googleAccount: accountInfo }, () => {
          resolve(accountInfo);
        });
      }
    );
  });
}

export async function logoutGoogle() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['googleAccount'], (res) => {
      const token = res.googleAccount?.token;
      if (token && typeof chrome.identity?.removeCachedAuthToken === 'function') {
        chrome.identity.removeCachedAuthToken({ token }, () => {});
      }
      chrome.storage.local.remove(['googleAccount'], () => {
        resolve();
      });
    });
  });
}

export async function checkAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['googleAccount'], async (res) => {
      if (res.googleAccount && res.googleAccount.email && res.googleAccount.token) {
        resolve(res.googleAccount);
        return;
      }
      if (typeof chrome.identity?.getAuthToken === 'function') {
        chrome.identity.getAuthToken({ interactive: false }, async (token) => {
          if (token) {
            const profile = await fetchGoogleProfile(token);
            const accountInfo = {
              token,
              email: profile?.email || 'Google Account',
              name: profile?.name || '',
              picture: profile?.picture || null
            };
            chrome.storage.local.set({ googleAccount: accountInfo });
            resolve(accountInfo);
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  });
}

export async function getOrCreateFtuCalendar(token) {
  const cachedCalId = await new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['ftuCalendarId'], (res) => resolve(res.ftuCalendarId || null));
    } else {
      resolve(null);
    }
  });

  // Verify whether cached calendar still exists and is accessible
  if (cachedCalId && cachedCalId !== 'primary') {
    try {
      const checkRes = await calendarApiFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cachedCalId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (checkRes.ok) {
        return { calendarId: cachedCalId, calendarName: 'FTU Schedule', isSecondary: true };
      } else {
        console.warn('[Google Calendar] Cached calendar ID is no longer valid or was deleted. Clearing cached ID.');
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove(['ftuCalendarId']);
        }
      }
    } catch (e) {
      console.warn('[Google Calendar] Error checking cached calendar:', e);
    }
  }

  try {
    const listRes = await calendarApiFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = (listData.items || []).find(c => c.summary === 'FTU Schedule');
      if (existing) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ ftuCalendarId: existing.id });
        }
        return { calendarId: existing.id, calendarName: 'FTU Schedule', isSecondary: true };
      }
    }

    const createRes = await calendarApiFetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: 'FTU Schedule',
        description: 'Thời khóa biểu Trường Đại học Ngoại Thương (FTU) được đồng bộ tự động',
        timeZone: 'Asia/Ho_Chi_Minh'
      })
    });

    if (createRes.ok) {
      const created = await createRes.json();
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ ftuCalendarId: created.id });
      }
      return { calendarId: created.id, calendarName: 'FTU Schedule', isSecondary: true };
    }
  } catch (err) {
    console.warn('[Google Calendar] Secondary calendar creation failed. Falling back to primary:', err);
  }

  return { calendarId: 'primary', calendarName: 'Primary (FTU Schedule)', isSecondary: false };
}

export async function fetchGoogleEvents(token, timeMin, timeMax, calendarId = 'primary') {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&maxResults=2500`;
  const res = await calendarApiFetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch events from calendar (HTTP ${res.status})`);
  const data = await res.json();
  // Filter out any deleted / cancelled events so items removed from calendar can be re-synced!
  return (data.items || []).filter(ev => ev && ev.status !== 'cancelled');
}

export async function patchGoogleEvent(token, eventId, patchData, calendarId = 'primary') {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await calendarApiFetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patchData)
  });
  if (!res.ok) throw new Error(`Failed to patch event (HTTP ${res.status})`);
  return await res.json();
}

export async function insertGoogleEvent(token, eventData, calendarId = 'primary') {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await calendarApiFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  });
  if (!res.ok) throw new Error(`Failed to insert event (HTTP ${res.status})`);
  return await res.json();
}

export async function deleteGoogleEvent(token, eventId, calendarId = 'primary') {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await calendarApiFetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete event (HTTP ${res.status})`);
  return true;
}

export const PERIOD_TIMES = {
  1: { start: '06:45', end: '07:30' },
  2: { start: '07:30', end: '08:15' },
  3: { start: '08:15', end: '09:00' },
  4: { start: '09:15', end: '10:00' },
  5: { start: '10:00', end: '10:45' },
  6: { start: '10:45', end: '11:30' },
  7: { start: '12:30', end: '13:15' },
  8: { start: '13:15', end: '14:00' },
  9: { start: '14:00', end: '14:45' },
  10: { start: '15:00', end: '15:45' },
  11: { start: '15:45', end: '16:30' },
  12: { start: '16:30', end: '17:15' },
  13: { start: '18:00', end: '18:45' },
  14: { start: '18:45', end: '19:30' },
  15: { start: '19:30', end: '20:15' }
};

/**
 * Extracts course code (e.g. ESP341, KTE306, MKT401, TMA408) from string
 */
export function extractCourseCode(text) {
  if (!text) return '';
  const match = String(text).match(/\b([A-Z]{2,5}\d{3,4})\b/i);
  return match ? match[1].toUpperCase() : '';
}

/**
 * Pre-Insert Deduplication Engine with Strict Overwrite & Clash Prevention.
 * Matches candidate class against existing Google Calendar events.
 * Ignores any cancelled or deleted events so removed items can be re-synced!
 */
export function findMatchingCalendarEvent(candidate, existingEvents) {
  const { dateStr, startTimeStr, endTimeStr, courseCode, id_tkb, summary } = candidate;
  const candStartMin = timeStringToMinutes(startTimeStr);
  const candEndMin = timeStringToMinutes(endTimeStr);

  let exactMatch = null;
  let codeMatch = null;
  let clashEvent = null;

  for (const ev of existingEvents) {
    // If an event was deleted/cancelled in Google Calendar, it MUST NOT match!
    if (!ev || ev.status === 'cancelled') continue;

    const evStartRaw = ev.start?.dateTime || ev.start?.date || '';
    const evEndRaw = ev.end?.dateTime || ev.end?.date || '';
    const evDate = evStartRaw.split('T')[0];

    // Check same calendar day
    if (evDate !== dateStr) continue;

    const evPriv = ev.extendedProperties?.private || {};
    const evCourseCode = (evPriv.courseCode || evPriv.ma_mon || extractCourseCode(ev.summary) || '').toUpperCase();
    const evIdTkb = evPriv.id_tkb || '';

    // Extract event start and end hours/minutes
    let evStartMin = 0;
    let evEndMin = 0;
    if (evStartRaw.includes('T')) {
      const timePart = evStartRaw.split('T')[1].substring(0, 5);
      evStartMin = timeStringToMinutes(timePart);
    }
    if (evEndRaw.includes('T')) {
      const timePart = evEndRaw.split('T')[1].substring(0, 5);
      evEndMin = timeStringToMinutes(timePart);
    }

    // Overlapping shift condition (shift times overlap or are within 35 min window)
    const timesOverlap = Math.max(candStartMin, evStartMin) < Math.min(candEndMin, evEndMin) ||
                         Math.abs(candStartMin - evStartMin) <= 35;

    // Match 1: Exact ID TKB match
    if (id_tkb && evIdTkb && String(id_tkb) === String(evIdTkb)) {
      exactMatch = ev;
      break;
    }

    // Match 2: Same course code and overlapping time window
    if (courseCode && evCourseCode && courseCode.toUpperCase() === evCourseCode && timesOverlap) {
      codeMatch = ev;
      break;
    }

    // Match 3: Matching summary string with valid course code
    if (courseCode && courseCode.length >= 3 && (ev.summary || '').toUpperCase().includes(courseCode.toUpperCase()) && timesOverlap) {
      codeMatch = ev;
      break;
    }

    // Detect clash: Different course code / subject scheduled at the same time window!
    if (timesOverlap && evCourseCode && courseCode && evCourseCode !== courseCode.toUpperCase()) {
      clashEvent = ev;
    }
  }

  return {
    matchedEvent: exactMatch || codeMatch,
    clashEvent
  };
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Normalizes date string into YYYY-MM-DD.
 * Handles both YYYY-MM-DD and DD/MM/YYYY inputs safely.
 */
export function normalizeIsoDate(dateStr) {
  if (!dateStr) return '';
  const raw = String(dateStr).trim().split('T')[0];
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return raw;
}

/**
 * Calculates standard Monday-to-Sunday date bounds for an academic week.
 * Guarantees reliable week coverage across month and year boundaries.
 */
export function getWeekDateBounds(week) {
  if (!week) return null;

  let startStr = (week.ngay_bat_dau || week.ngay_bd || week.tu_ngay || '').split('T')[0];
  let endStr = (week.ngay_ket_thuc || week.ngay_kt || week.den_ngay || '').split('T')[0];

  const classes = week.ds_thoi_khoa_bieu || week.ds_tkb || week.tkb || [];
  if (!startStr && classes.length > 0) {
    const dates = classes
      .map(c => (c.ngay_hoc || '').split('T')[0])
      .filter(Boolean)
      .map(normalizeIsoDate)
      .sort();
    if (dates.length > 0) {
      startStr = dates[0];
      if (!endStr) endStr = dates[dates.length - 1];
    }
  }

  startStr = normalizeIsoDate(startStr);
  if (!startStr || !startStr.includes('-')) return null;

  const [sy, sm, sd] = startStr.split('-').map(Number);
  if (!sy || !sm || !sd) return null;

  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  if (isNaN(startDate.getTime())) return null;

  // FTU standard academic weeks begin on Monday (1) and conclude Sunday (0)
  const day = startDate.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monDate = new Date(startDate.getTime() + diffToMon * 86400000);
  const sunDate = new Date(monDate.getTime() + 6 * 86400000);

  const pad = n => String(n).padStart(2, '0');
  const mondayIso = `${monDate.getUTCFullYear()}-${pad(monDate.getUTCMonth() + 1)}-${pad(monDate.getUTCDate())}`;
  const sundayIso = `${sunDate.getUTCFullYear()}-${pad(sunDate.getUTCMonth() + 1)}-${pad(sunDate.getUTCDate())}`;

  // Time queries buffered by +/- 24h to avoid any timezone discrepancies
  const queryMin = new Date(monDate.getTime() - 24 * 3600000);
  const queryMax = new Date(sunDate.getTime() + 48 * 3600000);

  return {
    mondayIso,
    sundayIso,
    queryMin,
    queryMax
  };
}

/**
 * Checks if a Google Calendar event represents an FTU university class.
 * Differentiates university schedules from user personal events (dentist, family, etc.).
 */
export function isFtuClassEvent(ev) {
  if (!ev || ev.status === 'cancelled') return false;
  const priv = ev.extendedProperties?.private || {};
  if (priv.app === 'ftu-calendar-sync') return true;
  if (priv.id_tkb || priv.courseCode || priv.ma_mon) return true;

  const desc = ev.description || '';
  if (
    desc.includes('Mã TKB:') ||
    desc.includes('Tiết học:') ||
    desc.includes('Phòng học:') ||
    desc.includes('Giảng viên:') ||
    desc.includes('Môn học:')
  ) {
    return true;
  }

  const summary = ev.summary || '';
  if (extractCourseCode(summary)) return true;
  if (summary.includes('(Dạy bù)') || summary.includes('Lớp:')) return true;

  return false;
}

/**
 * Synchronizes class schedules to Google Calendar.
 * For every sync attempt, it clears out every class of the target week from the calendar
 * before syncing that week back with the authoritative data from the portal.
 *
 * Supported scopes:
 * - 'this_week': Current active week
 * - 'from_this_week': Current week through semester end
 * - 'semester': All weeks in semester
 */
export async function syncScheduleToGoogleCalendar(token, scheduleData, options = {}) {
  if (!token) throw new Error('Chưa đăng nhập tài khoản Google');
  if (!scheduleData || !scheduleData.ds_tuan_tkb) {
    throw new Error('Dữ liệu thời khóa biểu rỗng hoặc không hợp lệ');
  }

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const scope = options.scope || 'this_week'; // 'this_week' | 'from_this_week' | 'semester'
  const activeWeekIndex = options.activeWeekIndex ?? 0;

  if (onProgress) {
    onProgress({
      phase: 'init',
      current: 0,
      total: 0,
      percent: 5,
      message: 'Đang kết nối Google Calendar...'
    });
  }

  // 1. Get or create calendar with label "FTU Schedule"
  const { calendarId, calendarName, isSecondary } = await getOrCreateFtuCalendar(token);

  // 2. Filter weeks based on scope
  const allWeeks = scheduleData.ds_tuan_tkb || [];
  let targetWeeks = [];

  if (scope === 'this_week') {
    targetWeeks = [allWeeks[activeWeekIndex] || allWeeks[0]].filter(Boolean);
  } else if (scope === 'from_this_week') {
    targetWeeks = allWeeks.slice(activeWeekIndex);
  } else {
    // 'semester'
    targetWeeks = allWeeks;
  }

  if (targetWeeks.length === 0) {
    if (onProgress) {
      onProgress({
        phase: 'completed',
        current: 0,
        total: 0,
        percent: 100,
        message: 'Không tìm thấy tuần học nào phù hợp trong phạm vi đã chọn.'
      });
    }
    return {
      success: true,
      clearedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      clashesCount: 0,
      total: 0,
      calendarName,
      message: 'Không tìm thấy tuần học nào phù hợp trong phạm vi đã chọn.'
    };
  }

  let totalCandidateClasses = 0;
  targetWeeks.forEach(w => {
    totalCandidateClasses += (w.ds_thoi_khoa_bieu || w.ds_tkb || w.tkb || []).length;
  });

  let clearedCount = 0;
  let insertedCount = 0;
  let clashesCount = 0;
  const changes = [];

  const totalSteps = targetWeeks.length * 2; // Step 1: Clear week, Step 2: Sync week
  let currentStep = 0;

  // Process each target week: Clear existing classes -> Sync back from portal
  for (let wIdx = 0; wIdx < targetWeeks.length; wIdx++) {
    const week = targetWeeks[wIdx];
    const weekLabel = week.tuan_hoc ? `Tuần ${week.tuan_hoc}` : `Tuần ${wIdx + 1}`;
    const weekClasses = week.ds_thoi_khoa_bieu || week.ds_tkb || week.tkb || [];

    // STEP A: Calculate date bounds for the target week
    const bounds = getWeekDateBounds(week);

    // STEP B: Clear out every class of the target week from Google Calendar
    if (bounds) {
      currentStep++;
      const clearPercent = Math.min(95, Math.round((currentStep / totalSteps) * 85));

      if (onProgress) {
        onProgress({
          phase: 'clearing',
          current: insertedCount,
          total: totalCandidateClasses,
          percent: clearPercent,
          message: `[${weekLabel}] Đang xóa sạch lớp cũ trên lịch (${bounds.mondayIso} - ${bounds.sundayIso})...`
        });
      }

      // Query existing calendar events across this target week's window
      const weekExistingEvents = await fetchGoogleEvents(token, bounds.queryMin, bounds.queryMax, calendarId);

      // Filter events belonging strictly to this week's 7 calendar days that are university classes
      const weekClassesToDelete = weekExistingEvents.filter(ev => {
        if (!ev || ev.status === 'cancelled') return false;
        const evStart = ev.start?.dateTime || ev.start?.date || '';
        const evDate = normalizeIsoDate(evStart.split('T')[0]);
        if (evDate < bounds.mondayIso || evDate > bounds.sundayIso) return false;
        return isFtuClassEvent(ev);
      });

      for (const ev of weekClassesToDelete) {
        try {
          await deleteGoogleEvent(token, ev.id, calendarId);
          clearedCount++;
          changes.push({
            type: 'cleared',
            subject: ev.summary || 'Lớp học',
            time: normalizeIsoDate((ev.start?.dateTime || ev.start?.date || '').split('T')[0]),
            reason: `Đã xóa lớp cũ của ${weekLabel}`
          });
        } catch (delErr) {
          console.warn('[Sync] Could not delete old class event:', ev.id, delErr);
        }
      }
    }

    // Micro-delay in studio mock mode to ensure realistic, smooth visual progress
    if (token && token.startsWith('ya29.studio_')) {
      await new Promise(r => setTimeout(r, 20));
    }

    // STEP C: Sync that week back with the authoritative data from the portal
    currentStep++;
    const syncWeekPercent = Math.min(95, Math.round((currentStep / totalSteps) * 85));

    if (onProgress) {
      onProgress({
        phase: 'syncing',
        current: insertedCount,
        total: totalCandidateClasses,
        percent: syncWeekPercent,
        message: `[${weekLabel}] Đang đồng bộ ${weekClasses.length} lớp học từ Cổng Đào Tạo...`
      });
    }

    for (let cIdx = 0; cIdx < weekClasses.length; cIdx++) {
      const item = weekClasses[cIdx];
      const startPeriod = Number(item.tiet_bat_dau) || 1;
      const periodsCount = Number(item.so_tiet) || 1;
      const endPeriod = startPeriod + periodsCount - 1;

      const startTimeStr = PERIOD_TIMES[startPeriod]?.start || '06:45';
      const endTimeStr = PERIOD_TIMES[endPeriod]?.end || '09:00';

      const rawDate = item.ngay_hoc || '';
      const dateStr = normalizeIsoDate(rawDate);
      if (!dateStr) continue;

      const startDateTime = `${dateStr}T${startTimeStr}:00+07:00`;
      const endDateTime = `${dateStr}T${endTimeStr}:00+07:00`;

      const courseCode = item.ma_mon || extractCourseCode(item.ten_mon);
      const isMakeup = Boolean(item.is_day_bu || (item.ten_mon || '').includes('Dạy bù') || (item.ghi_chu || '').includes('Dạy bù'));
      const makeupTag = isMakeup ? ' (Dạy bù)' : '';
      const summary = `${item.ten_mon}${makeupTag} (${courseCode})`;
      const expectedLocation = item.ma_phong ? `Phòng ${item.ma_phong}` : '';

      const description = [
        `Môn học: ${item.ten_mon}`,
        `Mã môn: ${courseCode}`,
        `Lớp: ${item.ten_lop || item.ma_lop || 'N/A'}`,
        `Giảng viên: ${item.ten_giang_vien || 'Chưa cập nhật'}`,
        `Phòng học: ${item.ma_phong || 'Chưa xếp phòng'}`,
        `Tiết học: Tiết ${startPeriod} - ${endPeriod} (${periodsCount} tiết)`,
        `Nhóm: ${item.ma_nhom || 'N/A'}`,
        `Mã TKB: ${item.id_tkb || 'N/A'}`,
        isMakeup ? 'Lưu ý: Lớp học bù' : ''
      ].filter(Boolean).join('\n');

      const expectedProperties = {
        app: 'ftu-calendar-sync',
        id_tkb: String(item.id_tkb || ''),
        courseCode: String(courseCode),
        ma_mon: String(courseCode),
        ngay_hoc: String(dateStr),
        tiet_bat_dau: String(startPeriod),
        so_tiet: String(periodsCount),
        ma_phong: String(item.ma_phong || ''),
        ten_giang_vien: String(item.ten_giang_vien || '')
      };

      const eventPayload = {
        summary,
        location: expectedLocation,
        description,
        start: { dateTime: startDateTime, timeZone: 'Asia/Ho_Chi_Minh' },
        end: { dateTime: endDateTime, timeZone: 'Asia/Ho_Chi_Minh' },
        colorId: isMakeup ? '11' : '9', // Flamingo for Makeup, Grape for standard
        extendedProperties: {
          private: expectedProperties
        }
      };

      // Check for internal clashes in the portal schedule (two classes at same day & period)
      const internalClash = weekClasses.find((other, oIdx) => 
        oIdx < cIdx && 
        normalizeIsoDate(other.ngay_hoc) === dateStr && 
        Number(other.tiet_bat_dau) === startPeriod
      );
      if (internalClash) {
        clashesCount++;
        changes.push({
          type: 'clash',
          subject: item.ten_mon,
          clashWith: internalClash.ten_mon,
          time: `${dateStr} ${startTimeStr}`
        });
      }

      // Insert clean event for this target week
      await insertGoogleEvent(token, eventPayload, calendarId);
      insertedCount++;
      changes.push({
        type: 'inserted',
        subject: item.ten_mon,
        room: item.ma_phong,
        time: `${dateStr} ${startTimeStr}`
      });

      if (onProgress) {
        onProgress({
          phase: 'syncing',
          current: insertedCount,
          total: totalCandidateClasses,
          percent: Math.min(98, syncWeekPercent + Math.round(((cIdx + 1) / weekClasses.length) * (85 / totalSteps))),
          subject: item.ten_mon,
          room: item.ma_phong,
          message: `[${weekLabel}] Đang chèn: ${item.ten_mon}`
        });
      }
    }
  }

  if (onProgress) {
    onProgress({
      phase: 'completed',
      current: insertedCount,
      total: totalCandidateClasses,
      percent: 100,
      message: 'Đồng bộ hoàn tất thành công!'
    });
  }

  const lastSyncData = {
    timestamp: Date.now(),
    dateStr: new Date().toISOString(),
    clearedCount,
    insertedCount,
    updatedCount: 0,
    skippedCount: 0,
    clashesCount,
    total: totalCandidateClasses,
    scope
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      chrome.storage.local.set({
        lastSyncTimestamp: lastSyncData.timestamp,
        lastSyncInfo: lastSyncData
      });
    }
  } catch (err) {
    console.warn('[Sync] Could not save lastSyncInfo to storage:', err);
  }

  return {
    success: true,
    calendarName,
    calendarId,
    clearedCount,
    insertedCount,
    updatedCount: 0,
    skippedCount: 0,
    clashesCount,
    total: totalCandidateClasses,
    changes,
    timestamp: lastSyncData.timestamp,
    syncInfo: lastSyncData
  };
}

/**
 * Cleans up duplicate events in Google Calendar (e.g. duplicate entries from
 * previous imports as shown in image.png).
 */
export async function cleanCalendarDuplicates(token, calendarId = 'primary', options = {}) {
  if (!token) throw new Error('Chưa đăng nhập tài khoản Google');
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  if (onProgress) {
    onProgress({ phase: 'scanning', percent: 20, message: 'Đang quét toàn bộ sự kiện trên Google Calendar...' });
  }

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 5, 1);

  const events = await fetchGoogleEvents(token, timeMin, timeMax, calendarId);
  if (!events || events.length === 0) {
    if (onProgress) onProgress({ phase: 'completed', percent: 100, message: 'Không có sự kiện nào để quét.' });
    return { success: true, scannedCount: 0, removedCount: 0 };
  }

  if (onProgress) {
    onProgress({ phase: 'analyzing', percent: 50, message: `Đã quét ${events.length} sự kiện. Đang phân tích trùng lặp...` });
  }

  let removedCount = 0;
  const groups = new Map();

  // Group events by day and course code
  events.forEach(ev => {
    const startStr = ev.start?.dateTime || ev.start?.date || '';
    const dateStr = startStr.split('T')[0];
    if (!dateStr) return;

    const courseCode = (ev.extendedProperties?.private?.courseCode || 
                        ev.extendedProperties?.private?.ma_mon || 
                        extractCourseCode(ev.summary) || '').toUpperCase();
    if (!courseCode) return;

    const key = `${dateStr}_${courseCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  });

  // For each group with > 1 event, keep the most informative one and delete duplicates
  for (const [key, evList] of groups.entries()) {
    if (evList.length > 1) {
      // Sort by preference: events with private extendedProperties, or longer description
      evList.sort((a, b) => {
        const aHasProps = Boolean(a.extendedProperties?.private?.id_tkb);
        const bHasProps = Boolean(b.extendedProperties?.private?.id_tkb);
        if (aHasProps !== bHasProps) return bHasProps ? 1 : -1;
        return (b.description || '').length - (a.description || '').length;
      });

      // Keep index 0, delete others
      const toDelete = evList.slice(1);
      for (const dup of toDelete) {
        try {
          if (onProgress) {
            onProgress({
              phase: 'deleting',
              percent: Math.min(95, 50 + Math.round((removedCount + 1) * 5)),
              message: `Đang xóa sự kiện trùng: ${dup.summary || 'Sự kiện'}`
            });
          }
          await deleteGoogleEvent(token, dup.id, calendarId);
          removedCount++;
        } catch (e) {
          console.warn('[Clean Duplicates] Could not delete event:', dup.id, e);
        }
      }
    }
  }

  if (onProgress) {
    onProgress({
      phase: 'completed',
      percent: 100,
      scannedCount: events.length,
      removedCount,
      message: 'Dọn dẹp trùng lặp hoàn tất!'
    });
  }

  return {
    success: true,
    scannedCount: events.length,
    removedCount
  };
}
