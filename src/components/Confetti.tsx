"use client";
import { motion } from "framer-motion";

const pieces = Array.from({ length: 40 }, (_, i) => i);
export default function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
      {pieces.map(i => (
        <motion.span key={i} className="absolute w-3 h-3 rounded-sm" style={{ left: `${(i*97)%100}%`, background: ["#f59e0b","#22d3ee","#f43f5e","#a3e635","#fff"][i%5] }}
          initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: "110vh", opacity: 0.9, rotate: 360 }} transition={{ duration: 3 + (i%5), delay: (i%10)*0.1, ease: "linear" }} />
      ))}
    </div>
  );
}
