#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

trap cleanup_e2e EXIT

for scenario in "${SCRIPT_DIR}"/[0-9][0-9]-*.sh; do
  bash "$scenario"
done

echo "=== ALL E2E SCENARIOS PASSED ==="
