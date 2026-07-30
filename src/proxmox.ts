import { readFileSync } from "node:fs";
import type { Container, ServiceMap } from "./types.ts";
import { extractIpFromConfig, getServiceInfo } from "./utils.ts";

interface LxcEntry {
  vmid: number;
  name?: string;
  status: string;
  uptime?: number;
  mem?: number;
  maxmem?: number;
}

interface NetworkInterface {
  name?: string;
  inet?: string;
}

type FetchOptions = RequestInit & {
  tls?: { rejectUnauthorized?: boolean; ca?: string };
};

export class ProxmoxAPI {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchOptions: FetchOptions;

  constructor(host: string, user: string, token: string, sslVerify: boolean | string = false) {
    this.baseUrl = `https://${host}/api2/json`;
    this.headers = { Authorization: `PVEAPIToken=${user}=${token}` };

    if (sslVerify === false) {
      this.fetchOptions = { tls: { rejectUnauthorized: false } };
    } else if (typeof sslVerify === "string") {
      const ca = readFileSync(sslVerify, "utf-8");
      this.fetchOptions = { tls: { ca } };
    } else {
      this.fetchOptions = {};
    }
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers,
      ...this.fetchOptions,
    } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.get("/nodes");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  /**
   * Fetch every LXC container across all nodes.
   *
   * Throws if the node list or a node's container list can't be retrieved, so the
   * caller can tell "Proxmox is unreachable" apart from "there are no containers"
   * and avoid replacing a good cache with an empty one. Per-container detail lookups
   * stay best-effort — one unreadable container shouldn't fail the whole poll.
   */
  async getContainers(serviceMap: ServiceMap): Promise<Container[]> {
    const nodesRes = await this.get<{ data: Array<{ node: string }> }>("/nodes");

    // Nodes, and the containers within each node, are fetched concurrently. Each
    // container costs two or three round trips, so walking them sequentially made
    // the poll duration scale with the size of the cluster.
    const perNode = await Promise.all(
      nodesRes.data.map(async ({ node }) => {
        const lxcRes = await this.get<{ data: LxcEntry[] }>(`/nodes/${node}/lxc`);
        return Promise.all(lxcRes.data.map((ct) => this.toContainer(node, ct, serviceMap)));
      }),
    );

    return perNode.flat();
  }

  private async toContainer(
    node: string,
    ct: LxcEntry,
    serviceMap: ServiceMap,
  ): Promise<Container> {
    let ip: string | null = null;

    const configRes = await this.get<{ data: Record<string, unknown> }>(
      `/nodes/${node}/lxc/${ct.vmid}/config`,
    ).catch(() => null);

    if (configRes) ip = extractIpFromConfig(configRes.data);

    if (!ip && ct.status === "running") {
      ip = await this.getActualIp(node, ct.vmid);
    }

    const name = ct.name ?? `CT-${ct.vmid}`;
    return {
      vmid: ct.vmid,
      name,
      status: ct.status as Container["status"],
      node,
      ip: ip ?? "DHCP/Unknown",
      uptime: ct.uptime ?? 0,
      memory_usage: ct.mem ?? 0,
      memory_max: ct.maxmem ?? 0,
      service: getServiceInfo(name, serviceMap),
    };
  }

  private async getActualIp(node: string, vmid: number): Promise<string | null> {
    try {
      const statusRes = await this.get<{ data: Record<string, unknown> }>(
        `/nodes/${node}/lxc/${vmid}/status/current`,
      );

      if (!("netin" in statusRes.data || "netout" in statusRes.data)) return null;

      const ifRes = await this.get<{ data: NetworkInterface[] }>(
        `/nodes/${node}/lxc/${vmid}/interfaces`,
      ).catch(() => null);

      if (!ifRes) return null;

      const eth0 = ifRes.data.find((i) => i.name === "eth0" && i.inet);
      if (eth0?.inet) return eth0.inet.split("/")[0];

      const fallback = ifRes.data.find((i) => i.name !== "lo" && i.inet);
      if (fallback?.inet) return fallback.inet.split("/")[0];
    } catch (e) {
      console.error(`Error getting actual IP for container ${vmid}:`, e);
    }
    return null;
  }
}
