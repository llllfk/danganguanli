/** 拖拽文件夹时用 webkitGetAsEntry 递归收集，并补齐 webkitRelativePath */

export async function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const items = dt.items;
  if (!items?.length) return Array.from(dt.files || []);

  const roots: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = (
      items[i] as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntry | null;
      }
    ).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (!roots.length) return Array.from(dt.files || []);

  const out: File[] = [];

  async function readAll(
    reader: FileSystemDirectoryReader
  ): Promise<FileSystemEntry[]> {
    const all: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (!batch.length) break;
      all.push(...batch);
    }
    return all;
  }

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      const rel = prefix + file.name;
      try {
        Object.defineProperty(file, "webkitRelativePath", {
          value: rel,
          configurable: true,
        });
      } catch {
        /* ignore */
      }
      out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const children = await readAll(
        (entry as FileSystemDirectoryEntry).createReader()
      );
      const dirPrefix = `${prefix}${entry.name}/`;
      for (const child of children) {
        await walk(child, dirPrefix);
      }
    }
  }

  for (const root of roots) {
    await walk(root, "");
  }
  return out.length ? out : Array.from(dt.files || []);
}
