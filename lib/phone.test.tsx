import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientPhone } from "../components/client-phone";
import { copyPhoneNumber, phoneCallHref, phoneCopyText } from "./phone";

test("a client phone can be dialled and copied without changing how it reads", async () => {
  assert.equal(phoneCallHref("9123 4567"), "tel:91234567");
  assert.equal(phoneCopyText("9123 4567"), "9123 4567");
  assert.equal(phoneCallHref("+852 9123-4567"), "tel:+85291234567");
  assert.equal(phoneCopyText("  +852 9123-4567  "), "+852 9123-4567");
  assert.equal(phoneCallHref(""), null);
  assert.equal(phoneCallHref("   "), null);
  assert.equal(phoneCopyText("abc"), null);
  assert.equal(phoneCallHref("javascript:alert(1)"), null);
  assert.equal(phoneCallHref("https://example.com"), null);
  const hostile = phoneCallHref("tel:javascript:alert(1)");
  if (hostile) assert.match(hostile, /^tel:\+?\d+$/);

  const html = renderToStaticMarkup(createElement(ClientPhone, { phone: "9123 4567" }));
  assert.match(html, /href="tel:91234567"/);
  assert.match(html, /aria-label="致電 9123 4567"/);
  assert.match(html, />9123 4567</);
  assert.match(html, /複製號碼/);
  assert.match(html, /aria-label="複製 9123 4567"/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /whatsapp|WhatsApp|wa\.me/i);

  const international = renderToStaticMarkup(createElement(ClientPhone, { phone: "+852 9123 4567" }));
  assert.match(international, /href="tel:\+85291234567"|href="tel:&#43;85291234567"/);
  assert.match(international, /\+852 9123 4567/);

  assert.equal(renderToStaticMarkup(createElement(ClientPhone, { phone: "   " })), "");
  const plain = renderToStaticMarkup(createElement(ClientPhone, { phone: "沒有號碼" }));
  assert.match(plain, /沒有號碼/);
  assert.doesNotMatch(plain, /href=|複製號碼|tel:/);

  const copied: string[] = [];
  assert.equal(
    await copyPhoneNumber("9123 4567", {
      writeText: async (value) => {
        copied.push(value);
      },
    }),
    true,
  );
  assert.deepEqual(copied, ["9123 4567"]);
  let called = false;
  assert.equal(
    await copyPhoneNumber("   ", {
      writeText: async () => {
        called = true;
      },
    }),
    false,
  );
  assert.equal(called, false);
  assert.equal(
    await copyPhoneNumber("9123 4567", {
      writeText: async () => {
        throw new Error("denied");
      },
    }),
    false,
  );
});

test("the request sidebar offers the phone only when a client has one", () => {
  const adminPage = readFileSync(new URL("../app/admin/(desk)/requests/[id]/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/(portal)/requests/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(adminPage, /\{client\.phone \? <ClientPhone phone=\{client\.phone\} \/> : null\}/);
  assert.doesNotMatch(adminPage, /whatsapp|WhatsApp|wa\.me/i);
  assert.doesNotMatch(clientPage, /ClientPhone|tel:|client\.phone/);
});
