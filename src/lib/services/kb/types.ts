export interface EmbeddingConfig {
  configId: string;
  provider: string;
  model: string;
  dimensions: number;
  baseUrl?: string;
}

export interface SearchResult {
  filePath: string;
  heading?: string;
  preview: string;
  score: number;
  offset: number;
  source: 'vector' | 'bm25' | 'hybrid';
}

export interface IndexStatus {
  indexed: boolean;
  chunkCount: number;
  fileCount: number;
  modelId: string;
  dimensions: number;
  lastUpdated?: string;
  staleFiles: string[];
}

export interface LocalModelInfo {
  id: string;
  name: string;
  size: number;
  dimensions: number;
  language: 'multilingual' | 'chinese' | 'english';
  downloaded: boolean;
  path?: string;
}

export interface ModelPreset {
  model: string;
  maxDim: number;
  defaultDim: number;
}

/** Embedding model presets per provider */
export const EMBEDDING_MODELS: Record<string, ModelPreset[]> = {
  openai: [
    { model: 'text-embedding-3-small', maxDim: 1536, defaultDim: 1024 },
    { model: 'text-embedding-3-large', maxDim: 3072, defaultDim: 1024 },
    { model: 'text-embedding-ada-002', maxDim: 1536, defaultDim: 1536 },
  ],
  gemini: [
    { model: 'models/text-embedding-004', maxDim: 768, defaultDim: 768 },
  ],
  ollama: [
    { model: 'nomic-embed-text', maxDim: 768, defaultDim: 768 },
    { model: 'mxbai-embed-large', maxDim: 1024, defaultDim: 1024 },
    { model: 'bge-m3', maxDim: 1024, defaultDim: 1024 },
  ],
  glm: [
    { model: 'embedding-3', maxDim: 2048, defaultDim: 1024 },
  ],
  doubao: [
    { model: 'doubao-embedding', maxDim: 2560, defaultDim: 1024 },
  ],
  deepseek: [
    { model: 'text-embedding-3-small', maxDim: 1536, defaultDim: 1024 },
  ],
};

/** Get the max dimension for a given provider+model, or the provider's default */
export function getMaxDimension(provider: string, model: string): number {
  const presets = EMBEDDING_MODELS[provider];
  if (!presets) return 1536;
  const match = presets.find((p) => p.model === model);
  return match ? match.maxDim : presets[0]?.maxDim ?? 1536;
}

/** Get the default embedding model for a provider */
export function getDefaultEmbeddingModel(provider: string): ModelPreset | null {
  const presets = EMBEDDING_MODELS[provider];
  return presets?.[0] ?? null;
}
