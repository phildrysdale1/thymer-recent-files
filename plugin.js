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
        /* ==============================
           Backdrop
           ============================== */
        .recent-files-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }

        /* ==============================
           Modal Container
           ============================== */
        .recent-files-modal {
            border-radius: 12px;
            /* Using theme-specific border or a fallback */
            border: 1px solid var(--cards-border-color, var(--color-bg-400));
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);

            width: 520px;
            max-width: 92vw;
            max-height: 72vh;

            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 10001;

            /* Matches your theme's main window background */
            background-color: var(--color-bg-900); 
            color: var(--color-text-50);
        }

        /* ==============================
           Header
           ============================== */
        .recent-files-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            /* Divider line using a slightly lighter background color */
            border-bottom: 1px solid var(--color-bg-700));
        }

        .recent-files-close-btn {
            background: none;
            border: none;
            font-size: 26px;
            cursor: pointer;
            color: var(--color-text-500);
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .recent-files-close-btn:hover {
            background: var(--color-bg-700));
            color: var(--color-text-100);
        }

        /* ==============================
           Body & List Items
           ============================== */
        .recent-files-modal-body {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 8px;
            min-height: 0;
        }

        .recent-file-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background .15s ease;
        }

        .recent-file-item:hover {
            /* Uses the theme's hover color */
            background: var(--sidebar-bg-hover, var(--color-bg-700)));
        }

        .recent-file-title {
            font-weight: 500;
            color: var(--color-text-100);
        }

        .recent-file-meta {
            font-size: 12px;
            color: var(--color-text-500);
        }

        /* Icon color tweak to match theme primary if available */
        .recent-file-icon {
            color: var(--color-primary-400, var(--color-text-200));
            display: flex;
            align-items: center;
        }
    `);
}
}
