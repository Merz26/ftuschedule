export const PERIOD_MAP = {
  1: { start: '06:45', end: '09:00' }, // Shift 1 (Tiết 1 to 3)
  4: { start: '09:15', end: '11:30' }, // Shift 2 (Tiết 4 to 6)
  7: { start: '12:30', end: '14:45' }, // Shift 3 (Tiết 7 to 9)
  10: { start: '15:00', end: '17:15' } // Shift 4 (Tiết 10 to 12)
};

export function generateICS(events) {
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FTU Schedule Sync//EN',
    'CALSCALE:GREGORIAN'
  ];

  events.forEach(ev => {
    ics.push(
      'BEGIN:VEVENT',
      `SUMMARY:${ev.title}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${formatICSDate(ev.start)}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${formatICSDate(ev.end)}`,
      `LOCATION:${ev.room}`,
      `DESCRIPTION:Course: ${ev.courseCode}\\nLecturer: ${ev.lecturer}`
    );
    if (ev.rrule) {
      ics.push(`RRULE:${ev.rrule}`);
    }
    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function parseVietnameseDate(dateStr) {
    // Expected format: DD/MM/YY
    const parts = dateStr.split('/');
    if(parts.length !== 3) return null;
    const year = 2000 + parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[0], 10);
    return new Date(year, month, day);
}

export function parseExcel(fileBlob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                if (!window.XLSX) throw new Error("SheetJS not loaded");
                const workbook = window.XLSX.read(data, {type: 'array'});
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet);
                
                const events = [];
                json.forEach(row => {
                    const code = row['Mã MH'];
                    const title = row['Tên môn học'];
                    const room = row['Phòng'];
                    const lecturer = row['Giảng viên'];
                    const dayOfWeek = parseInt(row['Thứ'], 10); // 2 is Monday, 3 is Tuesday...
                    const startPeriod = parseInt(row['Tiết bắt đầu'], 10);
                    
                    const timeBoundaries = row['Thời gian học'];
                    if (!timeBoundaries) return;
                    
                    const [startDateStr, endDateStr] = timeBoundaries.split(' đến ');
                    const startDate = parseVietnameseDate(startDateStr.trim());
                    const endDate = parseVietnameseDate(endDateStr.trim());
                    
                    if(!startDate || !endDate) return;
                    
                    // Map start period to actual time
                    const periodTime = PERIOD_MAP[startPeriod];
                    if(!periodTime) return;
                    
                    // Adjust start date to the correct day of the week
                    let eventStart = new Date(startDate);
                    const targetDay = dayOfWeek === 8 ? 0 : dayOfWeek - 1; // JS Date: 0 is Sun, 1 is Mon
                    while(eventStart.getDay() !== targetDay) {
                        eventStart.setDate(eventStart.getDate() + 1);
                    }
                    
                    const [startH, startM] = periodTime.start.split(':');
                    eventStart.setHours(parseInt(startH), parseInt(startM), 0, 0);
                    
                    let eventEnd = new Date(eventStart);
                    const [endH, endM] = periodTime.end.split(':');
                    eventEnd.setHours(parseInt(endH), parseInt(endM), 0, 0);
                    
                    // End Date of recurrence
                    let untilDate = new Date(endDate);
                    untilDate.setHours(23, 59, 59, 0);
                    
                    events.push({
                        title: title,
                        courseCode: code,
                        room: room,
                        lecturer: lecturer,
                        start: eventStart,
                        end: eventEnd,
                        rrule: `FREQ=WEEKLY;UNTIL=${formatICSDate(untilDate)}`
                    });
                });
                resolve(events);
            } catch(err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(fileBlob);
    });
}
