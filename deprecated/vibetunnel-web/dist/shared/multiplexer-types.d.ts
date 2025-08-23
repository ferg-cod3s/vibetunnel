export type { TmuxPane, TmuxSession, TmuxTarget, TmuxWindow } from './tmux-types.js';
export type MultiplexerType = 'tmux' | 'zellij' | 'screen';
export interface MultiplexerSession {
    name: string;
    type: MultiplexerType;
    windows?: number;
    created?: string;
    attached?: boolean;
    exited?: boolean;
    activity?: string;
    current?: boolean;
}
export interface MultiplexerStatus {
    tmux: {
        available: boolean;
        type: MultiplexerType;
        sessions: MultiplexerSession[];
    };
    zellij: {
        available: boolean;
        type: MultiplexerType;
        sessions: MultiplexerSession[];
    };
    screen: {
        available: boolean;
        type: MultiplexerType;
        sessions: MultiplexerSession[];
    };
}
export interface MultiplexerTarget {
    type: MultiplexerType;
    session: string;
    window?: number;
    pane?: number;
}
