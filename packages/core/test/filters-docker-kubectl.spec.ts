import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { containerLogsFilter, dockerBuildFilter } from '../src/filters/docker.ts'
import { projectStaticFilter } from '../src/filters/index.ts'
import { mayProject } from '../src/economy.ts'
import type { MappedProjection } from '../src/projection-map.ts'

/** Real outputs captured on Docker Desktop 27.4 (BuildKit) on 2026-10-31; see fixtures/docker/. */
const fixture = (name: string) => readFileSync(new URL(`fixtures/docker/${name}`, import.meta.url), 'utf8')

/** Every copied span is exactly the source text it claims to be. */
function copiesExactly(source: string, projection: MappedProjection) {
  for (const span of projection.sourceMap.spans) {
    if (span.sourceStart === undefined) continue
    expect(projection.text.slice(span.outputStart, span.outputEnd)).toBe(source.slice(span.sourceStart, span.sourceEnd))
  }
}

describe('docker build (BuildKit plain progress)', () => {
  it('drops progress rows and internal steps, keeping every step header, step output and the image identity', () => {
    const stdout = fixture('build-nocache.txt')
    const result = dockerBuildFilter.projectMapped({ command: 'docker build --progress=plain --no-cache -t tw-capture:1 .', stdout, exitCode: 0 })!
    copiesExactly(stdout, result)
    for (const kept of ['#5 [1/6] FROM docker.io/library/node:22-bookworm', '#7 [3/6] RUN node -e', '#7 0.239 step output 4', '#8 0.098 etc',
      '#10 0.107 hello from note', '#11 exporting to image', '#11 writing image sha256:7da7071f', '#11 naming to docker.io/library/tw-capture:1 done']) {
      expect(result.text, kept).toContain(kept)
    }
    for (const gone of ['#7 DONE 0.3s', 'transferring dockerfile', '[internal] load metadata', '#0 building with', '#11 exporting layers']) expect(result.text, gone).not.toContain(gone)
    expect(result.text).toMatch(/\[\d+ build progress lines omitted\]\n$/u)
    expect(result.text.length).toBeLessThan(stdout.length * 0.7)
  })

  it('drops layer download and extraction rows of a pulled base image', () => {
    const stdout = fixture('build-pull.txt')
    const text = dockerBuildFilter.project({ command: 'docker build --progress=plain -f Dockerfile.pull -t tw-pull:1 .', stdout, exitCode: 0 })!
    expect(text).toContain('#4 [1/2] FROM docker.io/library/alpine:3.20@sha256:')
    expect(text).toContain('#5 0.084 hello from alpine')
    expect(text).not.toMatch(/sha256:[0-9a-f]{64} \d/u)
    expect(text).not.toContain('extracting sha256')
    expect(text.length).toBeLessThan(stdout.length * 0.4)
  })

  it('keeps cached steps marked CACHED', () => {
    const stdout = fixture('build-cached.txt')
    const text = dockerBuildFilter.project({ command: 'docker build --progress=plain -t tw-capture:1 .', stdout, exitCode: 0 })!
    expect(text.match(/^#\d+ CACHED$/gmu)).toHaveLength(5)
  })

  it('keeps a failed step whole and the error report verbatim', () => {
    const stdout = fixture('build-fail.txt')
    const result = dockerBuildFilter.projectMapped({ command: 'docker build --progress=plain -f Dockerfile.fail -t tw-fail:1 .', stdout, exitCode: 1 })!
    copiesExactly(stdout, result)
    const report = stdout.slice(stdout.indexOf('#6 [3/3] RUN'), stdout.indexOf('\nView build details'))
    expect(result.text).toContain(report)
    expect(result.text).toContain('ERROR: failed to solve:')
  })

  it('leaves quiet builds, TTY progress and other output alone', () => {
    const stdout = fixture('build-nocache.txt')
    for (const command of ['docker build -q .', 'docker build --progress=tty .', 'docker build --progress auto .', 'docker run node:22 echo hi',
      'docker compose build -q', 'docker compose --progress tty build', 'docker compose up --build', 'docker compose logs build']) {
      expect(dockerBuildFilter.project({ command, stdout, exitCode: 0 }), command).toBeUndefined()
    }
    expect(dockerBuildFilter.project({ command: 'docker build .', stdout: 'Sending build context to Docker daemon  2.048kB\nStep 1/2 : FROM node\n', exitCode: 0 })).toBeUndefined()
    // docker buildx build and docker image build read the same.
    for (const command of ['docker buildx build --progress=plain .', 'docker image build .']) {
      expect(dockerBuildFilter.project({ command, stdout, exitCode: 0 }), command).toBeDefined()
    }
  })

  it('is chosen by the filter chain for a docker build command', () => {
    const stdout = fixture('build-pull.txt')
    expect(projectStaticFilter({ command: 'docker build -t tw-pull:1 .', stdout, exitCode: 0 })?.filter).toBe('docker-build')
  })
})

/**
 * Real `docker compose build` outputs (Docker Desktop 27.4, Compose v2.31, 2026-11-23): two services
 * built in parallel without a terminal, stdout and stderr merged as an agent sees them.
 */
describe('docker compose build', () => {
  it('reads Compose\'s plain progress like docker build, keeping its service rows, every step and its output', () => {
    const stdout = fixture('compose-build.txt')
    const result = dockerBuildFilter.projectMapped({ command: 'docker compose build --no-cache', stdout, exitCode: 0 })!
    copiesExactly(stdout, result)
    for (const kept of [' Service worker  Building\n', ' Service api  Built\n', '#16 [worker 4/5] RUN npm install --omit=dev --no-audit --no-fund\n',
      '#16 1.740 added 1 package in 1s\n', '#21 0.298 import ok\n', "WARNING: Running pip as the 'root' user", '#22 naming to docker.io/library/app-api 0.0s done\n',
      '#18 naming to docker.io/library/app-worker 0.0s done\n']) {
      expect(result.text, kept).toContain(kept)
    }
    // The per-service internal steps, Compose's metadata-file step, and timing rows of steps without a problem.
    for (const gone of ['[worker internal] load build definition', '[api internal] load metadata', 'resolving provenance', '#21 DONE', '#0 building with']) {
      expect(result.text, gone).not.toContain(gone)
    }
    expect(result.text).toMatch(/\[\d+ build progress lines omitted\]\n$/u)
    // The pip step printed a warning: all of its lines stay, its timing row included.
    expect(result.text).toContain('#15 DONE 12.8s\n')
  })

  it('keeps cached steps and a failed step whole, with the error report verbatim', () => {
    // Cached: Compose's status rows (stderr) all arrive before the first step (stdout).
    const cached = fixture('compose-cached.txt')
    expect(cached.startsWith(' Service api  Building\n Service worker  Building\n Service worker  Built\n Service api  Built\n#0 ')).toBe(true)
    const text = dockerBuildFilter.project({ command: 'docker compose build', stdout: cached, exitCode: 0 })!
    expect(text.startsWith(' Service api  Building\n Service worker  Building\n Service worker  Built\n Service api  Built\n')).toBe(true)
    expect(text.match(/^#\d+ CACHED$/gmu)?.length).toBe(cached.match(/^#\d+ CACHED$/gmu)?.length)
    expect(text.length).toBeLessThan(cached.length * 0.6)
    const failed = fixture('compose-fail.txt')
    const result = dockerBuildFilter.projectMapped({ command: 'docker-compose build', stdout: failed, exitCode: 17 })!
    copiesExactly(failed, result)
    expect(result.text).toContain(failed.slice(failed.indexOf('#19 [api 4/6] RUN pip install'), failed.length).trimEnd())
  })

  it('takes Compose\'s global options before build, and stands aside for quiet or terminal progress', () => {
    const stdout = fixture('compose-cached.txt')
    for (const command of ['docker-compose build', 'docker compose -f compose.yaml -p app build api worker', 'docker compose --progress plain build',
      'docker compose --progress=plain build --pull', 'docker compose build --no-cache api']) {
      expect(dockerBuildFilter.project({ command, stdout, exitCode: 0 }), command).toBeDefined()
      expect(mayProject(command), command).toBe(true)
    }
    for (const command of ['docker compose build --quiet', 'docker compose --progress=quiet build', 'docker compose --progress json build', 'docker compose up', 'docker compose -f build up']) {
      expect(dockerBuildFilter.project({ command, stdout, exitCode: 0 }), command).toBeUndefined()
      expect(mayProject(command), command).toBe(false)
    }
    // Compose's lead rows are skipped only for a Compose command.
    expect(dockerBuildFilter.project({ command: 'docker build .', stdout, exitCode: 0 })).toBeUndefined()
  })
})

describe('container logs', () => {
  it('folds runs of identical lines, keeping each distinct line and every warning', () => {
    const stdout = fixture('logs.txt')
    const result = containerLogsFilter.projectMapped({ command: 'docker logs tw-logs', stdout, exitCode: 0 })!
    copiesExactly(stdout, result)
    expect(result.text).toBe('server listening on :8080\nGET /health 200\n[39 identical lines omitted]\nworker started\ncache miss for key=user:42\n[5 identical lines omitted]\n'
      + 'warning: slow query 1200ms\nwarning: slow query 1200ms\nwarning: slow query 1200ms\nshutting down\n')
  })

  it('folds lines identical but for a leading timestamp, keeping the first and last of each run', () => {
    const stdout = fixture('logs-ts.txt')
    const result = containerLogsFilter.projectMapped({ command: 'docker logs --timestamps tw-logs', stdout, exitCode: 0 })!
    copiesExactly(stdout, result)
    const lines = stdout.trimEnd().split('\n')
    expect(result.text).toContain(`${lines[1]}\n[38 repeated lines omitted]\n${lines[40]}\n`)
    expect(result.text.match(/warning: slow query/gu)).toHaveLength(3)
  })

  it('reads kubectl logs and docker compose logs the same way (hand-written samples: no cluster was available)', () => {
    const kube = 'Starting server\n' + 'probe ok\n'.repeat(12) + 'Error: connection refused\n'.repeat(4) + 'done\n'
    expect(containerLogsFilter.project({ command: 'kubectl logs deploy/api -n prod', stdout: kube, exitCode: 0 }))
      .toBe('Starting server\nprobe ok\n[11 identical lines omitted]\n' + 'Error: connection refused\n'.repeat(4) + 'done\n')
    const compose = 'web-1  | GET / 200\n'.repeat(5) + 'db-1   | ready\n'
    expect(containerLogsFilter.project({ command: 'docker compose logs', stdout: compose, exitCode: 0 })).toBe('web-1  | GET / 200\n[4 identical lines omitted]\ndb-1   | ready\n')
  })

  it('leaves short runs, failed commands and other programs alone', () => {
    expect(containerLogsFilter.project({ command: 'docker logs x', stdout: 'a\na\nb\n', exitCode: 0 })).toBeUndefined()
    expect(containerLogsFilter.project({ command: 'docker logs x', stdout: 'a\n'.repeat(5), exitCode: 1 })).toBeUndefined()
    for (const command of ['docker ps', 'kubectl get pods', 'journalctl -u api', 'tail -f app.log']) {
      expect(containerLogsFilter.project({ command, stdout: 'a\n'.repeat(5), exitCode: 0 }), command).toBeUndefined()
    }
  })
})
