import type { McpServer } from '@modelcontextprotocol/server'
import process from 'node:process'
import * as z from 'zod/v4'
import { loadMetadataFile } from '../data/loader'
import { findComponent, listComponents } from '../data/metadata'
import { resolveVersion } from '../data/version'
import { lintProject } from '../utils/scanner'

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool('wot_list', {
    description: 'List available wot-ui components.',
    inputSchema: z.object({ version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ version }) => {
    const components = listComponents(version)
    return { content: [{ type: 'text', text: jsonText({ components }) }] }
  })

  server.registerTool('wot_info', {
    description: 'Get props, events, slots, and CSS variables for a component.',
    inputSchema: z.object({ component: z.string(), version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ component, version }) => {
    const result = findComponent(component, version)
    if (!result)
      return { isError: true, content: [{ type: 'text', text: `Component not found: ${component}` }] }
    return { content: [{ type: 'text', text: jsonText(result) }] }
  })

  server.registerTool('wot_doc', {
    description: 'Get component markdown documentation.',
    inputSchema: z.object({ component: z.string(), version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ component, version }) => {
    const result = findComponent(component, version)
    if (!result?.doc)
      return { isError: true, content: [{ type: 'text', text: `Documentation not found: ${component}` }] }
    return { content: [{ type: 'text', text: result.doc }] }
  })

  server.registerTool('wot_demo', {
    description: 'Get component demo code or list demos.',
    inputSchema: z.object({ component: z.string(), demo: z.string().optional(), version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ component, demo, version }) => {
    const result = findComponent(component, version)
    if (!result)
      return { isError: true, content: [{ type: 'text', text: `Component not found: ${component}` }] }
    if (!demo)
      return { content: [{ type: 'text', text: jsonText({ demos: result.demos ?? [] }) }] }
    const matched = result.demos?.find(item => item.name.toLowerCase() === demo.toLowerCase())
    if (!matched)
      return { isError: true, content: [{ type: 'text', text: `Demo not found: ${demo}` }] }
    return { content: [{ type: 'text', text: jsonText(matched) }] }
  })

  server.registerTool('wot_token', {
    description: 'Get component CSS variables.',
    inputSchema: z.object({ component: z.string().optional(), version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ component, version }) => {
    if (!component) {
      const components = listComponents(version).map(item => ({ name: item.name, cssVars: item.cssVars }))
      return { content: [{ type: 'text', text: jsonText({ components }) }] }
    }
    const result = findComponent(component, version)
    if (!result)
      return { isError: true, content: [{ type: 'text', text: `Component not found: ${component}` }] }
    return { content: [{ type: 'text', text: jsonText({ name: result.name, cssVars: result.cssVars }) }] }
  })

  server.registerTool('wot_changelog', {
    description: 'Get changelog entries for the supported v2 dataset.',
    inputSchema: z.object({ version: z.string().optional(), component: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ version, component }) => {
    const metadata = loadMetadataFile(resolveVersion(version))
    const entries = (metadata.changelog ?? []).filter((entry) => {
      const versionMatches = version ? entry.version === version || `v${entry.version}` === version : true
      const componentMatches = component ? (entry.components ?? []).some(item => item.toLowerCase() === component.toLowerCase()) : true
      return versionMatches && componentMatches
    })
    return { content: [{ type: 'text', text: jsonText({ entries }) }] }
  })

  server.registerTool('wot_lint', {
    description: 'Lint a local project for wot-ui related issues.',
    inputSchema: z.object({ dir: z.string().optional(), version: z.string().optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ dir, version }) => {
    const report = lintProject(dir ?? process.cwd(), version)
    return { content: [{ type: 'text', text: jsonText(report) }] }
  })
}
