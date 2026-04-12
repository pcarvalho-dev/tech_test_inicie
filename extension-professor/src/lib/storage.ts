export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: 'professor';
}

export interface StorageData {
  token?: string;
  user?: StoredUser;
}

export function getStorage(keys: (keyof StorageData)[]): Promise<StorageData> {
  return chrome.storage.local.get(keys) as Promise<StorageData>;
}

export function setStorage(data: Partial<StorageData>): Promise<void> {
  return chrome.storage.local.set(data);
}

export function clearStorage(): Promise<void> {
  return chrome.storage.local.clear();
}
