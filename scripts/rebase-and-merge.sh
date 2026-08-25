#!/bin/bash
# rebase-and-merge.sh - Manual fallback for bot PR rebases and merges
#
# The primary automation path now lives in GitHub Actions:
#   - .github/workflows/bot-pr-controller.yml
#   - .github/workflows/bot-pr-rebase-queue.yml
#
# Keep this script around for maintainer-driven intervention when the queue needs
# manual help or GitHub automation is temporarily unavailable.

set -euo pipefail

REPO="pulumi/pulumi-self-hosted-installers"
WAIT_FOR_CI_START=30      # seconds to wait for CI to start after rebase
CI_POLL_INTERVAL=10       # seconds between CI status checks
FLAKY_CHECK="Test Minio as object storage/minio-test (pull_request)"

# Check if a known flaky check has failed early
# Returns 0 if check passed or still running, 1 if failed
check_flaky_test() {
  local pr=$1
  local check_name=$2
  local max_wait=120  # Wait up to 2 minutes for the check to complete
  local waited=0

  echo "  Monitoring '$check_name' for early failure..."

  while [ $waited -lt $max_wait ]; do
    local status
    status=$(gh pr checks "$pr" --repo "$REPO" --json name,state \
      --jq ".[] | select(.name == \"$check_name\") | .state" 2>/dev/null || echo "")

    case "$status" in
      "SUCCESS")
        echo "  '$check_name' passed early check"
        return 0
        ;;
      "FAILURE")
        echo "  '$check_name' FAILED - skipping this PR"
        return 1
        ;;
      "IN_PROGRESS"|"PENDING"|"QUEUED")
        ;;
      "")
        ;;
      *)
        echo "  '$check_name' status: $status"
        ;;
    esac

    sleep $CI_POLL_INTERVAL
    waited=$((waited + CI_POLL_INTERVAL))
  done

  echo "  '$check_name' still running after ${max_wait}s, continuing with full CI wait..."
  return 0
}

# Wait for CI checks to start (transition from stale to in-progress)
wait_for_ci_start() {
  local pr=$1
  local max_attempts=$((WAIT_FOR_CI_START / CI_POLL_INTERVAL))
  local attempt=0

  echo "  Waiting for CI to start on PR #$pr..."

  while [ $attempt -lt $max_attempts ]; do
    # Check if there are any IN_PROGRESS checks
    local in_progress
    in_progress=$(gh pr checks "$pr" --repo "$REPO" --json state \
      --jq '[.[] | select(.state == "IN_PROGRESS" or .state == "PENDING")] | length' 2>/dev/null || echo "0")

    if [ "$in_progress" -gt 0 ]; then
      echo "  CI started ($in_progress checks in progress)"
      return 0
    fi

    attempt=$((attempt + 1))
    echo "  Waiting for CI to start... (attempt $attempt/$max_attempts)"
    sleep $CI_POLL_INTERVAL
  done

  echo "  Warning: CI did not start within ${WAIT_FOR_CI_START}s, checking anyway..."
  return 0
}

# Get all open Renovate and Dependabot PRs sorted by number
prs=$(gh pr list --repo "$REPO" --state open --json number,headRefName \
  --jq '.[] | select(.headRefName | startswith("renovate/") or startswith("dependabot/")) | .number' | sort -n)

for pr in $prs; do
  echo "========================================"
  echo "Processing PR #$pr..."
  echo "========================================"

  # Get current HEAD before rebase
  old_sha=$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq '.headRefOid' 2>/dev/null || echo "")

  # Update PR branch (rebase)
  echo "  Rebasing PR #$pr..."
  if ! gh pr update-branch "$pr" --repo "$REPO" --rebase 2>/dev/null; then
    echo "  Rebase not needed or failed, skipping..."
    continue
  fi

  # Wait for GitHub to register the new commit
  sleep 5

  # Verify the commit changed (rebase actually happened)
  new_sha=$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq '.headRefOid' 2>/dev/null || echo "")
  if [ "$old_sha" = "$new_sha" ]; then
    echo "  No changes after rebase, checking existing CI..."
  else
    echo "  Rebased: $old_sha -> $new_sha"
    # Wait for new CI to start
    wait_for_ci_start "$pr"
  fi

  # Check for known flaky test failure early (skip PR if it fails)
  if ! check_flaky_test "$pr" "$FLAKY_CHECK"; then
    echo "  Skipping PR #$pr due to flaky test failure"
    continue
  fi

  # Wait for CI to complete
  echo "  Waiting for CI to complete on PR #$pr..."
  if ! gh pr checks "$pr" --repo "$REPO" --watch --fail-fast; then
    echo "  CI failed for PR #$pr, moving to next PR..."
    continue
  fi

  # Approve Dependabot PRs once tests pass
  branch=$(gh pr view "$pr" --repo "$REPO" --json headRefName --jq '.headRefName' 2>/dev/null || echo "")
  if [[ "$branch" == dependabot/* ]]; then
    echo "  Approving Dependabot PR #$pr (LGTM)..."
    gh pr review "$pr" --repo "$REPO" --approve --body "LGTM" || echo "  Could not add review (may already be approved)"
  fi

  # Merge if checks pass
  echo "  CI passed! Enabling auto-merge for PR #$pr..."
  gh pr merge "$pr" --repo "$REPO" --squash --auto || echo "  Auto-merge already enabled or failed"

  echo "  PR #$pr queued for merge"
  echo ""
  sleep 5  # Rate limiting between PRs
done

echo "========================================"
echo "All PRs processed!"
echo "========================================"
