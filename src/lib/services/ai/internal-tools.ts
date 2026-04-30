/**
 * Internal Tools - built-in tools that are always available, independent of MCP servers.
 * These tools allow the AI to perform actions on Moraya itself (e.g., configuring MCP servers).
 */

import type { ToolDefinition, ToolCallRequest } from './types';
import { mcpStore, connectServer, disconnectServer, type MCPServerConfig } from '$lib/services/mcp';
import {
  createService,
  saveService,
  removeService,
  listServices,
} from '$lib/services/mcp/container-manager';
import { containerStore } from '$lib/services/mcp/container-store';
import { editorStore } from '$lib/stores/editor-store';
import { filesStore } from '$lib/stores/files-store';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { computeImageDir, computeImageRelativePath, isInsideKnowledgeBase } from './image-path-utils';

/** Extract a human-readable message from unknown caught values (Error objects, strings, etc.). */
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

/** Built-in tool definitions — always injected into the LLM tool list. */
export const INTERNAL_TOOLS: ToolDefinition[] = [
  {
    name: 'add_mcp_server',
    description:
      'Add and connect a new MCP server to Moraya. Use this when the user asks to install, add, or configure an MCP server. ' +
      'Supports stdio transport (command + args, most common) and HTTP/SSE transport (url). ' +
      'After adding, the server is automatically connected and its tools become available.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Server display name, e.g. "PostgreSQL", "Filesystem", "Notion"',
        },
        transport_type: {
          type: 'string',
          enum: ['stdio', 'http', 'sse'],
          description: 'Transport type. Most MCP servers use "stdio".',
        },
        command: {
          type: 'string',
          description: 'For stdio: executable command, e.g. "npx" or "uvx"',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'For stdio: command arguments array, e.g. ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"]',
        },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'For stdio: optional environment variables, e.g. {"DATABASE_URL": "..."}',
        },
        url: {
          type: 'string',
          description: 'For http/sse: server endpoint URL, e.g. "http://localhost:3000/mcp"',
        },
      },
      required: ['name', 'transport_type'],
    },
  },
  {
    name: 'create_mcp_service',
    description:
      'Create and start a new dynamic MCP service on-the-fly. Use this when you need to call an HTTP API ' +
      'or perform a task that no existing MCP tool covers. You provide tool definitions (JSON Schema) ' +
      'and handler code (Node.js JavaScript using built-in fetch). The service runs as a local MCP ' +
      'server and its tools become immediately available for use.\n\n' +
      'Handler code requirements:\n' +
      '- Export an object with async functions matching tool names: module.exports = { tool_name: async (args) => result }\n' +
      '- Use built-in fetch() for HTTP API calls (Node.js 18+)\n' +
      '- Access environment variables (API keys) via process.env.KEY_NAME\n' +
      '- Return a string or object (objects are JSON-stringified automatically)\n' +
      '- Throw errors to report failures to the caller',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Service name (alphanumeric + hyphens, e.g. "weather-api", "github-issues")',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this service does',
        },
        tools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Tool name (snake_case)' },
              description: { type: 'string', description: 'What this tool does' },
              inputSchema: {
                type: 'object',
                description: 'JSON Schema for tool input parameters',
              },
            },
            required: ['name', 'description', 'inputSchema'],
          },
          description: 'Array of tool definitions with JSON Schema input specs',
        },
        handlersCode: {
          type: 'string',
          description:
            'Node.js JavaScript code exporting handler functions. ' +
            'Example: module.exports = { get_weather: async ({ city }) => { ' +
            "const r = await fetch('https://api.example.com/weather?city=' + city); " +
            'return await r.json(); } }',
        },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Optional environment variables (e.g. API keys) to pass to the service process',
        },
      },
      required: ['name', 'description', 'tools', 'handlersCode'],
    },
  },
  {
    name: 'save_mcp_service',
    description:
      'Save a temporary AI-created MCP service so it persists across sessions. ' +
      'Use this when the user wants to keep a dynamically created service for future use.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The service ID returned by create_mcp_service',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'list_dynamic_services',
    description: 'List all AI-created dynamic MCP services (both temporary and saved)',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'remove_dynamic_service',
    description: 'Stop and remove an AI-created dynamic MCP service',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The service ID to remove',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'update_editor_content',
    description:
      'Write Markdown content into the Moraya editor\'s CURRENTLY OPEN document. ' +
      'IMPORTANT: This tool always writes to whatever file is open in the editor right now — ' +
      'it has NO ability to choose a target path. ' +
      'Do NOT use this tool when the user asks to modify a specific named file (e.g. MORAYA.md, rules.md, or any path) ' +
      'unless that exact file is already open in the editor. ' +
      'For writing to a specific file by path, use write_file instead. ' +
      'Correct uses: (1) filling a new unsaved document, (2) replacing the content of the file the user is currently editing. ' +
      'CRITICAL: NEVER pass rule/configuration file content (e.g. content read from MORAYA.md or .moraya/rules/) as the content argument — ' +
      'the content must be the actual article/document the user wants to write, not rules or system instructions.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The full Markdown content to write into the editor',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'fetch_image_to_local',
    description:
      'Fetch an image URL and save it to a local file. ' +
      'Uses the WebView browser cache, so this works even for expired or temporary URLs ' +
      'that are still cached from when they were first displayed in the editor. ' +
      'Use this BEFORE calling MCP tools that require a local file path (e.g. image upload tools). ' +
      'Returns the absolute local file path that can be passed directly to MCP tools.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The image URL to fetch (can be an expired URL if still cached in browser)',
        },
        filename: {
          type: 'string',
          description:
            'Optional desired filename (e.g. "banner.jpg"). If omitted, extracted from the URL.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'save_image_to_kb',
    description:
      'Download an image from a URL and save it to the knowledge base images/ directory. ' +
      'This is the PREFERRED way to save images when working within a knowledge base — ' +
      'it automatically places the image in the correct mirror directory structure ' +
      '(e.g. {kbRoot}/images/blog/article/hero.jpg for an article at {kbRoot}/blog/article.md). ' +
      'If the current article is not yet saved, the image goes to images/temp/ and will be ' +
      'migrated automatically when the article is first saved. ' +
      'Returns the relative path to insert into Markdown (e.g. images/blog/article/hero.jpg).',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The image URL to download.',
        },
        filename: {
          type: 'string',
          description: 'Filename to save as (e.g. "hero.jpg"). If omitted, derived from URL.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_knowledge_base',
    description:
      'Search the active knowledge base using semantic vector search and keyword matching. ' +
      'Returns relevant document chunks with file paths and text snippets. ' +
      'Use this when the user asks about content in their knowledge base or needs to find specific information across their documents.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        top_k: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_ai_reviews',
    description:
      'Write structured AI-generated review comments to the current document sidecar file (v0.32.0). ' +
      'Use this when asked to review a document — provide up to 10 review entries, each anchored ' +
      'on an exact text fragment from the document with a dimension classification (logic / expression / fact / structure).',
    input_schema: {
      type: 'object',
      properties: {
        reviews: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              markedText: {
                type: 'string',
                description: 'Exact text fragment from the current document being reviewed',
              },
              contextBefore: {
                type: 'string',
                description: 'Up to 50 characters of context preceding the markedText',
                maxLength: 50,
              },
              contextAfter: {
                type: 'string',
                description: 'Up to 50 characters of context following the markedText',
                maxLength: 50,
              },
              comment: {
                type: 'string',
                description: 'The review comment text',
              },
              dimension: {
                type: 'string',
                enum: ['logic', 'expression', 'fact', 'structure'],
                description: 'Review dimension classification',
              },
            },
            required: ['markedText', 'comment', 'dimension'],
          },
        },
      },
      required: ['reviews'],
    },
  },
];

