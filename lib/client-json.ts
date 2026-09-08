/**
 * Read an API response without letting an empty or non-JSON body break the
 * page. Cloudflare can occasionally return a short empty response while a
 * worker is waking up; callers can then keep their current UI state and retry.
 */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('서버 응답이 비어 있어요. 잠시 후 다시 시도해주세요.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('서버 응답을 읽지 못했어요. 잠시 후 다시 시도해주세요.');
  }
}
