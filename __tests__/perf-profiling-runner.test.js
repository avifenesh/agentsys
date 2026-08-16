const profilingRunner = require('../lib/perf/profiling-runner');
const profilers = require('../lib/perf/profilers');

describe('perf profiling runner', () => {
  it('runs selected profiler command', () => {
    const originalSelect = profilers.selectProfiler;
    profilers.selectProfiler = () => ({
      id: 'fake',
      buildCommand: () => 'node -e "console.log(\'ok\')"',
      parseOutput: () => ({ tool: 'fake', hotspots: ['file:1'], artifacts: ['out.prof'] })
    });

    const result = profilingRunner.runProfiling();
    profilers.selectProfiler = originalSelect;

    expect(result.ok).toBe(true);
    expect(result.result.tool).toBe('fake');
    expect(result.result.artifacts[0]).toBe('out.prof');
  });
});

it('runs a batch shim profiler command through cmd.exe', () => {
  // A direct .cmd spawn fails with EINVAL since the CVE-2024-27980 fix.
  jest.resetModules();
  const execFileSync = jest.fn();
  jest.doMock('child_process', () => ({ execFileSync }));
  jest.doMock('../lib/perf/profilers', () => ({
    selectProfiler: () => ({
      id: 'fake',
      buildCommand: () => 'npx.cmd clinic doctor',
      parseOutput: () => ({ tool: 'fake', hotspots: [], artifacts: [] })
    })
  }));

  const runner = require('../lib/perf/profiling-runner');
  // The cmd.exe hop is win32-only, so fake the platform instead of skipping.
  // comspec is pinned too: a real Windows host has COMSPEC set to an absolute
  // path, which would not match a bare cmd.exe.
  const platform = process.platform;
  const comspec = process.env.comspec;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  process.env.comspec = 'cmd.exe';

  try {
    expect(runner.runProfiling().ok).toBe(true);
  } finally {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    if (comspec === undefined) {
      delete process.env.comspec;
    } else {
      process.env.comspec = comspec;
    }
  }

  expect(execFileSync).toHaveBeenCalledWith(
    'cmd.exe',
    ['/d', '/s', '/c', '""npx.cmd" "clinic" "doctor""'],
    expect.objectContaining({ windowsVerbatimArguments: true })
  );

  jest.dontMock('child_process');
  jest.dontMock('../lib/perf/profilers');
  jest.resetModules();
});

it('does not enforce timeout when timeoutMs is not provided', () => {
  jest.resetModules();
  const execFileSync = jest.fn();
  jest.doMock('child_process', () => ({ execFileSync }));
  jest.doMock('../lib/perf/profilers', () => ({
    selectProfiler: () => ({
      id: 'fake',
      buildCommand: () => 'node -e "console.log(1)"',
      parseOutput: () => ({ tool: 'fake', hotspots: [], artifacts: [] })
    })
  }));

  const runner = require('../lib/perf/profiling-runner');
  const result = runner.runProfiling({ timeoutMs: undefined });

  expect(result.ok).toBe(true);
  expect(execFileSync).toHaveBeenCalledTimes(1);
  const options = execFileSync.mock.calls[0][2];
  expect(options.timeout).toBeUndefined();

  jest.dontMock('child_process');
  jest.dontMock('../lib/perf/profilers');
  jest.resetModules();
});
