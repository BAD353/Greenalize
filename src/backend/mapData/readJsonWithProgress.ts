export type DownloadProgress = (receivedBytes: number, totalBytes: number | null) => void;

// Reads a JSON response while reporting how many bytes have arrived. The total is only known when the server sends
// an uncompressed Content-Length, otherwise it is null.
export async function readJsonWithProgress(response: Response, onProgress?: DownloadProgress) {
  if (!response.body) return response.json();

  const contentLength = Number(response.headers.get("Content-Length"));
  const totalBytes = !response.headers.get("Content-Encoding") && contentLength > 0 ? contentLength : null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    onProgress?.(receivedBytes, totalBytes);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}