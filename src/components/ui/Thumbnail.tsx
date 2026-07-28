import { Music4, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/cn";

export function Thumbnail({
  src,
  alt,
  audioOnly = false,
  className,
  overlay,
}: {
  src: string | null | undefined;
  alt: string;
  audioOnly?: boolean;
  className?: string;
  overlay?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border border-hairline bg-canvas-soft",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-ink-faint">
          {audioOnly ? (
            <Music4 className="size-1/3 max-h-8 max-w-8" />
          ) : (
            <Video className="size-1/3 max-h-8 max-w-8" />
          )}
        </div>
      )}
      {overlay ? (
        <span className="absolute right-1 bottom-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[0.65rem] font-medium text-white tabular-nums">
          {overlay}
        </span>
      ) : null}
    </div>
  );
}
