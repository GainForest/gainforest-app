import { AwardIcon, CameraIcon, SproutIcon, TrophyIcon } from "lucide-react";
import { parseRecognitionBadgeKey } from "@/app/_lib/recognition-badges";

/** Icon for one recognition badge key (manual or round-scoped BioBlitz). */
export function recognitionBadgeIcon(key: string): typeof SproutIcon {
  const parsed = parseRecognitionBadgeKey(key);
  if (parsed?.family === "manual") return SproutIcon;
  if (parsed?.family === "bioblitz") {
    return parsed.prize === "most-images" ? TrophyIcon : CameraIcon;
  }
  return AwardIcon;
}
