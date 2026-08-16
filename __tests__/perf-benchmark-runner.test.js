const {
  parseMetrics,
  aggregateMetrics,
  normalizeBenchmarkOptions,
  runBenchmark,
  runBenchmarkSeries,
  DEFAULT_MIN_DURATION,
  BINARY_SEARCH_MIN_DURATION
} = require('../lib/perf/benchmark-runner');

jest.mock('child_process', () => ({
  execFileSync: jest.fn()
}));

const { execFileSync } = require('child_process');

describe('normalizeBenchmarkOptions', () => {
  it('uses default duration for full mode', () => {
    const result = normalizeBenchmarkOptions();
    expect(result.mode).toBe('full');
    expect(result.duration).toBe(DEFAULT_MIN_DURATION);
    expect(result.warmup).toBe(10);
  });

  it('uses shorter default duration for binary-search mode', () => {
    const result = normalizeBenchmarkOptions({ mode: 'binary-search' });
    expect(result.mode).toBe('binary-search');
    expect(result.duration).toBe(BINARY_SEARCH_MIN_DURATION);
  });

  it('respects explicit duration when above minimum', () => {
    const result = normalizeBenchmarkOptions({ duration: 120 });
    expect(result.duration).toBe(120);
  });

  it('uses provided duration as minimum when below default', () => {
    // When explicit duration is provided, it becomes the effective minimum
    const result = normalizeBenchmarkOptions({ duration: 10 });
    expect(result.duration).toBe(10);
  });

  it('uses minDuration when provided', () => {
    const result = normalizeBenchmarkOptions({ minDuration: 90 });
    expect(result.duration).toBe(90);
  });

  it('enforces minDuration over smaller duration', () => {
    const result = normalizeBenchmarkOptions({ duration: 30, minDuration: 45 });
    expect(result.duration).toBe(45);
  });

  it('respects allowShort flag', () => {
    const result = normalizeBenchmarkOptions({ allowShort: true });
    expect(result.allowShort).toBe(true);
  });

  it('defaults allowShort to false', () => {
    const result = normalizeBenchmarkOptions({});
    expect(result.allowShort).toBe(false);
  });

  it('ignores invalid duration values', () => {
    const result = normalizeBenchmarkOptions({ duration: 'invalid' });
    expect(result.duration).toBe(DEFAULT_MIN_DURATION);
  });

  it('ignores negative duration values', () => {
    const result = normalizeBenchmarkOptions({ duration: -10 });
    expect(result.duration).toBe(DEFAULT_MIN_DURATION);
  });

  it('ignores NaN duration values', () => {
    const result = normalizeBenchmarkOptions({ duration: NaN });
    expect(result.duration).toBe(DEFAULT_MIN_DURATION);
  });

  it('preserves custom warmup value', () => {
    const result = normalizeBenchmarkOptions({ warmup: 5 });
    expect(result.warmup).toBe(5);
  });
});

