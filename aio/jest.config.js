module.exports = {
  preset: "jest-preset-angular",
  roots: ['src'],
  setupTestFrameworkScriptFile: "<rootDir>/src/setupJest.ts",
  moduleNameMapper: {
    'testing/(.*)': '<rootDir>/src/testing/$1',
    'app/(.*)': '<rootDir>/src/app/$1',
    'assets/(.*)': '<rootDir>/src/assets/$1',
    'environments/(.*)': '<rootDir>/src/environments/$1'
  }
};
