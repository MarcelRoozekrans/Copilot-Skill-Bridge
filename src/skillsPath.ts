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
    const effective = override && override.length > 0
        ? override
        : (scope === 'user' ? USER_DEFAULT : WORKSPACE_DEFAULT);

    if (effective === '~') {
        return vscode.Uri.file(os.homedir());
    }
    if (effective.startsWith('~/') || effective.startsWith('~\\')) {
        return vscode.Uri.file(path.join(os.homedir(), effective.slice(2)));
    }
    if (path.isAbsolute(effective)) {
        return vscode.Uri.file(effective);
    }
    if (scope === 'workspace') {
        return vscode.Uri.joinPath(workspaceUri, ...effective.split(/[\\/]/));
    }
    return vscode.Uri.file(path.join(os.homedir(), effective));
}