describe('runBenchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PERF_ALLOW_SHORT;
  });

  it('throws on empty command', () => {
    expect(() => runBenchmark('')).toThrow('Benchmark command must be a non-empty string');
  });

  it('throws on non-string command', () => {
    expect(() => runBenchmark(null)).toThrow('Benchmark command must be a non-empty string');
    expect(() => runBenchmark(123)).toThrow('Benchmark command must be a non-empty string');
  });

  it('executes command and returns result', () => {
    execFileSync.mockImplementation(() => {
      return 'benchmark output';
    });

    const result = runBenchmark('echo test', { allowShort: true });
    expect(result.success).toBe(true);
    expect(result.output).toBe('benchmark output');
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      stdio: 'pipe',
      encoding: 'utf8'
    }));
  });

  it('runs a batch shim through cmd.exe instead of spawning it directly', () => {
    // Node fails with EINVAL on a direct .cmd spawn since the CVE-2024-27980
    // fix, so an npm-based benchmark command needs the cmd.exe hop. The hop is
    // win32-only, so the platform is faked rather than skipping off Windows.
    execFileSync.mockImplementation(() => 'output');
    const platform = process.platform;
    // A real Windows host has COMSPEC set to an absolute path, so it is pinned
    // here as well - otherwise the expected shell differs per host.
    const comspec = process.env.comspec;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.comspec = 'cmd.exe';

    try {
      runBenchmark('npm.cmd run bench', { allowShort: true });
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
      ['/d', '/s', '/c', '""npm.cmd" "run" "bench""'],
      expect.objectContaining({ windowsVerbatimArguments: true })
    );
  });

  it('spawns a .cmd directly off Windows, where cmd.exe does not exist', () => {
    execFileSync.mockImplementation(() => 'output');
    const platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    try {
      runBenchmark('./build.cmd bench', { allowShort: true });
    } finally {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    }

    expect(execFileSync).toHaveBeenCalledWith(
      './build.cmd',
      ['bench'],
      expect.not.objectContaining({ windowsVerbatimArguments: true })
    );
  });

  it('sets PERF_RUN_DURATION env variable by default', () => {
    execFileSync.mockImplementation(() => 'output');

    runBenchmark('echo test', { allowShort: true });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        PERF_RUN_DURATION: String(DEFAULT_MIN_DURATION)
      })
    }));
  });

  it('does not set PERF_RUN_DURATION when setDurationEnv is false', () => {
    execFileSync.mockImplementation(() => 'output');

    runBenchmark('echo test', { setDurationEnv: false, allowShort: true });
    const callEnv = execFileSync.mock.calls[0][2].env;
    expect(callEnv.PERF_RUN_DURATION).toBeUndefined();
  });

  it('sets PERF_RUN_MODE when runMode is provided', () => {
    execFileSync.mockImplementation(() => 'output');

    runBenchmark('echo test', { runMode: 'oneshot', allowShort: true });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        PERF_RUN_MODE: 'oneshot'
      })
    }));
  });

  it('returns duration information in result', () => {
    execFileSync.mockImplementation(() => 'output');

    const result = runBenchmark('echo test', { duration: 90, allowShort: true });
    expect(result.duration).toBe(90);
    expect(result.warmup).toBe(10);
    expect(result.mode).toBe('full');
  });

  it('throws when benchmark finishes too quickly', () => {
    execFileSync.mockImplementation(() => 'output');

    expect(() => runBenchmark('echo test', { duration: 60 }))
      .toThrow(/Benchmark finished too quickly/);
  });

  it('does not throw on short duration when allowShort is true', () => {
    execFileSync.mockImplementation(() => 'output');

    const result = runBenchmark('echo test', { duration: 60, allowShort: true });
    expect(result.success).toBe(true);
  });

  it('does not throw on short duration when PERF_ALLOW_SHORT=1', () => {
    process.env.PERF_ALLOW_SHORT = '1';
    execFileSync.mockImplementation(() => 'output');

    const result = runBenchmark('echo test', { duration: 60 });
    expect(result.success).toBe(true);
  });

  it('merges custom env variables', () => {
    execFileSync.mockImplementation(() => 'output');

    runBenchmark('echo test', { env: { CUSTOM_VAR: 'value' }, allowShort: true });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        CUSTOM_VAR: 'value'
      })
    }));
  });

  it('returns elapsed time in result', () => {
    execFileSync.mockImplementation(() => 'output');

    const result = runBenchmark('echo test', { allowShort: true });
    expect(typeof result.elapsedSeconds).toBe('number');
    expect(result.elapsedSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('runBenchmarkSeries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PERF_ALLOW_SHORT;
  });

  it('runs benchmark once by default', () => {
    execFileSync.mockImplementation(() => 'PERF_METRICS latency_ms=100');

    const result = runBenchmarkSeries('echo test', { allowShort: true });
    expect(result.runs).toBe(1);
    expect(result.samples).toHaveLength(1);
    expect(result.metrics.latency_ms).toBe(100);
  });

  it('runs benchmark multiple times when runs is specified', () => {
    let callCount = 0;
    execFileSync.mockImplementation(() => {
      callCount++;
      return `PERF_METRICS latency_ms=${100 + callCount * 10}`;
    });

    const result = runBenchmarkSeries('echo test', { runs: 3 });
    expect(result.runs).toBe(3);
    expect(result.samples).toHaveLength(3);
    expect(execFileSync).toHaveBeenCalledTimes(3);
  });

  it('aggregates multiple runs using median by default', () => {
    let callCount = 0;
    execFileSync.mockImplementation(() => {
      callCount++;
      const values = [100, 200, 150];
      return `PERF_METRICS latency_ms=${values[callCount - 1]}`;
    });

    const result = runBenchmarkSeries('echo test', { runs: 3 });
    expect(result.aggregate).toBe('median');
    expect(result.metrics.latency_ms).toBe(150);
  });

  it('supports custom aggregate function', () => {
    let callCount = 0;
    execFileSync.mockImplementation(() => {
      callCount++;
      const values = [100, 200, 150];
      return `PERF_METRICS latency_ms=${values[callCount - 1]}`;
    });

    const result = runBenchmarkSeries('echo test', { runs: 3, aggregate: 'mean' });
    expect(result.aggregate).toBe('mean');
    expect(result.metrics.latency_ms).toBe(150);
  });

  it('uses oneshot mode for multiple runs by default', () => {
    execFileSync.mockImplementation(() => 'PERF_METRICS latency_ms=100');

    runBenchmarkSeries('echo test', { runs: 3 });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        PERF_RUN_MODE: 'oneshot'
      })
    }));
  });

  it('uses duration mode for single run by default', () => {
    execFileSync.mockImplementation(() => 'PERF_METRICS latency_ms=100');

    runBenchmarkSeries('echo test', { runs: 1, allowShort: true });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        PERF_RUN_MODE: 'duration'
      })
    }));
  });

  it('throws on invalid runs value', () => {
    expect(() => runBenchmarkSeries('echo test', { runs: 0 }))
      .toThrow('runs must be a positive number');
    expect(() => runBenchmarkSeries('echo test', { runs: -1 }))
      .toThrow('runs must be a positive number');
    expect(() => runBenchmarkSeries('echo test', { runs: 'invalid' }))
      .toThrow('runs must be a positive number');
  });

  it('throws when metrics parsing fails', () => {
    execFileSync.mockImplementation(() => 'no metrics here');

    expect(() => runBenchmarkSeries('echo test', { allowShort: true }))
      .toThrow(/Metrics parse failed/);
  });

  it('floors fractional runs value', () => {
    execFileSync.mockImplementation(() => 'PERF_METRICS latency_ms=100');

    const result = runBenchmarkSeries('echo test', { runs: 2.9 });
    expect(result.runs).toBe(2);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('supports custom runMode override', () => {
    execFileSync.mockImplementation(() => 'PERF_METRICS latency_ms=100');

    runBenchmarkSeries('echo test', { runs: 3, runMode: 'duration', allowShort: true });
    expect(execFileSync).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
      env: expect.objectContaining({
        PERF_RUN_MODE: 'duration'
      })
    }));
  });
});

