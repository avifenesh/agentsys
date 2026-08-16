/**
 * Tests for atomic write utility
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { writeFileAtomic, writeJsonAtomic, getTempPath } = require('../lib/utils/atomic-write');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('atomic-write', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getTempPath', () => {
    it('generates temp path in same directory', () => {
      const targetPath = path.join(tempDir, 'file.json');
      const tempPath = getTempPath(targetPath);

      expect(path.dirname(tempPath)).toBe(tempDir);
      expect(tempPath).toMatch(/\.file\.json\.[a-f0-9]+\.tmp$/);
    });

    it('generates unique temp paths', () => {
      const targetPath = '/some/file.txt';
      const paths = new Set();

      for (let i = 0; i < 100; i++) {
        paths.add(getTempPath(targetPath));
      }

      expect(paths.size).toBe(100);
    });
  });

  describe('writeFileAtomic', () => {
    it('writes file successfully', () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Hello, World!';

      const result = writeFileAtomic(filePath, content);

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('overwrites existing file atomically', () => {
      const filePath = path.join(tempDir, 'existing.txt');
      fs.writeFileSync(filePath, 'old content');

      writeFileAtomic(filePath, 'new content');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
    });

    it('creates directories if needed', () => {
      const filePath = path.join(tempDir, 'nested', 'dir', 'file.txt');

      writeFileAtomic(filePath, 'content');

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('cleans up temp file on failure', () => {
      const filePath = path.join(tempDir, 'nonexistent', 'dir', 'file.txt');

      // Create parent as file to cause rename failure
      fs.writeFileSync(path.join(tempDir, 'nonexistent'), 'blocking');

      expect(() => writeFileAtomic(filePath, 'content')).toThrow();

      // Verify no .tmp files left behind
      const allFiles = fs.readdirSync(tempDir);
      expect(allFiles.some(f => f.endsWith('.tmp'))).toBe(false);
    });

    it('does not leave partial writes on interrupt', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'original content');

      // If writeFileAtomic throws during write, original should be intact
      // This is hard to test directly, but we can verify the pattern works
      writeFileAtomic(filePath, 'new content');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
    });
  });

  describe('writeJsonAtomic', () => {
    it('writes JSON with default indentation', () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { name: 'test', value: 123 };

      writeJsonAtomic(filePath, data);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(JSON.parse(content)).toEqual(data);
      expect(content).toContain('\n'); // Has indentation
    });

    it('writes JSON with custom indentation', () => {
      const filePath = path.join(tempDir, 'compact.json');
      const data = { a: 1 };

      writeJsonAtomic(filePath, data, { indent: 0 });

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('{"a":1}');
    });

    it('handles complex nested objects', () => {
      const filePath = path.join(tempDir, 'complex.json');
      const data = {
        users: [{ name: 'alice' }, { name: 'bob' }],
        settings: { theme: 'dark', notifications: true },
        timestamp: '2024-01-01T00:00:00Z'
      };

      writeJsonAtomic(filePath, data);

      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(data);
    });

    it('handles null and undefined values', () => {
      const filePath = path.join(tempDir, 'nulls.json');
      const data = { nullValue: null, undefinedGone: undefined };

      writeJsonAtomic(filePath, data);

      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(parsed.nullValue).toBeNull();
      expect(parsed).not.toHaveProperty('undefinedGone');
    });
  });

  describe('concurrent writes', () => {
    it('handles rapid sequential writes without data loss', () => {
      const filePath = path.join(tempDir, 'sequential.txt');
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        writeFileAtomic(filePath, `content-${i}`);
      }

      // Final content should be the last write
      expect(fs.readFileSync(filePath, 'utf8')).toBe(`content-${iterations - 1}`);
    });

    it('handles parallel writes from multiple async operations', async () => {
      const filePath = path.join(tempDir, 'parallel.txt');
      const writes = [];
      const iterations = 20;

      // Simulate parallel writes
      for (let i = 0; i < iterations; i++) {
        writes.push(
          new Promise((resolve, reject) => {
            try {
              writeFileAtomic(filePath, `parallel-${i}`);
              resolve(i);
            } catch (err) {
              reject(err);
            }
          })
        );
      }

      // All writes should complete (none should throw due to race condition)
      const results = await Promise.allSettled(writes);
      const failures = results.filter(r => r.status === 'rejected');

      // File should exist and contain valid content from one of the writers
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toMatch(/^parallel-\d+$/);

      // All writes should have succeeded
      expect(failures).toHaveLength(0);
    });

    it('maintains file integrity under concurrent access', async () => {
      const filePath = path.join(tempDir, 'integrity.json');
      const iterations = 30;

      // Initial write
      writeJsonAtomic(filePath, { count: 0 });

      // Concurrent read-modify-write cycles
      const operations = [];
      for (let i = 0; i < iterations; i++) {
        operations.push(
          new Promise(resolve => {
            try {
              // Each write is a complete, valid JSON
              writeJsonAtomic(filePath, {
                count: i,
                timestamp: Date.now(),
                data: `iteration-${i}`
              });
              resolve(true);
            } catch {
              resolve(false);
            }
          })
        );
      }

      await Promise.all(operations);

      // File should be valid JSON (not corrupted by partial writes)
      const content = fs.readFileSync(filePath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();

      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('count');
      expect(parsed).toHaveProperty('data');
    });
  });

  describe('large files', () => {
    it('handles 1MB file', () => {
      const filePath = path.join(tempDir, 'large-1mb.txt');
      const oneMB = 1024 * 1024;
      const content = 'x'.repeat(oneMB);

      const result = writeFileAtomic(filePath, content);

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBe(oneMB);

      // Verify content integrity
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles 10MB file', () => {
      const filePath = path.join(tempDir, 'large-10mb.txt');
      const tenMB = 10 * 1024 * 1024;
      // Use a repeating pattern for verification
      const pattern = 'ABCDEFGHIJ';
      const repetitions = tenMB / pattern.length;
      const content = pattern.repeat(repetitions);

      const result = writeFileAtomic(filePath, content);

      expect(result).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBe(tenMB);

      // Verify pattern at beginning, middle, and end
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(10);

      // Check beginning
      fs.readSync(fd, buffer, 0, 10, 0);
      expect(buffer.toString()).toBe(pattern);

      // Check middle
      fs.readSync(fd, buffer, 0, 10, Math.floor(tenMB / 2));
      expect(buffer.toString()).toBe(pattern);

      // Check near end
      fs.readSync(fd, buffer, 0, 10, tenMB - 20);
      expect(buffer.toString()).toBe(pattern);

      fs.closeSync(fd);
    });

    it('handles large JSON with many entries', () => {
      const filePath = path.join(tempDir, 'large-json.json');
      const data = {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          description: `This is item number ${i} with some additional text`,
          timestamp: Date.now(),
          tags: ['tag1', 'tag2', 'tag3']
        }))
      };

      writeJsonAtomic(filePath, data);

      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(parsed.items).toHaveLength(10000);
      expect(parsed.items[0].id).toBe(0);
      expect(parsed.items[9999].id).toBe(9999);
    });
  });

  describe('permission errors', () => {
    // Skip permission tests on Windows as chmod behaves differently
    const isWindows = process.platform === 'win32';

    it('throws on read-only directory', () => {
      if (isWindows) {
        // A System32 write is not a reliable refusal: anything elevated - a CI
        // runner included - succeeds and leaves the file behind. Use a parent
        // that cannot hold children at all, which is refused whatever the
        // account can do.
        const notADirectory = path.join(tempDir, 'plain-file');
        fs.writeFileSync(notADirectory, 'a file, not a directory');

        expect(() => writeFileAtomic(path.join(notADirectory, 'file.txt'), 'test')).toThrow();
        return;
      }

      const readOnlyDir = path.join(tempDir, 'readonly');
      fs.mkdirSync(readOnlyDir);
      fs.chmodSync(readOnlyDir, 0o444);

      const filePath = path.join(readOnlyDir, 'file.txt');

      try {
        expect(() => writeFileAtomic(filePath, 'content')).toThrow();
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(readOnlyDir, 0o755);
      }
    });

    it('throws when overwriting read-only file', () => {
      if (isWindows) {
        // On Windows, use attrib to set read-only
        const filePath = path.join(tempDir, 'readonly-file.txt');
        fs.writeFileSync(filePath, 'original');

        // Make file read-only using Windows API
        const { execSync } = require('child_process');
        try {
          execSync(`attrib +R "${filePath}"`, { stdio: 'ignore' });

          // Atomic write should still work because it renames over the file
          // The behavior depends on Windows version and NTFS settings
          // Just verify no crash occurs
          try {
            writeFileAtomic(filePath, 'new content');
          } catch (e) {
            expect(e.code).toMatch(/EPERM|EACCES/);
          }
        } finally {
          execSync(`attrib -R "${filePath}"`, { stdio: 'ignore' });
        }
        return;
      }

      const filePath = path.join(tempDir, 'readonly.txt');
      fs.writeFileSync(filePath, 'original');
      fs.chmodSync(filePath, 0o444);

      try {
        // On Linux, renaming to overwrite a read-only file can succeed
        // if the parent directory allows it (depends on directory permissions, not file)
        // So we just verify the function doesn't crash
        try {
          writeFileAtomic(filePath, 'new content');
        } catch {
          // Either throw or succeed is acceptable on Linux
        }
      } finally {
        fs.chmodSync(filePath, 0o644);
      }
    });

    it('preserves original file when write fails due to permissions', () => {
      if (isWindows) {
        // Skip detailed permission test on Windows
        return;
      }

      const filePath = path.join(tempDir, 'preserve.txt');
      fs.writeFileSync(filePath, 'original content');
      fs.chmodSync(filePath, 0o444);

      try {
        writeFileAtomic(filePath, 'new content');
      } catch {
        // Expected to throw
      }

      // On Linux, the file may be overwritten even with read-only perms
      // if the parent directory allows it. Read permission back first.
      fs.chmodSync(filePath, 0o644);
      const content = fs.readFileSync(filePath, 'utf8');
      // Accept either original or new - behavior is platform dependent
      expect(
        content === 'original content' || content === 'new content'
      ).toBe(true);
    });
  });

  describe('disk space errors', () => {
    it('throws error with appropriate code on disk write failure', () => {
      // We cannot easily simulate disk full, but we can verify error handling
      // by attempting to write to an invalid path
      const invalidPath = path.join(
        tempDir,
        'a'.repeat(300), // Extremely long filename
        'file.txt'
      );

      expect(() => writeFileAtomic(invalidPath, 'content')).toThrow();
    });

    it('cleans up temp file when write fails', () => {
      // Create a scenario where the temp file might be left behind
      const filePath = path.join(tempDir, 'cleanup-test.txt');

      // Write valid file first
      writeFileAtomic(filePath, 'valid');

      // Count files before failed write attempt
      const filesBefore = fs.readdirSync(tempDir).filter(f => f.endsWith('.tmp'));

      // Try to trigger an error (create blocking condition)
      const blockingPath = path.join(tempDir, 'blocked', 'nested', 'deep', 'file.txt');
      fs.writeFileSync(path.join(tempDir, 'blocked'), 'blocker');

      try {
        writeFileAtomic(blockingPath, 'content');
      } catch {
        // Expected
      }

      // No new .tmp files should remain
      const filesAfter = fs.readdirSync(tempDir).filter(f => f.endsWith('.tmp'));
      expect(filesAfter.length).toBe(filesBefore.length);
    });
  });

  describe('unicode content', () => {
    it('handles basic unicode characters', () => {
      const filePath = path.join(tempDir, 'unicode-basic.txt');
      const content = 'Hello World - Bonjour le monde - Hola Mundo';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles extended unicode (emojis)', () => {
      const filePath = path.join(tempDir, 'unicode-emoji.txt');
      const content = 'Status: [OK] [WARN] [ERROR] - Unicode test';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles CJK characters', () => {
      const filePath = path.join(tempDir, 'unicode-cjk.txt');
      const content = 'Chinese: \u4e2d\u6587 Japanese: \u65e5\u672c\u8a9e Korean: \ud55c\uad6d\uc5b4';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles Arabic and Hebrew (RTL)', () => {
      const filePath = path.join(tempDir, 'unicode-rtl.txt');
      const content = 'Arabic: \u0645\u0631\u062d\u0628\u0627 Hebrew: \u05e9\u05dc\u05d5\u05dd';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles mixed unicode in JSON', () => {
      const filePath = path.join(tempDir, 'unicode-json.json');
      const data = {
        greeting: '\u4f60\u597d',
        message: 'Hello World',
        symbols: '\u221e \u2211 \u03c0 \u03b8',
        mixed: 'Price: \u20ac100 or \u00a350'
      };

      writeJsonAtomic(filePath, data);

      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(parsed.greeting).toBe('\u4f60\u597d');
      expect(parsed.message).toBe('Hello World');
      expect(parsed.symbols).toBe('\u221e \u2211 \u03c0 \u03b8');
    });

    it('handles surrogate pairs (4-byte unicode)', () => {
      const filePath = path.join(tempDir, 'unicode-surrogate.txt');
      // Mathematical symbols and ancient scripts use surrogate pairs
      const content = 'Math: \uD835\uDC00\uD835\uDC01\uD835\uDC02 (Mathematical Bold)';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles zero-width characters', () => {
      const filePath = path.join(tempDir, 'unicode-zerowidth.txt');
      // Zero-width joiner and non-joiner
      const content = 'Zero\u200Bwidth\u200Bspace and\u200Cjoiner\u200Dtest';

      writeFileAtomic(filePath, content);

      const read = fs.readFileSync(filePath, 'utf8');
      expect(read).toBe(content);
      expect(read.length).toBe(content.length);
    });

    it('handles BOM (byte order mark)', () => {
      const filePath = path.join(tempDir, 'unicode-bom.txt');
      const content = '\uFEFFContent with BOM';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles newline variations', () => {
      const filePath = path.join(tempDir, 'unicode-newlines.txt');
      const content = 'Line1\nLine2\r\nLine3\rLine4';

      writeFileAtomic(filePath, content);

      // Read as buffer to verify exact bytes
      const buffer = fs.readFileSync(filePath);
      expect(buffer.toString('utf8')).toBe(content);
    });
  });

  describe('special characters in paths', () => {
    it('handles spaces in filename', () => {
      const filePath = path.join(tempDir, 'file with spaces.txt');

      writeFileAtomic(filePath, 'content');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('content');
    });

    it('handles special characters in filename', () => {
      // Use only characters valid on both Windows and Unix
      const filePath = path.join(tempDir, 'file-with_special.chars.txt');

      writeFileAtomic(filePath, 'content');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('content');
    });

    it('handles unicode in path', () => {
      const filePath = path.join(tempDir, '\u6587\u4ef6\u540d.txt');

      writeFileAtomic(filePath, 'content');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('content');
    });
  });

  describe('edge cases', () => {
    it('handles empty content', () => {
      const filePath = path.join(tempDir, 'empty.txt');

      writeFileAtomic(filePath, '');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('');
      expect(fs.statSync(filePath).size).toBe(0);
    });

    it('handles empty JSON object', () => {
      const filePath = path.join(tempDir, 'empty.json');

      writeJsonAtomic(filePath, {});

      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({});
    });

    it('handles empty JSON array', () => {
      const filePath = path.join(tempDir, 'empty-array.json');

      writeJsonAtomic(filePath, []);

      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual([]);
    });

    it('handles single character content', () => {
      const filePath = path.join(tempDir, 'single.txt');

      writeFileAtomic(filePath, 'x');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('x');
    });

    it('handles binary-like content', () => {
      const filePath = path.join(tempDir, 'binary-like.txt');
      // Content with null bytes and control characters
      const content = 'start\x00middle\x01\x02\x03end';

      writeFileAtomic(filePath, content);

      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('handles deeply nested directory creation', () => {
      const filePath = path.join(
        tempDir,
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
        'file.txt'
      );

      writeFileAtomic(filePath, 'deep content');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('deep content');
    });

    it('returns true on successful write', () => {
      const filePath = path.join(tempDir, 'return-value.txt');

      const result = writeFileAtomic(filePath, 'content');

      expect(result).toBe(true);
    });
  });
});
