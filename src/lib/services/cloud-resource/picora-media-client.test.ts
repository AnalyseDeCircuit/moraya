import { describe, it, expect, vi, beforeEach } from 'vitest';
import { picoraApiBaseFromUploadUrl } from './picora-media-client';

// Mock @tauri-apps/api/core — tested functions that call invoke are integration concerns
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('picoraApiBaseFromUploadUrl', () => {
  it('strips path from a standard upload URL', () => {
    expect(picoraApiBaseFromUploadUrl('https://picora.example.com/v1/upload')).toBe(
      'https://picora.example.com',
    );
  });

  it('preserves protocol and host for https', () => {
    expect(picoraApiBaseFromUploadUrl('https://api.picora.io/v1/files/upload')).toBe(
      'https://api.picora.io',
    );
  });

  it('works with http', () => {
    expect(picoraApiBaseFromUploadUrl('http://localhost:3000/v1/upload')).toBe(
      'http://localhost:3000',
    );
  });

  it('strips port correctly', () => {
    expect(picoraApiBaseFromUploadUrl('https://picora.example.com:8443/v1/upload')).toBe(
      'https://picora.example.com:8443',
    );
  });

  it('returns base for URL without /v1/ path via fallback', () => {
    // Invalid URL → fallback regex
    const result = picoraApiBaseFromUploadUrl('https://picora.example.com');
    expect(result).toBe('https://picora.example.com');
  });

  it('handles malformed URL via regex fallback', () => {
    const result = picoraApiBaseFromUploadUrl('not-a-url/v1/upload');
    expect(result).toBe('not-a-url');
  });

  it('returns empty string for empty input via fallback', () => {
    const result = picoraApiBaseFromUploadUrl('');
    expect(result).toBe('');
  });
});
