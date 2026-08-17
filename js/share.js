export function filenameFor(prefix, ext = "json") {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (prefix || "morning-pages").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug || "morning-pages"}-${stamp}.${ext}`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareFilesOrDownload(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
    }
  }
  for (const file of files) downloadBlob(file.name, file);
  return "downloaded";
}

export async function shareOrDownload(filename, content, mimeType = "application/json") {
  return shareFilesOrDownload([new File([content], filename, { type: mimeType })]);
}

export { shareFilesOrDownload };
