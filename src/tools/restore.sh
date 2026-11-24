#!/bin/bash
set -euo pipefail

mcli alias set S3 "${ENDPOINT_URL}" "${ACCESS_KEY}" "${SECRET_KEY}"

mcli mirror "S3/${BUCKET_NAME}/${SNAPSHOT_NAME}" "${SNAPSHOT_NAME}/"

cd "${SNAPSHOT_NAME}"

CURL_ARGS=(-sS)
if [ -n "${CA_CERT_PATH:-}" ]; then
  CURL_ARGS+=(--cacert "${CA_CERT_PATH}")
fi
if [ -n "${API_KEY:-}" ]; then
  CURL_ARGS+=(-H "api-key: ${API_KEY}")
fi

CLUSTER_DOMAIN="${CLUSTER_DOMAIN:-cluster.local}"

shopt -s nullglob
SNAPSHOTS=(*.snapshot)
if [ ${#SNAPSHOTS[@]} -eq 0 ]; then
  echo "No snapshot files found in ${SNAPSHOT_NAME}." >&2
  exit 1
fi

for x in "${SNAPSHOTS[@]}"; do
  NODE_NAME="${x%.snapshot}"
  QDRANT_ENDPOINT="${CONNECTION_METHOD}://${NODE_NAME}.${CLUSTER_NAME}-headless.${NAMESPACE}.svc.${CLUSTER_DOMAIN}:6333"
  if ! RESULT=$(curl "${CURL_ARGS[@]}" \
    "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots/upload?priority=snapshot" \
    -H "Content-Type:multipart/form-data" \
    -F "snapshot=@${x}"); then
    echo "Failed to restore snapshot on ${NODE_NAME}." >&2
    exit 1
  fi
  STATUS=$(echo "${RESULT}" | jq -r '.status // empty')
  TIME=$(echo "${RESULT}" | jq -r '.time // empty')
  if [ "${STATUS}" = "ok" ]; then
    echo "Snapshot ${x} restored successfully in ${TIME}s."
  else
    echo "Failed to restore snapshot on ${NODE_NAME}." >&2
    echo "${RESULT}" | jq . >&2 || echo "${RESULT}" >&2
    exit 1
  fi
done
