import type { Metadata } from "next";
import { DeviceMonitor } from "../_components/DeviceMonitor";
import { fetchDevices } from "../_lib/devices";

// Dynamic so the page reflects the HEALTHCHECKS_API_KEY env var at request
// time (set in the deployment, not at build) and the freshest heartbeats. The
// client poller then keeps it live via /api/devices.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tainá devices",
  description:
    "Liveness of the GainForest field Raspberry Pis running Tainá; heartbeat status, CPU temperature, memory, disk, uptime, and the local draft queue.",
  alternates: { canonical: "/devices" },
};

export default async function DevicesPage() {
  const initial = await fetchDevices();
  return <DeviceMonitor initial={initial} />;
}
