import { normalizeEmail } from "@/lib/auth/email";
import { normalizeLoginName } from "@/lib/auth/login-name";
import { passwordError } from "@/lib/auth/password";

export type ClientDraft = {
  companyName: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
};

export type ClientAccountDraft = ClientDraft & {
  loginName: string;
  email: string | null;
  password: string;
};

export function parseClientDraft(input: {
  companyName: string;
  contactName: string;
  phone: string;
  notes: string;
}): { ok: true; value: ClientDraft } | { ok: false; error: string } {
  const companyName = input.companyName.trim();
  const contactName = input.contactName.trim();
  const phone = input.phone.trim();
  const notes = input.notes.trim();

  if (!companyName) return { ok: false, error: "請填寫公司名稱。" };
  if (companyName.length > 120) return { ok: false, error: "公司名稱太長。" };
  if (contactName.length > 80) return { ok: false, error: "聯絡人姓名太長。" };
  if (phone.length > 40) return { ok: false, error: "電話太長。" };
  if (notes.length > 2000) return { ok: false, error: "備註太長。" };

  return {
    ok: true,
    value: {
      companyName,
      contactName: contactName || null,
      phone: phone || null,
      notes: notes || null,
    },
  };
}

export function optionalEmail(value: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  const email = normalizeEmail(trimmed);
  if (!email) return { ok: false, error: "請輸入有效的電郵地址，或留空。" };
  return { ok: true, value: email };
}

export function parseClientAccount(input: {
  companyName: string;
  contactName: string;
  phone: string;
  notes: string;
  loginName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): { ok: true; value: ClientAccountDraft } | { ok: false; error: string } {
  const draft = parseClientDraft(input);
  if (!draft.ok) return draft;
  const loginName = normalizeLoginName(input.loginName);
  if (!loginName) return { ok: false, error: "請填寫 2 至 40 個字元的登入名稱，不能有空白。" };
  const email = optionalEmail(input.email);
  if (!email.ok) return email;
  const passwordProblem = passwordError(input.password);
  if (passwordProblem) return { ok: false, error: passwordProblem };
  if (input.password !== input.confirmPassword) return { ok: false, error: "兩次輸入的密碼不相同。" };
  return {
    ok: true,
    value: {
      ...draft.value,
      loginName,
      email: email.value,
      password: input.password,
    },
  };
}

export function parseMessageBody(body: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = body.trim();
  if (value.length > 4000) return { ok: false, error: "內容太長，請精簡至 4000 字以內。" };
  return { ok: true, value };
}
