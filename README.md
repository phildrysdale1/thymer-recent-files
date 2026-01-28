# Thymer Recent Files Plugin

A Thymer plugin that adds quick access to your most recently modified files via a popup modal.

## Features

- Sidebar item with icon for instant access to recent files
- Styled modal matching Thymer's native UI
- Shows files from all collections
- Displays relative timestamps ("5m ago", "2d ago")
- Zero performance impact - only scans when clicked
- Configurable file count (default: 15)

## Installation

1. Press `Cmd+P` / `Ctrl+P` in Thymer to open Command Palette
2. Select "Plugins" → "Create Plugin" → "Global Plugin"
3. Paste the contents of `recent-files-plugin.json` into the JSON editor
4. Click "Code" tab and paste the contents of `recent-files-plugin.js`
5. Click "Save"

## Usage

Click the clock icon in your sidebar to see recent files. Click any file to open it in a new panel.

**Keyboard shortcuts:**
- `Esc` - Close modal
- Click outside - Close modal

## Configuration

Edit the plugin settings to customise:

```json
{
  "custom": {
    "maxFiles": 15,
    "showCollection": true
  }
}
```

- `maxFiles` - Number of files to show (default: 15)
- `showCollection` - Show collection names (default: true)
