/**
 * Recent Files Plugin
 *
 * Opens a dedicated panel/tab showing recently modified files.
 * - Collections whose name contains "Journal" are excluded.
 * - Click ★ to star/unstar a file (persisted in localStorage).
 * - Click any file row to open it in a new panel.
 * - Configurable number of files via config.custom.maxFiles (default: 15).
 *
 * Performance: Only scans when you open the Recent panel — NO background polling.
 */

class Plugin extends AppPlugin {

    // ─────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────

    onLoad() {
        this.ui.registerCustomPanelType('recent-files-panel', (panel) => {
            this._panelElement = panel.getElement();
            this.renderRecentPanel(panel);
        });

        this.sidebarItem = this.ui.addSidebarItem({
            label: 'Recent',
            icon: 'ti-clock',
            tooltip: 'Show recently modified files',
            onClick: () => this.openRecentPanel()
        });

        this.ui.addCommandPaletteCommand({
            label: 'Show Recent Notes',
            icon: 'ti-clock',
            onSelected: () => this.openRecentPanel()
        });

        this.injectStyles();
    }

    onUnload() {
        if (this.sidebarItem) this.sidebarItem.remove();
    }

    // ─────────────────────────────────────────────
    // Pin storage (localStorage — no plugin reload)
    // ─────────────────────────────────────────────

    _pinStorageKey() {
        return `recent-files-pins-${this.getWorkspaceGuid()}`;
    }

    _loadPins() {
        try {
            const raw = localStorage.getItem(this._pinStorageKey());
            return new Set(raw ? JSON.parse(raw) : []);
        } catch {
            return new Set();
        }
    }

    _savePins(pinnedGuids) {
        try {
            localStorage.setItem(this._pinStorageKey(), JSON.stringify(Array.from(pinnedGuids)));
        } catch (err) {
            console.error('[Recent Files] Failed to save pins:', err);
        }
    }

    // ─────────────────────────────────────────────
    // Panel management
    // ─────────────────────────────────────────────

    async openRecentPanel() {
        const existing = this.ui.getPanels().find(p => {
            const nav = p.getNavigation();
            return nav && nav.type === 'custom' && nav.customType === 'recent-files-panel';
        });

        if (existing) {
            this.ui.setActivePanel(existing);
            return;
        }

        const panel = await this.ui.createPanel();
        if (!panel) {
            console.error('[Recent Files] Failed to create panel');
            return;
        }

        panel.navigateToCustomType('recent-files-panel');
        this.ui.setActivePanel(panel);
    }

    async renderRecentPanel(panel) {
        panel.setTitle('Recent');

        const el = panel.getElement();
        if (!el) return;

        el.innerHTML = '';
        el.className = 'rf-panel';

        // ── Header ──────────────────────────────
        const header = document.createElement('div');
        header.className = 'rf-header';

        const titleEl = document.createElement('h2');
        titleEl.className = 'rf-title';
        titleEl.textContent = 'Recent';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'rf-icon-btn';
        refreshBtn.title = 'Refresh';
        refreshBtn.appendChild(this.ui.createIcon('ti-refresh'));
        refreshBtn.onclick = () => this.renderRecentPanel(panel);

        header.appendChild(titleEl);
        header.appendChild(refreshBtn);

        // ── Body ────────────────────────────────
        const body = document.createElement('div');
        body.className = 'rf-body';
        body.innerHTML = '<div class="rf-loading">Loading…</div>';

        el.appendChild(header);
        el.appendChild(body);

        await this.populateBody(body, panel);
    }

    async populateBody(body, panel) {
        try {
            const config = this.getConfiguration();
            const maxFiles = config.custom?.maxFiles || 15;
            const showCollection = config.custom?.showCollection !== false;
            const pinnedGuids = this._loadPins();

            const recentFiles = await this.getRecentFiles(maxFiles, pinnedGuids);

            body.innerHTML = '';

            if (recentFiles.length === 0) {
                body.innerHTML = '<div class="rf-empty">No recent files found</div>';
                return;
            }

            const list = document.createElement('div');
            list.className = 'rf-list';

            const pinned = recentFiles.filter(f => f.isPinned);
            const recent = recentFiles.filter(f => !f.isPinned);

            if (pinned.length > 0) {
                list.appendChild(this.makeDivider('Starred'));
                pinned.forEach(f => list.appendChild(
                    this.buildFileRow(f, showCollection, pinnedGuids, list, maxFiles, panel)
                ));
            }

            if (recent.length > 0) {
                if (pinned.length > 0) list.appendChild(this.makeDivider('Recent'));
                recent.forEach(f => list.appendChild(
                    this.buildFileRow(f, showCollection, pinnedGuids, list, maxFiles, panel)
                ));
            }

            body.appendChild(list);

        } catch (err) {
            console.error('[Recent Files] Error loading files:', err);
            body.innerHTML = '<div class="rf-error">Error loading recent files</div>';
        }
    }

