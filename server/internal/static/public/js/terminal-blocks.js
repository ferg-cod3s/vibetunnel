/**
 * Block-Based Terminal Component
 * Implements Warp-style command blocks for better command organization and UX
 */

import { EnhancedTerminal } from './terminal-webgl.js';

/**
 * CommandBlock represents a single command and its output
 */
class CommandBlock {
    constructor(id, command) {
        this.id = id;
        this.command = command;
        this.output = [];
        this.status = 'pending'; // pending, running, success, error
        this.startTime = null;
        this.endTime = null;
        this.exitCode = null;
        this.element = null;
        this.collapsed = false;
    }
    
    get duration() {
        if (!this.startTime) return null;
        const end = this.endTime || Date.now();
        return end - this.startTime;
    }
    
    addOutput(data) {
        this.output.push(data);
    }
    
    setStatus(status, exitCode = null) {
        this.status = status;
        this.exitCode = exitCode;
        if (status === 'running') {
            this.startTime = Date.now();
        } else if (status === 'success' || status === 'error') {
            this.endTime = Date.now();
        }
    }
    
    toJSON() {
        return {
            id: this.id,
            command: this.command,
            output: this.output.join(''),
            status: this.status,
            exitCode: this.exitCode,
            duration: this.duration,
            timestamp: this.startTime
        };
    }
}

/**
 * BlockTerminal - Terminal with command block management
 */
export class BlockTerminal {
    constructor(container, options = {}) {
        this.container = container;
        this.blocks = new Map();
        this.activeBlock = null;
        this.blockIdCounter = 0;
        this.maxBlocks = options.maxBlocks || 1000;
        
        // Create container structure
        this.setupDOM();
        
        // Initialize enhanced terminal
        this.terminal = new EnhancedTerminal(this.terminalContainer, {
            ...options,
            scrollback: 0 // We manage scrollback via blocks
        });
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Command history
        this.history = [];
        this.historyIndex = -1;
    }
    
    setupDOM() {
        // Create main container structure
        this.container.innerHTML = `
            <div class="block-terminal">
                <div class="blocks-container"></div>
                <div class="terminal-container"></div>
                <div class="command-input-container">
                    <div class="command-prompt">
                        <span class="prompt-symbol">❯</span>
                        <input type="text" class="command-input" placeholder="Enter command..." />
                    </div>
                </div>
            </div>
        `;
        
        // Get references
        this.blocksContainer = this.container.querySelector('.blocks-container');
        this.terminalContainer = this.container.querySelector('.terminal-container');
        this.commandInput = this.container.querySelector('.command-input');
        
        // Add styles
        this.injectStyles();
    }
    
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .block-terminal {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: #0a0b0d;
                color: #e0e0e0;
                font-family: 'Hack Nerd Font Mono', 'Fira Code', monospace;
            }
            
