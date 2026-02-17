import { Monitor } from "lucide-react";
import { getIdeColor, getIdeIcon } from "../utils/formatters";

interface IdeIconProps {
  ideId: string;
  iconBase64?: string;
  size?: number;
  className?: string;
}

export default function IdeIcon({ ideId, iconBase64, size = 36, className = "" }: IdeIconProps) {
  if (iconBase64) {
    return (
      <img
        src={`data:image/png;base64,${iconBase64}`}
        alt={ideId}
        className={`rounded-lg shadow-sm object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm ${className}`}
      style={{ width: size, height: size, backgroundColor: getIdeColor(ideId) }}
    >
      {size >= 28 ? <Monitor size={size * 0.5} /> : getIdeIcon(ideId)}
    </div>
  );
}
