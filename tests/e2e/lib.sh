#!/usr/bin/env bash
set -euo pipefail

E2E_NS="${E2E_NS:-default}"
OP_NS="${OP_NS:-qdrant-operator}"
CLUSTER_NAME="${CLUSTER_NAME:-e2e-cluster}"
COLLECTION_NAME="${COLLECTION_NAME:-e2e-col}"

wait_statefulset_exists() {
  for _ in $(seq 1 20); do
    if kubectl get statefulset "$CLUSTER_NAME" -n "$E2E_NS" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: StatefulSet ${CLUSTER_NAME} was not created in time" >&2
  return 1
}

wait_cluster_status() {
  local expected="${1:-Running}"
  local status=""
  for _ in $(seq 1 36); do
    status=$(kubectl get qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS" -o jsonpath='{.status.qdrantStatus}' 2>/dev/null || true)
    if [ "$status" = "$expected" ]; then
      return 0
    fi
    sleep 5
  done
  echo "ERROR: QdrantCluster ${CLUSTER_NAME} status='${status}', expected='${expected}'" >&2
  return 1
}

wait_collection_status() {
  local expected="${1:-Ready}"
  local status=""
  for _ in $(seq 1 20); do
    status=$(kubectl get qdrantcollection "$COLLECTION_NAME" -n "$E2E_NS" -o jsonpath='{.status.collectionStatus}' 2>/dev/null || true)
    if [ "$status" = "$expected" ]; then
      return 0
    fi
    sleep 3
  done
  echo "ERROR: QdrantCollection ${COLLECTION_NAME} status='${status}', expected='${expected}'" >&2
  return 1
}

qdrant_curl() {
  local path="$1"
  local apikey op_pod
  apikey=$(kubectl get secret "${CLUSTER_NAME}-apikey" -n "$E2E_NS" -o jsonpath='{.data.api-key}' | base64 -d)
  op_pod=$(kubectl get pod -n "$OP_NS" -l app=qdrant-operator --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
  kubectl get secret "${CLUSTER_NAME}-server-cert" -n "$E2E_NS" -o jsonpath='{.data.cacert\.pem}' | base64 -d | \
    kubectl exec -i -n "$OP_NS" "$op_pod" -- sh -c 'cat > /tmp/e2e-ca.pem'
  kubectl exec -n "$OP_NS" "$op_pod" -- \
    curl -sS --cacert /tmp/e2e-ca.pem -H "api-key: ${apikey}" \
    "https://${CLUSTER_NAME}.${E2E_NS}.svc.cluster.local:6333${path}"
}

cleanup_e2e() {
  kubectl delete qdrantcollection "$COLLECTION_NAME" -n "$E2E_NS" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl delete qdrantcluster "$CLUSTER_NAME" -n "$E2E_NS" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
