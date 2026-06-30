# Changelog

All notable changes to **API Documenter** will be documented in this file.

## [1.0.26] - 2026-06-30

### Added
- **Workspace History Preservation**: The app now automatically saves your IDE state (expanded folders, open tabs, active API, and environment) and instantly restores it whenever you switch projects or restart the app.
- **Recent Projects List**: Added a beautifully styled "Recent Projects" section to the Welcome screen that lists your recently opened projects in order.
- **Keyboard Shortcuts**: 
  - `Ctrl + Enter` to instantly send an API request.
  - `Ctrl + B` to quickly toggle the sidebar.
- **Response Panel Enhancements**:
  - Added custom floating scroll buttons (Up/Down) to easily navigate large JSON responses.
  - Added a custom CodeMirror search UI.
  - Implemented a sticky panel header and scroll margins.

### Fixed
- Fixed an issue where the Welcome screen content would overflow and cut off the logo on smaller screens.
- Fixed a race condition that caused deleted projects to still briefly appear in the Recent Projects list.
- Fixed a bug where projects from other environments (e.g., production vs dev) would show up in the Recent Projects list but fail to open.
