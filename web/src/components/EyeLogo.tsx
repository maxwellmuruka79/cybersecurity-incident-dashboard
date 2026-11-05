import { LOGO_SRC } from "../lib/brand";

// The SENTRIX eye as a transparent PNG (sidebar and login screen).
export default function EyeLogo({ className = "w-8" }: { className?: string }) {
  return <img src={LOGO_SRC} alt="SENTRIX" className={`h-auto select-none ${className}`} draggable={false} />;
}