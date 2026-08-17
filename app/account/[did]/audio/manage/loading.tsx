import { AudioManageLoadingSkeleton } from "../../../_components/ManageWorkspaceSkeletons";

// Without this file the route inherits the profile's Overview-shaped skeleton,
// which mirrors folder tiles and a share card this page never shows — and
// renders unpadded, since AccountChrome passes manage routes through bare.
export default function AudioManageLoading() {
  return <AudioManageLoadingSkeleton />;
}
