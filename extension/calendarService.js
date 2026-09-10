/**
 * Safe fetch helper for Google Calendar / OAuth APIs.
 * Seamlessly handles development preview tokens (starting with 'ya29.studio_')
 * without mutating global window.fetch, and calls native fetch in production.
 */
async function calendarApiFetch(url, options = {}) {
  const token = (options.headers?.Authorization || options.headers?.authorization || '').replace(/^Bearer\s+/i, '');

  if (token && token.startsWith('ya29.studio_')) {
    const urlStr = String(url);

    // Mock OAuth profile
    if (urlStr.includes('googleapis.com/oauth2/v2/userinfo')) {
      let googleAccount = {};
      try { googleAccount = JSON.parse(localStorage.getItem('googleAccount') || '{}'); } catch(e) {}
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
      try { googleAccount = JSON.parse(localStorage.getItem('googleAccount') || '{}'); } catch(e) {}
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

    let mockCalendars = [];
    let mockEvents = {};
    try { mockCalendars = JSON.parse(localStorage.getItem('mockGoogleCalendars') || '[]'); } catch(e) {}
    try { mockEvents = JSON.parse(localStorage.getItem('mockGoogleEvents') || '{}'); } catch(e) {}

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
      try { localStorage.setItem('mockGoogleCalendars', JSON.stringify(mockCalendars)); } catch(e) {}
      return {
        ok: true,
        status: 200,
        json: async () => newCal
      };
    }

    // GET / POST / PATCH events
    const eventsMatch = urlStr.match(/\/calendars\/([^/]+)\/events(?:\/([^?]+))?/);
    if (eventsMatch) {
      const calId = decodeURIComponent(eventsMatch[1]);
      const eventId = eventsMatch[2];
      if (!mockEvents[calId]) mockEvents[calId] = [];

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
        try { localStorage.setItem('mockGoogleEvents', JSON.stringify(mockEvents)); } catch(e) {}
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
          try { localStorage.setItem('mockGoogleEvents', JSON.stringify(mockEvents)); } catch(e) {}
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
        picture: data.picture || null,
        verified: true
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

export async function authorizeGoogle() {
  return new Promise((resolve, reject) => {
    const clientId = chrome.runtime.getManifest().oauth2.client_id;
    if (clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
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
            // Fallback to getAuthToken
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

        // Fetch user profile info
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
      if (res.googleAccount && res.googleAccount.email) {
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
  // Check if calendar already cached in storage
  const cachedCalId = await new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['ftuCalendarId'], (res) => resolve(res.ftuCalendarId || null));
    } else {
      resolve(null);
    }
  });

  try {
    // 1. Fetch user calendar list to find "FTU Schedule"
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

    // 2. Not found: create dedicated "FTU Schedule" secondary calendar
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
      console.log('[Google Calendar] Created new calendar "FTU Schedule":', created.id);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ ftuCalendarId: created.id });
      }
      return { calendarId: created.id, calendarName: 'FTU Schedule', isSecondary: true };
    }
  } catch (err) {
    console.warn('[Google Calendar] Secondary calendar creation failed or not supported by scope. Falling back to primary calendar:', err);
  }

  // Fallback to primary calendar if secondary calendar not permitted
  return { calendarId: cachedCalId || 'primary', calendarName: 'Primary (FTU Schedule)', isSecondary: false };
}

export async function fetchGoogleEvents(token, timeMin, timeMax, calendarId = 'primary') {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&maxResults=250`;
  const res = await calendarApiFetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch events from calendar (HTTP ${res.status})`);
  const data = await res.json();
  return data.items || [];
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

