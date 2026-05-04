import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type SkillsScope = 'user' | 'workspace';

const USER_DEFAULT = '~/.claude/skills';
const WORKSPACE_DEFAULT = '.github/skills';

export function resolveSkillsRoot(
    scope: SkillsScope,
    override: string | undefined,
    workspaceUri: vscode.Uri,
): vscode.Uri {
    const raw = override ?? (scope === 'user' ? USER_DEFAULT : WORKSPACE_DEFAULT);

    if (raw.startsWith('~')) {
        return vscode.Uri.file(path.join(os.homedir(), raw.slice(1)));
    }
    if (path.isAbsolute(raw)) {
        return vscode.Uri.file(raw);
    }
    if (scope === 'workspace') {
        return vscode.Uri.joinPath(workspaceUri, ...raw.split(/[\\/]/));
    }
    return vscode.Uri.file(path.join(os.homedir(), raw));
}
