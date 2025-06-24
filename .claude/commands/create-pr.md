# Create Pull Request

Create a pull request with a concise description of changes. This command will:
1. Create a new branch
2. Commit the changes
3. Push to remote
4. Create a PR using GitHub CLI
5. Do not mention Claude code or testing plan in the PR description.

## Usage
Run this command after making changes to create a PR automatically.

## Command
```bash
# Create a new branch with timestamp
git checkout -b update-specs-$(date +%Y%m%d-%H%M%S)

# Add and commit changes
git add -A
git commit -m ""

# Push to remote
git push -u origin HEAD

# Create PR with gh CLI
gh pr create \
  --title "..." \
  --body "## Summary
```
