import type { McpServerDefinition } from '../src/mcp/clients/types'

export interface ProjectRegistration { root: string, digest: string }
export interface BridgeConfig { schemaVersion: 1, bridgeHash: string, projects: ProjectRegistration[] }
export const declarationPath: string
export function digest(source: string): string
export function parseDeclaration(source: string): { schemaVersion: 1, server: McpServerDefinition }
export function validateRegistry(config: unknown): BridgeConfig
export function within(root: string, path: string): boolean
export function gitRoot(cwd: string): Promise<string | undefined>
export class DeepseekProjectLocationError extends Error {}
export function installRoot(cwd: string): Promise<string>
export function selectProject(cwd: string, projects: ProjectRegistration[]): Promise<ProjectRegistration | undefined>
export function readDeclaration(root: string): Promise<{ source: string, declaration: { schemaVersion: 1, server: McpServerDefinition } }>
export function apply(ctx: unknown, config: BridgeConfig): Promise<void>
