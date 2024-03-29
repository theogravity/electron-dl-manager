module.exports = {
  roots: ["<rootDir>/test"],
  testMatch: ["**/__tests__/**/*.+(ts|tsx|js)", "**/?(*.)+(spec|test).+(ts|tsx|js)"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsConfig: "tsconfig.json", diagnostics: { exclude: ["**"] } }],
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "./config/fileTransformer.js",
  },
  testEnvironment: "node",
  moduleNameMapper: {
    electron: "<rootDir>/__mocks__/electron.js",
  },
};
