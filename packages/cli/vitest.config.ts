import { defineConfig, mergeConfig } from 'vitest/config'
import shared from '../../vitest.shared.ts'

// The CLI tests run the real `tokenwise` command, several times in one test: slow CI runners need more than 5 s.
export default mergeConfig(shared, defineConfig({ test: { testTimeout: 20_000 } }))