    makeDivider(text) {
        const d = document.createElement('div');
        d.className = 'rf-divider';
        d.textContent = text;
        return d;
    }

    // ─────────────────────────────────────────────
    // Row builder
    // ─────────────────────────────────────────────

    buildFileRow(file, showCollection, pinnedGuids, list, maxFiles, panel) {
        const item = document.createElement('div');
        item.className = 'rf-item' + (file.isPinned ? ' rf-item--pinned' : '');
        item.dataset.guid = file.recordGuid;

        // Star button
        const pinBtn = document.createElement('button');
        pinBtn.className = 'rf-pin-btn' + (file.isPinned ? ' rf-pin-btn--active' : '');
        pinBtn.title = file.isPinned ? 'Unstar' : 'Star';
        pinBtn.textContent = '★';
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            const nowPinned = !pinnedGuids.has(file.recordGuid);
            if (nowPinned) {
                pinnedGuids.add(file.recordGuid);
            } else {
                pinnedGuids.delete(file.recordGuid);
            }
            this._savePins(pinnedGuids);
            file.isPinned = nowPinned;
            item.classList.toggle('rf-item--pinned', nowPinned);
            pinBtn.classList.toggle('rf-pin-btn--active', nowPinned);
            pinBtn.title = nowPinned ? 'Unstar' : 'Star';
            this.repositionRow(item, file, pinnedGuids, list, showCollection, maxFiles, panel);
        };

        // Icon
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'rf-icon';
        iconWrapper.appendChild(this.ui.createIcon(file.collectionIcon || 'ti-file'));

        // Content
        const content = document.createElement('div');
        content.className = 'rf-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'rf-item-title';
        titleDiv.textContent = file.title || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'rf-meta';

        if (showCollection) {
            const colSpan = document.createElement('span');
            colSpan.textContent = file.collectionName;
            meta.appendChild(colSpan);
            const sep = document.createElement('span');
            sep.className = 'rf-sep';
            sep.textContent = '•';
            meta.appendChild(sep);
        }

        const timeSpan = document.createElement('span');
        timeSpan.textContent = this.formatRelativeTime(file.updatedAt);
        meta.appendChild(timeSpan);

        content.appendChild(titleDiv);
        content.appendChild(meta);

        item.appendChild(pinBtn);
        item.appendChild(iconWrapper);
        item.appendChild(content);

        // Open record on click — reuse an existing non-Recent panel rather than
        // opening a new one each time, matching standard Thymer behaviour.
        item.onclick = async () => {
            try {
                const myElement = this._panelElement;
                let targetPanel = null;
                for (const p of this.ui.getPanels()) {
                    if (p.getElement() === myElement) continue;
                    targetPanel = p;
                    break;
                }
                if (!targetPanel) {
                    targetPanel = await this.ui.createPanel();
                }
                if (!targetPanel) return;
                targetPanel.navigateTo({
                    type: 'edit_panel',
                    rootId: file.recordGuid,
                    workspaceGuid: this.getWorkspaceGuid()
                });
                this.ui.setActivePanel(targetPanel);
            } catch (err) {
                console.error('[Recent Files] Error opening record:', err);
            }
        };