/** Check if a tool name belongs to an internal tool. */
export function isInternalTool(name: string): boolean {
  return INTERNAL_TOOLS.some(t => t.name === name);
}

/** Execute an internal tool and return the result. */
export async function executeInternalTool(
  tc: ToolCallRequest,
): Promise<{ content: string; isError: boolean }> {
  switch (tc.name) {
    case 'add_mcp_server':
      return handleAddMcpServer(tc.arguments);
    case 'create_mcp_service':
      return handleCreateMcpService(tc.arguments);
    case 'save_mcp_service':
      return handleSaveMcpService(tc.arguments);
    case 'list_dynamic_services':
      return handleListDynamicServices();
    case 'remove_dynamic_service':
      return handleRemoveDynamicService(tc.arguments);
    case 'update_editor_content':
      return handleUpdateEditorContent(tc.arguments);
    case 'fetch_image_to_local':
      return handleFetchImageToLocal(tc.arguments);
    case 'save_image_to_kb':
      return handleSaveImageToKb(tc.arguments);
    case 'search_knowledge_base':
      return handleSearchKnowledgeBase(tc.arguments);
    case 'write_ai_reviews':
      return handleWriteAiReviews(tc.arguments);
    default:
      return { content: `Unknown internal tool: ${tc.name}`, isError: true };
  }
}

