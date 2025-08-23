import { Router } from 'express';
export interface DiscoveredRepository {
    id: string;
    path: string;
    folderName: string;
    lastModified: string;
    relativePath: string;
    gitBranch?: string;
}
export interface Branch {
    name: string;
    current: boolean;
    remote: boolean;
    worktree?: string;
}
/**
 * Create routes for repository discovery functionality
 */
export declare function createRepositoryRoutes(): Router;
