// ─────────────────────────── Git types ───────────────────────────

/** Mirrors Rust GitStatus struct */
export interface GitFileStatus {
	modified: string[];
	added: string[];
	deleted: string[];
	untracked: string[];
	has_changes: boolean;
}

/** Mirrors Rust GitLogEntry struct */
export interface GitLogEntry {
	hash: string;
	short_hash: string;
	author: string;
	email: string;
	date: string;
	message: string;
	/** v0.32.1: previous filename when this commit renamed/copied the file (only set when --follow is used). */
	renamed_from?: string | null;
}

/** Mirrors Rust GitSyncStatus struct */
export interface GitSyncStatus {
	ahead: number;
	behind: number;
	branch: string;
	remote_branch: string;
}

/** Mirrors Rust GitUserInfo struct */
export interface GitUserInfo {
	name: string;
	email: string;
}

/** Mirrors Rust GitBlameEntry struct (v0.32.0) */
export interface GitBlameEntry {
	line: number;          // 1-based final line number
	hash: string;          // 40-char commit hash; "0000…0" for uncommitted
	short_hash: string;    // first 8 chars of hash
	author: string;
	author_mail: string;
	author_time: number;   // unix timestamp seconds
	summary: string;
	content: string;       // actual line content (without leading \t)
	uncommitted: boolean;  // true when hash is all zeros
}

/** Git binding config stored on KnowledgeBase */
export interface GitConfig {
	remoteUrl: string;
	configId: string;
	branch: string;
	autoCommit: boolean;
	autoSync: boolean;
	syncIntervalMin: number;
	lastSyncAt: number;
}

/** Sync phase for UI display */
export type GitSyncPhase =
	| 'idle'
	| 'synced'
	| 'ahead'
	| 'behind'
	| 'diverged'
	| 'syncing'
	| 'committing'
	| 'error'
	| 'no-git';

/** Keychain prefix for git tokens */
export const KEYCHAIN_GIT_PREFIX = 'git-token:';
