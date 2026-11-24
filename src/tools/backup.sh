#!/bin/bash
set -euo pipefail

mcli alias set S3 "${ENDPOINT_URL}" "${ACCESS_KEY}" "${SECRET_KEY}"

CURRENT_TIME=$(date +"%Y-%m-%d-%H-%M")
BACKUP_DIR="${CLUSTER_NAME}/${COLLECTION_NAME}/${CURRENT_TIME}"
mkdir -p "${BACKUP_DIR}"

CURL_ARGS=(-sS)
if [ -n "${CA_CERT_PATH:-}" ]; then
  CURL_ARGS+=(--cacert "${CA_CERT_PATH}")
fi
if [ -n "${API_KEY:-}" ]; then
  CURL_ARGS+=(-H "api-key: ${API_KEY}")
fi

CLUSTER_DOMAIN="${CLUSTER_DOMAIN:-cluster.local}"
CLUSTER_URL="${CONNECTION_METHOD}://${CLUSTER_NAME}.${NAMESPACE}.svc.${CLUSTER_DOMAIN}:6333"

# Discover active peers dynamically via Qdrant /cluster API so CronJobs stay accurate after scaling
PEER_HOSTS=()
if CLUSTER_INFO=$(curl "${CURL_ARGS[@]}" --fail "${CLUSTER_URL}/cluster" 2>/dev/null); then
  while IFS= read -r uri; do
    [ -z "${uri}" ] && continue
    # Convert p2p URI (http(s)://pod.headless.ns:6335) to pod short name
    host="${uri#*://}"
    host="${host%%:*}"
    pod="${host%%.*}"
    PEER_HOSTS+=("${pod}")
  done < <(echo "${CLUSTER_INFO}" | jq -r '.result.peers // {} | to_entries[].value.uri')
fi

# Fallback to REPLICAS env if peer discovery returned nothing
if [ ${#PEER_HOSTS[@]} -eq 0 ]; then
  for ((i=0; i<REPLICAS; ++i)); do
    PEER_HOSTS+=("${CLUSTER_NAME}-${i}")
  done
fi

for POD_NAME in "${PEER_HOSTS[@]}"; do
  QDRANT_ENDPOINT="${CONNECTION_METHOD}://${POD_NAME}.${CLUSTER_NAME}-headless.${NAMESPACE}.svc.${CLUSTER_DOMAIN}:6333"
  RESULT=$(curl "${CURL_ARGS[@]}" -X POST "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots")
  SNAPSHOT_NAME=$(echo "${RESULT}" | jq -r '.result.name // empty')
  if [ -n "${SNAPSHOT_NAME}" ]; then
    curl "${CURL_ARGS[@]}" --fail \
      "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots/${SNAPSHOT_NAME}" \
      -o "${BACKUP_DIR}/${POD_NAME}.snapshot"
    echo "Saved ${BACKUP_DIR}/${POD_NAME}.snapshot"
    # Clean up temporary snapshot on Qdrant pod to prevent disk leaks
    curl "${CURL_ARGS[@]}" -X DELETE \
      "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots/${SNAPSHOT_NAME}" > /dev/null || true
  else
    echo "Failed to create snapshot on ${QDRANT_ENDPOINT}." >&2
    echo "${RESULT}" | jq . >&2 || echo "${RESULT}" >&2
    exit 1
  fi
done

mcli mirror "${BACKUP_DIR}" "S3/${BUCKET_NAME}/${BACKUP_DIR}"
echo "Backup of collection \"${COLLECTION_NAME}\" uploaded to bucket \"${BUCKET_NAME}\"."
echo "Snapshot path: \"${BACKUP_DIR}\"."
