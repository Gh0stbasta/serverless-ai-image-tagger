module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/test/**',
  ],
  moduleNameMapper: {
    '^lib$': '<rootDir>/lib/index.ts',
    '^interfaces$': '<rootDir>/interfaces/index.ts',
  },
};
