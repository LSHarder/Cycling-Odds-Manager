import { Shirt } from "lucide-react";

export type JerseyType = "yellow" | "green" | "polkadot" | "white" | string;

export function JerseyIcon({ type, className = "" }: { type: JerseyType; className?: string }) {
  if (type === "yellow") {
    return <Shirt className={`fill-[#FFD700] text-[#FFD700] stroke-black ${className}`} />;
  }
  if (type === "green") {
    return <Shirt className={`fill-[#00B140] text-[#00B140] stroke-black ${className}`} />;
  }
  if (type === "white") {
    return <Shirt className={`fill-white text-white stroke-black ${className}`} />;
  }
  if (type === "polkadot") {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        <Shirt className="fill-white text-white stroke-black absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-[1px] p-[20%] opacity-80 mix-blend-multiply">
          <div className="w-[15%] h-[15%] rounded-full bg-[#E63946]" />
          <div className="w-[15%] h-[15%] rounded-full bg-[#E63946]" />
          <div className="w-[15%] h-[15%] rounded-full bg-[#E63946]" />
          <div className="w-[15%] h-[15%] rounded-full bg-[#E63946]" />
        </div>
      </div>
    );
  }
  return <Shirt className={`text-muted-foreground ${className}`} />;
}
