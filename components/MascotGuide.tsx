import React from 'react';
import { motion } from 'framer-motion';

interface MascotGuideProps {
  message: string;
  animate?: 'wave' | 'confetti' | null;
}

const MascotGuide: React.FC<MascotGuideProps> = ({ message, animate }) => {
  return (
    <div className="flex flex-col items-center mb-6">
        <motion.img
          src="/monkey.png"
          alt="App Mascot"
          className="w-24 h-24 rounded-full border-2 border-yellow-400 shadow-lg mb-2"
          initial={{ rotate: 0 }}
          animate={animate === 'wave' ? { rotate: [0, 20, -20, 0] } : {}}
          transition={{ duration: 1, repeat: 2 }}
        />
      {animate === 'confetti' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="absolute mt-2"
        >
          {/* Simple confetti effect */}
          <span role="img" aria-label="confetti" style={{ fontSize: '2rem' }}>🎉</span>
        </motion.div>
      )}
      <div className="bg-white/80 text-gray-900 rounded-xl px-4 py-2 shadow text-center text-base font-semibold max-w-xs">
        {message}
      </div>
    </div>
  );
};

export default MascotGuide;
