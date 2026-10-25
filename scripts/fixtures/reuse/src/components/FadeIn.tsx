import { motion } from "framer-motion";

export function FadeIn({ children }: { children: unknown }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.42 }}>
      {children as never}
    </motion.div>
  );
}
