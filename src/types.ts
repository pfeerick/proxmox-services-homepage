export interface ServiceDefinition {
  port: number | null | undefined;
  name: string;
  icon: string;
  description: string;
  protocol?: string;
}

export interface ServiceInfo {
  name: string;
  icon: string;
  url: string;
  description: string;
  container_name: string;
}

export interface Container {
  vmid: number;
  name: string;
  status: "running" | "stopped" | "unknown";
  node: string;
  ip: string;
  uptime: number;
  memory_usage: number;
  memory_max: number;
  service: ServiceDefinition | null;
}

export type ServiceMap = Record<string, ServiceDefinition>;

export interface ProxmoxConfig {
  host: string;
  user: string;
  token: string;
  ssl_verify: boolean | string;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface DashboardConfig {
  auto_refresh_seconds: number;
  title: string;
}

export interface AppConfig {
  proxmox: ProxmoxConfig;
  server: ServerConfig;
  dashboard: DashboardConfig;
}
