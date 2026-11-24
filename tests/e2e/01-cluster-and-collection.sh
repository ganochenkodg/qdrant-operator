#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

echo "=== [01] Cluster creation, TLS+APIKey, QdrantCollection create & patch ==="

cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: ${CLUSTER_NAME}
  namespace: ${E2E_NS}
spec:
  replicas: 1
  image: qdrant/qdrant:v1.20.2
  apikey: 'true'
  readApikey: 'true'
  jwtRbac: true
  tls:
    enabled: true
  probes:
    readiness:
      enabled: true
    liveness:
      enabled: true
    startup:
      enabled: true
      failureThreshold: 30
  podSecurityContext:
    fsGroup: 3000
    fsGroupChangePolicy: Always
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 2000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: ["ALL"]
  env:
    - name: E2E_FLAG
      value: "on"
  config:
    storage:
      performance:
        io_uring: auto
EOF

wait_statefulset_exists
kubectl rollout status "statefulset/${CLUSTER_NAME}" -n "$E2E_NS" --timeout=180s
wait_cluster_status "Running"

cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: ${COLLECTION_NAME}
  namespace: ${E2E_NS}
spec:
  cluster: ${CLUSTER_NAME}
  vectorSize: 32
  distance: Dot
  datatype: float16
  onDisk: true
  sparseVectors:
    bm25:
      modifier: idf
  payloadIndexes:
    - fieldName: category
      fieldSchema: keyword
    - fieldName: description
      fieldSchema:
        type: text
        tokenizer: word
        lowercase: true
EOF

wait_collection_status "Ready"

RESULT=$(qdrant_curl "/collections/${COLLECTION_NAME}")
echo "Create response: $RESULT"
echo "$RESULT" | jq -e '
  .result.status == "green" and
  .result.config.params.vectors.distance == "Dot" and
  .result.config.params.vectors.datatype == "float16" and
  (.result.payload_schema | has("category") and has("description"))
' >/dev/null

kubectl patch qdrantcollection "$COLLECTION_NAME" -n "$E2E_NS" --type=merge -p '{"spec":{"onDisk":false}}'
sleep 4
PATCHED=$(qdrant_curl "/collections/${COLLECTION_NAME}")
echo "$PATCHED" | jq -e '.result.config.params.vectors.on_disk == false' >/dev/null

echo "=== [01] PASSED ==="
