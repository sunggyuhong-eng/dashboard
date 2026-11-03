import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Only tests in the actual app; uploaded patch copies are not test projects.
    include: [
      'src/types.test.ts',
      'src/approval.test.tsx',
      'src/headcount.test.tsx',
      'src/OfferOverview.test.tsx',
      'src/PipelineOverview.test.tsx',
      'src/RecruitingReport.test.tsx',
    ],
  },
}))