const PERIOD_TIMES = {
  1: { start: '06:45', end: '07:30' },
  2: { start: '07:30', end: '08:15' },
  3: { start: '08:15', end: '09:00' },
  4: { start: '09:15', end: '10:00' },
  5: { start: '10:00', end: '10:45' },
  6: { start: '10:45', end: '11:30' },
  7: { start: '12:45', end: '13:30' },
  8: { start: '13:30', end: '14:15' },
  9: { start: '14:15', end: '15:00' },
  10: { start: '15:15', end: '16:00' },
  11: { start: '16:00', end: '16:45' },
  12: { start: '16:45', end: '17:30' },
  13: { start: '17:45', end: '18:30' },
  14: { start: '18:30', end: '19:15' },
  15: { start: '19:15', end: '20:00' }
};

/**
 * Synchronizes an entire week's schedule to Google Calendar of the logged-in account
 * under the "FTU Schedule" label / calendar.
 * - Items not already present are created.
 * - Items with mismatched information (e.g. changed room, lecturer, or time)
 *   are overwritten with fresh data from the FTU portal.
 */
export async function syncWeekToGoogleCalendar(token, weekData) {
  if (!token) throw new Error('Chưa đăng nhập tài khoản Google');
  if (!weekData || !weekData.ds_thoi_khoa_bieu) {
    throw new Error('Dữ liệu tuần không hợp lệ hoặc rỗng');
  }

  // 1. Get or create calendar with label "FTU Schedule"
  const { calendarId, calendarName } = await getOrCreateFtuCalendar(token);
  console.log(`[Sync Week] Targeting calendar "${calendarName}" (${calendarId})`);

  // 2. Determine week date window
  const weekClasses = weekData.ds_thoi_khoa_bieu || [];
  if (weekClasses.length === 0) {
    return {
      success: true,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      total: 0,
      calendarName,
      message: 'Tuần này không có tiết học nào để đồng bộ.'
    };
  }

  // Parse start/end of the week (format: DD/MM/YYYY)
  let minDate = new Date();
  let maxDate = new Date();

  if (weekData.ngay_bat_dau && weekData.ngay_ket_thuc) {
    const [d1, m1, y1] = weekData.ngay_bat_dau.split('/').map(Number);
    const [d2, m2, y2] = weekData.ngay_ket_thuc.split('/').map(Number);
    minDate = new Date(Date.UTC(y1, m1 - 1, d1, 0, 0, 0) - 7 * 3600000);
    maxDate = new Date(Date.UTC(y2, m2 - 1, d2, 23, 59, 59) - 7 * 3600000);
  } else {
    // derive from classes
    const dates = weekClasses.map(c => new Date(c.ngay_hoc)).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      minDate = new Date(Math.min(...dates.map(d => d.getTime())) - 24 * 3600000);
      maxDate = new Date(Math.max(...dates.map(d => d.getTime())) + 24 * 3600000);
    }
  }

  // 3. Fetch existing events from the target calendar in this time window
  const existingEvents = await fetchGoogleEvents(token, minDate, maxDate, calendarId);
  console.log(`[Sync Week] Found ${existingEvents.length} existing events in calendar window`);

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const changes = [];

  // 4. Process each class from the FTU portal schedule
  for (const item of weekClasses) {
    const startPeriod = Number(item.tiet_bat_dau) || 1;
    const periodsCount = Number(item.so_tiet) || 1;
    const endPeriod = startPeriod + periodsCount - 1;

    const startTimeStr = PERIOD_TIMES[startPeriod]?.start || '07:00';
    const endTimeStr = PERIOD_TIMES[endPeriod]?.end || '09:00';

    // Parse class date (YYYY-MM-DD)
    const rawDate = item.ngay_hoc || '';
    const dateStr = rawDate.split('T')[0];
    if (!dateStr) continue;

    const startDateTime = `${dateStr}T${startTimeStr}:00+07:00`;
    const endDateTime = `${dateStr}T${endTimeStr}:00+07:00`;

    const summary = `${item.ten_mon} (${item.ma_mon})`;
    const expectedLocation = item.ma_phong ? `Phòng ${item.ma_phong}` : '';
    const description = [
      `Môn học: ${item.ten_mon}`,
      `Mã môn: ${item.ma_mon}`,
      `Lớp: ${item.ten_lop || item.ma_lop || 'N/A'}`,
      `Giảng viên: ${item.ten_giang_vien || 'Chưa cập nhật'}`,
      `Phòng học: ${item.ma_phong || 'Chưa xếp phòng'}`,
      `Tiết học: Tiết ${startPeriod} - ${endPeriod} (${periodsCount} tiết)`,
      `Nhóm: ${item.ma_nhom || 'N/A'}`,
      `Mã TKB: ${item.id_tkb || 'N/A'}`
    ].join('\n');

    const expectedProperties = {
      app: 'ftu-calendar-sync',
      id_tkb: String(item.id_tkb || ''),
      ma_mon: String(item.ma_mon || ''),
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
      colorId: '9', // Grape/Blue
      extendedProperties: {
        private: expectedProperties
      }
    };

    // Find matching existing event
    const existing = existingEvents.find(ev => {
      const priv = ev.extendedProperties?.private;
      if (priv) {
        if (priv.id_tkb && priv.id_tkb === String(item.id_tkb)) return true;
        if (priv.ma_mon === String(item.ma_mon) && priv.ngay_hoc === dateStr && priv.tiet_bat_dau === String(startPeriod)) {
          return true;
        }
      }
      // Fallback matching by title and start time
      const evStart = ev.start?.dateTime || '';
      if (evStart.startsWith(`${dateStr}T${startTimeStr}`) && (ev.summary || '').includes(item.ma_mon)) {
        return true;
      }
      return false;
    });

    if (existing) {
      // Check for mismatched information between Google Calendar and FTU Portal
      const existingLoc = (existing.location || '').trim();
      const newLoc = expectedLocation.trim();
      const existingPriv = existing.extendedProperties?.private || {};

      const roomMismatched = existingLoc !== newLoc || (existingPriv.ma_phong && existingPriv.ma_phong !== String(item.ma_phong || ''));
      const lecturerMismatched = existingPriv.ten_giang_vien && existingPriv.ten_giang_vien !== String(item.ten_giang_vien || '');
      const timeMismatched = (existing.start?.dateTime && !existing.start.dateTime.startsWith(`${dateStr}T${startTimeStr}`)) ||
                             (existing.end?.dateTime && !existing.end.dateTime.startsWith(`${dateStr}T${endTimeStr}`));
      const titleMismatched = existing.summary !== summary;

      if (roomMismatched || lecturerMismatched || timeMismatched || titleMismatched) {
        // OVERWRITE with info from the portal!
        console.log(`[Sync Week] Overwriting mismatched info for "${item.ten_mon}" in calendar:`, {
          roomMismatch: roomMismatched ? `${existingLoc} -> ${newLoc}` : 'no',
          timeMismatch: timeMismatched,
          lecturerMismatch: lecturerMismatched
        });

        await patchGoogleEvent(token, existing.id, eventPayload, calendarId);
        updatedCount++;
        changes.push({
          type: 'updated',
          subject: item.ten_mon,
          room: item.ma_phong,
          reason: roomMismatched ? `Cập nhật phòng: ${newLoc || 'Chưa xếp'}` : 'Cập nhật thông tin từ Cổng Đào Tạo'
        });
      } else {
        // Information matches perfectly, no update needed
        skippedCount++;
      }
    } else {
      // Item not present in Google Calendar: Insert new event!
      console.log(`[Sync Week] Inserting new event for "${item.ten_mon}" (${dateStr}, ${startPeriod}-${endPeriod})`);
      await insertGoogleEvent(token, eventPayload, calendarId);
      insertedCount++;
      changes.push({
        type: 'inserted',
        subject: item.ten_mon,
        room: item.ma_phong,
        time: `${dateStr} ${startTimeStr}`
      });
    }
  }

  return {
    success: true,
    calendarName,
    calendarId,
    insertedCount,
    updatedCount,
    skippedCount,
    total: weekClasses.length,
    changes
  };
}