describe('perf benchmark parser', () => {
  it('parses single scenario metrics', () => {
    const output = [
      'noise',
      'PERF_METRICS_START',
      '{"latency_ms":120,"throughput_rps":450}',
      'PERF_METRICS_END',
      'tail'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(120);
  });

  it('parses multi-scenario metrics', () => {
    const output = [
      'PERF_METRICS_START',
      '{"scenarios":{"low":{"latency_ms":120},"high":{"latency_ms":450}}}',
      'PERF_METRICS_END'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.scenarios.low.latency_ms).toBe(120);
  });

  it('parses line metrics', () => {
    const output = [
      'noise',
      'PERF_METRICS latency_ms=120 throughput_rps=450',
      'tail'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(120);
    expect(result.metrics.throughput_rps).toBe(450);
  });

  it('parses line metrics with scenarios', () => {
    const output = [
      'PERF_METRICS scenario=low latency_ms=120',
      'PERF_METRICS scenario=high latency_ms=450'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.scenarios.low.latency_ms).toBe(120);
    expect(result.metrics.scenarios.high.latency_ms).toBe(450);
  });

  it('fails when markers are missing', () => {
    const result = parseMetrics('no metrics here');
    expect(result.ok).toBe(false);
  });

  it('aggregates median metrics', () => {
    const samples = [
      { duration_ms: 12, files: 3 },
      { duration_ms: 10, files: 3 },
      { duration_ms: 14, files: 3 }
    ];
    const result = aggregateMetrics(samples, 'median');
    expect(result.duration_ms).toBe(12);
    expect(result.files).toBe(3);
  });

  it('aggregates scenario metrics', () => {
    const samples = [
      { scenarios: { low: { latency_ms: 10 }, high: { latency_ms: 20 } } },
      { scenarios: { low: { latency_ms: 12 }, high: { latency_ms: 22 } } },
      { scenarios: { low: { latency_ms: 11 }, high: { latency_ms: 21 } } }
    ];
    const result = aggregateMetrics(samples, 'median');
    expect(result.scenarios.low.latency_ms).toBe(11);
    expect(result.scenarios.high.latency_ms).toBe(21);
  });
});

describe('parseMetrics edge cases', () => {
  it('fails on non-string input', () => {
    const result = parseMetrics(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Output must be a string');
  });

  it('fails on invalid JSON in block format', () => {
    const output = [
      'PERF_METRICS_START',
      '{invalid json}',
      'PERF_METRICS_END'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Failed to parse metrics JSON/);
  });

  it('fails on non-numeric metric value in line format', () => {
    const output = 'PERF_METRICS latency_ms=notanumber';
    const result = parseMetrics(output);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must be a number/);
  });

  it('ignores PERF_METRICS lines with no key=value pairs', () => {
    const output = [
      'PERF_METRICS',
      'PERF_METRICS latency_ms=100'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(100);
  });

  it('ignores tokens without equals sign', () => {
    const output = 'PERF_METRICS latency_ms=100 sometext throughput=200';
    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(100);
    expect(result.metrics.throughput).toBe(200);
  });

  it('ignores empty keys', () => {
    const output = 'PERF_METRICS =100 latency_ms=200';
    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(200);
  });

  it('handles PERF_METRICS marker embedded in line', () => {
    const output = 'some prefix PERF_METRICS latency_ms=100';
    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(100);
  });

  it('merges multiple metrics lines for same scenario', () => {
    const output = [
      'PERF_METRICS scenario=test latency_ms=100',
      'PERF_METRICS scenario=test throughput=200'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.scenarios.test.latency_ms).toBe(100);
    expect(result.metrics.scenarios.test.throughput).toBe(200);
  });

  it('handles Windows line endings', () => {
    const output = 'PERF_METRICS latency_ms=100\r\nPERF_METRICS throughput=200';
    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(100);
    expect(result.metrics.throughput).toBe(200);
  });

  it('validates block format metrics against schema', () => {
    const output = [
      'PERF_METRICS_START',
      '{"invalid_metric":"not_a_number"}',
      'PERF_METRICS_END'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid metrics/);
  });

  it('prefers block format over line format when both present', () => {
    const output = [
      'PERF_METRICS latency_ms=999',
      'PERF_METRICS_START',
      '{"latency_ms":100}',
      'PERF_METRICS_END'
    ].join('\n');

    const result = parseMetrics(output);
    expect(result.ok).toBe(true);
    expect(result.metrics.latency_ms).toBe(100);
  });
});

describe('aggregateMetrics edge cases', () => {
  it('throws on empty samples array', () => {
    expect(() => aggregateMetrics([])).toThrow('samples must be a non-empty array');
  });

  it('throws on non-array input', () => {
    expect(() => aggregateMetrics(null)).toThrow('samples must be a non-empty array');
    expect(() => aggregateMetrics({})).toThrow('samples must be a non-empty array');
  });

  it('aggregates with mean', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 200 },
      { latency_ms: 300 }
    ];
    const result = aggregateMetrics(samples, 'mean');
    expect(result.latency_ms).toBe(200);
  });

  it('aggregates with min', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 50 },
      { latency_ms: 150 }
    ];
    const result = aggregateMetrics(samples, 'min');
    expect(result.latency_ms).toBe(50);
  });

  it('aggregates with max', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 50 },
      { latency_ms: 150 }
    ];
    const result = aggregateMetrics(samples, 'max');
    expect(result.latency_ms).toBe(150);
  });

  it('computes median for even number of samples', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 200 },
      { latency_ms: 300 },
      { latency_ms: 400 }
    ];
    const result = aggregateMetrics(samples, 'median');
    expect(result.latency_ms).toBe(250);
  });

  it('throws on unsupported aggregate function', () => {
    const samples = [{ latency_ms: 100 }];
    expect(() => aggregateMetrics(samples, 'unknown'))
      .toThrow('Unsupported aggregate: unknown');
  });

  it('throws when metric sets differ across runs', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 100, extra: 50 }
    ];
    expect(() => aggregateMetrics(samples))
      .toThrow('Metric sets differ across runs');
  });

  it('throws when metric keys differ across runs', () => {
    const samples = [
      { latency_ms: 100 },
      { throughput: 100 }
    ];
    expect(() => aggregateMetrics(samples))
      .toThrow('Metric sets differ across runs');
  });

  it('throws on non-object metrics', () => {
    expect(() => aggregateMetrics([null]))
      .toThrow('metrics must be an object');
    expect(() => aggregateMetrics([[1, 2, 3]]))
      .toThrow('metrics must be an object');
  });

  it('throws on non-numeric metric value', () => {
    expect(() => aggregateMetrics([{ latency_ms: 'fast' }]))
      .toThrow('metric latency_ms must be a number');
  });

  it('throws on NaN metric value', () => {
    expect(() => aggregateMetrics([{ latency_ms: NaN }]))
      .toThrow('metric latency_ms must be a number');
  });

  it('throws on non-object scenarios', () => {
    expect(() => aggregateMetrics([{ scenarios: 'invalid' }]))
      .toThrow('metrics.scenarios must be an object');
  });

  it('throws on non-object scenario metrics', () => {
    expect(() => aggregateMetrics([{ scenarios: { test: 'invalid' } }]))
      .toThrow('metrics.scenarios.test must be an object');
  });

  it('throws on non-numeric scenario metric value', () => {
    expect(() => aggregateMetrics([{ scenarios: { test: { latency: 'fast' } } }]))
      .toThrow('metric test.latency must be a number');
  });

  it('handles single sample without aggregation', () => {
    const samples = [{ latency_ms: 100, throughput: 200 }];
    const result = aggregateMetrics(samples);
    expect(result.latency_ms).toBe(100);
    expect(result.throughput).toBe(200);
  });

  it('handles aggregate function case insensitively', () => {
    const samples = [
      { latency_ms: 100 },
      { latency_ms: 200 },
      { latency_ms: 300 }
    ];
    const result = aggregateMetrics(samples, 'MEAN');
    expect(result.latency_ms).toBe(200);
  });

  it('aggregates mixed flat and scenario metrics', () => {
    const samples = [
      { duration_ms: 10, scenarios: { fast: { latency_ms: 5 } } },
      { duration_ms: 20, scenarios: { fast: { latency_ms: 15 } } },
      { duration_ms: 15, scenarios: { fast: { latency_ms: 10 } } }
    ];
    const result = aggregateMetrics(samples, 'median');
    expect(result.duration_ms).toBe(15);
    expect(result.scenarios.fast.latency_ms).toBe(10);
  });
});
