# Plugin Audit TODO

- [ ] Update `package.json` to declare plugin type correctly (should use `elizaos:plugin:1.0.0` rather than project type)
- [ ] Provide `.env.example` with required variables documented in README for easier configuration
- [ ] Replace direct `process.env` access with runtime settings and plugin configuration (see `src/plugin.ts` lines 203-218)
- [ ] Add authentication/authorization for RSS HTTP endpoints (currently open in `RSSServerService`)
- [ ] Expand test coverage for failure cases in `TwitterRSSService.processAllLists`
- [ ] Add CI workflow for linting and testing to ensure code quality

