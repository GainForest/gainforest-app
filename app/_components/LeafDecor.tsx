import Image from "next/image";

export function LeafDecor({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/decor/leaves.png"
        alt=""
        fill
        priority
        className="object-contain object-center"
        sizes="520px"
      />
    </div>
  );
}
