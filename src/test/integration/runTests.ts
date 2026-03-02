import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './index');
    const workspacePath = path.resolve(__dirname, '../../../test-workspace');

    // Ensure ELECTRON_RUN_AS_NODE is not inherited, otherwise Code.exe
    // runs as a plain Node process instead of launching the Electron GUI.
    delete process.env['ELECTRON_RUN_AS_NODE'];

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [workspacePath],
    });
}

main().catch((err) => {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
});