        return item;
    }

    // Reorder rows in-place after a star/unstar
    repositionRow(item, file, pinnedGuids, list, showCollection, maxFiles, panel) {
        const allItems = Array.from(list.querySelectorAll('.rf-item'));
        const pinOrder = Array.from(pinnedGuids);

        allItems.sort((a, b) => {
            const aIdx = pinOrder.indexOf(a.dataset.guid);
            const bIdx = pinOrder.indexOf(b.dataset.guid);
            const aPinned = aIdx !== -1;
            const bPinned = bIdx !== -1;
            if (aPinned && bPinned) return aIdx - bIdx;
            if (aPinned) return -1;
            if (bPinned) return 1;
            return 0;
        });

        list.innerHTML = '';
        const hasPinned   = allItems.some(el => pinnedGuids.has(el.dataset.guid));
        const hasUnpinned = allItems.some(el => !pinnedGuids.has(el.dataset.guid));

        if (hasPinned) list.appendChild(this.makeDivider('Starred'));
        for (const el of allItems) {
            if (!pinnedGuids.has(el.dataset.guid)) continue;
            list.appendChild(el);
        }

        if (hasUnpinned) {
            if (hasPinned) list.appendChild(this.makeDivider('Recent'));
            for (const el of allItems) {
                if (pinnedGuids.has(el.dataset.guid)) continue;
                list.appendChild(el);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Data fetching
    // ─────────────────────────────────────────────

    async getRecentFiles(maxFiles, pinnedGuids) {
        const files = [];
        const collections = await this.data.getAllCollections();

        for (const collection of collections) {
            if (collection.getName().toLowerCase().includes('journal')) continue;

            const records = await collection.getAllRecords();
            const collectionName = collection.getName();
            const collectionIcon = collection.getConfiguration().icon;

            for (const record of records) {
                const updatedAt = record.getUpdatedAt();
                if (updatedAt) {
                    files.push({
                        recordGuid: record.guid,
                        collectionName,
                        collectionIcon,
                        title: record.getName(),
                        updatedAt,
                        isPinned: pinnedGuids.has(record.guid)
                    });
                }
            }
        }

        const pinOrder = Array.from(pinnedGuids);
        const pinned = files
            .filter(f => f.isPinned)
            .sort((a, b) => pinOrder.indexOf(a.recordGuid) - pinOrder.indexOf(b.recordGuid));

        const recent = files
            .filter(f => !f.isPinned)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, maxFiles);

        return [...pinned, ...recent];
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    formatRelativeTime(date) {
        const now = new Date();
        const diffMs   = now.getTime() - date.getTime();
        const diffSecs  = Math.floor(diffMs / 1000);
        const diffMins  = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays  = Math.floor(diffHours / 24);

        if (diffSecs  < 60) return 'just now';
        if (diffMins  < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays  <  7) return `${diffDays}d ago`;
        if (diffDays  < 30) return `${Math.floor(diffDays / 7)}w ago`;

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }

    // ─────────────────────────────────────────────
    // Styles
    // ─────────────────────────────────────────────

    injectStyles() {
        this.ui.injectCSS(`
            .rf-panel {
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                justify-content: flex-start !important;
                width: 100% !important;
                height: 100% !important;
                box-sizing: border-box !important;
                background: var(--color-bg-900, #1e1e2e);
                color: var(--color-text-50, #cdd6f4);
                overflow: hidden;
            }

            .rf-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                box-sizing: border-box;
                padding: 18px 10px 14px;
                border-bottom: 1px solid var(--color-bg-700, rgba(128,128,128,0.2));
                flex-shrink: 0;
            }

            .rf-title {
                margin: 0;
                font-size: 17px;
                font-weight: 600;
                color: var(--color-text-50, inherit);
            }

            .rf-icon-btn {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--color-text-500, #6c7086);
                padding: 4px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: background .15s, color .15s;
            }
            .rf-icon-btn:hover {
                background: var(--color-bg-700, rgba(128,128,128,0.1));
                color: var(--color-text-100, #fff);
            }

            .rf-body {
                flex: 1 1 auto;
                width: 100%;
                box-sizing: border-box;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px 4px;
            }

            .rf-list {
                width: 100%;
                box-sizing: border-box;
            }

            .rf-loading,
            .rf-empty,
            .rf-error {
                text-align: center;
                padding: 40px 20px;
                color: var(--color-text-500, #6c7086);
                font-size: 14px;
            }
            .rf-error { color: var(--color-error, #f38ba8); }

            .rf-divider {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: .06em;
                color: var(--color-text-600, #585b70);
                padding: 10px 10px 4px;
                user-select: none;
                width: 100%;
                box-sizing: border-box;
            }

            .rf-item {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                box-sizing: border-box;
                padding: 9px 10px;
                border-radius: 8px;
                cursor: pointer;
                transition: background .15s;
                min-width: 0;
            }
            .rf-item:hover {
                background: var(--sidebar-bg-hover, var(--color-bg-700, rgba(255,255,255,0.05)));
            }
            .rf-item--pinned {
                background: var(--color-bg-800, rgba(255,255,255,0.02));
            }
            .rf-item--pinned:hover {
                background: var(--color-bg-700, rgba(255,255,255,0.06));
            }

            .rf-pin-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                padding: 2px 4px;
                border-radius: 4px;
                color: var(--color-text-700, rgba(128,128,128,0.3));
                opacity: 0;
                transition: opacity .15s, color .15s;
                flex-shrink: 0;
            }
            .rf-item:hover .rf-pin-btn,
            .rf-pin-btn--active {
                opacity: 1;
            }
            .rf-pin-btn--active {
                color: var(--color-primary-400, #cba6f7);
            }
            .rf-pin-btn:hover {
                color: var(--color-text-100, #cdd6f4) !important;
            }

            .rf-icon {
                color: var(--color-primary-400, var(--color-text-200));
                display: flex;
                align-items: center;
                flex-shrink: 0;
            }

            .rf-content {
                display: flex;
                flex-direction: column;
                gap: 2px;
                flex: 1;
                min-width: 0;
            }
            .rf-item-title {
                font-size: 14px;
                font-weight: 500;
                color: var(--color-text-100, inherit);
                white-space: normal;
                word-break: break-word;
                overflow-wrap: break-word;
            }
            .rf-meta {
                font-size: 12px;
                color: var(--color-text-500, #6c7086);
                white-space: normal;
                word-break: break-word;
                overflow-wrap: break-word;
            }
            .rf-sep {
                margin: 0 5px;
            }
        `);
    }
}
