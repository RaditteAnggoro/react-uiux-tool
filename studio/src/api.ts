let token = '';
let projectRoot = '';
let checkpointId = '';
export function setToken(value: string) { token = value; }
export function setProject(value: string) {
  if (value !== projectRoot) checkpointId = '';
  projectRoot = value;
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const projectActions = ['analyze', 'patch', 'edit', 'edit-group', 'apply', 'undo', 'discard', 'draft/edit', 'draft/edit-group', 'draft/undo', 'draft/redo', 'draft/commit', 'draft/discard', 'draft/preview'];
  const payload = body !== undefined && projectActions.includes(path)
    ? { ...(body as object), expectedProject: projectRoot, ...(path === 'undo' ? { expectedCheckpoint: checkpointId } : {}) }
    : body;
  const response = await fetch(`/api/${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json', ...(token ? {'X-UIUX-Token': token} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(payload)})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  if (result.checkpoint?.id) checkpointId = result.checkpoint.id;
  if (path === 'undo') checkpointId = '';
  if (result.refreshFailed) window.dispatchEvent(new Event('uiux:refresh-failed'));
  return result as T;
}
