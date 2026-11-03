let token = '';
export function setToken(value: string) { token = value; }
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json', ...(token ? {'X-UIUX-Token': token} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result as T;
}
