export const ports = {
  prod: { api: null, frontend: null },
  dev: { api: 19700, frontend: 9000 },
  e2e: { api: 19701, frontend: 9001 },
  manual: { api: 19702, frontend: 9002 },
} as const;

export type Env = keyof typeof ports;

export function getPorts(env: Env = 'dev') {
  return ports[env];
}