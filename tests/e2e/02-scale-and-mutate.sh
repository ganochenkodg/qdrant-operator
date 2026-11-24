#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

echo "=== [02] Scale 1->3->1 (PDB lifecycle) and field removal on StatefulSet ==="

# Scale up to 3 replicas (real Raft quorum) and verify PDB creation
kubectl patch qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS" --type=merge -p '{"spec":{"replicas":3}}'
sleep 5
kubectl rollout status "statefulset/${CLUSTER_NAME}" -n "$E2E_NS" --timeout=180s
wait_cluster_status "Running"
kubectl get pdb "$CLUSTER_NAME" -n "$E2E_NS" >/dev/null

# Remove env var and disable livenessProbe on 3-node cluster (verifies StatefulSet replace + HA rolling update)
kubectl patch qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS" --type=merge -p '{
  "spec": {
    "env": [],
    "probes": {
      "readiness": {"enabled": true},
      "liveness": {"enabled": false},
      "startup": {"enabled": true, "failureThreshold": 30}
    }
  }
}'
sleep 5
kubectl rollout status "statefulset/${CLUSTER_NAME}" -n "$E2E_NS" --timeout=240s
wait_cluster_status "Running"

STS_JSON=$(kubectl get statefulset "$CLUSTER_NAME" -n "$E2E_NS" -o json)
echo "$STS_JSON" | jq -e '(.spec.template.spec.containers[0].env // []) | map(.name) | index("E2E_FLAG") == null' >/dev/null
echo "$STS_JSON" | jq -e '.spec.template.spec.containers[0].livenessProbe == null' >/dev/null

# Scale back down to 1 replica and verify PDB deletion
kubectl patch qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS" --type=merge -p '{"spec":{"replicas":1}}'
sleep 5
kubectl rollout status "statefulset/${CLUSTER_NAME}" -n "$E2E_NS" --timeout=180s
wait_cluster_status "Running"
if kubectl get pdb "$CLUSTER_NAME" -n "$E2E_NS" >/dev/null 2>&1; then
  echo "ERROR: PDB ${CLUSTER_NAME} should have been deleted at replicas=1" >&2
  exit 1
fi

echo "=== [02] PASSED ==="
