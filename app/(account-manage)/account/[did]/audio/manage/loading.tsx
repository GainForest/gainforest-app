import { AudioManageLoadingSkeleton } from "@/app/account/_components/ManageWorkspaceSkeletons";

// This route lives outside the profile segment, so its own fallback must name
// the first paint: the AudioMoth workspace, not the account's Overview tiles.
export default function AudioManageLoading() {
  return <AudioManageLoadingSkeleton />;
}
