export type AdminLoginCode = "invalid_email" | "not_allowlisted" | "password_unset" | "password_wrong";

export type ClientLoginCode = "invalid_login_name" | "credentials";

export function adminLoginError(code: AdminLoginCode): string {
  switch (code) {
    case "invalid_email":
      return "請輸入有效的電郵地址。";
    case "not_allowlisted":
      return "這個電郵不在管理員允許清單內。";
    case "password_unset":
      return "這個帳戶尚未設定密碼。";
    case "password_wrong":
      return "電郵或密碼不正確。";
  }
}

export function clientLoginError(code: ClientLoginCode): string {
  switch (code) {
    case "invalid_login_name":
      return "請輸入登入名稱。";
    case "credentials":
      return "登入名稱或密碼不正確。";
  }
}
