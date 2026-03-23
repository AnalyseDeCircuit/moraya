export type {
  EmbeddingConfig,
  SearchResult,
  IndexStatus,
  LocalModelInfo,
  ModelPreset,
} from './types';

export {
  EMBEDDING_MODELS,
  getMaxDimension,
  getDefaultEmbeddingModel,
} from './types';

export {
  getEmbeddingConfig,
  indexKnowledgeBase,
  searchKnowledgeBase,
  getIndexStatus,
  deleteIndex,
  indexSingleFile,
  autoIndexOnSave,
} from './kb-service';
