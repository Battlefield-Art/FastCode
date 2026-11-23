import { ProjectionBuilder, sourceLines } from '../projection-map.ts'
import type { MappedProjection } from '../projection-map.ts'
import type { EconomyFilter, FilterInput } from '../types.ts'
import { jsToolArgv } from './js-tool.ts'
import { NOT_PLAIN } from './noise.ts'

/** ``Applying migration `20240101000000_init` ``, one per migration the engine applies. */
const APPLYING = /^Applying migration `([^`\s]+)`$/u
/** The summary tree's rows: `  └─ 20240101000000_init/` and its `    └─ migration.sql`. */
const FOLDER = /^ {2}└─ (\S+)\/$/u
const FILE = '    └─ migration.sql'
/** `30 migrations found in prisma/migrations`: how many migration folders the project has. */
const FOUND = /^(\d+) migrations? found in (\S+)$/u
/** The header of `migrate status`'s list of migrations the database has not applied (Prisma 5 to 7). */
const PENDING = 'Following migrations have not yet been applied:'

function migrateSubcommand(command: string): string | undefined {
  const argv = jsToolArgv(command, ['prisma'])
  return argv?.[1] === 'migrate' ? argv[2] : undefined
}

function migrateCommand(command: string): boolean {
  return ['dev', 'deploy', 'reset', 'status'].includes(migrateSubcommand(command) ?? '')
}

/**
 * `prisma migrate dev|deploy|reset` names each migration twice: as it applies
 * it (``Applying migration `…` ``) and again in a `migrations/` tree after
 * "The following migration(s) have been applied". When the tree lists exactly
 * the applied migrations, in order, each with only its migration.sql, the
 * tree becomes one counted note. Every Applying line, warning, prompt,
 * summary and generator line stays.
 */
function projectApplied(input: FilterInput): MappedProjection | undefined {
  if (input.exitCode !== 0) return undefined
  const lines = sourceLines(input.stdout)
  const applied = lines.flatMap(line => APPLYING.exec(line.text)?.[1] ?? [])
  const root = lines.findIndex(line => line.text === 'migrations/')
  if (root < 0 || applied.length < 2) return undefined
  for (const [n, id] of applied.entries()) {
    if (FOLDER.exec(lines[root + 1 + 2 * n]?.text ?? '')?.[1] !== id || lines[root + 2 + 2 * n]?.text !== FILE) return undefined
  }
  const end = root + 1 + 2 * applied.length
  // A longer tree (another file or folder) is not the applied list.
  if (FOLDER.test(lines[end]?.text ?? '') || /^ {4}└─ /u.test(lines[end]?.text ?? '')) return undefined
  const builder = new ProjectionBuilder(input.stdout)
  for (const line of lines.slice(0, root)) builder.keep(line.start, line.end)
  builder.generate(`[migrations/ tree omitted: ${end - root} lines naming the ${applied.length} migrations applied above, each with its migration.sql]\n`, 'prisma-migration-tree')
  for (const line of lines.slice(end)) builder.keep(line.start, line.end)
  return builder.finish()
}

/**
 * `prisma migrate status` against a database that has applied none of the
 * project's migrations (a fresh or empty database) lists every migration
 * folder as not yet applied. When the list is exactly as long as the
 * `N migrations found in <dir>` count above it, it is the folder's listing:
 * the first and last names stay and those in between become one counted
 * note. A partial list (some applied), a diverged or failed history, and
 * every other line stay verbatim.
 */
function projectStatus(input: FilterInput): MappedProjection | undefined {
  if (![0, 1].includes(input.exitCode)) return undefined
  const lines = sourceLines(input.stdout)
  const at = lines.findIndex(line => FOUND.test(line.text))
  const found = FOUND.exec(lines[at]?.text ?? '')
  if (found === null || lines[at + 1]?.text !== PENDING) return undefined
  const count = Number(found[1])
  const names = lines.slice(at + 2, at + 2 + count)
  if (count < 4 || names.length !== count || !names.every(line => /^\S+$/u.test(line.text))) return undefined
  // The list ends where the count says: a blank line or the end of the output.
  const after = lines[at + 2 + count]
  if (after !== undefined && after.text !== '') return undefined
  const builder = new ProjectionBuilder(input.stdout)
  for (const line of lines.slice(0, at + 3)) builder.keep(line.start, line.end)
  builder.generate(`[${count - 2} more migrations omitted: all ${count} in ${found[2]} are not yet applied]\n`, 'prisma-pending-list')
  for (const line of lines.slice(at + 1 + count)) builder.keep(line.start, line.end)
  return builder.finish()
}

function projectMapped(input: FilterInput): MappedProjection | undefined {
  if (NOT_PLAIN.test(input.stdout)) return undefined
  const subcommand = migrateSubcommand(input.command)
  if (subcommand === 'status') return projectStatus(input)
  return migrateCommand(input.command) ? projectApplied(input) : undefined
}

export const prismaMigrateFilter: EconomyFilter = {
  name: 'prisma-migrate', transformation: 'noise-removal', projectMapped, commands: migrateCommand,
  project: input => projectMapped(input)?.text,
}
