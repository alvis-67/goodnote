import { neon } from "@neondatabase/serverless";

import { normalizeEmail } from "../lib/auth/email";
import { hashPassword, passwordError } from "../lib/auth/password";

// Reads the password from stdin. Do not pass it as an argument, and do not print it.
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }

  process.stderr.write("New admin password: ");
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return await new Promise((resolve, reject) => {
    let value = "";
    const onData = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stderr.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u0003") {
        stdin.setRawMode(false);
        process.stderr.write("\n");
        reject(new Error("cancelled"));
        return;
      }
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!email || !databaseUrl) {
    console.error(
      "Set ADMIN_EMAIL and DATABASE_URL_UNPOOLED. Type the password into stdin; do not pass it as an argument.",
    );
    process.exit(1);
  }

  const password = await readPassword();
  const problem = passwordError(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const sql = neon(databaseUrl);
  try {
    const rows = await sql`
      with updated as (
        update admin_allowlist
        set password_hash = ${passwordHash},
            password_changed_at = now()
        where email = ${email}
        returning email
      ),
      revoked as (
        update sessions
        set revoked_at = now()
        from updated
        where sessions.admin_email = updated.email
          and sessions.revoked_at is null
        returning sessions.id
      )
      select
        (select count(*)::int from updated) as updated_count,
        (select count(*)::int from revoked) as revoked_count
    `;
    if (Number(rows[0]?.updated_count ?? 0) !== 1) {
      console.error("That email is not on admin_allowlist. No password was stored.");
      process.exit(1);
    }
  } catch {
    console.error("Could not update the admin password.");
    process.exit(1);
  }

  console.log("Admin password updated. Existing sessions for that account were revoked.");
}

main().catch(() => {
  console.error("Could not update the admin password.");
  process.exit(1);
});
