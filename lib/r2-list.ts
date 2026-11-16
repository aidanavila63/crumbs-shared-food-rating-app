// Round 77: the file names in an S3 / R2 "list objects" answer (used to keep only the newest backups).
export function listedKeys(xml: string) {
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1])
}
