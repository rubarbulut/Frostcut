import { validateProject, type Project } from './model';

/** Same UTF-8 byte budget on save/open. Media files are not embedded in project JSON. */
export const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
export function assertProjectFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > MAX_PROJECT_FILE_BYTES)
    throw new Error('Project files support up to 64 MiB. Remove unused parts or save parts in separate projects; your current edit and local autosave remain unchanged.');
}
export function projectFileBlob(project: Project) {
  // Whitespace is unnecessary for reopening, and can multiply large point tables.
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  assertProjectFileSize(blob.size);
  return blob;
}
export async function readProjectFile(file: Pick<File, 'size' | 'text'>) {
  assertProjectFileSize(file.size);
  let value: unknown;
  try { value = JSON.parse(await file.text()); }
  catch { throw new Error('This project file could not be read as JSON. Choose a FrostCut project backup.'); }
  return validateProject(value);
}