async function handleAddMcpServer(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const name = args.name as string;
  const transportType = args.transport_type as string;

  if (!name) {
    return { content: 'Error: "name" is required', isError: true };
  }

  let transport: MCPServerConfig['transport'];

  if (transportType === 'stdio') {
    const command = args.command as string;
    if (!command) {
      return { content: 'Error: "command" is required for stdio transport', isError: true };
    }
    transport = {
      type: 'stdio',
      command,
      args: (args.args as string[]) || [],
      env: (args.env as Record<string, string>) || undefined,
    };
  } else if (transportType === 'http' || transportType === 'sse') {
    const url = args.url as string;
    if (!url) {
      return { content: `Error: "url" is required for ${transportType} transport`, isError: true };
    }
    transport = { type: transportType, url };
  } else {
    return { content: `Error: unsupported transport_type "${transportType}"`, isError: true };
  }

  // Name-based deduplication: if a server with the same name exists,
  // disconnect and update it instead of creating a duplicate.
  const existing = mcpStore.getState().servers.find(s => s.name === name);
  const serverId = existing?.id ?? `mcp-${Date.now()}`;

  if (existing) {
    try { await disconnectServer(existing.id); } catch { /* ignore */ }
  }

  const config: MCPServerConfig = {
    id: serverId,
    name,
    transport,
    enabled: true,
  };

  mcpStore.addServer(config);

  try {
    await connectServer(config);
    const state = mcpStore.getState();
    const toolCount = state.tools.filter(t => t.serverId === config.id).length;
    const action = existing ? 'updated' : 'added';
    return {
      content: `MCP Server "${name}" ${action} and connected successfully. Discovered ${toolCount} tool(s).`,
      isError: false,
    };
  } catch (e: any) {
    return {
      content: `MCP Server "${name}" added but connection failed: ${errMsg(e)}. You can try connecting manually in Settings → MCP.`,
      isError: false,
    };
  }
}

// ── Dynamic Service Handlers ──

async function handleCreateMcpService(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const state = containerStore.getState();
  if (!state.nodeAvailable) {
    return {
      content: 'Error: Node.js 18+ is required to create dynamic MCP services but was not found. Please install Node.js from https://nodejs.org/',
      isError: true,
    };
  }

  const name = args.name as string;
  const description = args.description as string;
  const tools = args.tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  const handlersCode = args.handlersCode as string;
  const env = args.env as Record<string, string> | undefined;

  if (!name || !description || !tools || !handlersCode) {
    return { content: 'Error: name, description, tools, and handlersCode are all required', isError: true };
  }

  try {
    const service = await createService({ name, description, tools, handlersCode, env });
    return {
      content: `Dynamic MCP service "${service.name}" created and running. ${service.tools.length} tool(s) available: ${service.tools.join(', ')}. Service ID: ${service.id}`,
      isError: false,
    };
  } catch (e: any) {
    return { content: `Failed to create dynamic service: ${errMsg(e)}`, isError: true };
  }
}

async function handleSaveMcpService(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const serviceId = args.serviceId as string;
  if (!serviceId) {
    return { content: 'Error: serviceId is required', isError: true };
  }

  try {
    await saveService(serviceId);
    const state = containerStore.getState();
    const svc = state.services.find((s) => s.id === serviceId);
    return {
      content: `Service "${svc?.name || serviceId}" saved. It will auto-reconnect on next app launch.`,
      isError: false,
    };
  } catch (e: any) {
    return { content: `Failed to save service: ${errMsg(e)}`, isError: true };
  }
}

async function handleListDynamicServices(): Promise<{ content: string; isError: boolean }> {
  const services = listServices();
  if (services.length === 0) {
    return { content: 'No dynamic MCP services are currently active.', isError: false };
  }

  const list = services
    .map(
      (s) =>
        `- ${s.name} (ID: ${s.id}, status: ${s.status}, lifecycle: ${s.lifecycle}, tools: ${s.tools.join(', ')})`,
    )
    .join('\n');
  return { content: `Active dynamic services:\n${list}`, isError: false };
}

