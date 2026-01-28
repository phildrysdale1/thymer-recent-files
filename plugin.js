/**
 * Recent Files Plugin
 * 
 * Adds a sidebar item that opens a styled modal showing recently modified files.
 * Click any file to open it in a new panel. Configurable number of files (default: 15).
 * 
 * Performance: Only scans when you click the sidebar icon - NO background polling.
 */

class Plugin extends AppPlugin {

    onLoad() {
        // Add sidebar item
        this.sidebarItem = this.ui.addSidebarItem({
            label: 'Recent Files',
            icon: 'ti-clock',
            tooltip: 'Show recently modified files',
            onClick: () => {
                this.showRecentFilesModal();
            }
        });

        // Inject CSS for the modal
        this.injectModalStyles();
    }

    onUnload() {
        // Cleanup
        if (this.sidebarItem) {
            this.sidebarItem.remove();
        }
    }

    async showRecentFilesModal() {
        // Get configuration
        const config = this.getConfiguration();
        const maxFiles = config.custom?.maxFiles || 15;
        const showCollection = config.custom?.showCollection !== false;

        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'recent-files-modal-backdrop';
        
        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'recent-files-modal';
        
        // Modal header
        const header = document.createElement('div');
        header.className = 'recent-files-modal-header';
        
        const title = document.createElement('h2');
        title.textContent = 'Recent Files';
        title.style.margin = '0';
        title.style.fontSize = '16px';
        title.style.fontWeight = '600';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'recent-files-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => {
            backdrop.remove();
        };
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Modal body
        const body = document.createElement('div');
        body.className = 'recent-files-modal-body';
        body.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading...</div>';
        
        modal.appendChild(header);
        modal.appendChild(body);
        
        // Prevent clicks on modal from closing it
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        backdrop.appendChild(modal);
        
