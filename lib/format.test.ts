import assert from "node:assert/strict";
import test from "node:test";

import { excerpt, formatBytes, formatRelative } from "./format";

test("relative times stay in Traditional Chinese", () => {
  const now = new Date("2026-11-10T08:00:00Z");
  assert.equal(formatRelative("2026-11-10T07:59:40Z", now), "剛剛");
  assert.equal(formatRelative("2026-11-10T07:30:00Z", now), "30 分鐘前");
  assert.equal(formatRelative("2026-11-10T05:00:00Z", now), "3 小時前");
  assert.equal(formatRelative("2026-11-08T08:00:00Z", now), "2 日前");
});

test("excerpts collapse whitespace and mark file-only messages", () => {
  assert.equal(excerpt("  請出\n報價  "), "請出 報價");
  assert.equal(excerpt("   "), "已上載檔案");
  assert.equal(excerpt("一二三四五六七八九十", 4), "一二三四…");
});

test("file sizes use KB and MB", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
});
