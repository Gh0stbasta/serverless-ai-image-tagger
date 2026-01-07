module.exports = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  roots: ['<rootDir>/test', '<rootDir>/../backend/test'],
  testMatch: ['**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'NodeNext',
        esModuleInterop: true,
        skipLibCheck: true,
      }
    }
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
  collectCoverageFrom: [
    '<rootDir>/../backend/**/*.ts',
    '!<rootDir>/../backend/**/*.test.ts',
    '!<rootDir>/../backend/test/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  modulePaths: ['<rootDir>/node_modules'],
};