        // Add to DOM
        document.body.appendChild(backdrop);
        
        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
            }
        });
        
        // Close on escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                backdrop.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // Fetch and render files
        try {
            const recentFiles = await this.getRecentFiles(maxFiles);
            
            body.innerHTML = '';
            
            if (recentFiles.length === 0) {
                body.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">No recent files found</div>';
                return;
            }
            
            // Create file list
            const list = document.createElement('div');
            list.className = 'recent-files-list';
            
            for (const file of recentFiles) {
                const item = document.createElement('div');
                item.className = 'recent-file-item';
                
                // Icon
                const iconWrapper = document.createElement('div');
                iconWrapper.className = 'recent-file-icon';
                const icon = this.ui.createIcon(file.collectionIcon || 'ti-file');
                iconWrapper.appendChild(icon);
                
                // Content
                const content = document.createElement('div');
                content.className = 'recent-file-content';
                
                // Title
                const titleDiv = document.createElement('div');
                titleDiv.className = 'recent-file-title';
                titleDiv.textContent = file.title || 'Untitled';
                
                // Meta info
                const meta = document.createElement('div');
                meta.className = 'recent-file-meta';
                
                if (showCollection) {
                    const collectionSpan = document.createElement('span');
                    collectionSpan.textContent = file.collectionName;
                    meta.appendChild(collectionSpan);
                    
                    const separator = document.createElement('span');
                    separator.textContent = '•';
                    separator.style.margin = '0 6px';
                    meta.appendChild(separator);
                }
                
                const timeSpan = document.createElement('span');
                timeSpan.textContent = this.formatRelativeTime(file.updatedAt);
                meta.appendChild(timeSpan);
                
                content.appendChild(titleDiv);
                content.appendChild(meta);
                
                item.appendChild(iconWrapper);
                item.appendChild(content);
                
                // Click handler
                item.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        await this.openRecord(file.recordGuid, file.title);
                        backdrop.remove();
                    } catch (error) {
                        console.error('[Recent Files] Error opening record:', error);
                    }
                };
                
                list.appendChild(item);
            }
            
            body.appendChild(list);
            
        } catch (error) {
            console.error('[Recent Files] Error loading files:', error);
            body.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-error);">Error loading recent files</div>';
        }
    }

    async openRecord(recordGuid, title) {
        console.log('[Recent Files] Opening record:', title, recordGuid);
        
        try {
            // Get workspace GUID using the helper method
            const workspaceGuid = this.getWorkspaceGuid();
            
            if (!workspaceGuid) {
                console.error('[Recent Files] No workspace GUID found!');
                return;
            }
            
            // Create a new panel
            const newPanel = await this.ui.createPanel();
            
            if (!newPanel) {
                console.error('[Recent Files] Failed to create new panel');
                return;
            }
            
            // Navigate using the correct structure
            newPanel.navigateTo({
                type: 'edit_panel',
                rootId: recordGuid,
                workspaceGuid: workspaceGuid
            });
            
            // Set as active panel
            this.ui.setActivePanel(newPanel);
            
            console.log('[Recent Files] Record opened successfully');
        } catch (error) {
            console.error('[Recent Files] Error in openRecord:', error);
        }
    }

    async getRecentFiles(maxFiles) {
        const files = [];
        
        // Get all collections
        const collections = await this.data.getAllCollections();
        
        // Fetch records from all collections
        for (const collection of collections) {
            const records = await collection.getAllRecords();
            const collectionName = collection.getName();
            const collectionIcon = collection.getConfiguration().icon;
            
            for (const record of records) {
                const updatedAt = record.date('updated_at');
                if (updatedAt) {
                    files.push({
                        recordGuid: record.guid,
                        collectionName: collectionName,
                        collectionIcon: collectionIcon,
                        title: record.getName(),
                        updatedAt: updatedAt
                    });
                }
            }
        }
        
        // Sort by updated_at descending (most recent first)
        files.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        
        // Return top N files
        return files.slice(0, maxFiles);
    }

    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}w ago`;
        } else {
            // Format as date for older files
            return date.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    }

    injectModalStyles() {
        this.ui.injectCSS(`
            /* Modal backdrop */
            .recent-files-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                animation: recent-files-fadeIn 0.15s ease-out;
            }

            @keyframes recent-files-fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            /* Modal container */
            .recent-files-modal {
                background: var(--background-primary);
                border-radius: 8px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
                width: 500px;
                max-width: 90vw;
                max-height: 70vh;
                display: flex;
                flex-direction: column;
                animation: recent-files-slideIn 0.2s ease-out;
                border: 1px solid var(--background-modifier-border);
                position: relative;
                z-index: 10001;
                isolation: isolate;
                opacity: 1 !important;
                filter: none;
            }

            @keyframes recent-files-slideIn {
                from {
                    transform: translateY(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            /* Modal header */
            .recent-files-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .recent-files-close-btn {
                background: none;
                border: none;
                font-size: 28px;
                line-height: 1;
                cursor: pointer;
                color: var(--text-muted);
                padding: 0;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.1s;
            }

            .recent-files-close-btn:hover {
                background: var(--background-modifier-hover);
                color: var(--text-normal);
            }

            /* Modal body */
            .recent-files-modal-body {
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px;
                flex: 1 1 auto;
                min-height: 0;
            }

            /* File list */
            .recent-files-list {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            /* File item */
            .recent-file-item {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.1s;
                gap: 12px;
                user-select: none;
            }

            .recent-file-item:hover {
                background-color: var(--background-modifier-hover);
                transform: translateX(2px);
            }

            .recent-file-item:active {
                background-color: var(--background-modifier-active-hover);
                transform: translateX(0);
            }

            .recent-file-icon {
                color: var(--text-muted);
                flex-shrink: 0;
                display: flex;
                align-items: center;
                font-size: 18px;
            }

            .recent-file-content {
                flex: 1;
                min-width: 0;
            }

            .recent-file-title {
                font-weight: 500;
                color: var(--text-normal);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 3px;
            }

            .recent-file-meta {
                font-size: 12px;
                color: var(--text-muted);
                display: flex;
                align-items: center;
            }
        `);
    }
}