async function handleRemoveDynamicService(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const serviceId = args.serviceId as string;
  if (!serviceId) {
    return { content: 'Error: serviceId is required', isError: true };
  }

  const state = containerStore.getState();
  const svc = state.services.find((s) => s.id === serviceId);
  const name = svc?.name || serviceId;

  try {
    await removeService(serviceId);
    return { content: `Service "${name}" has been stopped and removed.`, isError: false };
  } catch (e: any) {
    return { content: `Failed to remove service: ${errMsg(e)}`, isError: true };
  }
}

/** Try to get image bytes from a URL using a timed fetch with the specified cache mode. */
async function fetchWithTimeout(
  url: string,
  cacheMode: RequestCache,
  timeoutMs: number,
): Promise<{ buffer: ArrayBuffer; error: null } | { buffer: null; error: string }> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: cacheMode, signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) return { buffer: null, error: `HTTP ${r.status}` };
    const buf = await r.arrayBuffer();
    if (buf.byteLength === 0) return { buffer: null, error: 'empty response' };
    return { buffer: buf, error: null };
  } catch (e: any) {
    clearTimeout(tid);
    return {
      buffer: null,
      error: e?.name === 'AbortError' ? `timed out after ${timeoutMs / 1000}s` : errMsg(e),
    };
  }
}

/**
 * Level-3 fallback: extract image bytes from a rendered <img> element via canvas.
 * Works even for images that are displayed in the editor but whose URL has expired,
 * as long as the browser still has the decoded bitmap in memory.
 * Returns null if the image is not rendered or is cross-origin tainted.
 */
async function extractImageViaCanvas(url: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    // Search for a rendered <img> whose src matches the URL
    let target: HTMLImageElement | null = null;
    for (const img of document.querySelectorAll('img')) {
      if (img.src === url || img.currentSrc === url) {
        target = img;
        break;
      }
    }
    if (!target || target.naturalWidth === 0 || target.naturalHeight === 0) {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = target.naturalWidth;
    canvas.height = target.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    try {
      ctx.drawImage(target, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(null); return; }
          blob.arrayBuffer().then(resolve).catch(() => resolve(null));
        },
        'image/jpeg',
        0.92,
      );
    } catch {
      // SecurityError: cross-origin taint — canvas.toBlob would throw
      resolve(null);
    }
  });
}

async function handleFetchImageToLocal(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const url = args.url as string;
  if (!url) return { content: 'Error: "url" is required', isError: true };

  let buffer: ArrayBuffer | null = null;
  const errors: string[] = [];

  // Level 1: force-cache — returns stale cached response without revalidating the origin.
  // Best for expired presigned URLs that are still in the browser HTTP cache.
  const l1 = await fetchWithTimeout(url, 'force-cache', 10_000);
  if (l1.buffer) {
    buffer = l1.buffer;
  } else {
    errors.push(`cache: ${l1.error}`);

    // Level 2: network fetch — works if the URL is still valid on the server.
    const l2 = await fetchWithTimeout(url, 'default', 10_000);
    if (l2.buffer) {
      buffer = l2.buffer;
    } else {
      errors.push(`network: ${l2.error}`);

      // Level 3: DOM canvas extraction — works if the image is rendered in the editor
      // even when the URL has expired AND is not in the HTTP cache.
      buffer = await extractImageViaCanvas(url);
      if (!buffer) errors.push('DOM canvas: image not rendered or cross-origin tainted');
    }
  }

  if (!buffer) {
    return {
      content: `Failed to retrieve image from ${url}. Tried: ${errors.join(' | ')}. The image cannot be accessed through any available method.`,
      isError: true,
    };
  }

  // Encode to base64 for write_file_binary
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64Data = btoa(binary);

  // Determine filename
  let filename = (args.filename as string) || '';
  if (!filename) {
    try {
      filename = new URL(url).pathname.split('/').pop()?.split('?')[0] || 'image';
    } catch {
      filename = 'image';
    }
  }
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'image';
  if (!filename.includes('.')) filename += '.jpg';
  const uniqueFilename = `${Date.now()}_${filename}`;

  const dataDir = await appDataDir();
  const base = dataDir.replace(/[/\\]$/, '');
  const localPath = `${base}/image-cache/${uniqueFilename}`;

  await invoke('write_file_binary', { path: localPath, base64Data });

  return {
    content: `Image saved to: ${localPath} (${buffer.byteLength} bytes). Pass this local path to MCP tools that require a file path.`,
    isError: false,
  };
}

