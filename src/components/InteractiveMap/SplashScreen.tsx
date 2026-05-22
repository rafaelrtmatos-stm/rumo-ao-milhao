import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  logoUrl: string;
  title?: string;
  isLoading: boolean;
  duration?: number;
  onComplete?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  logoUrl,
  title = 'Carregando',
  isLoading,
  duration = 2000,
  onComplete,
}) => {
  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [isLoading, duration, onComplete]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center"
        >
          {/* Logo with fade animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              duration: 0.6,
              ease: 'easeOut',
            }}
            className="mb-6"
          >
            <img
              src={logoUrl}
              alt={title}
              className="w-40 h-40 md:w-48 md:h-48 object-contain"
            />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{
              duration: 0.6,
              delay: 0.2,
              ease: 'easeOut',
            }}
            className="text-2xl md:text-3xl font-bold text-gray-800"
          >
            {title}
          </motion.h1>

          {/* Loading indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.4,
              ease: 'easeOut',
            }}
            className="mt-8"
          >
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                  className="w-2 h-2 bg-blue-500 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
