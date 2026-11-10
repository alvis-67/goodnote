import assert from "node:assert/strict";
import test from "node:test";

import { parseClientDraft, parseMessageBody } from "./clients";

test("client drafts require a company name and drop blank optional fields", () => {
  const parsed = parseClientDraft({
    companyName: "  甲工程公司  ",
    contactName: " ",
    phone: "",
    notes: "內部",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.companyName, "甲工程公司");
    assert.equal(parsed.value.contactName, null);
    assert.equal(parsed.value.notes, "內部");
  }
  assert.equal(parseClientDraft({ companyName: " ", contactName: "", phone: "", notes: "" }).ok, false);
});

test("message bodies are trimmed and length limited", () => {
  const parsed = parseMessageBody("  請出報價  ");
  assert.equal(parsed.ok && parsed.value, "請出報價");
  assert.equal(parseMessageBody("字".repeat(4001)).ok, false);
});
