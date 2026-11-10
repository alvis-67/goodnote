import assert from "node:assert/strict";
import test from "node:test";

import { parseClientAccount, parseClientDraft, parseMessageBody } from "./clients";

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

test("a new client account requires a unique-style login name and treats email as optional", () => {
  const parsed = parseClientAccount({
    companyName: "甲工程公司",
    contactName: "",
    phone: "",
    notes: "",
    loginName: " Chan-Co ",
    email: " ",
    password: "test-password-1",
    confirmPassword: "test-password-1",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.loginName, "chan-co");
    assert.equal(parsed.value.email, null);
  }
  assert.equal(
    parseClientAccount({
      companyName: "甲工程公司",
      contactName: "",
      phone: "",
      notes: "",
      loginName: "chan-co",
      email: "not-an-email",
      password: "test-password-1",
      confirmPassword: "test-password-1",
    }).ok,
    false,
  );
  assert.equal(
    parseClientAccount({
      companyName: "甲工程公司",
      contactName: "",
      phone: "",
      notes: "",
      loginName: "chan-co",
      email: "",
      password: "test-password-1",
      confirmPassword: "different-password",
    }).ok,
    false,
  );
});

test("message bodies are trimmed and length limited", () => {
  const parsed = parseMessageBody("  請出報價  ");
  assert.equal(parsed.ok && parsed.value, "請出報價");
  assert.equal(parseMessageBody("字".repeat(4001)).ok, false);
});
