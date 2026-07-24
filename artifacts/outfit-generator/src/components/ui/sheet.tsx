import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// Stub sub-components expected by sidebar.tsx (unused in this app but must type-check)
export function SheetContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { side?: string }) {
  return <div {...props}>{children}</div>;
}
export function SheetHeader({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
export function SheetTitle({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props}>{children}</h2>;
}
export function SheetDescription({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props}>{children}</p>;
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  [key: string]: unknown;
}

export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 md:left-[220px] bg-black/40 backdrop-blur-sm z-50"
          />
          
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 md:left-[220px] right-0 max-h-[90vh] bg-white border-t-4 border-black rounded-t-3xl z-50 flex flex-col shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)]"
          >
            <div className="p-4 flex justify-between items-center border-b-2 border-black bg-primary rounded-t-[1.3rem]">
              <h2 className="font-display font-bold text-2xl uppercase">{title}</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="w-10 h-10 bg-white border-2 border-black rounded-full flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
