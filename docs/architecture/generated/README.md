# Generated architecture catalogs

Run `npm run catalog` to regenerate these checked-in inventories from package
manifests, source paths, the contract register, and the command surface. They
are migration maps, not a second manually edited authority. Review generated
diffs with their source changes. Contract specifications are generated for every
register entry and include purpose, non-purpose, clock/unit, unknown/error,
compatibility, runtime-validator, and fixture fields.

`reverse-links.json` is the generated reverse view for stable contract, ADR,
claim, and evidence references, including contract-to-fixture links. Run
`npm run test:retrieval` to execute the newcomer retrieval benchmark; it guards
the top-level routes without introducing a separately edited wiki or mandatory
search service.
