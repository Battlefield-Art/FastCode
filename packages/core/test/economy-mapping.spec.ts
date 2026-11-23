import { describe, expect, it } from 'vitest'
import { literalCommand, toolArgv } from '../src/command.ts'
import { classifyMiss, mayProject } from '../src/economy.ts'
import { projectStaticFilter } from '../src/filters/index.ts'
import { ProjectionBuilder, sourceLines } from '../src/projection-map.ts'

describe('Economy copy provenance', () => {
  it('maps CRLF and multi-code-unit characters without normalization', () => {
    const raw = '甲😀\r\nsecond\r\nlast'
    const lines = sourceLines(raw)
    const builder = new ProjectionBuilder(raw)
    builder.keep(lines[0]!.start, lines[0]!.end)
    builder.generate('[omitted]\n', 'omission')
    builder.keep(lines[2]!.start, lines[2]!.end)
    const projection = builder.finish()
    expect(projection.text).toBe('甲😀\r\n[omitted]\nlast')
    expect(projection.sourceMap.spans[0]).toMatchObject({ outputStart: 0, outputEnd: 5, sourceStart: 0, sourceEnd: 5 })
    expect(projection.sourceMap.spans[1]?.generated).toBe('omission')
  })

  it('distinguishes generated omission counts from copied matches', () => {
    const raw = Array.from({ length: 28 }, (_, i) => `甲.ts:${i + 1}: 😀`).join('\n')
    const projection = projectStaticFilter({ command: 'rg -n "a;b" src/', stdout: raw, exitCode: 0 })!
    expect(projection.sourceMap.spans.some(span => span.generated === 'omitted-search-matches')).toBe(true)
    for (const span of projection.sourceMap.spans) {
      if (span.sourceStart !== undefined) expect(projection.text.slice(span.outputStart, span.outputEnd)).toBe(raw.slice(span.sourceStart, span.sourceEnd))
    }
  })

  it.each(['rg x; true', 'rg x || true', 'cd /tmp; rg x', 'cd /tmp "&&" rg x', 'echo $(rg x)', 'rg "$(cat x)"', 'rg x # comment', 'rg x\\\n', 'rg x | wc -l', 'pytest tests/*', 'rg x ~/src', 'rg x file?.py', 'rg x [ab].py'])('leaves unsupported shell syntax untouched: %s', command => {
    expect(literalCommand(command)).toBeUndefined()
  })

  it('accepts a literal quiet cd prefix without changing quoted arguments', () => {
    expect(literalCommand('cd "/tmp/a b" && python3.12 -m pytest')).toEqual(['python3.12', '-m', 'pytest'])
    expect(literalCommand("rg 'a; b' src/")).toEqual(['rg', 'a; b', 'src/'])
    expect(literalCommand("rg '[ab].*' src/")).toEqual(['rg', '[ab].*', 'src/'])
    expect(literalCommand('git diff HEAD~1')).toEqual(['git', 'diff', 'HEAD~1'])
  })

  it('names a program given by its path by its file name, for the built-in filters only', async () => {
    const { toolArgv } = await import('../src/index.ts')
    expect(toolArgv('/opt/homebrew/bin/python3 -m pytest -v')).toEqual(['python3', '-m', 'pytest', '-v'])
    expect(toolArgv('.venv/bin/pytest -x')).toEqual(['pytest', '-x'])
    expect(toolArgv('git status')).toEqual(['git', 'status'])
    expect(toolArgv('./')).toBeUndefined()
    expect(literalCommand('.venv/bin/pytest -x')).toEqual(['.venv/bin/pytest', '-x'])
  })

  it('accepts a final 2>&1 and | tee <file>, alone or after a quiet cd prefix, but no other redirect or pipe', () => {
    expect(literalCommand('python3 -m pytest -v 2>&1')).toEqual(['python3', '-m', 'pytest', '-v'])
    expect(literalCommand('cd /repo && python3 -m pytest -v 2>&1')).toEqual(['python3', '-m', 'pytest', '-v'])
    expect(literalCommand('pytest 2>&1 -v')).toBeUndefined()
    expect(literalCommand('pytest -v 2>/dev/null')).toBeUndefined()
    expect(literalCommand('pytest -v 2>&1 | tee out.txt')).toEqual(['pytest', '-v'])
    expect(literalCommand('cd /repo && python3 -m pytest -v 2>&1 | tee -a /tmp/first_run.txt')).toEqual(['python3', '-m', 'pytest', '-v'])
    expect(literalCommand('pytest -v | tee $OUT')).toBeUndefined()
    expect(literalCommand('pytest -v | tee out.txt | tail -5')).toBeUndefined()
  })

  describe('quiet setup steps before the command', () => {
    it.each([
      ['source venv/bin/activate && pytest -v test/test_output.py', ['pytest', '-v', 'test/test_output.py']],
      ['. .venv/bin/activate && python -m pytest -q', ['python', '-m', 'pytest', '-q']],
      ['cd /repo && source .venv/bin/activate && pytest -q 2>&1', ['pytest', '-q']],
      ['source /opt/conda/bin/activate ml-env && pytest', ['pytest']],
      ['source ./.env && npm test', ['npm', 'test']],
      ['export PATH=/tmp/venv/bin:$PATH && pytest -v test/test_output.py', ['pytest', '-v', 'test/test_output.py']],
      ['export PYTHONPATH="$PWD/src" CI=1 && cd ./app && cargo test', ['cargo', 'test']],
      ['PATH=/opt/venv/bin:$PATH pytest -q', ['PATH=/opt/venv/bin:$PATH', 'pytest', '-q']],
      ['PYTHONPATH=${PWD} ../venv/bin/python -m pytest -q', ['PYTHONPATH=${PWD}', '../venv/bin/python', '-m', 'pytest', '-q']],
    ])('reads the command after them: %s', (command, argv) => {
      expect(literalCommand(command)).toEqual(argv)
      expect(mayProject(command)).toBe(true)
    })

    it('names the program past assignments with expansions', () => {
      expect(toolArgv('PATH=/opt/venv/bin:$PATH pytest -q')).toEqual(['pytest', '-q'])
      expect(toolArgv('PYTHONPATH=${PWD} ../venv/bin/python -m pytest -q')).toEqual(['python', '-m', 'pytest', '-q'])
    })

    it.each([
      'source venv/bin/activate; pytest', 'source activate && pytest', 'source ./setup.sh && pytest', 'source venv/bin/activate a b && pytest',
      'source ~/.venv/bin/activate && pytest', 'nvm use 18 && npm test', 'cd app && pytest', 'cd $DIR && pytest', 'export -p && pytest',
      'export A=$(pwd) && pytest', 'export A=`pwd` && pytest', 'pytest $ARGS', 'pytest -k=$X', 'make CC=$CC', 'FOO=$1 pytest', '"PATH=/x:$PATH" pytest',
      'PATH=$PATH:$(pwd) pytest', 'PATH=${PATH:-/bin} pytest', 'env A=$X pytest', 'echo ${HOME}', 'pytest && source venv/bin/activate',
      'source venv/bin/activate && pytest && echo done', 'source venv/bin/activate && ', '&& pytest', 'source venv/bin/activate || pytest',
    ])('refuses anything else: %s', command => {
      expect(literalCommand(command)).toBeUndefined()
    })

    it('filters the command as if it ran alone, and reports misses by its output', () => {
      const stdout = ['============================= test session starts ==============================',
        'platform darwin -- Python 3.12.4, pytest-8.3.2, pluggy-1.5.0 -- /tmp/venv/bin/python', 'cachedir: .pytest_cache', 'rootdir: /repo',
        'collecting ... collected 40 items', '',
        ...Array.from({ length: 40 }, (_, i) => `test/test_output.py::test_case_${i} PASSED${' '.repeat(30)}[${String(Math.round((i + 1) * 2.5)).padStart(3)}%]`),
        '', '============================== 40 passed in 0.31s ==============================', ''].join('\n')
      const alone = projectStaticFilter({ command: 'pytest -v test/test_output.py', stdout, exitCode: 0 })
      expect(alone?.filter).toBe('pytest')
      for (const command of ['source venv/bin/activate && pytest -v test/test_output.py', 'export PATH=/tmp/venv/bin:$PATH && pytest -v test/test_output.py',
        'PATH=/tmp/venv/bin:$PATH pytest -v test/test_output.py']) {
        expect(projectStaticFilter({ command, stdout, exitCode: 0 }), command).toEqual(alone)
      }
      expect(classifyMiss('source venv/bin/activate && pytest -v')).toBe('output-format-unrecognized')
      expect(classifyMiss('source venv/bin/activate && ./run.sh')).toBe('command-not-covered')
      expect(classifyMiss('source venv/bin/activate; pytest -v')).toBe('unsupported-shell-syntax')
      // Options given through the environment are not in argv: `-s` there means live output.
      for (const command of ['export PYTEST_ADDOPTS=-s && pytest -v test/test_output.py', 'PYTEST_ADDOPTS="-s" pytest -v test/test_output.py']) {
        expect(projectStaticFilter({ command, stdout, exitCode: 0 }), command).toBeUndefined()
      }
    })
  })

  it.each(['pytest -s', 'pytest -vs', 'pytest --capture=no', 'pytest --capture tee-sys'])('preserves interleaved live test output: %s', command => {
    const stdout = '================ test session starts ================\ncollected 1 item\nimportant .\n================ 1 passed in 0.05s ================\n'
    expect(projectStaticFilter({ command, stdout, exitCode: 0 })).toBeUndefined()
  })

  it('passes through an incomplete diff instead of synthesizing counts', () => {
    const stdout = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -0,0 +1,20 @@\n+only one line\n'
    expect(projectStaticFilter({ command: 'git diff', stdout, exitCode: 0 })).toBeUndefined()
  })
})
