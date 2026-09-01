import * as assert from 'assert';
import { isFileNotFound } from '../../fsErrors';

describe('isFileNotFound', () => {
    it('should recognise a VS Code FileSystemError code', () => {
        const err = Object.assign(new Error('Unable to read file'), { code: 'FileNotFound' });
        assert.strictEqual(isFileNotFound(err), true);
    });

    it('should recognise a Node ENOENT code', () => {
        const err = Object.assign(new Error('boom'), { code: 'ENOENT' });
        assert.strictEqual(isFileNotFound(err), true);
    });

    it('should recognise an ENOENT message with no code property', () => {
        const err = new Error("ENOENT: no such file or directory, open 'c:\\x\\y.json'");
        assert.strictEqual(isFileNotFound(err), true);
    });

    it('should not treat a JSON parse failure as file-not-found', () => {
        const err = new SyntaxError('Unexpected token } in JSON at position 12');
        assert.strictEqual(isFileNotFound(err), false);
    });

    it('should not treat a permission error as file-not-found', () => {
        const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
        assert.strictEqual(isFileNotFound(err), false);
    });

    it('should handle non-error values without throwing', () => {
        assert.strictEqual(isFileNotFound(undefined), false);
        assert.strictEqual(isFileNotFound(null), false);
        assert.strictEqual(isFileNotFound('ENOENT'), false);
    });
});
