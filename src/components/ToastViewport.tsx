import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { useToast, type ToastTone } from "../state/toast";

const ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "text-violet",
  success: "text-positive",
  error: "text-negative",
};

export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="glass pointer-events-auto flex gap-3 rounded-card border border-hairline p-3 shadow-panel"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_CLASSES[toast.tone]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed break-words text-ink-muted">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="focus-ring -mt-0.5 -mr-0.5 size-6 shrink-0 cursor-pointer rounded-md text-ink-faint transition-colors hover:text-ink"
              >
                <X className="mx-auto size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
