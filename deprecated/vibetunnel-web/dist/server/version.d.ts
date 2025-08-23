export declare const VERSION: string;
export declare const BUILD_DATE: string;
export declare const BUILD_TIMESTAMP: string | number;
export declare const GIT_COMMIT: string;
export declare const NODE_VERSION: string;
export declare const PLATFORM: NodeJS.Platform;
export declare const ARCH: NodeJS.Architecture;
export declare function getVersionInfo(): {
    version: string;
    buildDate: string;
    buildTimestamp: string | number;
    gitCommit: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: NodeJS.Architecture;
    uptime: number;
    pid: number;
};
export declare function printVersionBanner(): void;