async function handleSaveImageToKb(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const url = args.url as string;
  if (!url) return { content: 'Error: "url" is required', isError: true };

  // Resolve current article path and knowledge base root
  const editorState = editorStore.getState();
  const articlePath = editorState.currentFilePath ?? null;
  const kb = filesStore.getActiveKnowledgeBase();
  const kbRoot = kb?.path ?? null;

  // Verify the article belongs to the active knowledge base
  if (!kbRoot || !isInsideKnowledgeBase(articlePath, kbRoot)) {
    return {
      content: 'Error: No active knowledge base or current article is not inside a knowledge base. Use fetch_image_to_local instead.',
      isError: true,
    };
  }

  // Fetch image data (reuse the multi-level fetch logic)
  let buffer: ArrayBuffer | null = null;
  const errors: string[] = [];

  const l1 = await fetchWithTimeout(url, 'force-cache', 10_000);
  if (l1.buffer) {
    buffer = l1.buffer;
  } else {
    errors.push(`cache: ${l1.error}`);
    const l2 = await fetchWithTimeout(url, 'default', 10_000);
    if (l2.buffer) {
      buffer = l2.buffer;
    } else {
      errors.push(`network: ${l2.error}`);
      buffer = await extractImageViaCanvas(url);
      if (!buffer) errors.push('DOM canvas: image not rendered or cross-origin tainted');
    }
  }

  if (!buffer) {
    return {
      content: `Failed to retrieve image from ${url}. Tried: ${errors.join(' | ')}.`,
      isError: true,
    };
  }

  // Encode to base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64Data = btoa(binary);

  // Determine filename
  let filename = (args.filename as string) || '';
  if (!filename) {
    try {
      filename = new URL(url).pathname.split('/').pop()?.split('?')[0] || 'image';
    } catch {
      filename = 'image';
    }
  }
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'image';
  if (!filename.includes('.')) filename += '.jpg';

  // Compute destination path using the mirror structure
  const imageDir = computeImageDir(articlePath, kbRoot);
  const absolutePath = `${imageDir}/${filename}`;
  const relativePath = computeImageRelativePath(articlePath, kbRoot, filename);

  await invoke('write_file_binary', { path: absolutePath, base64Data });

  const status = articlePath ? 'saved to knowledge base' : 'saved to images/temp/ (will migrate on first file save)';
  return {
    content: `Image ${status}.\nLocal absolute path: ${absolutePath}\nMarkdown reference: ![](${relativePath})\nSize: ${buffer.byteLength} bytes.`,
    isError: false,
  };
}

