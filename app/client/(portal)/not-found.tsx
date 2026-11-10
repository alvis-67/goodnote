import { ClientListLink } from "@/components/client-list-link";

export default function ClientRequestNotFound() {
  return (
    <main>
      <ClientListLink />
      <h1 className="mt-1 text-2xl font-semibold">找不到這個請求</h1>
      <p className="mt-2 text-muted">它可能不屬於這個帳戶。</p>
    </main>
  );
}
