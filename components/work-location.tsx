import { displayWorkLocation } from "@/lib/work-location";

export function WorkLocation({ location }: { location: string | null }) {
  const value = displayWorkLocation(location);
  if (!value) return null;
  return (
    <p className="mt-1 text-sm leading-6">
      <span className="font-semibold">工作地點</span>
      <span className="ml-2">{value}</span>
    </p>
  );
}
