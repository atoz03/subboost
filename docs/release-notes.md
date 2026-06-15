# SubBoost v2.4.0

## Highlights

- Publishes SubBoost from a clean release repository with fresh public Git history.
- Keeps the AGPL-3.0-only public source, local deployment app, shared packages, and release workflow together in the canonical `SubBoost/subboost` repository.
- Ships the current local deployment experience, shared parser/generator logic, template tools, rule management UI, and self-host release assets as one cohesive source snapshot.
- Keeps the one-click deployment assets available through the release: `install.sh`, `release.json`, `docker-compose.image.yml`, and `subboost-manager`.

## Upgrade Notes

- No manual migration is required for existing deployments.
- Existing deployments can keep using the normal `subboost update` flow.
- The repository is temporarily kept private while final rollout validation finishes.
