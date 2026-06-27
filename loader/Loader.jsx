"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

export default function GlobalLoader({ children }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Defer state update to avoid synchronous update warning
    const startLoading = () => {
      if (isMounted) setLoading(true);
    };

    const stopLoading = () => {
      if (isMounted) setLoading(false);
    };

    // Schedule loader start on next microtask
    queueMicrotask(startLoading);

    // Stop after delay (simulate load)
    const timer = setTimeout(stopLoading, 800);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <>
      <AnimatePresence>
        {loading && (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
          >
            {/* Spinner */}
            <div className="w-12 h-12 border-4 border-[#003f87] border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
