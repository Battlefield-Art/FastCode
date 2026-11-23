// An agent's turn-end card taking the switch-off news: prints how many switch-offs it got to say.
import { takeSwitchedOff } from '../../src/index.ts'

const [home, host] = process.argv.slice(2)
process.stdout.write(String(takeSwitchedOff(home!, host!).length))
