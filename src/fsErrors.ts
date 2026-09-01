/**
 * True when an error from `vscode.workspace.fs` means "the target does not exist".
 *
 * VS Code normally surfaces this as a `FileSystemError` with code `FileNotFound`,
 * but the underlying Node `ENOENT` can reach us directly depending on the file
 * system provider, so both shapes are recognised. Deliberately duck-typed rather
 * than using `instanceof vscode.FileSystemError` so it works under the unit-test
 * vscode mock.
 */
export function isFileNotFound(err: unknown): boolean {
    const code = (err as { code?: unknown } | null | undefined)?.code;
    if (code === 'FileNotFound' || code === 'ENOENT') { return true; }
    return err instanceof Error && err.message.includes('ENOENT');
}
