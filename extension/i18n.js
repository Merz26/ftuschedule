export const dict = {
  en: {
    title: "FTU Schedule Sync",
    portal_status: "Portal Session",
    google_status: "Google Calendar",
    connected: "Connected",
    disconnected: "Disconnected",
    not_authorized: "Not Authorized",
    session_expired: "Session Expired",
    run_diagnostic: "Run Diagnostic Test",
    today_classes: "Today's Classes",
    no_classes: "No classes today! 🎉",
    disconnect: "Disconnect / Sign Out",
    connect_google: "Connect Google Account",
    portal_credentials: "Portal Credentials",
    student_id: "Student ID",
    password: "Password",
    save: "Save",
    manual_tools: "Manual Tools & ICS Export",
    export_semester: "Export Full Semester (.ics)",
    export_makeup: "Export Makeup Classes (.ics)",
    drop_excel: "Drop Export_TKB.xlsx here",
    shift: "Period",
    room: "Room",
    lecturer: "Lecturer",
    account_menu: "Confirmed Accounts",
    google_account: "Google Account",
    portal_account: "FTU Student Profile",
    student_name: "Name",
    student_email: "FTU Email",
    student_role: "Role",
    tkb_tuan_status: "Weekly Schedule (/tkb-tuan)",
    tkb_tuan_verified: "✓ /tkb-tuan Verified",
    tkb_tuan_failed: "✗ /tkb-tuan Inaccessible",
    switch_account: "Switch Account",
    toggle_details: "Account Details",
    verify_now: "Verify /tkb-tuan",
    sync_now: "Sync Schedule Now",
    sync_week_title: "Sync Week to Google Calendar",
    label_select_week: "Select Week to Sync",
    btn_sync_week: "📅 Sync Week to \"FTU Schedule\"",
    enter_credentials_msg: "Please enter Student ID and Password in Portal Credentials section"
  },
  vi: {
    title: "Đồng bộ TKB FTU",
    portal_status: "Phiên đăng nhập Cổng",
    google_status: "Google Calendar",
    connected: "Đã kết nối",
    disconnected: "Ngắt kết nối",
    not_authorized: "Chưa xác thực",
    session_expired: "Hết hạn phiên",
    run_diagnostic: "Chạy chẩn đoán",
    today_classes: "Lớp học hôm nay",
    no_classes: "Hôm nay không có tiết! 🎉",
    disconnect: "Ngắt kết nối / Đăng xuất",
    connect_google: "Kết nối tài khoản Google",
    portal_credentials: "Thông tin Cổng Đào Tạo",
    student_id: "Mã sinh viên",
    password: "Mật khẩu",
    save: "Lưu",
    manual_tools: "Công cụ thủ công & Xuất ICS",
    export_semester: "Xuất TKB cả kỳ (.ics)",
    export_makeup: "Xuất TKB học bù (.ics)",
    drop_excel: "Kéo thả Export_TKB.xlsx vào đây",
    shift: "Tiết",
    room: "Phòng",
    lecturer: "Giảng viên",
    account_menu: "Xác nhận Tài khoản",
    google_account: "Tài khoản Google",
    portal_account: "Hồ sơ Sinh viên FTU",
    student_name: "Họ và tên",
    student_email: "Email FTU",
    student_role: "Vai trò",
    tkb_tuan_status: "Thời khóa biểu tuần (/tkb-tuan)",
    tkb_tuan_verified: "✓ /tkb-tuan Đã xác thực",
    tkb_tuan_failed: "✗ Không thể truy cập /tkb-tuan",
    switch_account: "Đổi tài khoản",
    toggle_details: "Chi tiết tài khoản",
    verify_now: "Kiểm tra /tkb-tuan",
    sync_now: "Đồng bộ TKB ngay",
    sync_week_title: "Đồng bộ Tuần sang Google Calendar",
    label_select_week: "Chọn tuần cần đồng bộ",
    btn_sync_week: "📅 Đồng bộ Tuần vào \"FTU Schedule\"",
    enter_credentials_msg: "Vui lòng nhập Mã sinh viên và Mật khẩu trong phần Thông tin Cổng Đào Tạo"
  }
};

let currentLang = 'vi';

export function setLang(lang) {
  currentLang = lang;
}

export function getLang() {
    return currentLang;
}

export function t(key) {
  return dict[currentLang][key] || key;
}
