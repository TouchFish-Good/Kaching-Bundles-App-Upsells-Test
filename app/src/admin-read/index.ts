import { AdminRegistry } from './registry';

export const adminRegistry = new AdminRegistry(`${process.cwd()}/admin-read.sqlite`);
export const adminRegistryReady = adminRegistry.ready();
