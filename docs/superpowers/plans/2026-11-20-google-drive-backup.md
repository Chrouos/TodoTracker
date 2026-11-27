# Google Drive Backup Implementation Plan

**Goal** Give users automatic snapshots in their own Google Drive and allow manual restore.

**Architecture** Keep Chrome storage as the source of truth. Use Chrome Identity and the Drive API from the extension service worker. Reuse version 1 JSON exports and imports.

- [x] Test change detection, retention, failed uploads and the Drive request contract.
- [x] Add the Drive client and serialize background backup operations. Check hourly and on startup.
- [x] Add localized Settings controls for connection, backup history and confirmed restore.
- [x] Document OAuth setup, backup scope and the recovery workflow.
- [x] Run extension tests and web type checks.

**Verification** All six Drive tests and Web type checking passed. The extension suite passed 242 of 244 tests. Both failures also reproduce on the original revision in Node 22 without Web Locks. Live Google authorization and recovery require the Chrome Extension OAuth Client ID.
