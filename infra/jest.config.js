module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/../backend/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
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
