import { InlinePhone } from "@/components/inline-phone";
import { splitHongKongPhoneText } from "@/lib/phone";

export function MessageBody({ text, mine }: { text: string; mine: boolean }) {
  const parts = splitHongKongPhoneText(text);
  return (
    <p className="mt-2 whitespace-pre-wrap text-base leading-7">
      {parts.map((part, index) => {
        const key = `${offsetOf(parts, index)}-${part.type}`;
        if (part.type === "text") return <span key={key}>{part.text}</span>;
        return <InlinePhone key={key} phone={part.text} mine={mine} />;
      })}
    </p>
  );
}

function offsetOf(parts: Array<{ text: string }>, index: number): number {
  let offset = 0;
  for (let cursor = 0; cursor < index; cursor += 1) offset += parts[cursor]?.text.length ?? 0;
  return offset;
}
