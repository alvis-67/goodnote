export type ClientDraft = {
  companyName: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
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

export function parseMessageBody(body: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = body.trim();
  if (value.length > 4000) return { ok: false, error: "內容太長，請精簡至 4000 字以內。" };
  return { ok: true, value };
}
