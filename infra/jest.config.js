/**
 * Globalized Jest configuration for the entire monorepo.
 * 
 * Architectural Decision: This config discovers and runs all tests across the monorepo
 * (infra and backend) when executed from the infra folder. This supports a centralized
 * test execution strategy for CI/CD while maintaining the ability to run tests independently
 * in each package.
 * 
 * Uses Jest's projects feature to run tests from different directories with their own
 * configurations, ensuring proper isolation and type resolution for each package.
 * 
 * Note: Explicit paths to node_modules are required because rootDir is set to the parent
 * directory, and Jest needs to know where to find transformers and setup files before
 * module resolution takes effect.
 */
module.exports = {
  // Enable monorepo-wide test discovery using projects
  projects: [
    {
      displayName: 'infra',
      testEnvironment: 'node',
      rootDir: '..',
      roots: ['<rootDir>/infra/test'],
      testMatch: ['**/*.test.ts'],
      transform: {
        // Explicit path required: transformer is loaded before moduleDirectories takes effect
        '^.+\\.tsx?$': ['<rootDir>/infra/node_modules/ts-jest', {
          tsconfig: '<rootDir>/infra/tsconfig.json',
        }]
      },
      // Explicit path required: setup files are loaded before moduleDirectories takes effect
      setupFilesAfterEnv: ['<rootDir>/infra/node_modules/aws-cdk-lib/testhelpers/jest-autoclean'],
      moduleDirectories: ['node_modules', '<rootDir>/infra/node_modules'],
      modulePaths: ['<rootDir>/infra/node_modules'],
    },
    {
      displayName: 'backend',
      testEnvironment: 'node',
      rootDir: '..',
      roots: ['<rootDir>/backend/test'],
      testMatch: ['**/*.test.ts'],
      transform: {
        // Explicit path required: transformer is loaded before moduleDirectories takes effect
        '^.+\\.tsx?$': ['<rootDir>/backend/node_modules/ts-jest', {
          tsconfig: '<rootDir>/backend/tsconfig.json',
        }]
      },
      moduleDirectories: ['node_modules', '<rootDir>/backend/node_modules'],
      modulePaths: ['<rootDir>/backend/node_modules'],
    },
  ],
  collectCoverageFrom: [
    '<rootDir>/backend/**/*.ts',
    '<rootDir>/infra/lib/**/*.ts',
    '!<rootDir>/backend/**/*.test.ts',
    '!<rootDir>/backend/test/**',
    '!<rootDir>/infra/test/**',
    '!<rootDir>/infra/**/*.test.ts',
  ],
  coverageDirectory: '<rootDir>/infra/coverage',
};