async function handleUpdateEditorContent(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const markdownContent = args.content as string;
  if (!markdownContent) {
    return { content: 'Error: "content" is required', isError: true };
  }

  const state = editorStore.getState();
  const filePath = state.currentFilePath;

  // v0.32.1 §F7: merge state guard — block write when repo is mid-merge.
  try {
    const fileState = filesStore.getState();
    const kb = fileState.knowledgeBases.find(
      (k) => k.id === fileState.activeKnowledgeBaseId,
    );
    if (kb?.git) {
      const { gitInMerge } = await import('$lib/services/git/git-service');
      if (await gitInMerge(kb.path)) {
        return {
          content:
            'Repository is in the middle of a merge. Resolve conflicts first before AI can update document content.',
          isError: true,
        };
      }
    }
  } catch {
    /* probe failed → proceed */
  }

  // Update editor content
  editorStore.setContent(markdownContent);
  window.dispatchEvent(new CustomEvent('moraya:file-synced', { detail: { content: markdownContent } }));

  // If the file is saved (has a path), also persist to disk
  if (filePath) {
    try {
      await invoke('write_file', { path: filePath, content: markdownContent });
      editorStore.setDirty(false);
      return {
        content: `Content written to editor and saved to ${filePath.split('/').pop()} (${markdownContent.length} chars).`,
        isError: false,
      };
    } catch {
      editorStore.setDirty(true);
      return {
        content: `Content updated in editor (${markdownContent.length} chars) but failed to save to disk. The file is marked as unsaved.`,
        isError: false,
      };
    }
  }

  // New unsaved document — just fill the editor
  editorStore.setDirty(true);
  return {
    content: `Content filled into editor (${markdownContent.length} chars). The document is unsaved — user can save with Cmd+S.`,
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// search_knowledge_base
// ---------------------------------------------------------------------------

async function handleSearchKnowledgeBase(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const query = args.query as string;
  if (!query) {
    return { content: 'Missing required parameter: query', isError: true };
  }
  const topK = (args.top_k as number) || 5;

  // Get active knowledge base path
  const fsState = filesStore.getState();
  const activeKB = fsState.knowledgeBases.find(
    (kb) => kb.id === fsState.activeKnowledgeBaseId,
  );
  if (!activeKB) {
    return {
      content: 'No active knowledge base. Open a folder first.',
      isError: true,
    };
  }

  try {
    const { getEmbeddingConfig, searchKnowledgeBase } = await import(
      '$lib/services/kb'
    );
    const config = getEmbeddingConfig();
    if (!config) {
      return {
        content:
          'Embedding not configured. Set up in Settings > Knowledge Base.',
        isError: true,
      };
    }

    const results = await searchKnowledgeBase(
      activeKB.path,
      query,
      config,
      topK,
    );

    if (results.length === 0) {
      return {
        content: `No results found for "${query}" in the knowledge base.`,
        isError: false,
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.filePath}${r.heading ? ` > ${r.heading}` : ''} (score: ${r.score.toFixed(2)})\n${r.preview}`,
      )
      .join('\n\n');

    return {
      content: `Found ${results.length} results for "${query}":\n\n${formatted}`,
      isError: false,
    };
  } catch (e: unknown) {
    return { content: `Search failed: ${errMsg(e)}`, isError: true };
  }
}

// ──────────────── v0.32.0: handleWriteAiReviews ────────────────────

/**
 * Process AI-generated structured reviews:
 * 1. Validate each entry (markedText, comment, dimension required)
 * 2. Cap at 10 entries (uniformly across 4 dimensions when possible)
 * 3. Resolve KB root + relPath of current file
 * 4. Try fuzzy match for markedText that doesn't appear verbatim
 * 5. Get HEAD commit (silent fallback to '')
 * 6. Replace any existing AI-authored reviews (idempotent retry)
 * 7. Persist sidecar JSON + reload reviewStore
 */
async function handleWriteAiReviews(
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  // Lazy imports to avoid module cycle (review modules import from ai-service)
  const [{ reviewStore }, { loadReviews, saveReviews, createReview }, { gitHeadCommit }] =
    await Promise.all([
      import('$lib/services/review/review-store'),
      import('$lib/services/review/review-service'),
      import('$lib/services/git/git-service'),
    ]);

  const rawReviews = args.reviews;
  if (!Array.isArray(rawReviews)) {
    return { content: 'Error: "reviews" must be an array', isError: true };
  }

  // Resolve current document context
  const editorState = editorStore.getState();
  const docText = editorState.content ?? '';
  const filePath = editorState.currentFilePath ?? null;
  if (!filePath) {
    return { content: 'Error: no file is currently open', isError: true };
  }

  // v0.32.1 §F3: file-switch defence — if the user switched files between
  // triggerReviewCommand starting the request and the tool call landing,
  // discard silently to avoid writing one file's reviews into another file.
  try {
    const { getReviewAiInflightFilePath } = await import('./ai-service');
    const snapshot = getReviewAiInflightFilePath();
    if (snapshot && snapshot !== filePath) {
      return {
        content: 'AI review cancelled because the active file changed',
        isError: false,
      };
    }
  } catch {
    /* no snapshot — proceed */
  }
  const fileState = filesStore.getState();
  const kb = fileState.knowledgeBases.find(
    (k) => k.id === fileState.activeKnowledgeBaseId,
  );
  if (!kb) {
    return { content: 'Error: no active knowledge base', isError: true };
  }
  const kbRoot = kb.path.replace(/\\/g, '/').replace(/\/$/, '');
  if (!filePath.startsWith(kbRoot)) {
    return {
      content: 'Error: current file is not inside the active knowledge base',
      isError: true,
    };
  }
  const relPath = filePath.slice(kbRoot.length).replace(/^\//, '');

  // Get HEAD commit (silent fallback if not git-bound)
  let commitHash = '';
  try {
    commitHash = await gitHeadCommit(kb.path);
  } catch {
    // KB is not git-bound — proceed with empty hash
  }

  // Validate + classify by dimension
  type AIReviewInput = {
    markedText: string;
    contextBefore?: string;
    contextAfter?: string;
    comment: string;
    dimension: 'logic' | 'expression' | 'fact' | 'structure';
  };
  const VALID_DIMENSIONS = new Set(['logic', 'expression', 'fact', 'structure']);
  const valid: AIReviewInput[] = [];
  let invalidCount = 0;

  for (const r of rawReviews as Record<string, unknown>[]) {
    const markedText = typeof r.markedText === 'string' ? r.markedText.trim() : '';
    const comment = typeof r.comment === 'string' ? r.comment.trim() : '';
    const dimension = typeof r.dimension === 'string' ? r.dimension : '';
    if (!markedText || !comment || !VALID_DIMENSIONS.has(dimension)) {
      invalidCount++;
      continue;
    }
    valid.push({
      markedText,
      contextBefore: typeof r.contextBefore === 'string' ? r.contextBefore.slice(0, 50) : '',
      contextAfter: typeof r.contextAfter === 'string' ? r.contextAfter.slice(0, 50) : '',
      comment,
      dimension: dimension as AIReviewInput['dimension'],
    });
  }

  // Cap at 10 — distribute evenly across 4 dimensions
  const byDim = new Map<string, AIReviewInput[]>();
  for (const r of valid) {
    const arr = byDim.get(r.dimension) ?? [];
    arr.push(r);
    byDim.set(r.dimension, arr);
  }
  const capped: AIReviewInput[] = [];
  let added = 0;
  let layer = 0;
  while (added < 10 && layer < 10) {
    let progress = false;
    for (const dim of ['logic', 'expression', 'fact', 'structure']) {
      const arr = byDim.get(dim);
      if (arr && layer < arr.length && added < 10) {
        capped.push(arr[layer]);
        added++;
        progress = true;
      }
    }
    if (!progress) break;
    layer++;
  }

  if (capped.length === 0) {
    return {
      content:
        invalidCount > 0
          ? `Error: ${invalidCount} review(s) had invalid format and none were valid`
          : 'Error: AI generated no review suggestions',
      isError: true,
    };
  }

  // Helper: find an exact line number for the markedText in docText
  function lineOfOffset(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < docText.length; i++) {
      if (docText[i] === '\n') line++;
    }
    return line;
  }

  // Find each markedText in docText: exact match → fuzzy (strip whitespace/punct) fallback
  function fuzzyFind(needle: string): number {
    const idx = docText.indexOf(needle);
    if (idx >= 0) return idx;
    // Whitespace-collapsed fuzzy match
    const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
    const docCollapsed = collapse(docText);
    const needleCollapsed = collapse(needle);
    if (!needleCollapsed) return -1;
    const cidx = docCollapsed.indexOf(needleCollapsed);
    if (cidx < 0) return -1;
    // Approximate back to original offset by walking docText skipping whitespace
    let pos = 0;
    let cpos = 0;
    while (pos < docText.length && cpos < cidx) {
      if (/\s/.test(docText[pos])) {
        // Skip extra whitespace; only count one
        if (cpos > 0 && docCollapsed[cpos - 1] !== ' ') cpos++;
        pos++;
      } else {
        cpos++;
        pos++;
      }
    }
    return pos;
  }

  // Load existing sidecar; remove any old AI-authored reviews (idempotent retry)
  const existing = await loadReviews(kbRoot, relPath);
  const previousNonAI = (existing?.reviews ?? []).filter(
    (r) => r.author !== 'AI' && r.authorEmail !== 'ai@moraya',
  );

  // Build new AI Review records
  const newReviews = capped.map((r) => {
    const offset = fuzzyFind(r.markedText);
    const line = offset >= 0 ? lineOfOffset(offset) : 0;
    const review = createReview(
      'AI',
      'ai@moraya',
      {
        commitHash,
        markedText: r.markedText,
        contextBefore: r.contextBefore ?? '',
        contextAfter: r.contextAfter ?? '',
        originalLine: line,
      },
      `[${r.dimension}] ${r.comment}`,
    );
    return review;
  });

  const merged = [...previousNonAI, ...newReviews];
  await saveReviews(kbRoot, relPath, {
    version: 1 as const,
    documentPath: relPath,
    reviews: merged,
  });

  // Reload reviewStore so the panel refreshes
  await reviewStore.loadForFile(kbRoot, relPath, docText);

  const summary = [
    `Wrote ${newReviews.length} AI review(s) to sidecar.`,
    invalidCount > 0 ? `(${invalidCount} invalid entries skipped.)` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { content: summary, isError: false };
}
