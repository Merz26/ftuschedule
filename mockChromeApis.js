// Interactive Chrome APIs for Studio Preview & Standalone Testing
// Ensure no pre-baked credentials: only use what user saves in the credential section
if (localStorage.getItem('studentId') === JSON.stringify('2415115057')) {
  localStorage.removeItem('studentId');
  localStorage.removeItem('password');
  localStorage.removeItem('portalToken');
  localStorage.removeItem('portalTokenExpiresAt');
  localStorage.removeItem('portalVerification');
  localStorage.removeItem('studentProfile');
}

window.chrome = {
  runtime: {
    getManifest: () => ({
      version: '1.0.4',
      oauth2: {
        client_id: '1068393903577-5g3l76neofv7fgdtkshfpcqcf9rprh1n.apps.googleusercontent.com',
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ]
      }
    }),
    getURL: (path) => path,
    lastError: null
  },
  storage: {
    local: {
      get: (keys, callback) => {
        let res = {};
        if (typeof keys === 'string') {
          const val = localStorage.getItem(keys);
          res[keys] = val !== null ? JSON.parse(val) : undefined;
        } else if (Array.isArray(keys)) {
          keys.forEach(k => {
            const val = localStorage.getItem(k);
            res[k] = val !== null ? JSON.parse(val) : undefined;
          });
        } else if (typeof keys === 'object' && keys !== null) {
          Object.keys(keys).forEach(k => {
            const val = localStorage.getItem(k);
            res[k] = val !== null ? JSON.parse(val) : keys[k];
          });
        }
        setTimeout(() => callback(res), 10);
      },
      set: (items, callback) => {
        Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        if (callback) setTimeout(callback, 10);
      },
      remove: (keys, callback) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach(k => localStorage.removeItem(k));
        if (callback) setTimeout(callback, 10);
      }
    }
  },
  identity: {
    getRedirectURL: () => 'https://lcjcknmplgfjdldbhgbaefbmheokkbdo.chromiumapp.org/',
    removeCachedAuthToken: ({ token }, callback) => {
      localStorage.removeItem('googleAccount');
      if (callback) callback();
    },
    getAuthToken: (options, callback) => {
      const stored = localStorage.getItem('googleAccount');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.token) {
            callback(parsed.token);
            return;
          }
        } catch(e) {}
      }
      if (options.interactive) {
        window.chrome.identity.launchWebAuthFlow({ interactive: true }, (url) => {
          if (url && url.includes('access_token=')) {
            const tok = new URL(url.replace('#', '?')).searchParams.get('access_token');
            callback(tok);
          } else {
            callback(null);
          }
        });
      } else {
        callback(null);
      }
    },
    launchWebAuthFlow: (options, callback) => {
      console.log('[Identity] Launching OAuth Sign-In flow:', options);

      // Create modal container
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.inset = '0';
      modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';
      modal.style.padding = '16px';

      modal.innerHTML = `
        <div style="background:#ffffff; color:#1f2937; border-radius:12px; max-width:340px; width:100%; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.2); font-family:system-ui,-apple-system,sans-serif;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <div style="font-size:24px;">🇬</div>
            <div>
              <h3 style="margin:0; font-size:16px; font-weight:700;">Sign in with Google</h3>
              <p style="margin:0; font-size:12px; color:#6b7280;">Google Calendar Integration</p>
            </div>
          </div>
          <p style="font-size:13px; margin:0 0 14px 0; color:#4b5563; line-height:1.4;">
            Confirm your Google account to authorize synchronization with Google Calendar:
          </p>
          <div style="margin-bottom:12px;">
            <label style="display:block; font-size:11px; font-weight:600; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Gmail Address</label>
            <input type="email" id="modal_google_email" value="lehoangphuc.contact@gmail.com" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:11px; font-weight:600; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">Display Name</label>
            <input type="text" id="modal_google_name" value="Lê Hoàng Phúc" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="modal_btn_confirm" style="background:#2563eb; color:white; border:none; padding:9px 12px; border-radius:6px; font-weight:600; font-size:13px; cursor:pointer;">
              Confirm Google Sign-In
            </button>
            <button id="modal_btn_cancel" style="background:transparent; color:#6b7280; border:1px solid #e5e7eb; padding:8px 12px; border-radius:6px; font-size:13px; cursor:pointer;">
              Cancel
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#modal_btn_confirm').onclick = () => {
        const email = modal.querySelector('#modal_google_email').value.trim() || 'lehoangphuc.contact@gmail.com';
        const name = modal.querySelector('#modal_google_name').value.trim() || 'Google User';
        const fakeToken = 'ya29.studio_' + btoa(email) + '_' + Date.now();
        
        // Save account into storage
        localStorage.setItem('googleAccount', JSON.stringify({
          token: fakeToken,
          email,
          name,
          picture: null,
          authorizedAt: new Date().toISOString()
        }));

        document.body.removeChild(modal);
        callback(`https://lcjcknmplgfjdldbhgbaefbmheokkbdo.chromiumapp.org/#access_token=${encodeURIComponent(fakeToken)}&token_type=Bearer&expires_in=3600`);
      };

      modal.querySelector('#modal_btn_cancel').onclick = () => {
        document.body.removeChild(modal);
        window.chrome.runtime.lastError = { message: 'User cancelled Google sign-in' };
        callback(null);
      };
    }
  },
  alarms: {
    create: (name, options) => console.log('Mock alarm created', name, options)
  },
  notifications: {
    create: (id, options) => console.log('Mock notification', id, options)
  },
  offscreen: {
    createDocument: () => Promise.resolve(),
    closeDocument: () => Promise.resolve()
  }
};