            .blocks-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                min-height: 0;
            }
            
            .command-block {
                margin-bottom: 10px;
                border: 1px solid #2a2b2d;
                border-radius: 8px;
                background: #12131a;
                overflow: hidden;
                transition: all 0.2s ease;
            }
            
            .command-block:hover {
                border-color: #3a3b3d;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .command-block.running {
                border-color: #f1fa8c;
            }
            
            .command-block.success {
                border-color: #50fa7b;
            }
            
            .command-block.error {
                border-color: #ff5555;
            }
            
            .block-header {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: #1a1b24;
                cursor: pointer;
                user-select: none;
            }
            
            .block-status {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-right: 10px;
                background: #6272a4;
            }
            
            .block-status.running {
                background: #f1fa8c;
                animation: pulse 1s infinite;
            }
            
            .block-status.success {
                background: #50fa7b;
            }
            
            .block-status.error {
                background: #ff5555;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            .block-command {
                flex: 1;
                font-size: 14px;
                color: #f8f8f2;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .block-meta {
                display: flex;
                gap: 15px;
                font-size: 12px;
                color: #6272a4;
            }
            
            .block-duration {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .block-actions {
                display: flex;
                gap: 8px;
            }
            
            .block-action {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: none;
                background: transparent;
                color: #6272a4;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .block-action:hover {
                background: #44475a;
                color: #f8f8f2;
            }
            
            .block-output {
                padding: 12px;
                background: #0a0b0d;
                font-size: 13px;
                line-height: 1.4;
                white-space: pre-wrap;
                word-break: break-all;
                max-height: 400px;
                overflow-y: auto;
            }
            
            .block-output.collapsed {
                display: none;
            }
            
            .terminal-container {
                display: none; /* Hidden by default, shown for active block */
                height: 400px;
                border-top: 1px solid #2a2b2d;
            }
            
            .terminal-container.active {
                display: block;
            }
            
            .command-input-container {
                padding: 12px;
                background: #12131a;
                border-top: 1px solid #2a2b2d;
            }
            
            .command-prompt {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .prompt-symbol {
                color: #50fa7b;
                font-weight: bold;
            }
            
            .command-input {
                flex: 1;
                background: transparent;
                border: none;
                outline: none;
                color: #f8f8f2;
                font-family: inherit;
                font-size: 14px;
            }
            
            .command-input::placeholder {
                color: #44475a;
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventHandlers() {
        // Command input handling
        this.commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand(this.commandInput.value);
                this.commandInput.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });
        
        // Terminal data handler
        this.terminal.onData((data) => {
            if (this.activeBlock) {
                // Send input to active block's process
                this.sendToProcess(this.activeBlock.id, data);
            }
        });
    }
    
    executeCommand(command) {
        if (!command.trim()) return;
        
        // Add to history
        this.history.push(command);
        this.historyIndex = this.history.length;
        
        // Create new block
        const blockId = this.blockIdCounter++;
        const block = new CommandBlock(blockId, command);
        this.blocks.set(blockId, block);
        
        // Create block UI
        const blockElement = this.createBlockElement(block);
        this.blocksContainer.appendChild(blockElement);
        block.element = blockElement;
        
        // Set as active block
        this.activeBlock = block;
        block.setStatus('running');
        this.updateBlockUI(block);
        
        // Show terminal for active block
        this.terminalContainer.classList.add('active');
        
        // Execute command (this would connect to your WebSocket/backend)
        this.executeBlockCommand(block);
        
        // Scroll to bottom
        this.blocksContainer.scrollTop = this.blocksContainer.scrollHeight;
        
        // Cleanup old blocks if needed
        if (this.blocks.size > this.maxBlocks) {
            const oldestBlock = this.blocks.values().next().value;
            this.removeBlock(oldestBlock.id);
        }
    }
    
    createBlockElement(block) {
        const div = document.createElement('div');
        div.className = `command-block ${block.status}`;
        div.dataset.blockId = block.id;
        
        div.innerHTML = `
            <div class="block-header">
                <div class="block-status ${block.status}"></div>
                <div class="block-command">${this.escapeHtml(block.command)}</div>
                <div class="block-meta">
                    <div class="block-duration">
                        <span class="duration-value">--</span>
                    </div>
                    <div class="block-actions">
                        <button class="block-action replay" title="Replay command">↻</button>
                        <button class="block-action copy" title="Copy output">📋</button>
                        <button class="block-action collapse" title="Collapse">${block.collapsed ? '▶' : '▼'}</button>
                    </div>
                </div>
            </div>
            <div class="block-output ${block.collapsed ? 'collapsed' : ''}">${this.escapeHtml(block.output.join(''))}</div>
        `;
        
        // Add event handlers
        const header = div.querySelector('.block-header');
        const collapseBtn = div.querySelector('.collapse');
        const replayBtn = div.querySelector('.replay');
        const copyBtn = div.querySelector('.copy');
        
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleBlock(block.id);
        });
        
        replayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.replayBlock(block.id);
        });
        
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyBlockOutput(block.id);
        });
        
        header.addEventListener('click', () => {
            this.selectBlock(block.id);
        });
        
        return div;
    }
    
    updateBlockUI(block) {
        if (!block.element) return;
        
        const element = block.element;
        element.className = `command-block ${block.status}`;
        
        const statusEl = element.querySelector('.block-status');
        statusEl.className = `block-status ${block.status}`;
        
        const durationEl = element.querySelector('.duration-value');
        if (block.duration) {
            const seconds = (block.duration / 1000).toFixed(1);
            durationEl.textContent = `${seconds}s`;
        }
        
        const outputEl = element.querySelector('.block-output');
        outputEl.innerHTML = this.escapeHtml(block.output.join(''));
        
        // Auto-scroll output to bottom
        outputEl.scrollTop = outputEl.scrollHeight;
    }
    
    executeBlockCommand(block) {
        // This is where you'd connect to your backend
        // For now, we'll simulate command execution
        
        // Simulate command output
        setTimeout(() => {
            block.addOutput(`Executing: ${block.command}\n`);
            block.addOutput('Sample output line 1\n');
            block.addOutput('Sample output line 2\n');
            this.updateBlockUI(block);
        }, 100);
        
        // Simulate command completion
        setTimeout(() => {
            block.setStatus('success', 0);
            this.updateBlockUI(block);
            this.activeBlock = null;
            this.terminalContainer.classList.remove('active');
        }, 2000);
    }
    
    toggleBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) return;
        
        block.collapsed = !block.collapsed;
        const outputEl = block.element.querySelector('.block-output');
        const collapseBtn = block.element.querySelector('.collapse');
        
        if (block.collapsed) {
            outputEl.classList.add('collapsed');
            collapseBtn.innerHTML = '▶';
        } else {
            outputEl.classList.remove('collapsed');
            collapseBtn.innerHTML = '▼';
        }
    }
    
    replayBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) return;
        
        this.executeCommand(block.command);
    }
    
    copyBlockOutput(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) return;
        
        const output = block.output.join('');
        navigator.clipboard.writeText(output).then(() => {
            // Show feedback
            const copyBtn = block.element.querySelector('.copy');
            copyBtn.innerHTML = '✓';
            setTimeout(() => {
                copyBtn.innerHTML = '📋';
            }, 1000);
        });
    }
    
    selectBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) return;
        
        // Remove previous selection
        this.blocksContainer.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection
        block.element.classList.add('selected');
    }
    
    removeBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) return;
        
        block.element.remove();
        this.blocks.delete(blockId);
    }
    
    navigateHistory(direction) {
        if (this.history.length === 0) return;
        
        this.historyIndex += direction;
        this.historyIndex = Math.max(0, Math.min(this.history.length - 1, this.historyIndex));
        
        this.commandInput.value = this.history[this.historyIndex] || '';
    }
    
    sendToProcess(blockId, data) {
        // This would send data to the backend process
        console.log(`Sending to block ${blockId}:`, data);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Export blocks as JSON
    exportBlocks() {
        return Array.from(this.blocks.values()).map(block => block.toJSON());
    }
    
    // Import blocks from JSON
    importBlocks(data) {
        data.forEach(blockData => {
            const block = new CommandBlock(this.blockIdCounter++, blockData.command);
            block.output = [blockData.output];
            block.status = blockData.status;
            block.exitCode = blockData.exitCode;
            block.startTime = blockData.timestamp;
            block.endTime = blockData.timestamp + (blockData.duration || 0);
            
            this.blocks.set(block.id, block);
            const element = this.createBlockElement(block);
            this.blocksContainer.appendChild(element);
            block.element = element;
        });
    }
}

export default BlockTerminal;
