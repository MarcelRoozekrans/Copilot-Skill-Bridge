import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillImportState } from './types';
import { getLogger } from './logger';
import { isFileNotFound } from './fsErrors';

const USER_MANIFEST_FILENAME = 'copilot-skill-bridge.json';

export interface UserManifest {
    skills: Record<string, SkillImportState>;
}

export function getUserManifestUri(): vscode.Uri {
    return vscode.Uri.file(path.join(os.homedir(), '.claude', USER_MANIFEST_FILENAME));
}

export function createEmptyUserManifest(): UserManifest {
    return { skills: {} };
}

export async function loadUserManifest(): Promise<UserManifest> {
    try {
        const raw = await vscode.workspace.fs.readFile(getUserManifestUri());
        return JSON.parse(Buffer.from(raw).toString('utf-8')) as UserManifest;
    } catch (err) {
        // A missing file is the normal state before the first user-scope import.
        // Anything else (corrupt JSON, permissions) is a real problem worth surfacing.
        if (!isFileNotFound(err)) {
            getLogger().warn('userManifest.loadUserManifest: unreadable manifest, using empty fallback', err);
        }
        return createEmptyUserManifest();
    }
}

export async function saveUserManifest(manifest: UserManifest): Promise<void> {
    const uri = getUserManifestUri();
    const dir = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(dir);
    const content = JSON.stringify(manifest, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
}
