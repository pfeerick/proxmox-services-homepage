import type { Container, ServiceDefinition, ServiceInfo, ServiceMap } from "./types.ts";

/** Extract a static IP from a Proxmox LXC network config string, or return null. */
export function extractIpFromConfig(lxcConfig: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(lxcConfig)) {
    if (!key.startsWith("net") || typeof value !== "string") continue;
    if (!value.includes("ip=")) continue;
    for (const part of value.split(",")) {
      if (part.trim().startsWith("ip=")) {
        const ipWithSubnet = part.trim().slice(3);
        if (ipWithSubnet.toLowerCase() !== "dhcp") {
          return ipWithSubnet.split("/")[0];
        }
      }
    }
  }
  return null;
}

/** Look up service info for a container by exact name or prefix match. */
export function getServiceInfo(
  containerName: string,
  serviceMap: ServiceMap,
): ServiceDefinition | null {
  if (containerName in serviceMap) return serviceMap[containerName];
  for (const serviceName of Object.keys(serviceMap)) {
    if (containerName.startsWith(serviceName)) return serviceMap[serviceName];
  }
  return null;
}

/** Derive the running-services list from a containers snapshot. */
export function computeServices(containers: Container[]): ServiceInfo[] {
  const services: ServiceInfo[] = [];
  for (const ct of containers) {
    if (ct.status === "running" && ct.ip !== "DHCP/Unknown" && ct.service?.port) {
      const protocol = ct.service.protocol ?? "http";
      services.push({
        name: ct.service.name,
        icon: ct.service.icon,
        url: `${protocol}://${ct.ip}:${ct.service.port}`,
        description: ct.service.description,
        container_name: ct.name,
      });
    }
  }
  return services.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
