# Project file save/open

Manual project save and open now share a 64 MiB UTF-8 byte limit. The previous
save path could emit a file of any size while open refused anything above 20 MB.
Large tracking projects could therefore save successfully and fail to reopen.

Files remain plain FrostCut JSON, serialized without unnecessary indentation.
No point, text, timing, keyframe or sequence data is removed or rounded. Legacy
formatted backups still open. Imported projects still pass the full model
validator; excess files are rejected before reading/parsing their content.

Manual save checks the actual Blob byte size before starting a browser download.
Save button and Ctrl/Cmd+S report an actionable error if the file exceeds the
budget, preserving the current project, undo history, media and local autosave.
The larger bound supports more point data; it does not promise unlimited files.
Media files stay separate and must be kept/relinked with the project backup.

Three focused tests passed in 507 ms, one worker; source type-check passed.
Tests use a tiny 600-point, multi-sequence Unicode project to verify byte sizing,
compact lossless JSON, model validation, legacy opening and rejection before
reading. The size boundary is checked numerically without allocating a 64 MiB
fixture. Large-file/browser download and open review remains pending. No media
job, model, render, browser suite or production build was started.
