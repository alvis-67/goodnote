import { connection } from "next/server";
import { redirect } from "next/navigation";

export default async function RetiredClientLink() {
  await connection();
  redirect("/client/login");
}
