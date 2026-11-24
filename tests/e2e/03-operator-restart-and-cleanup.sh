#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

echo "=== [03] Operator leader failover, collection stability, and cleanup ==="

OLD_LEADER=$(kubectl get lease qdrant-operator -n "$OP_NS" -o jsonpath='{.spec.holderIdentity}')
echo "Current leader: ${OLD_LEADER}"
kubectl delete pod "$OLD_LEADER" -n "$OP_NS"

# Wait for another replica to acquire the lease
NEW_LEADER=""
for _ in $(seq 1 20); do
  NEW_LEADER=$(kubectl get lease qdrant-operator -n "$OP_NS" -o jsonpath='{.spec.holderIdentity}' 2>/dev/null || true)
  if [ -n "$NEW_LEADER" ] && [ "$NEW_LEADER" != "$OLD_LEADER" ]; then
    break
  fi
  sleep 2
done
echo "New leader: ${NEW_LEADER}"
test -n "$NEW_LEADER"
test "$NEW_LEADER" != "$OLD_LEADER"

kubectl rollout status deploy/qdrant-operator -n "$OP_NS" --timeout=120s
sleep 5

# Existing Ready collection must NOT flip to Error after leader failover
COL_STATUS=$(kubectl get qdrantcollection "$COLLECTION_NAME" -n "$E2E_NS" -o jsonpath='{.status.collectionStatus}')
echo "Collection status after failover: ${COL_STATUS}"
test "$COL_STATUS" = "Ready"

# Verify collection deletion propagates to Qdrant
kubectl delete qdrantcollection "$COLLECTION_NAME" -n "$E2E_NS"
sleep 4
DELETED=$(qdrant_curl "/collections/${COLLECTION_NAME}")
echo "$DELETED" | jq -e '.status.error != null' >/dev/null

# Verify cluster deletion cleans up StatefulSet
kubectl delete qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS"
for _ in $(seq 1 20); do
  if ! kubectl get statefulset "$CLUSTER_NAME" -n "$E2E_NS" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if kubectl get statefulset "$CLUSTER_NAME" -n "$E2E_NS" >/dev/null 2>&1; then
  echo "ERROR: StatefulSet ${CLUSTER_NAME} was not garbage-collected" >&2
  exit 1
fi

echo "=== [03] PASSED ==="
