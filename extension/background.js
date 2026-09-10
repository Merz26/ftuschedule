import { getSessionToken } from './portalService.js';

// Background Service Worker

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailySync') {
        runBackgroundSync();
    }
});

// Run once a day at 12:00 PM
chrome.alarms.create('dailySync', {
    when: getNextNoon(),
    periodInMinutes: 24 * 60
});

function getNextNoon() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    if (d.getTime() < Date.now()) {
        d.setDate(d.getDate() + 1);
    }
    return d.getTime();
}

async function runBackgroundSync() {
    try {
        const result = await getSessionToken();
        if (!result || !result.success || !result.token) {
            console.warn(`Background sync failed: ${result?.error || 'No token available'}. User must log in again.`);
            return;
        }
        const token = result.token;
        
        // Notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'FTU Schedule Sync',
            message: 'Background sync completed successfully!'
        });
    } catch(e) {
        console.error('Background sync failed', e);
    }
}
