const CHUNK_RE = /(\d+)|(\D+)/g;

export function naturalCompare(a: string, b: string): number {
  const aChunks = a.match(CHUNK_RE) || [];
  const bChunks = b.match(CHUNK_RE) || [];
  const len = Math.min(aChunks.length, bChunks.length);

  for (let i = 0; i < len; i++) {
    const ac = aChunks[i];
    const bc = bChunks[i];
    const aNum = Number(ac);
    const bNum = Number(bc);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum !== bIsNum) {
      return aIsNum ? -1 : 1;
    } else {
      const cmp = ac.localeCompare(bc, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
  }
  return aChunks.length - bChunks.length;
}

export function sortResources<T extends { name: string; folderPath?: string; parentFolderId?: string }>(
  items: T[],
  folders: Set<string>,
): T[] {
  return items.slice().sort((a, b) => {
    const aIsFolder = folders.has(a.parentFolderId ?? "") && !a.parentFolderId;
    const bIsFolder = folders.has(b.parentFolderId ?? "") && !b.parentFolderId;
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;

    const aPath = a.folderPath ?? "";
    const bPath = b.folderPath ?? "";
    if (aPath !== bPath) return naturalCompare(aPath, bPath);

    return naturalCompare(a.name, b.name);
  });
}
