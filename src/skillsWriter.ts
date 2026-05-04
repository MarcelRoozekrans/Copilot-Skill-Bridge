import * as vscode from 'vscode';
import { CompanionFile } from './types';
import { getLogger } from './logger';

export async function writeSkillFolder(
    root: vscode.Uri,
    skillName: string,
    skillContent: string,
    companionFiles: CompanionFile[],
): Promise<void> {
    const skillDir = vscode.Uri.joinPath(root, skillName);
    await vscode.workspace.fs.createDirectory(skillDir);

    await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(skillDir, 'SKILL.md'),
        Buffer.from(skillContent, 'utf-8'),
    );

    for (const companion of companionFiles) {
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(skillDir, companion.name),
            Buffer.from(companion.content, 'utf-8'),
        );
    }
}

export async function removeSkillFolder(root: vscode.Uri, skillName: string): Promise<void> {
    const skillDir = vscode.Uri.joinPath(root, skillName);
    try {
        await vscode.workspace.fs.delete(skillDir, { recursive: true, useTrash: false });
    } catch (err) {
        getLogger().debug('skillsWriter.removeSkillFolder: directory not found', err);
    }
}
